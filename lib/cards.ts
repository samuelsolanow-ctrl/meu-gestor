import { addDays, addMonths, todaySP } from '@/lib/format';

type DB = any;

export type Card = {
  id: string;
  name: string;
  institution: string | null;
  space_id: string;
  closing_day: number | null;
  due_day: number | null;
  credit_limit: number | null;
};

export type CardTx = {
  id: string;
  kind: 'income' | 'expense';
  amount: number;
  description: string;
  occurred_on: string;
  installment_no: number | null;
  installment_total: number | null;
  account_id: string;
  categories?: { name: string } | null;
};

export type Invoice = {
  key: string; // AAAA-MM (mês em que a fatura fecha)
  closesOn: string;
  dueOn: string;
  total: number;
  items: CardTx[];
  status: 'aberta' | 'fechada' | 'vencida' | 'paga';
};

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const r2 = (n: number) => Math.round(n * 100) / 100;

export function shiftKey(key: string, months: number) {
  return addMonths(`${key}-01`, months).slice(0, 7);
}

/** Em qual fatura cai uma compra: até o dia do fechamento entra na fatura do mês; depois, na do mês seguinte. */
export function invoiceKeyFor(date: string, closingDay: number | null) {
  const [y, m, d] = date.split('-').map(Number);
  const key = `${y}-${pad(m)}`;
  if (!closingDay) return key;
  return d > Math.min(closingDay, lastDay(y, m)) ? shiftKey(key, 1) : key;
}

export function invoiceDates(key: string, closingDay: number | null, dueDay: number | null) {
  const [y, m] = key.split('-').map(Number);
  const close = closingDay ? Math.min(closingDay, lastDay(y, m)) : lastDay(y, m);
  const closesOn = `${key}-${pad(close)}`;
  let dueOn: string;
  if (dueDay) {
    const dueKey = dueDay > close ? key : shiftKey(key, 1);
    const [dy, dm] = dueKey.split('-').map(Number);
    dueOn = `${dueKey}-${pad(Math.min(dueDay, lastDay(dy, dm)))}`;
  } else {
    dueOn = addDays(closesOn, 7);
  }
  return { closesOn, dueOn };
}

/** Busca compras do cartão (desde ~3 meses atrás, incluindo parcelas futuras) e monta as faturas. */
export async function loadCardData(db: DB, cards: Card[], today = todaySP()) {
  const ids = cards.map((c) => c.id);
  if (!ids.length) return new Map<string, { invoices: Map<string, Invoice>; current: string; used: number }>();
  const since = addMonths(today, -3);
  const [{ data: txs }, { data: paidRows }] = await Promise.all([
    db
      .from('transactions')
      .select('id, kind, amount, description, occurred_on, installment_no, installment_total, account_id, categories(name)')
      .in('account_id', ids)
      .gte('occurred_on', since)
      .order('occurred_on'),
    db.from('card_invoices').select('account_id, invoice_key').in('account_id', ids),
  ]);
  const paid = new Set((paidRows ?? []).map((p: any) => `${p.account_id}|${p.invoice_key}`));

  const out = new Map<string, { invoices: Map<string, Invoice>; current: string; used: number }>();
  for (const c of cards) {
    const invoices = new Map<string, Invoice>();
    const get = (key: string) => {
      let inv = invoices.get(key);
      if (!inv) {
        const { closesOn, dueOn } = invoiceDates(key, c.closing_day, c.due_day);
        inv = { key, closesOn, dueOn, total: 0, items: [], status: 'aberta' };
        invoices.set(key, inv);
      }
      return inv;
    };
    const current = invoiceKeyFor(today, c.closing_day);
    get(current);
    for (const t of (txs ?? []) as CardTx[]) {
      if (t.account_id !== c.id) continue;
      const inv = get(invoiceKeyFor(t.occurred_on, c.closing_day));
      inv.items.push(t);
      inv.total = r2(inv.total + (t.kind === 'income' ? -1 : 1) * Number(t.amount));
    }
    let used = 0;
    for (const inv of invoices.values()) {
      inv.items.sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1));
      if (paid.has(`${c.id}|${inv.key}`)) inv.status = 'paga';
      else if (today <= inv.closesOn) inv.status = 'aberta';
      else if (today <= inv.dueOn) inv.status = 'fechada';
      else inv.status = 'vencida';
      if (inv.status !== 'paga') used += Math.max(0, inv.total);
    }
    out.set(c.id, { invoices, current, used: r2(used) });
  }
  return out;
}

/** A fatura "da vez" para pagar: a fechada/vencida mais antiga não paga, senão a aberta. */
export function invoiceToPay(invoices: Map<string, Invoice>, current: string) {
  const pending = [...invoices.values()]
    .filter((i) => (i.status === 'fechada' || i.status === 'vencida') && i.total > 0)
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  return pending[0] ?? invoices.get(current)!;
}

export const BANK_COLORS: Record<string, [string, string]> = {
  santander: ['#e11d2e', '#7a0d17'],
  bradesco: ['#cc1f4a', '#5c0b26'],
  neon: ['#00a6c7', '#05475a'],
  caixa: ['#1d5fb8', '#0b2a57'],
  'banco do brasil': ['#e8c21a', '#5a4a05'],
  'ágora': ['#1c3f7a', '#0a1a36'],
  agora: ['#1c3f7a', '#0a1a36'],
  nubank: ['#8a2be2', '#3a0f66'],
  itau: ['#ec7000', '#5c2b00'],
  'itaú': ['#ec7000', '#5c2b00'],
  inter: ['#ff7a00', '#5c2b00'],
};

export function cardColors(c: { name: string; institution: string | null }) {
  const hay = `${c.institution ?? ''} ${c.name}`.toLowerCase();
  for (const [k, v] of Object.entries(BANK_COLORS)) if (hay.includes(k)) return v;
  return ['#3b4a43', '#141a17'] as [string, string];
}
