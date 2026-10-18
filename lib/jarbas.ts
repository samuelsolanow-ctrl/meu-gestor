import type { AppContext } from '@/lib/context';
import { addBill, addTransaction, monthSummary, payBill } from '@/lib/finance';
import { brl, longDate, todaySP } from '@/lib/format';

/** Ação mostrada como cartão no chat */
export type ChatAction = { kind: 'transaction' | 'bill' | 'paid' | 'goal' | 'deleted'; title: string; sub: string; amount?: number; income?: boolean };

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
    name: 'aportar_meta',
    description: 'Soma um valor guardado em uma meta (use valor negativo para retirar).',
    input_schema: {
      type: 'object',
      properties: { meta_id: { type: 'string' }, valor: { type: 'number' } },
      required: ['meta_id', 'valor'],
    },
  },
] as const;

export async function buildSystemPrompt(ctx: AppContext) {
  const db = ctx.supabase;
  const [{ data: cats }, { data: accounts }, { data: members }] = await Promise.all([
    db.from('categories').select('name, kind').order('name'),
    db.from('accounts').select('name, type, institution, space_id').eq('archived', false),
    db.from('profiles').select('id, display_name'),
  ]);
  const today = todaySP();
  const weekday = WEEKDAYS[new Date(Date.parse(today + 'T12:00:00Z')).getUTCDay()];
  const others = (members ?? []).filter((m: any) => m.id !== ctx.userId).map((m: any) => m.display_name);
  const expense = (cats ?? []).filter((c: any) => c.kind === 'expense').map((c: any) => c.name).join(', ');
  const income = (cats ?? []).filter((c: any) => c.kind === 'income').map((c: any) => c.name).join(', ');
  const accs = (accounts ?? [])
    .map((a: any) => `${a.name}${a.institution ? ` (${a.institution})` : ''} — ${a.space_id === ctx.casal.id ? 'família' : 'pessoal'}`)
    .join('; ');

  return `Você é o Jarbas, assessor financeiro e pessoal da família dentro do app Meu Gestor.
Você conversa com ${ctx.name}${others.length ? ` (que divide o espaço Casal com ${others.join(' e ')})` : ''}.
Hoje é ${weekday}, ${longDate(today)} (${today}). Fuso: São Paulo.

Espaços:
- "casal": a Família, as finanças da casa (no app aparece como "Família"). O dinheiro do casal é todo junto. É o PADRÃO: use quando a pessoa não disser nada.
- "pessoal": só de ${ctx.name}. Use apenas se a pessoa disser que é pessoal, "só meu", "da minha conta", etc.
Você não tem acesso ao espaço pessoal de outra pessoa.

Categorias de despesa: ${expense || '(nenhuma)'}.
Categorias de receita: ${income || '(nenhuma)'}.
Contas e cartões cadastrados: ${accs || 'nenhum ainda (pode lançar sem conta)'}.

Como agir:
- Quando a pessoa contar um gasto ou receita, registre na hora com registrar_lancamento, escolhendo a categoria mais adequada da lista. Não peça confirmação para coisas óbvias.
- Datas relativas ("ontem", "sexta") viram AAAA-MM-DD com base em hoje.
- "Paguei a conta de luz" → procure com listar_contas_a_pagar e use marcar_conta_paga; se não existir conta cadastrada, registre como despesa.
- Para perguntas ("quanto gastamos com mercado?", "dá para viajar em julho?"), consulte os dados com as ferramentas antes de responder. Nunca invente números.
- Se faltar um dado essencial (o valor, por exemplo), pergunte de forma curta.
- Você sugere, mas não move dinheiro nem compra investimentos. Em recomendações, mostre os números e o raciocínio.
- Responda em português do Brasil, curto e simpático, como numa conversa de WhatsApp. Valores sempre no formato R$ 1.234,56. Sem markdown pesado: no máximo listas simples.
- Depois de registrar algo, confirme em uma frase (o app já mostra um cartão com os detalhes).
- Você também manda avisos sozinho: às 8h sobre contas que vencem e às 21h perguntando dos gastos do dia. Se a pessoa responder a um aviso ("paguei", "não teve nada", "gastei 30 no almoço"), aja de acordo.
- As respostas podem ser lidas em voz alta: prefira frases curtas e naturais, sem listas longas.`;
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
    default:
      return JSON.stringify({ ok: false, erro: `Ferramenta desconhecida: ${name}` });
  }
}
