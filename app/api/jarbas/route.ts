import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { getContext } from '@/lib/context';
import { buildSystem, runTool, TOOLS, WRITE_TOOLS, type ChatAction } from '@/lib/jarbas';
import { ensureSchema } from '@/lib/migrate';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = process.env.JARBAS_MODEL || 'claude-sonnet-5-5';
const MAX_STEPS = 6;

// Tools com cache: a parte fixa (ferramentas + instruções) é reaproveitada entre mensagens
const TOOLS_CACHED = TOOLS.map((t, i) => (i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t));

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'A chave da IA (ANTHROPIC_API_KEY) ainda não foi configurada na Vercel.' }, { status: 500 });
  }

  const ctx = await getContext();
  const body = await req.json().catch(() => ({}));
  const files: { kind: 'image' | 'pdf'; media_type: string; data: string; name: string }[] = (Array.isArray(body?.files) ? body.files : [])
    .slice(0, 3)
    .filter((f: any) => typeof f?.data === 'string' && /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(f?.media_type));
  const typed = String(body?.message ?? '').trim().slice(0, 2000);
  const text = typed || (files.length ? 'Veja o anexo.' : '');
  const attachNote = files.length ? `[Anexo: ${files.map((f) => f.name || (f.kind === 'pdf' ? 'PDF' : 'foto')).join(', ')}] ` : '';
  if (!text) return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 });
  const db = ctx.supabase;

  void ensureSchema(); // atualiza o banco em segundo plano, se precisar

  // Tudo em paralelo: histórico, contexto do Jarbas e salvar a mensagem
  const [{ data: history }, system] = await Promise.all([
    db.from('chat_messages').select('role, content').eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(20),
    buildSystem(ctx),
    db.from('chat_messages').insert({ space_id: ctx.casal.id, user_id: ctx.userId, role: 'user', content: attachNote + text }),
  ]);

  const messages: any[] = [];
  for (const m of (history ?? []).reverse()) {
    const last = messages[messages.length - 1];
    if (!last && m.role === 'assistant') continue;
    if (last && last.role === m.role) last.content += `\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  // a mensagem atual já pode ter entrado no histórico; garante que é a última
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || !last.content.endsWith(text)) {
    if (last?.role === 'user') last.content += `\n${text}`;
    else messages.push({ role: 'user', content: text });
  }

  // Anexos (foto/PDF) vão só na mensagem atual
  if (files.length) {
    const blocks: any[] = files.map((f) =>
      f.media_type === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } }
        : { type: 'image', source: { type: 'base64', media_type: f.media_type, data: f.data } },
    );
    const cur = messages[messages.length - 1];
    cur.content = [...blocks, { type: 'text', text: cur.content }];
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'));
      const actions: ChatAction[] = [];
      let reply = '';
      try {
        for (let step = 0; step < MAX_STEPS; step++) {
          let stepText = '';
          const s: any = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 800,
            system: system as any,
            tools: TOOLS_CACHED as any,
            messages,
          });
          s.on('text', (d: string) => {
            if (!stepText && reply) send({ t: 'text', d: ' ' });
            stepText += d;
            send({ t: 'text', d });
          });
          const msg: any = await s.finalMessage();
          reply += (reply && stepText ? ' ' : '') + stepText;

          const toolUses = msg.content.filter((b: any) => b.type === 'tool_use');
          if (msg.stop_reason !== 'tool_use' || toolUses.length === 0) break;

          messages.push({ role: 'assistant', content: msg.content });
          const results: any[] = [];
          let failed = false;
          for (const tu of toolUses) {
            const before = actions.length;
            try {
              const out = await runTool(ctx, tu.name, tu.input, actions);
              if (/"ok":\s*false/.test(out)) failed = true;
              if (/"orcamento":\{/.test(out)) failed = true; // deixa o Jarbas avisar do limite
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
            } catch (e: any) {
              failed = true;
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro: ${e?.message ?? 'falha'}`, is_error: true });
            }
            for (const a of actions.slice(before)) send({ t: 'action', a });
          }

          // Só gravou coisas, deu tudo certo e a confirmação já foi escrita: termina aqui (mais rápido)
          const onlyWrites = toolUses.every((t: any) => WRITE_TOOLS.has(t.name));
          if (onlyWrites && !failed && stepText.trim()) break;

          messages.push({ role: 'user', content: results });
        }

        if (!reply.trim()) {
          reply = actions.length ? 'Pronto!' : 'Não consegui entender. Pode repetir de outro jeito?';
          send({ t: 'text', d: reply });
        }
        await db.from('chat_messages').insert({ space_id: ctx.casal.id, user_id: ctx.userId, role: 'assistant', content: reply.trim() });
        send({ t: 'done', refresh: actions.length > 0 });
      } catch (e: any) {
        console.error('Jarbas error', e);
        const msg = e?.status === 401 ? 'A chave da IA parece inválida. Confira a ANTHROPIC_API_KEY na Vercel.' : 'Tive um problema para responder agora. Tente de novo.';
        send({ t: 'error', d: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
