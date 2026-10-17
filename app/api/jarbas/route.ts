import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { getContext } from '@/lib/context';
import { buildSystemPrompt, runTool, TOOLS, type ChatAction } from '@/lib/jarbas';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = process.env.JARBAS_MODEL || 'claude-haiku-5-5';
const MAX_STEPS = 8;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'A chave da IA (ANTHROPIC_API_KEY) ainda não foi configurada na Vercel.' }, { status: 500 });
  }

  const ctx = await getContext();
  const body = await req.json().catch(() => ({}));
  const text = String(body?.message ?? '').trim().slice(0, 2000);
  if (!text) return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 });

  const db = ctx.supabase;

  // Últimas mensagens para dar contexto
  const { data: history } = await db
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const messages: any[] = [];
  for (const m of (history ?? []).reverse()) {
    const last = messages[messages.length - 1];
    if (!last && m.role === 'assistant') continue; // precisa começar pelo usuário
    if (last && last.role === m.role) last.content += `\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  if (messages.length && messages[messages.length - 1].role === 'user') {
    messages[messages.length - 1].content += `\n${text}`;
  } else {
    messages.push({ role: 'user', content: text });
  }

  await db.from('chat_messages').insert({ space_id: ctx.casal.id, user_id: ctx.userId, role: 'user', content: text });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = await buildSystemPrompt(ctx);
  const actions: ChatAction[] = [];
  let reply = '';

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res: any = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        tools: TOOLS as any,
        messages,
      });

      const textOut = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
      const toolUses = res.content.filter((b: any) => b.type === 'tool_use');

      if (res.stop_reason !== 'tool_use' || toolUses.length === 0) {
        reply = textOut;
        break;
      }

      messages.push({ role: 'assistant', content: res.content });
      const results = [];
      for (const tu of toolUses) {
        try {
          const out = await runTool(ctx, tu.name, tu.input, actions);
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
        } catch (e: any) {
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro: ${e?.message ?? 'falha'}`, is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (e: any) {
    console.error('Jarbas error', e);
    const msg = e?.status === 401 ? 'A chave da IA parece inválida. Confira a ANTHROPIC_API_KEY na Vercel.' : 'Tive um problema para responder agora. Tente de novo em instantes.';
    return NextResponse.json({ error: msg, actions }, { status: 502 });
  }

  if (!reply) reply = actions.length ? 'Pronto!' : 'Não consegui entender. Pode repetir de outro jeito?';

  await db.from('chat_messages').insert({ space_id: ctx.casal.id, user_id: ctx.userId, role: 'assistant', content: reply });

  return NextResponse.json({ reply, actions });
}
