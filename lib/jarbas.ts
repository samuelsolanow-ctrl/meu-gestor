import type { AppContext } from '@/lib/context';
import { addBill, addTransaction, deleteTransaction, monthSummary, payBill, updateTransaction } from '@/lib/finance';
import { addDays, addMonths, brl, longDate, monthName, monthRange, todaySP } from '@/lib/format';
import { fmtWhen, localIso, parseLocal } from '@/lib/agenda';
import { ensureSchema } from '@/lib/migrate';
import { invoiceToPay, loadCardData, type Card } from '@/lib/cards';
import { getBudgets, setBudget } from '@/lib/budget';
import { INV_KINDS, addInvestment, listInvestments, moveInvestment } from '@/lib/investments';

/** Ação mostrada como cartão no chat */
export type ChatAction = { kind: 'transaction' | 'bill' | 'paid' | 'goal' | 'deleted' | 'event'; title: string; sub: string; amount?: number; income?: boolean };

/** Ferramentas que só gravam algo: quando todas dão certo, a confirmação já escrita basta (resposta mais rápida). */
export const WRITE_TOOLS = new Set(['registrar_lancamento', 'criar_conta_a_pagar', 'marcar_conta_paga', 'apagar_lancamento', 'criar_meta', 'aportar_meta', 'agendar', 'cancelar_compromisso', 'parcelar_lancamento', 'pagar_fatura', 'definir_orcamento', 'editar_lancamento', 'lembrar', 'esquecer', 'editar_conta_a_pagar', 'apagar_conta_a_pagar', 'registrar_investimento', 'movimentar_investimento']);

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
        valor: { type: 'number', description: 'Valor TOTAL em reais, positivo. Compra parcelada: o total ("10x de 410" → 4100).' },
        parcelas: { type: 'integer', description: 'Número de parcelas se for compra parcelada (ex.: 10). Omita se for à vista.' },
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
    name: 'parcelar_lancamento',
    description: 'Transforma um lançamento já feito à vista em compra parcelada (ex.: lançou 4100 mas foi em 10x). Mantém data, cartão e categoria.',
    input_schema: { type: 'object', properties: { lancamento_id: { type: 'string' }, parcelas: { type: 'integer' } }, required: ['lancamento_id', 'parcelas'] },
  },
  {
    name: 'editar_lancamento',
    description: 'Corrige um lançamento já feito: valor, descrição, categoria, data, conta/cartão ou espaço. Envie só o que muda. Em compra parcelada, valor = novo TOTAL e muda todas as parcelas.',
    input_schema: {
      type: 'object',
      properties: {
        lancamento_id: { type: 'string' },
        valor: { type: 'number' },
        descricao: { type: 'string' },
        categoria: { type: 'string' },
        data: { type: 'string', description: 'AAAA-MM-DD' },
        conta: { type: 'string' },
        espaco: { type: 'string', enum: ['casal', 'pessoal'] },
      },
      required: ['lancamento_id'],
    },
  },
  {
    name: 'editar_conta_a_pagar',
    description: 'Corrige uma conta a pagar: nome, valor, vencimento, repetição ou com quantos dias de antecedência avisar. Envie só o que muda. Use o id de listar_contas_a_pagar.',
    input_schema: {
      type: 'object',
      properties: {
        conta_id: { type: 'string' },
        nome: { type: 'string' },
        valor: { type: 'number' },
        vencimento: { type: 'string', description: 'AAAA-MM-DD' },
        recorrencia: { type: 'string', enum: ['none', 'monthly', 'yearly'] },
        avisar_dias_antes: { type: 'integer' },
      },
      required: ['conta_id'],
    },
  },
  {
    name: 'apagar_conta_a_pagar',
    description: 'Exclui uma conta a pagar cadastrada (não é pagar; é remover).',
    input_schema: { type: 'object', properties: { conta_id: { type: 'string' } }, required: ['conta_id'] },
  },
  {
    name: 'ver_investimentos',
    description: 'Lista os investimentos (separados das receitas/despesas): nome, onde está, titular, aplicado, valor atual e rendimento.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'registrar_investimento',
    description: 'Cadastra uma aplicação nova para acompanhar (ex.: "tenho 20 mil num CDB na Ágora"). NÃO é despesa nem receita.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Ex.: CDB 110% CDI, Tesouro Selic 2029, PETR4' },
        tipo: { type: 'string', enum: Object.keys(INV_KINDS) },
        instituicao: { type: 'string', description: 'Ágora, Santander…' },
        titular: { type: 'string', description: 'Nome da pessoa ou Família' },
        valor_aplicado: { type: 'number' },
        valor_atual: { type: 'number', description: 'Se diferente do aplicado' },
      },
      required: ['nome', 'valor_aplicado'],
    },
  },
  {
    name: 'movimentar_investimento',
    description: 'Num investimento existente: aporte (colocou mais), resgate (tirou) ou atualizacao (informou quanto vale hoje).',
    input_schema: {
      type: 'object',
      properties: {
        investimento: { type: 'string', description: 'Nome ou id do investimento' },
        tipo: { type: 'string', enum: ['aporte', 'resgate', 'atualizacao'] },
        valor: { type: 'number' },
        data: { type: 'string', description: 'AAAA-MM-DD; omita para hoje' },
      },
      required: ['investimento', 'tipo', 'valor'],
    },
  },
  {
    name: 'lembrar',
    description: 'Guarda na memória um fato duradouro que a pessoa contou e que ajuda no futuro (salário cai dia 5, aluguel é 2.000, mercado preferido, plano de trocar de carro, preferências). Não use para gastos (isso é lançamento) nem compromissos (isso é agenda).',
    input_schema: { type: 'object', properties: { fato: { type: 'string', description: 'Frase curta e objetiva' }, espaco: { type: 'string', enum: ['casal', 'pessoal'], description: 'pessoal se for algo só da pessoa' } }, required: ['fato'] },
  },
  {
    name: 'esquecer',
    description: 'Apaga um fato da memória (use o id da lista de memória).',
    input_schema: { type: 'object', properties: { memoria_id: { type: 'string' } }, required: ['memoria_id'] },
  },
  {
    name: 'definir_orcamento',
    description: 'Define o limite mensal de gasto de uma categoria (vale todo mês até mudar). Valor 0 remove o limite.',
    input_schema: { type: 'object', properties: { categoria: { type: 'string' }, valor: { type: 'number' }, espaco: { type: 'string', enum: ['casal', 'pessoal'] } }, required: ['categoria', 'valor', 'espaco'] },
  },
  {
    name: 'ver_orcamento',
    description: 'Mostra o orçamento do mês: limite e quanto já foi gasto em cada categoria.',
    input_schema: { type: 'object', properties: { espaco: { type: 'string', enum: ['casal', 'pessoal'] } }, required: ['espaco'] },
  },
  {
    name: 'ver_cartoes',
    description: 'Mostra os cartões de crédito: fatura atual (total, fechamento, vencimento, status), próximas faturas, limite usado e disponível.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'pagar_fatura',
    description: 'Marca a fatura do cartão como paga. NÃO lança despesa nova (as compras já estão lançadas).',
    input_schema: { type: 'object', properties: { cartao: { type: 'string', description: 'Nome do cartão' }, fatura: { type: 'string', description: 'AAAA-MM da fatura; omita para a fatura da vez' } }, required: ['cartao'] },
  },
  {
    name: 'apagar_lancamento',
    description: 'Apaga um lançamento (por exemplo quando a pessoa pede para desfazer). Se for parcelado, apaga todas as parcelas. Use o id de listar_lancamentos ou de um registro feito agora.',
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
- Cartão de crédito: compra parcelada ("10x", "em 10 vezes", "parcelei") → registrar_lancamento com valor TOTAL e parcelas; o app cria uma parcela por fatura. Se a pessoa disser só o valor da parcela ("10 de 410"), multiplique. Se disser que um lançamento já feito foi parcelado, use parcelar_lancamento. Pagar a fatura do cartão → pagar_fatura (nunca registre a fatura como despesa, senão conta em dobro). Perguntas sobre fatura, limite ou cartão → ver_cartoes.
- Investimentos ficam SEPARADOS: aplicar, aportar, resgatar ou atualizar o valor de um investimento nunca é registrar_lancamento (não é gasto nem receita). Use registrar_investimento (novo) ou movimentar_investimento (existente). Rendimento = valor atual − aplicado.
- Contas a pagar: dá para corrigir (editar_conta_a_pagar) e mudar o aviso ("me avisa 5 dias antes da escola" → avisar_dias_antes = 5).
- Orçamento: "quero gastar no máximo 800 com mercado" → definir_orcamento. "Como está o orçamento?", "ainda posso gastar com lazer?" → ver_orcamento. Ao lançar um gasto numa categoria que passou de 80% do limite, avise em poucas palavras.
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

INTELIGÊNCIA (é o que faz você valer a pena):
- Você já recebe abaixo um RETRATO atualizado das finanças, agenda e memória. Use-o para responder na hora, sem chamar ferramenta, sempre que ele bastar. Use ferramentas para gravar, corrigir ou quando precisar de detalhe que não está no retrato.
- Entenda a intenção, não só as palavras. "Dá pra eu comprar um tênis de 600?" → olhe saldo previsto do fim do mês, orçamento da categoria e faturas que vêm por aí, e responda sim/não com o motivo em uma frase. "Tô gastando muito?" → compare com orçamento e com o que entrou.
- Correções ("não, foi 95", "era no cartão", "muda pra lazer", "esse foi pessoal") → editar_lancamento no lançamento que acabou de ser feito (o id está nos últimos lançamentos do retrato). Nunca crie um novo por cima.
- Quando a pessoa contar algo duradouro sobre a vida financeira ou a rotina (salário, dia de pagamento, planos, preferências), guarde com lembrar, sem anunciar. Use a memória para personalizar e não pergunte o que já sabe.
- Faça contas com cuidado (parcelas, sobra, quanto falta para a meta, quanto por mês para chegar lá).
- Para cotações, juros, Selic, CDI, dólar, notícias ou qualquer coisa do mundo real que mude com o tempo, use web_search. Não invente números do mercado. Investimentos: explique e compare de forma prática; não recomende comprar um papel específico como certeza.
- Seja proativo quando fizer diferença: se ao lançar notar que uma categoria estourou, que uma fatura vence amanhã ou que um compromisso conflita, diga em poucas palavras.

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
  const today = todaySP();
  const safe = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);
  const [{ data: cats }, { data: accounts }, { data: members }, { data: agenda }, famMonth, myMonth, famBudget, bills, recent, goals, memory, prevMonth, invest] = await Promise.all([
    db.from('categories').select('name, kind').order('name'),
    db.from('accounts').select('id, name, type, institution, space_id, closing_day, due_day, credit_limit').eq('archived', false),
    db.from('profiles').select('id, display_name'),
    db.from('events').select('title, starts_at').gte('starts_at', now.toISOString()).lte('starts_at', new Date(now.getTime() + 7 * 86_400_000).toISOString()).order('starts_at').limit(15),
    safe(monthSummary(db, ctx.casal.id, today), null),
    safe(monthSummary(db, ctx.pessoal.id, today), null),
    safe(getBudgets(db, ctx.casal.id, today), []),
    db.from('bills').select('id, name, amount, due_date, space_id, recurrence').eq('status', 'open').lte('due_date', addDays(today, 20)).order('due_date').limit(12),
    db.from('transactions').select('id, kind, amount, description, occurred_on, space_id, installment_no, installment_total, categories(name), accounts(name)').order('created_at', { ascending: false }).limit(10),
    db.from('goals').select('name, target_amount, current_amount, deadline, space_id').order('created_at'),
    db.from('jarbas_memory').select('id, fact, space_id').order('created_at', { ascending: false }).limit(60),
    safe(monthSummary(db, ctx.casal.id, addMonths(today, -1)), null),
    safe(listInvestments(db), null as any),
  ]);
  const cardRows = ((accounts ?? []) as any[]).filter((a) => a.type === 'credit_card');
  const cardData = await safe(loadCardData(db, cardRows as Card[], today), new Map() as any);
  const sp = (id: string) => (id === ctx.casal.id ? 'Família' : 'pessoal');
  const money = (n: number) => brl(n);
  const monthLine = (m: any) => (m ? `entrou ${money(m.income)}, saiu ${money(m.expense)}, saldo ${money(m.balance)}${m.categories.length ? `; por categoria: ${m.categories.slice(0, 6).map((c: any) => `${c.name} ${money(c.total)}`).join(', ')}` : ''}` : 'sem dados');
  const billsOpen = (bills.data ?? []) as any[];
  const famBillsLeft = billsOpen.filter((b) => b.space_id === ctx.casal.id && b.due_date <= monthRange(today).end).reduce((s, b) => s + Number(b.amount), 0);
  const snapshot = [
    `RETRATO (atualizado agora):`,
    `Família em ${monthName(today)}: ${monthLine(famMonth)}. Previsto no fim do mês (descontando contas a vencer): ${famMonth ? money(famMonth.balance - famBillsLeft) : '?'}.`,
    `Mês passado na Família: ${monthLine(prevMonth)}.`,
    `Pessoal de ${ctx.name.split(' ')[0]} em ${monthName(today)}: ${monthLine(myMonth)}.`,
    `Orçamento da Família: ${famBudget.length ? famBudget.map((b) => `${b.name} ${money(b.spent)} de ${money(b.limit)}`).join('; ') : 'nenhum limite definido'}.`,
    `Cartões: ${
      cardRows.length
        ? cardRows
            .map((c) => {
              const d = cardData.get(c.id);
              if (!d) return c.name;
              const inv = invoiceToPay(d.invoices, d.current);
              const next = [...d.invoices.values()].filter((i: any) => i.key > d.current && i.total > 0).slice(0, 3).map((i: any) => `${i.key} ${money(i.total)}`).join(', ');
              return `${c.name} (${sp(c.space_id)}): fatura ${inv.key} ${money(inv.total)} ${inv.status}, vence ${inv.dueOn}${c.credit_limit ? `, limite disponível ${money(Number(c.credit_limit) - d.used)} de ${money(Number(c.credit_limit))}` : ''}${next ? `; próximas: ${next}` : ''}`;
            })
            .join(' | ')
        : 'nenhum cadastrado'
    }.`,
    `Contas a pagar (próx. 20 dias): ${billsOpen.length ? billsOpen.map((b) => `[id ${b.id}] ${b.name} ${money(Number(b.amount))} vence ${b.due_date}${b.recurrence === 'monthly' ? ' mensal' : ''} (${sp(b.space_id)})`).join('; ') : 'nenhuma'}.`,
    `Investimentos (separados do saldo): ${invest && invest.items.length ? `total ${money(invest.current)} (aplicado ${money(invest.invested)}, rendimento ${money(invest.gain)}); ` + invest.items.map((i: any) => `${i.name}${i.institution ? ` na ${i.institution}` : ''}${i.owner_name ? ` (${i.owner_name})` : ''} ${money(i.current_value)}`).join('; ') : 'nenhum cadastrado'}.`,
    `Metas: ${(goals.data ?? []).length ? (goals.data as any[]).map((g) => `${g.name} ${money(Number(g.current_amount))} de ${money(Number(g.target_amount))}${g.deadline ? ` até ${g.deadline}` : ''} (${sp(g.space_id)})`).join('; ') : 'nenhuma'}.`,
    `Últimos lançamentos (mais novo primeiro): ${((recent.data ?? []) as any[]).map((t) => `[id ${t.id}] ${t.occurred_on} ${t.kind === 'income' ? '+' : '-'}${money(Number(t.amount))} ${t.description}${t.installment_total ? ` ${t.installment_no}/${t.installment_total}` : ''} · ${t.categories?.name ?? 'sem categoria'}${t.accounts?.name ? ` · ${t.accounts.name}` : ''} · ${sp(t.space_id)}`).join(' | ') || 'nenhum'}.`,
    `Memória (o que você já sabe sobre eles): ${((memory.data ?? []) as any[]).map((m) => `[${m.id}] ${m.fact}${m.space_id === ctx.casal.id ? '' : ' (pessoal)'}`).join(' | ') || 'nada ainda'}.`,
  ].join('\n');
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
Agenda dos próximos 7 dias: ${proximos || 'nada marcado'}.

