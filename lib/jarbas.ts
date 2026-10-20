import type { AppContext } from '@/lib/context';
import { addBill, addTransaction, monthSummary, payBill } from '@/lib/finance';
import { brl, longDate, todaySP } from '@/lib/format';
import { fmtWhen, localIso, parseLocal } from '@/lib/agenda';
import { ensureSchema } from '@/lib/migrate';

/** Ação mostrada como cartão no chat */
export type ChatAction = { kind: 'transaction' | 'bill' | 'paid' | 'goal' | 'deleted' | 'event'; title: string; sub: string; amount?: number; income?: boolean };

/** Ferramentas que só gravam algo: quando todas dão certo, a confirmação já escrita basta (resposta mais rápida). */
export const WRITE_TOOLS = new Set(['registrar_lancamento', 'criar_conta_a_pagar', 'marcar_conta_paga', 'apagar_lancamento', 'criar_meta', 'aportar_meta', 'agendar', 'cancelar_compromisso']);

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const TOOLS = [
  {
    name: 'registrar_lancamento',
    description: 'Registra uma despesa ou receita que já aconteceu (gasto, compra, salário recebido, pix recebido).',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['despesa', 'receita'] },
        valor: { type: 'number', description: 'Valor em reais, positivo. Ex.: 85.5' },
        descricao: { type: 'string', description: 'Descrição curta, ex.: "Mercado", "Farmácia"' },
        categoria: { type: 'string', description: 'Nome exato de uma das categorias da família' },
        espaco: { type: 'string', enum: ['casal', 'pessoal'] },
        data: { type: 'string', description: 'AAAA-MM-DD. Omita para hoje.' },
        conta: { type: 'string', description: 'Nome da conta ou cartão usado, se a pessoa disse' },
      },
      required: ['tipo', 'valor', 'descricao', 'espaco'],
    },
  },
  {
    name: 'criar_conta_a_pagar',
    description: 'Cadastra uma conta futura a pagar (boleto, conta fixa, fatura, mensalidade).',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        valor: { type: 'number' },
        vencimento: { type: 'string', description: 'AAAA-MM-DD' },
        espaco: { type: 'string', enum: ['casal', 'pessoal'] },
        recorrencia: { type: 'string', enum: ['nenhuma', 'mensal', 'anual'] },
        categoria: { type: 'string' },
      },
      required: ['nome', 'valor', 'vencimento', 'espaco', 'recorrencia'],
    },
  },
  {
    name: 'listar_contas_a_pagar',
    description: 'Lista contas em aberto, com id, valor e vencimento.',
    input_schema: {
      type: 'object',
      properties: {
        espaco: { type: 'string', enum: ['casal', 'pessoal', 'ambos'] },
        ate: { type: 'string', description: 'Só contas que vencem até esta data (AAAA-MM-DD)' },
      },
    },
  },
  {
    name: 'marcar_conta_paga',
    description: 'Marca uma conta a pagar como paga. Isso também lança a despesa e, se for recorrente, cria a do próximo período. Use o id vindo de listar_contas_a_pagar.',
    input_schema: { type: 'object', properties: { conta_id: { type: 'string' } }, required: ['conta_id'] },
  },
  {
    name: 'resumo_do_mes',
    description: 'Entradas, saídas, saldo e gastos por categoria de um mês.',
    input_schema: {
      type: 'object',
      properties: {
        espaco: { type: 'string', enum: ['casal', 'pessoal'] },
        mes: { type: 'string', description: 'AAAA-MM. Omita para o mês atual.' },
      },
      required: ['espaco'],
    },
  },
  {
    name: 'listar_lancamentos',
    description: 'Lista lançamentos de um período, com id. Use para responder perguntas detalhadas ou achar um lançamento para apagar.',
    input_schema: {
      type: 'object',
      properties: {
        espaco: { type: 'string', enum: ['casal', 'pessoal'] },
        de: { type: 'string', description: 'AAAA-MM-DD' },
        ate: { type: 'string', description: 'AAAA-MM-DD' },
        busca: { type: 'string', description: 'Texto na descrição' },
      },
      required: ['espaco', 'de', 'ate'],
    },
  },
  {
    name: 'apagar_lancamento',
    description: 'Apaga um lançamento (por exemplo quando a pessoa pede para desfazer). Use o id de listar_lancamentos ou de um registro feito agora.',
    input_schema: { type: 'object', properties: { lancamento_id: { type: 'string' } }, required: ['lancamento_id'] },
  },
  {
    name: 'listar_metas',
    description: 'Lista as metas (viagem, reserva etc.) com id, valor atual, alvo e prazo.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'criar_meta',
    description: 'Cria uma meta de economia.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        valor_alvo: { type: 'number' },
        valor_atual: { type: 'number' },
        prazo: { type: 'string', description: 'AAAA-MM-DD' },
        espaco: { type: 'string', enum: ['casal', 'pessoal'] },
      },
      required: ['nome', 'valor_alvo', 'espaco'],
    },
  },
  {
    name: 'agendar',
    description: 'Cria um compromisso ou lembrete na agenda (aparece no Calendário do iPhone) e agenda a notificação. Use para "amanhã tenho dentista às 8", "me lembra às 15h de fazer o Pix", "conta às 10, me avisa 1 hora antes".',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Curto: "Dentista", "Fazer o Pix do aluguel", "Pagar conta de luz"' },
        tipo: { type: 'string', enum: ['compromisso', 'lembrete'], description: 'lembrete = só um aviso na hora; compromisso = evento com horário' },
        inicio: { type: 'string', description: 'Data e hora local AAAA-MM-DDTHH:MM (horário de São Paulo)' },
        fim: { type: 'string', description: 'Opcional, AAAA-MM-DDTHH:MM' },
        lembrar_minutos_antes: { type: 'number', description: 'Minutos antes para avisar. Lembrete: 0. Compromisso sem pedido explícito: 30.' },
        espaco: { type: 'string', enum: ['casal', 'pessoal'], description: 'pessoal por padrão; casal se for da família toda' },
        observacao: { type: 'string' },
      },
      required: ['titulo', 'tipo', 'inicio', 'espaco'],
    },
  },
  {
    name: 'listar_agenda',
    description: 'Lista compromissos e lembretes entre duas datas, com id.',
    input_schema: {
      type: 'object',
      properties: { de: { type: 'string', description: 'AAAA-MM-DD' }, ate: { type: 'string', description: 'AAAA-MM-DD' } },
      required: ['de', 'ate'],
    },
  },
  {
    name: 'cancelar_compromisso',
    description: 'Apaga um compromisso ou lembrete da agenda (use o id de listar_agenda ou de um agendamento feito agora).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'aportar_meta',
    description: 'Soma um valor guardado em uma meta (use valor negativo para retirar).',
    input_schema: {
      type: 'object',
      properties: { meta_id: { type: 'string' }, valor: { type: 'number' } },
      required: ['meta_id', 'valor'],
    },
  },
] as const;

