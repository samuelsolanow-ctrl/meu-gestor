import { addMonths, monthRange, todaySP } from '@/lib/format';

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
};

export async function addTransaction(db: DB, t: NewTransaction) {
  if (!(t.amount > 0)) throw new Error('Valor inválido');
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

export type NewBill = {
  spaceId: string;
  name: string;
  amount: number;
  dueDate: string;
  recurrence?: 'none' | 'monthly' | 'yearly';
  categoryId?: string | null;
  accountId?: string | null;
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