${snapshot}`;

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
        installments: Number(input.parcelas) || 1,
      });
      const parc = (tx as any).installments as number | undefined;
      actions.push({
        kind: 'transaction',
        title: tx.description,
        sub: parc
          ? `${parc}x de ${brl((tx as any).installment_amount)} · ${spaceName(spaceId(input.espaco))} · 1ª em ${longDate(tx.occurred_on)}`
          : `${tx.categories?.name ?? 'Sem categoria'} · ${spaceName(spaceId(input.espaco))} · ${longDate(tx.occurred_on)}`,
        amount: parc ? Number((tx as any).total) : Number(tx.amount),
        income: kind === 'income',
      });
      let orcamento: any = undefined;
      if (kind === 'expense' && tx.categories?.name) {
        const line = (await getBudgets(db, spaceId(input.espaco))).find((x) => x.name === tx.categories.name);
        if (line && line.spent >= line.limit * 0.8) orcamento = { limite: line.limit, gasto_no_mes: line.spent };
      }
      return JSON.stringify({ ok: true, lancamento_id: tx.id, categoria: tx.categories?.name ?? null, orcamento, ...(parc ? { parcelas: parc, valor_parcela: (tx as any).installment_amount } : {}) });
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
        .select('id, kind, amount, description, occurred_on, installment_no, installment_total, categories(name), accounts(name)')
        .eq('space_id', spaceId(input.espaco))
        .gte('occurred_on', input.de)
        .lte('occurred_on', input.ate)
        .order('occurred_on', { ascending: false })
        .limit(60);
      if (input.busca) q = q.ilike('description', `%${input.busca}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return JSON.stringify(
        (data ?? []).map((t: any) => ({ id: t.id, tipo: t.kind === 'income' ? 'receita' : 'despesa', valor: Number(t.amount), descricao: t.description, data: t.occurred_on, categoria: t.categories?.name ?? null, conta: t.accounts?.name ?? null, ...(t.installment_total ? { parcela: `${t.installment_no}/${t.installment_total}` } : {}) })),
      );
    }
    case 'apagar_lancamento': {
      const data = await deleteTransaction(db, String(input.lancamento_id));
      if (!data.length) return JSON.stringify({ ok: false, erro: 'Lançamento não encontrado' });
      const total = data.reduce((s: number, r: any) => s + Number(r.amount), 0);
      actions.push({ kind: 'deleted', title: `${data[0].description} apagado`, sub: data.length > 1 ? `${data.length} parcelas desfeitas` : 'Lançamento desfeito', amount: Math.round(total * 100) / 100 });
      return JSON.stringify({ ok: true, apagados: data.length });
    }
    case 'parcelar_lancamento': {
      const n = Math.floor(Number(input.parcelas));
      if (!(n > 1)) return JSON.stringify({ ok: false, erro: 'Número de parcelas inválido' });
      const { data: t } = await db.from('transactions').select('*').eq('id', String(input.lancamento_id)).maybeSingle();
      if (!t) return JSON.stringify({ ok: false, erro: 'Lançamento não encontrado' });
      if (t.installment_total) return JSON.stringify({ ok: false, erro: 'Esse lançamento já é parcelado' });
      const tx: any = await addTransaction(db, {
        spaceId: t.space_id, kind: t.kind, amount: Number(t.amount), description: t.description,
        categoryId: t.category_id, accountId: t.account_id, occurredOn: t.occurred_on, source: 'chat', installments: n,
      });
      await db.from('transactions').delete().eq('id', t.id);
      actions.push({ kind: 'transaction', title: t.description, sub: `Agora em ${n}x de ${brl(tx.installment_amount)}`, amount: Number(t.amount) });
      return JSON.stringify({ ok: true, parcelas: n, valor_parcela: tx.installment_amount });
    }
    case 'editar_lancamento': {
      const t = await updateTransaction(db, String(input.lancamento_id), {
        amount: input.valor ? Number(input.valor) : undefined,
        description: input.descricao ? String(input.descricao) : undefined,
        categoryId: input.categoria ? await categoryId(input.categoria, input.tipo === 'receita' ? 'income' : 'expense') : undefined,
        accountId: input.conta ? await accountId(input.conta) : undefined,
        occurredOn: input.data ? String(input.data) : undefined,
        spaceId: input.espaco ? spaceId(input.espaco) : undefined,
      });
      actions.push({ kind: 'transaction', title: `${input.descricao ?? t.description} corrigido`, sub: 'Lançamento atualizado', amount: input.valor ? Number(input.valor) : Number(t.amount), income: t.kind === 'income' });
      return JSON.stringify({ ok: true });
    }
    case 'lembrar': {
      await ensureSchema();
      const fact = String(input.fato ?? '').trim().slice(0, 300);
      if (!fact) return JSON.stringify({ ok: false });
      const { error } = await db.from('jarbas_memory').insert({ space_id: input.espaco === 'pessoal' ? ctx.pessoal.id : ctx.casal.id, fact });
      if (error) throw new Error(error.message);
      return JSON.stringify({ ok: true });
    }
    case 'esquecer': {
      const { error } = await db.from('jarbas_memory').delete().eq('id', String(input.memoria_id));
      if (error) throw new Error(error.message);
      return JSON.stringify({ ok: true });
    }
    case 'editar_conta_a_pagar': {
      await ensureSchema();
      const patch: any = {};
      if (input.nome) patch.name = String(input.nome);
      if (input.valor) patch.amount = Math.round(Number(input.valor) * 100) / 100;
      if (input.vencimento) patch.due_date = String(input.vencimento);
      if (input.recorrencia) patch.recurrence = String(input.recorrencia);
      if (input.avisar_dias_antes != null) patch.remind_days = Math.max(0, Math.min(15, Number(input.avisar_dias_antes)));
      const { data, error } = await db.from('bills').update(patch).eq('id', String(input.conta_id)).select('name, amount, due_date').maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return JSON.stringify({ ok: false, erro: 'Conta não encontrada' });
      actions.push({ kind: 'bill', title: `${data.name} atualizada`, sub: `Vence ${longDate(data.due_date)}`, amount: Number(data.amount) });
      return JSON.stringify({ ok: true });
    }
    case 'apagar_conta_a_pagar': {
      const { data, error } = await db.from('bills').delete().eq('id', String(input.conta_id)).select('name, amount').maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return JSON.stringify({ ok: false, erro: 'Conta não encontrada' });
      actions.push({ kind: 'deleted', title: `${data.name} excluída`, sub: 'Conta a pagar removida', amount: Number(data.amount) });
      return JSON.stringify({ ok: true });
    }
    case 'ver_investimentos': {
      const inv = await listInvestments(db);
      return JSON.stringify({
        total_atual: inv.current, total_aplicado: inv.invested, rendimento: inv.gain, rendimento_pct: inv.gainPct,
        itens: inv.items.map((i: any) => ({ id: i.id, nome: i.name, tipo: INV_KINDS[i.kind] ?? i.kind, onde: i.institution, titular: i.owner_name, aplicado: i.invested, atual: i.current_value, atualizado_em: String(i.updated_at).slice(0, 10) })),
      });
    }
    case 'registrar_investimento': {
      const it = await addInvestment(db, {
        spaceId: ctx.casal.id, name: String(input.nome), kind: input.tipo, institution: input.instituicao ?? null,
        owner: input.titular ?? ctx.name.split(' ')[0], invested: Number(input.valor_aplicado), current: input.valor_atual ? Number(input.valor_atual) : null,
      });
      actions.push({ kind: 'goal', title: it.name, sub: `Investimento · ${[it.institution, it.owner_name].filter(Boolean).join(' · ')}`, amount: Number(it.current_value) });
      return JSON.stringify({ ok: true, id: it.id });
    }
    case 'movimentar_investimento': {
      const inv = await listInvestments(db);
      const q = norm(String(input.investimento ?? ''));
      const hit = inv.items.find((i: any) => i.id === input.investimento) ?? inv.items.find((i: any) => norm(i.name) === q) ?? inv.items.find((i: any) => norm(i.name).includes(q) || q.includes(norm(i.name)) || (i.institution && q.includes(norm(i.institution))));
      if (!hit) return JSON.stringify({ ok: false, erro: 'Investimento não encontrado', existentes: inv.items.map((i: any) => i.name) });
      const after = await moveInvestment(db, hit.id, input.tipo, Number(input.valor), input.data);
      const label = input.tipo === 'aporte' ? 'Aporte' : input.tipo === 'resgate' ? 'Resgate' : 'Valor atualizado';
      actions.push({ kind: 'goal', title: `${hit.name} · ${label}`, sub: `Agora vale ${brl(after.current_value)}`, amount: Number(input.valor) });
      return JSON.stringify({ ok: true, valor_atual: after.current_value, aplicado: after.invested });
    }
    case 'definir_orcamento': {
      const cat = await categoryId(input.categoria, 'expense');
      if (!cat) return JSON.stringify({ ok: false, erro: 'Categoria não encontrada' });
      await setBudget(db, spaceId(input.espaco), cat, Number(input.valor));
      actions.push({ kind: 'goal', title: `Orçamento · ${input.categoria}`, sub: Number(input.valor) > 0 ? `Limite mensal · ${spaceName(spaceId(input.espaco))}` : 'Limite removido', amount: Number(input.valor) > 0 ? Number(input.valor) : undefined });
      return JSON.stringify({ ok: true });
    }
    case 'ver_orcamento': {
      const b = await getBudgets(db, spaceId(input.espaco));
      if (!b.length) return JSON.stringify({ ok: true, orcamento: 'nenhum limite definido' });
      return JSON.stringify(b.map((x) => ({ categoria: x.name, limite: x.limit, gasto: x.spent, restante: Math.round((x.limit - x.spent) * 100) / 100 })));
    }
    case 'ver_cartoes':
    case 'pagar_fatura': {
      await ensureSchema();
      const { data: cards } = await db.from('accounts').select('id, name, institution, space_id, closing_day, due_day, credit_limit').eq('type', 'credit_card').eq('archived', false);
      if (!cards?.length) return JSON.stringify({ ok: false, erro: 'Nenhum cartão cadastrado. Cadastre na aba Cartões.' });
      const data = await loadCardData(db, cards as Card[]);
      if (name === 'ver_cartoes') {
        return JSON.stringify(
          (cards as Card[]).map((c) => {
            const d = data.get(c.id)!;
            const invs = [...d.invoices.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
            const cur = d.invoices.get(d.current)!;
            const pay = invoiceToPay(d.invoices, d.current);
            return {
              cartao: c.name,
              de_quem: spaceName(c.space_id),
              fatura_atual: { mes: cur.key, total: cur.total, fecha: cur.closesOn, vence: cur.dueOn, status: cur.status },
              fatura_para_pagar: pay.key !== cur.key ? { mes: pay.key, total: pay.total, vence: pay.dueOn, status: pay.status } : null,
              proximas: invs.filter((i) => i.key > d.current).slice(0, 6).map((i) => ({ mes: i.key, total: i.total })),
              limite: c.credit_limit ? Number(c.credit_limit) : null,
              usado: d.used,
              disponivel: c.credit_limit ? Math.round((Number(c.credit_limit) - d.used) * 100) / 100 : null,
            };
          }),
        );
      }
      const nm = norm(String(input.cartao ?? ''));
      const card = (cards as Card[]).find((c) => norm(c.name) === nm) ?? (cards as Card[]).find((c) => norm(c.name).includes(nm) || nm.includes(norm(c.name)) || (c.institution && nm.includes(norm(c.institution))));
      if (!card) return JSON.stringify({ ok: false, erro: 'Cartão não encontrado', cartoes: cards.map((c: any) => c.name) });
      const d = data.get(card.id)!;
      const inv = input.fatura ? d.invoices.get(String(input.fatura)) : invoiceToPay(d.invoices, d.current);
      if (!inv) return JSON.stringify({ ok: false, erro: 'Fatura não encontrada' });
      const { error } = await db.from('card_invoices').upsert({ account_id: card.id, invoice_key: inv.key });
      if (error) throw new Error(error.message);
      actions.push({ kind: 'paid', title: `Fatura ${card.name} paga`, sub: `Vencimento ${longDate(inv.dueOn)}`, amount: inv.total });
      return JSON.stringify({ ok: true, fatura: inv.key, total: inv.total });
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