const STATIC_PROMPT = `Você é o Jarbas, assessor financeiro e secretário pessoal da família dentro do app Meu Gestor.

Espaços:
- "casal": a Família, as finanças da casa (no app aparece como "Família"). O dinheiro do casal é todo junto. É o PADRÃO para dinheiro.
- "pessoal": só da pessoa com quem você fala. Use se ela disser que é pessoal, "só meu", "da minha conta". Na agenda, compromissos são pessoais por padrão.
Você não tem acesso ao espaço pessoal de outra pessoa.

Como agir:
- Seja rápido e proativo. Faça na hora, sem pedir confirmação para coisas óbvias.
- IMPORTANTE para ser rápido: quando for gravar algo (lançar, agendar, pagar, criar), escreva PRIMEIRO a confirmação curta para a pessoa e, no mesmo turno, chame a(s) ferramenta(s). Ex.: "Anotado: R$ 85,00 de mercado na Família." + registrar_lancamento.
- Gasto ou receita contado → registrar_lancamento com a categoria mais adequada da lista.
- Compromissos, lembretes e "me lembra" → agendar. Converta datas e horas relativas ("amanhã às 8", "sexta 15h", "daqui 2 horas") para AAAA-MM-DDTHH:MM com base no momento atual. "Me lembra 1 hora antes" → lembrar_minutos_antes = 60. Se a pessoa não disser quando avisar, compromisso avisa 30 minutos antes e lembrete avisa na hora (0).
- Conta a pagar num horário ("amanhã tenho que pagar a conta às 10") → agende o lembrete; se houver valor, cadastre também com criar_conta_a_pagar.
- Se perceber conflito com algo já na agenda, avise numa frase.
- "Paguei a conta de luz" → listar_contas_a_pagar e marcar_conta_paga; se não existir conta cadastrada, registre como despesa.
- Perguntas sobre dinheiro ou agenda → consulte com as ferramentas antes de responder. Nunca invente números.
- Se faltar um dado essencial (o valor, o horário), pergunte de forma curta.
- Você sugere, mas não move dinheiro nem compra investimentos.
- Você também avisa sozinho: lembretes na hora marcada, contas às 8h e um fechamento do dia às 21h. Se a pessoa responder a um aviso ("paguei", "não teve nada"), aja de acordo.
- Mensagens por ditado de voz vêm com erros ("pics" = Pix, números por extenso, sem pontuação). Entenda pelo sentido e pelo histórico ("muda pra 16h", "apaga esse" se referem ao que acabou de ser dito). Só pergunte se for impossível deduzir.
- Fotos e PDFs anexados: leia com atenção. Nota fiscal ou comprovante → registrar_lancamento com valor, local e data do documento. Boleto ou fatura → criar_conta_a_pagar com valor e vencimento. Outro documento → resuma o que importa em poucas palavras ou responda o que a pessoa perguntou sobre ele.

ESTILO (muito importante):
- Seja direto ao ponto. Responda só o que foi pedido, sem introdução, sem rodeio, sem repetir o que a pessoa disse, sem oferecer ajuda extra ("quer que eu…?", "posso ajudar em algo mais?").
- Antes de CONSULTAR dados (listar, resumo), não escreva nada: chame a ferramenta e responda só com o resultado.
- Ao GRAVAR, escreva uma única confirmação curta e pronto. Depois da ferramenta, não repita nem reformule a confirmação.
- Nunca diga a mesma coisa duas vezes na mesma resposta.
- Normalmente 1 frase, no máximo 2. Só se estenda se a pessoa pedir explicação. Português do Brasil, tom de WhatsApp, sem markdown, valores como R$ 1.234,56. As respostas podem ser lidas em voz alta.`;

