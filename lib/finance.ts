import { addMonths, monthRange, todaySP } from '@/lib/format';
import { ensureSchema } from '@/lib/migrate';

type DB = any; // cliente do Supabase já autenticado (as regras de privacidade valem aqui)

export type NewTransaction = {
  spaceId: string;
  kind: 'income' | 'expense';
  amount: number;
  description: string;
  categoryId?: string | null;
  accountId?: string | null;
  occurredOn?: string;
  source?: 'chat' | 'form' | 'import' | 'photo';
  /** Número de parcelas (compra parcelada). O valor é o TOTAL da compra. */
  installments?: number;
};

export async function addTransaction(db: DB, t: NewTransaction) {
  if (!(t.amount > 0)) throw new Error('Valor inválido');
  const n = Math.floor(Number(t.installments) || 1);
  if (n > 1) return addInstallments(db, t, Math.min(n, 48));
  const { data, error } = await db
    .from('transactions')
    .insert({
      space_id: t.spaceId,
      kind: t.kind,
      amount: Math.round(t.amount * 100) / 100,
      description: t.description.trim() || (t.kind === 'income' ? 'Receita' : 'Despesa'),
      category_id: t.categoryId || null,
      account_id: t.accountId || null,
      occurred_on: t.occurredOn || todaySP(),
      source: t.source ?? 'form',
    })
    .select('id, kind, amount, description, occurred_on, categories(name)')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Compra parcelada: cria uma parcela por mês (cada uma cai na fatura certa do cartão). */
async function addInstallments(db: DB, t: NewTransaction, n: number) {
  await ensureSchema();
  const totalCents = Math.round(t.amount * 100);
  const base = Math.floor(totalCents / n);
  const first = t.occurredOn || todaySP();
  const group = crypto.randomUUID();
  const description = t.description.trim() || 'Compra parcelada';
  const rows = Array.from({ length: n }, (_, i) => ({
    space_id: t.spaceId,
    kind: t.kind,
    amount: (i === n - 1 ? totalCents - base * (n - 1) : base) / 100,
    description,
    category_id: t.categoryId || null,
    account_id: t.accountId || null,
    occurred_on: addMonths(first, i),
    installment_no: i + 1,
    installment_total: n,
    installment_group: group,
    source: t.source ?? 'form',
  }));
  const { data, error } = await db
    .from('transactions')
    .insert(rows)
    .select('id, kind, amount, description, occurred_on, installment_no, categories(name)');
  if (error) throw new Error(error.message);
  const firstRow = (data ?? []).find((r: any) => r.installment_no === 1) ?? data?.[0];
  return { ...firstRow, installments: n, installment_amount: base / 100, total: t.amount, group };
}

export type NewBill = {
  spaceId: string;
  name: string;
  amount: number;
  dueDate: string;
  recurrence?: 'none' | 'monthly' | 'yearly';
  categoryId?: string | null;
  accountId?: string | null;
  remindDays?: number;
};

export async function addBill(db: DB, b: NewBill) {
  if (!(b.amount > 0)) throw new Error('Valor inválido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate)) throw new Error('Data de vencimento inválida');
  const { data, error } = await db
    .from('bills')
    .insert({
      space_id: b.spaceId,
      name: b.name.trim(),
      amount: Math.round(b.amount * 100) / 100,
      due_date: b.dueDate,
      recurrence: b.recurrence ?? 'none',
      category_id: b.categoryId || null,
      account_id: b.accountId || null,
      ...(b.remindDays != null ? { remind_days: b.remindDays } : {}),
    })
    .select('id, name, amount, due_date, recurrence')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Marca a conta como paga, lança a despesa e, se for recorrente,
 * já cria a conta do próximo período.
 */
export async function payBill(db: DB, billId: string, source: 'chat' | 'form' = 'form') {
  const { data: bill, error } = await db.from('bills').select('*').eq('id', billId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!bill) throw new Error('Conta não encontrada');
  if (bill.status === 'paid') return { bill, alreadyPaid: true };

  const { error: upErr } = await db
    .from('bills')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', billId);
  if (upErr) throw new Error(upErr.message);

  await addTransaction(db, {
    spaceId: bill.space_id,
    kind: 'expense',
    amount: Number(bill.amount),
    description: bill.name,
    categoryId: bill.category_id,
    accountId: bill.account_id,
    source,
  });

  let next = null;
  if (bill.recurrence === 'monthly' || bill.recurrence === 'yearly') {
    next = await addBill(db, {
      spaceId: bill.space_id,
      name: bill.name,
      amount: Number(bill.amount),
      dueDate: addMonths(bill.due_date, bill.recurrence === 'monthly' ? 1 : 12),
      recurrence: bill.recurrence,
      categoryId: bill.category_id,
      accountId: bill.account_id,
      remindDays: bill.remind_days ?? undefined,
    });
  }
  return { bill, alreadyPaid: false, next };
}

export async function monthSummary(db: DB, spaceId: string, refDate: string = todaySP()) {
  const { start, end, key } = monthRange(refDate);
  const { data, error } = await db
    .from('transactions')
    .select('kind, amount, categories(name)')
    .eq('space_id', spaceId)
    .gte('occurred_on', start)
    .lte('occurred_on', end);
  if (error) throw new Error(error.message);

  let income = 0;
  let expense = 0;
  const byCategory: Record<string, number> = {};
  for (const t of data ?? []) {
    const v = Number(t.amount);
    if (t.kind === 'income') income += v;
    else {
      expense += v;
      const cat = t.categories?.name ?? 'Sem categoria';
      byCategory[cat] = (byCategory[cat] ?? 0) + v;
    }
  }
  const categories = Object.entries(byCategory)
    .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  return {
    month: key,
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    balance: Math.round((income - expense) * 100) / 100,
    categories,
  };
}

export type TxPatch = {
  amount?: number;
  description?: string;
  categoryId?: string | null;
  accountId?: string | null;
  occurredOn?: string;
  spaceId?: string;
};

/** Corrige um lançamento. Em compra parcelada: valor = novo TOTAL, data = 1ª parcela, vale para todas. */
export async function updateTransaction(db: DB, id: string, p: TxPatch) {
  await ensureSchema();
  const { data: t, error } = await db.from('transactions').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) throw new Error('Lançamento não encontrado');
  const patch: any = {};
  if (p.description !== undefined) patch.description = p.description.trim() || t.description;
  if (p.categoryId !== undefined) patch.category_id = p.categoryId;
  if (p.accountId !== undefined) patch.account_id = p.accountId;
  if (p.spaceId) patch.space_id = p.spaceId;
  const group = t.installment_group as string | null;
  if (group) {
    if (Object.keys(patch).length) {
      const { error: e } = await db.from('transactions').update(patch).eq('installment_group', group);
      if (e) throw new Error(e.message);
    }
    if (p.amount || p.occurredOn) {
      const { data: parts } = await db.from('transactions').select('id, amount, occurred_on, installment_no').eq('installment_group', group).order('installment_no');
      const list = parts ?? [];
      const n = list.length || 1;
      const total = p.amount ?? list.reduce((s: number, x: any) => s + Number(x.amount), 0);
      const first = p.occurredOn || list[0]?.occurred_on || t.occurred_on;
      const cents = Math.round(total * 100);
      const base = Math.floor(cents / n);
      await Promise.all(
        list.map((x: any, i: number) =>
          db.from('transactions').update({ amount: (i === n - 1 ? cents - base * (n - 1) : base) / 100, occurred_on: addMonths(first, i) }).eq('id', x.id),
        ),
      );
    }
  } else {
    if (p.amount) patch.amount = Math.round(p.amount * 100) / 100;
    if (p.occurredOn) patch.occurred_on = p.occurredOn;
    if (Object.keys(patch).length) {
      const { error: e } = await db.from('transactions').update(patch).eq('id', id);
      if (e) throw new Error(e.message);
    }
  }
  return t;
}

/** Apaga o lançamento (e todas as parcelas, se for parcelado). */
export async function deleteTransaction(db: DB, id: string) {
  await ensureSchema();
  const { data: t } = await db.from('transactions').select('id, installment_group').eq('id', id).maybeSingle();
  if (!t) return [];
  const q = db.from('transactions').delete();
  const { data, error } = await (t.installment_group ? q.eq('installment_group', t.installment_group) : q.eq('id', id)).select('description, amount');
  if (error) throw new Error(error.message);
  return data ?? [];
}
