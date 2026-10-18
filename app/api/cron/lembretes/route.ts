import { NextResponse } from 'next/server';
import { pushToUser, serviceClient } from '@/lib/push';
import { cronKey, safeEqual } from '@/lib/secrets';
import { fmtWhen } from '@/lib/agenda';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Chamado a cada minuto pelo agendador do banco (pg_cron): manda os lembretes vencidos.
export async function GET(req: Request) {
  const k = new URL(req.url).searchParams.get('k') || '';
  if (!safeEqual(k, cronKey())) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = serviceClient();
  const now = new Date();
  const since = new Date(now.getTime() - 6 * 3_600_000).toISOString(); // não manda lembrete velho

  const { data: due, error } = await db
    .from('events')
    .select('id, user_id, space_id, kind, title, starts_at, remind_at')
    .is('reminded_at', null)
    .lte('remind_at', now.toISOString())
    .gte('remind_at', since)
    .order('remind_at')
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const e of due ?? []) {
    // marca antes, para nunca mandar duas vezes
    const { data: claimed } = await db.from('events').update({ reminded_at: now.toISOString() }).eq('id', e.id).is('reminded_at', null).select('id');
    if (!claimed?.length) continue;

    const when = new Date(e.starts_at).getTime() - now.getTime() > 60_000 ? ` (${fmtWhen(e.starts_at)})` : '';
    const body = e.kind === 'reminder' ? e.title : `${e.title}${when}`;
    await db.from('chat_messages').insert({
      space_id: e.space_id,
      user_id: e.user_id,
      role: 'assistant',
      content: `Lembrete: ${body}.`,
    });
    sent += await pushToUser(db, e.user_id, { title: 'Jarbas · lembrete', body, url: '/jarbas', tag: `lembrete-${e.id}` });
  }

  return NextResponse.json({ checked: due?.length ?? 0, sent });
}
