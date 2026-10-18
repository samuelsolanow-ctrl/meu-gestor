import { NextResponse } from 'next/server';
import { pushToUser, serviceClient } from '@/lib/push';
import { addDays, brl, dueLabel, todaySP } from '@/lib/format';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Rotina automática do Jarbas (chamada pela Vercel em horários fixos):
//   ?slot=manha  → 8h: contas vencidas, de hoje e de amanhã
//   ?slot=noite  → 21h: "teve algum gasto hoje?" e, no domingo, o resumo da semana

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`;
  return (req.headers.get('user-agent') || '').includes('vercel-cron');
}

const weekdaySP = () =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date());

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const slot = new URL(req.url).searchParams.get('slot') === 'noite' ? 'noite' : 'manha';

  const db = serviceClient();
  const today = todaySP();
  const startOfDay = `${today}T00:00:00-03:00`;
  const isSunday = weekdaySP() === 'Sun';

  // Só quem ativou as notificações
  const { data: subs } = await db.from('push_subscriptions').select('user_id');
  const userIds: string[] = [...new Set<string>((subs ?? []).map((s: any) => String(s.user_id)))];
  const report: any[] = [];

  for (const userId of userIds) {
    const { data: profile } = await db.from('profiles').select('id, display_name, family_id').eq('id', userId).maybeSingle();
    if (!profile?.family_id) continue;
    const firstName = String(profile.display_name).split(' ')[0];

    const { data: spaces } = await db.from('spaces').select('id, kind, owner_id').eq('family_id', profile.family_id);
    const mine = (spaces ?? []).filter((s: any) => s.kind === 'shared' || s.owner_id === userId);
    const casal = mine.find((s: any) => s.kind === 'shared');
    if (!casal) continue;
    const spaceIds = mine.map((s: any) => s.id);

    // Não repete no mesmo dia
    const marker = slot === 'manha' ? 'Bom dia' : 'Boa noite';
    const { data: already } = await db
      .from('chat_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('role', 'assistant')
      .gte('created_at', startOfDay)
      .like('content', `${marker}%`)
      .limit(1);
    if (already?.length) {
      report.push({ userId, skipped: 'já enviado hoje' });
      continue;
    }

    let title = '';
    let body = '';
    let chat = '';

    if (slot === 'manha') {
      const { data: bills } = await db
        .from('bills')
        .select('name, amount, due_date')
        .in('space_id', spaceIds)
        .eq('status', 'open')
        .lte('due_date', addDays(today, 1))
        .order('due_date');
      if (!bills?.length) {
        report.push({ userId, skipped: 'sem contas' });
        continue;
      }
      const lines = bills.map((b: any) => `${b.name}: ${dueLabel(b.due_date, today).text.toLowerCase()} (${brl(b.amount)})`);
      const total = bills.reduce((s: number, b: any) => s + Number(b.amount), 0);
      title = bills.length === 1 ? `Jarbas · ${bills[0].name}` : `Jarbas · ${bills.length} contas pedem atenção`;
      body = bills.length === 1 ? `${lines[0]}. Já pagou?` : `${lines.slice(0, 3).join('; ')}${bills.length > 3 ? '…' : ''}. Total ${brl(total)}.`;
      chat = `Bom dia, ${firstName}! Contas que pedem atenção:\n${lines.map((l: string) => `• ${l}`).join('\n')}\n\nQuando pagar, me avise que eu marco como paga.`;
    } else {
      const { data: txs } = await db
        .from('transactions')
        .select('kind, amount')
        .in('space_id', spaceIds)
        .eq('occurred_on', today)
        .eq('created_by', userId);
      const gastos = (txs ?? []).filter((t: any) => t.kind === 'expense');
      const somaHoje = gastos.reduce((s: number, t: any) => s + Number(t.amount), 0);

      let semana = '';
      if (isSunday) {
        const { data: week } = await db
          .from('transactions')
          .select('amount, kind, categories(name)')
          .eq('space_id', casal.id)
          .gte('occurred_on', addDays(today, -6))
          .lte('occurred_on', today);
        const exp = (week ?? []).filter((t: any) => t.kind === 'expense');
        if (exp.length) {
          const total = exp.reduce((s: number, t: any) => s + Number(t.amount), 0);
          const byCat: Record<string, number> = {};
          for (const t of exp) {
            const c = (t as any).categories?.name ?? 'Sem categoria';
            byCat[c] = (byCat[c] ?? 0) + Number(t.amount);
          }
          const [topCat, topVal] = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
          semana = `Resumo da semana: a família gastou ${brl(total)}, e o maior gasto foi em ${topCat} (${brl(topVal)}).`;
        }
      }

      const hoje = gastos.length
        ? `Hoje anotei ${gastos.length === 1 ? '1 gasto' : `${gastos.length} gastos`} seus (${brl(somaHoje)}). Teve mais algum que eu não anotei?`
        : 'Hoje não anotei nenhum gasto seu. Teve algum? Me conta que eu lanço.';

      title = isSunday && semana ? 'Jarbas · resumo da semana' : 'Jarbas · fechando o dia';
      body = semana ? `${semana} ${hoje}` : hoje;
      chat = `Boa noite, ${firstName}! ${semana ? semana + '\n\n' : ''}${hoje}`;
    }

    // A mensagem fica na conversa, para você responder direto
    await db.from('chat_messages').insert({ space_id: casal.id, user_id: userId, role: 'assistant', content: chat });
    const sent = await pushToUser(db, userId, { title, body, url: '/jarbas', tag: `jarbas-${slot}` });
    report.push({ userId, sent });
  }

  return NextResponse.json({ slot, today, report });
}
