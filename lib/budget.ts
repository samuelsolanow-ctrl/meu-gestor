import { monthRange, todaySP } from '@/lib/format';

type DB = any;

export type BudgetLine = { categoryId: string; name: string; limit: number; spent: number };

/**
 * Orçamento por categoria. O limite vale do mês em que foi definido em diante,
 * até alguém mudar (não precisa recadastrar todo mês).
 */
export async function getBudgets(db: DB, spaceId: string, today = todaySP()): Promise<BudgetLine[]> {
  const { start, end } = monthRange(today);
  const [{ data: rows }, { data: txs }] = await Promise.all([
    db.from('budgets').select('category_id, month, amount, categories(name)').eq('space_id', spaceId).lte('month', start).order('month', { ascending: false }),
    db.from('transactions').select('category_id, amount').eq('space_id', spaceId).eq('kind', 'expense').gte('occurred_on', start).lte('occurred_on', end),
  ]);
  const spent: Record<string, number> = {};
  for (const t of txs ?? []) if (t.category_id) spent[t.category_id] = (spent[t.category_id] ?? 0) + Number(t.amount);
  const seen = new Set<string>();
  const out: BudgetLine[] = [];
  for (const r of rows ?? []) {
    if (seen.has(r.category_id)) continue; // fica com o mais recente
    seen.add(r.category_id);
    out.push({ categoryId: r.category_id, name: r.categories?.name ?? 'Categoria', limit: Number(r.amount), spent: Math.round((spent[r.category_id] ?? 0) * 100) / 100 });
  }
  return out.sort((a, b) => b.spent / b.limit - a.spent / a.limit);
}

/** Define (ou muda) o limite de uma categoria a partir deste mês. Valor 0 remove. */
export async function setBudget(db: DB, spaceId: string, categoryId: string, amount: number, today = todaySP()) {
  const month = monthRange(today).start;
  if (!(amount > 0)) {
    // remove este mês e os anteriores, para o limite deixar de valer
    const { error } = await db.from('budgets').delete().eq('space_id', spaceId).eq('category_id', categoryId).lte('month', month);
    if (error) throw new Error(error.message);
    return null;
  }
  const { error } = await db
    .from('budgets')
    .upsert({ space_id: spaceId, category_id: categoryId, month, amount: Math.round(amount * 100) / 100 }, { onConflict: 'space_id,category_id,month' });
  if (error) throw new Error(error.message);
  return { month, amount };
}
