import Anthropic from '@anthropic-ai/sdk';
import type { AppContext } from '@/lib/context';
import { buildSystem, runTool, TOOLS, WRITE_TOOLS, type ChatAction } from '@/lib/jarbas';
import { ensureSchema } from '@/lib/migrate';

const MODEL = process.env.JARBAS_MODEL || 'claude-sonnet-5-5';
const MAX_STEPS = 10;
// Busca na internet (cotações, Selic, notícias). Desligue com JARBAS_WEB=0.
const WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'BR', region: 'São Paulo', timezone: 'America/Sao_Paulo' } };
// A parte fixa (ferramentas + instruções) fica em cache entre mensagens
const TOOLS_CACHED = TOOLS.map((t, i) => (i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t));

export type JarbasFile = { kind: 'image' | 'pdf'; media_type: string; data: string; name: string };

export function cleanFiles(raw: any): JarbasFile[] {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 3)
    .filter((f: any) => typeof f?.data === 'string' && /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(f?.media_type));
}

/**
 * Uma conversa com o Jarbas: lê o histórico, pensa, usa as ferramentas e
 * guarda a resposta. Usado pelo chat do app, pela Siri e pelo SMS do banco.
 */
export async function runJarbas(opts: {
  ctx: AppContext;
  text: string;
  files?: JarbasFile[];
  /** Como a mensagem aparece no histórico (ex.: "[Siri] gastei 50") */
  stored?: string;
  /** Instrução extra só para esta mensagem (não aparece para a pessoa) */
  note?: string;
  onText?: (d: string) => void;
  onAction?: (a: ChatAction) => void;
}) {
  const { ctx, text, files = [], onText = () => {}, onAction = () => {} } = opts;
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('Falta ANTHROPIC_API_KEY'), { status: 401 });
  const db = ctx.supabase;
  void ensureSchema();

  const [{ data: history }, system] = await Promise.all([
    db.from('chat_messages').select('role, content').eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(30),
    buildSystem(ctx),
    db.from('chat_messages').insert({ space_id: ctx.casal.id, user_id: ctx.userId, role: 'user', content: opts.stored ?? text }),
  ]);

  const messages: any[] = [];
  for (const m of (history ?? []).reverse()) {
    const last = messages[messages.length - 1];
    if (!last && m.role === 'assistant') continue;
    if (last && last.role === m.role) last.content += `\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  const current = opts.note ? `${opts.note}\n\n${text}` : text;
  const last = messages[messages.length - 1];
  if (last?.role === 'user') {
    // a mensagem atual pode já ter entrado no histórico: troca pela versão completa
    const stored = opts.stored ?? text;
    last.content = last.content.endsWith(stored) ? last.content.slice(0, -stored.length) + current : `${last.content}\n${current}`;
  } else messages.push({ role: 'user', content: current });

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
  const actions: ChatAction[] = [];
  let reply = '';
  let useWeb = process.env.JARBAS_WEB !== '0';
  // PDF de fatura pode ter dezenas de compras: deixa espaço para a lista inteira
  const maxTokens = files.some((f) => f.kind === 'pdf') ? 8000 : 1200;

  for (let step = 0; step < MAX_STEPS; step++) {
    let stepText = '';
    let msg: any;
    try {
      const s: any = anthropic.messages.stream({
        model: MODEL,
        max_tokens: maxTokens,
        system: system as any,
        tools: (useWeb ? [...TOOLS_CACHED, WEB_SEARCH] : TOOLS_CACHED) as any,
        messages,
      });
      s.on('text', (d: string) => {
        if (!stepText && reply) onText(' ');
        stepText += d;
        onText(d);
      });
      msg = await s.finalMessage();
    } catch (e: any) {
      if (useWeb && e?.status === 400 && !stepText && /web_search|server tool|tool/i.test(String(e?.message))) {
        useWeb = false; // conta sem busca na internet liberada: segue sem ela
        step--;
        continue;
      }
      throw e;
    }
    reply += (reply && stepText ? ' ' : '') + stepText;

    if (msg.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: msg.content });
      continue;
    }

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
        if (/"orcamento":\{|"avisar":true/.test(out)) failed = true; // deixa o Jarbas comentar o resultado
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      } catch (e: any) {
        failed = true;
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erro: ${e?.message ?? 'falha'}`, is_error: true });
      }
      for (const a of actions.slice(before)) onAction(a);
    }

    // Só gravou, deu tudo certo e a confirmação já foi escrita: termina aqui (mais rápido)
    const onlyWrites = toolUses.every((t: any) => WRITE_TOOLS.has(t.name));
    if (onlyWrites && !failed && stepText.trim()) break;

    messages.push({ role: 'user', content: results });
  }

  if (!reply.trim()) {
    reply = actions.length ? 'Pronto!' : 'Não consegui entender. Pode repetir de outro jeito?';
    onText(reply);
  }
  await db.from('chat_messages').insert({ space_id: ctx.casal.id, user_id: ctx.userId, role: 'assistant', content: reply.trim() });
  return { reply: reply.trim(), actions };
}