/** Parte fixa (com cache, mais rápida e barata) + parte que muda a cada conversa. */
export async function buildSystem(ctx: AppContext) {
  const db = ctx.supabase;
  const now = new Date();
  const [{ data: cats }, { data: accounts }, { data: members }, { data: agenda }] = await Promise.all([
    db.from('categories').select('name, kind').order('name'),
    db.from('accounts').select('name, type, institution, space_id').eq('archived', false),
    db.from('profiles').select('id, display_name'),
    db.from('events').select('title, starts_at').gte('starts_at', now.toISOString()).lte('starts_at', new Date(now.getTime() + 3 * 86_400_000).toISOString()).order('starts_at').limit(12),
  ]);
  const today = todaySP();
  const weekday = WEEKDAYS[new Date(Date.parse(today + 'T12:00:00Z')).getUTCDay()];
  const others = (members ?? []).filter((m: any) => m.id !== ctx.userId).map((m: any) => m.display_name);
  const expense = (cats ?? []).filter((c: any) => c.kind === 'expense').map((c: any) => c.name).join(', ');
  const income = (cats ?? []).filter((c: any) => c.kind === 'income').map((c: any) => c.name).join(', ');
  const accs = (accounts ?? [])
    .map((a: any) => `${a.name}${a.institution ? ` (${a.institution})` : ''} — ${a.space_id === ctx.casal.id ? 'família' : 'pessoal'}`)
    .join('; ');
  const proximos = (agenda ?? []).map((e: any) => `${e.title} (${fmtWhen(e.starts_at)})`).join('; ');

  const dynamic = `Você conversa com ${ctx.name}${others.length ? ` (que divide a Família com ${others.join(' e ')})` : ''}.
Agora: ${weekday}, ${longDate(today)}, ${localIso(now).slice(11)} (${localIso(now)}), horário de São Paulo.
Categorias de despesa: ${expense || '(nenhuma)'}.
Categorias de receita: ${income || '(nenhuma)'}.
Contas e cartões: ${accs || 'nenhum ainda (pode lançar sem conta)'}.
Agenda dos próximos 3 dias: ${proximos || 'nada marcado'}.`;

  return [
    { type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamic },
  ];
}

export async function runTool(ctx: AppContext, name: string, input: any, actions: ChatAction[]): Promise<string> {
  const db = ctx.supabase;
  const spaceId = (e?: string) => (e === 'pessoal' ? ctx.pessoal.id : ctx.casal.id);
  const spaceName = (id: string) => (id === ctx.casal.id ? 'Família' : ctx.name.split(' ')[0]);

  async function categoryId(nameIn?: string, kind: 'income' | 'expense' = 'expense') {
    if (!nameIn) return null;
    const { data } = await db.from('categories').select('id, name, kind').eq('kind', kind);
    const hit = (data ?? []).find((c: any) => norm(c.name) === norm(nameIn)) ?? (data ?? []).find((c: any) => norm(c.name).includes(norm(nameIn)));
    return hit?.id ?? null;
  }
  async function accountId(nameIn?: string) {
    if (!nameIn) return null;
    const { data } = await db.from('accounts').select('id, name, institution').eq('archived', false);
    const n = norm(nameIn);
    const hit = (data ?? []).find((a: any) => norm(a.name) === n) ?? (data ?? []).find((a: any) => norm(a.name).includes(n) || n.includes(norm(a.name)) || (a.institution && n.includes(norm(a.institution))));
    return hit?.id ?? null;
  }

  if (name === 'agendar' || name === 'listar_agenda' || name === 'cancelar_compromisso') await ensureSchema();

  switch (name) {
    case 'registrar_lancamento': {
      const kind = input.tipo === 'receita' ? 'income' : 'expense';
      const tx = await addTransaction(db, {
        spaceId: spaceId(input.espaco),
        kind,
        amount: Number(input.valor),
        description: String(input.descricao ?? ''),
        categoryId: await categoryId(input.categoria, kind),
        accountId: await accountId(input.conta),
        occurredOn: input.data,
        source: 'chat',
      });
      actions.push({
        kind: 'transaction',
        title: tx.description,
        sub: `${tx.categories?.name ?? 'Sem categoria'} · ${spaceName(spaceId(input.espaco))} · ${longDate(tx.occurred_on)}`,
        amount: Number(tx.amount),
        income: kind === 'income',
      });
      return JSON.stringify({ ok: true, lancamento_id: tx.id, categoria: tx.categories?.name ?? null });
    }
    case 'criar_conta_a_pagar': {
      const rec = input.recorrencia === 'mensal' ? 'monthly' : input.recorrencia === 'anual' ? 'yearly' : 'none';
      const bill = await addBill(db, {
        spaceId: spaceId(input.espaco),
        name: String(input.nome),
        amount: Number(input.valor),
        dueDate: String(input.vencimento),
        recurrence: rec,
        categoryId: await categoryId(input.categoria, 'expense'),
      });
      actions.push({
        kind: 'bill',
        title: bill.name,
        sub: `Vence ${longDate(bill.due_date)}${rec === 'monthly' ? ' · todo mês' : rec === 'yearly' ? ' · todo ano' : ''}`,
        amount: Number(bill.amount),
      });
      return JSON.stringify({ ok: true, conta_id: bill.id });
    }
    case 'listar_contas_a_pagar': {
      let q = db.from('bills').select('id, name, amount, due_date, recurrence, space_id').eq('status', 'open').order('due_date').limit(40);
      if (input.espaco === 'casal' || input.espaco === 'pessoal') q = q.eq('space_id', spaceId(input.espaco));
      if (input.ate) q = q.lte('due_date', input.ate);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return JSON.stringify(
        (data ?? []).map((b: any) => ({ id: b.id, nome: b.name, valor: Number(b.amount), vencimento: b.due_date, recorrencia: b.recurrence, espaco: spaceName(b.space_id) })),
      );
    }
    case 'marcar_conta_paga': {
      const r = await payBill(db, String(input.conta_id), 'chat');
      if (!r.alreadyPaid) {
        actions.push({
          kind: 'paid',
          title: `${r.bill.name} paga`,
          sub: r.next ? `Próxima: ${longDate(r.next.due_date)}` : 'Despesa lançada',
          amount: Number(r.bill.amount),
        });
      }
      return JSON.stringify({ ok: true, ja_estava_paga: r.alreadyPaid, proxima_conta_vencimento: r.next?.due_date ?? null });
    }
    case 'resumo_do_mes': {
      const ref = input.mes && /^\d{4}-\d{2}$/.test(input.mes) ? `${input.mes}-01` : todaySP();
      const s = await monthSummary(db, spaceId(input.espaco), ref);
      return JSON.stringify(s);
    }
    case 'listar_lancamentos': {
      let q = db
        .from('transactions')
        .select('id, kind, amount, description, occurred_on, categories(name)')
        .eq('space_id', spaceId(input.espaco))
        .gte('occurred_on', input.de)
        .lte('occurred_on', input.ate)
        .order('occurred_on', { ascending: false })
        .limit(60);
      if (input.busca) q = q.ilike('description', `%${input.busca}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return JSON.stringify(
        (data ?? []).map((t: any) => ({ id: t.id, tipo: t.kind === 'income' ? 'receita' : 'despesa', valor: Number(t.amount), descricao: t.description, data: t.occurred_on, categoria: t.categories?.name ?? null })),
      );
    }
    case 'apagar_lancamento': {
      const { data, error } = await db.from('transactions').delete().eq('id', String(input.lancamento_id)).select('description, amount').maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return JSON.stringify({ ok: false, erro: 'Lançamento não encontrado' });
      actions.push({ kind: 'deleted', title: `${data.description} apagado`, sub: 'Lançamento desfeito', amount: Number(data.amount) });
      return JSON.stringify({ ok: true });
    }
    case 'listar_metas': {
      const { data } = await db.from('goals').select('id, name, target_amount, current_amount, deadline, space_id').order('created_at');
      return JSON.stringify(
        (data ?? []).map((g: any) => ({ id: g.id, nome: g.name, alvo: Number(g.target_amount), atual: Number(g.current_amount), prazo: g.deadline, espaco: spaceName(g.space_id) })),
      );
    }
    case 'criar_meta': {
      const { data, error } = await db
        .from('goals')
        .insert({
          space_id: spaceId(input.espaco),
          name: String(input.nome),
          target_amount: Number(input.valor_alvo),
          current_amount: Math.max(0, Number(input.valor_atual ?? 0)),
          deadline: input.prazo || null,
        })
        .select('id, name, target_amount, current_amount')
        .single();
      if (error) throw new Error(error.message);
      actions.push({ kind: 'goal', title: `Meta: ${data.name}`, sub: `${brl(data.current_amount)} de ${brl(data.target_amount)}` });
      return JSON.stringify({ ok: true, meta_id: data.id });
    }
    case 'aportar_meta': {
      const { data: g, error } = await db.from('goals').select('id, name, target_amount, current_amount').eq('id', String(input.meta_id)).maybeSingle();
      if (error) throw new Error(error.message);
      if (!g) return JSON.stringify({ ok: false, erro: 'Meta não encontrada' });
      const next = Math.max(0, Math.round((Number(g.current_amount) + Number(input.valor)) * 100) / 100);
      const { error: upErr } = await db.from('goals').update({ current_amount: next }).eq('id', g.id);
      if (upErr) throw new Error(upErr.message);
      actions.push({ kind: 'goal', title: `Meta: ${g.name}`, sub: `${brl(next)} de ${brl(g.target_amount)}` });
      return JSON.stringify({ ok: true, valor_atual: next, alvo: Number(g.target_amount) });
    }
    case 'agendar': {
      const start = parseLocal(String(input.inicio));
      if (isNaN(start.getTime())) return JSON.stringify({ ok: false, erro: 'Data/hora inválida' });
      const isReminder = input.tipo === 'lembrete';
      const before = Number.isFinite(Number(input.lembrar_minutos_antes)) ? Number(input.lembrar_minutos_antes) : isReminder ? 0 : 30;
      const remind = new Date(start.getTime() - Math.max(0, before) * 60_000);
      const end = input.fim ? parseLocal(String(input.fim)) : null;
      const { data, error } = await db
        .from('events')
        .insert({
          space_id: input.espaco === 'casal' ? ctx.casal.id : ctx.pessoal.id,
          user_id: ctx.userId,
          kind: isReminder ? 'reminder' : 'event',
          title: String(input.titulo),
          notes: input.observacao || null,
          starts_at: start.toISOString(),
          ends_at: end && !isNaN(end.getTime()) ? end.toISOString() : null,
          remind_at: remind.getTime() > Date.now() - 60_000 ? remind.toISOString() : null,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      actions.push({
        kind: 'event',
        title: String(input.titulo),
        sub: `${fmtWhen(start)}${before > 0 ? ` · aviso ${before >= 60 && before % 60 === 0 ? `${before / 60}h` : `${before} min`} antes` : ' · aviso na hora'}`,
      });
      return JSON.stringify({ ok: true, id: data.id, quando: fmtWhen(start) });
    }
    case 'listar_agenda': {
      const de = parseLocal(`${input.de}T00:00`);
      const ate = parseLocal(`${input.ate}T23:59`);
      const { data, error } = await db
        .from('events')
        .select('id, kind, title, starts_at, remind_at, space_id')
        .gte('starts_at', de.toISOString())
        .lte('starts_at', ate.toISOString())
        .order('starts_at')
        .limit(60);
      if (error) throw new Error(error.message);
      return JSON.stringify((data ?? []).map((e: any) => ({ id: e.id, tipo: e.kind === 'reminder' ? 'lembrete' : 'compromisso', titulo: e.title, quando: fmtWhen(e.starts_at), espaco: spaceName(e.space_id) })));
    }
    case 'cancelar_compromisso': {
      const { data, error } = await db.from('events').delete().eq('id', String(input.id)).select('title').maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return JSON.stringify({ ok: false, erro: 'Não encontrado' });
      actions.push({ kind: 'deleted', title: `${data.title} cancelado`, sub: 'Removido da agenda' });
      return JSON.stringify({ ok: true });
    }
    default:
      return JSON.stringify({ ok: false, erro: `Ferramenta desconhecida: ${name}` });
  }
}
