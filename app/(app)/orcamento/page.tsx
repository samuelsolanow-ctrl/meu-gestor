import Link from 'next/link';
import { getContext, pickSpace } from '@/lib/context';
import { getBudgets } from '@/lib/budget';
import { brl, monthName, monthRange, todaySP } from '@/lib/format';
import { saveBudgetsAction } from '../actions';
import { IconBack } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function OrcamentoPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const ctx = await getContext();
  const { e } = await searchParams;
  const { space, key } = pickSpace(ctx, e);
  const today = todaySP();
  const { start, end } = monthRange(today);
  const [budgets, { data: cats }, { data: txs }] = await Promise.all([
    getBudgets(ctx.supabase, space.id, today),
    ctx.supabase.from('categories').select('id, name').eq('kind', 'expense').order('name'),
    ctx.supabase.from('transactions').select('category_id, amount').eq('space_id', space.id).eq('kind', 'expense').gte('occurred_on', start).lte('occurred_on', end),
  ]);
  const spent: Record<string, number> = {};
  for (const t of txs ?? []) if (t.category_id) spent[t.category_id] = (spent[t.category_id] ?? 0) + Number(t.amount);
  const limitOf = Object.fromEntries(budgets.map((b) => [b.categoryId, b.limit]));
  const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const firstName = ctx.name.split(' ')[0];
  const rows = (cats ?? []).map((c: any) => ({ ...c, spent: spent[c.id] ?? 0, limit: limitOf[c.id] ?? 0 })).sort((a: any, b: any) => (b.limit > 0 ? 1 : 0) - (a.limit > 0 ? 1 : 0) || b.spent - a.spent);

  return (
    <main className="page">
      <header className="row">
        <Link href={key === 'pessoal' ? '/?e=pessoal' : '/'} className="btn btn-icon" aria-label="Voltar ao início" style={{ border: 'none' }}><IconBack /></Link>
        <h1 className="page-title">Orçamento de {monthName(today)}</h1>
      </header>

      <nav className="seg" aria-label="Espaço">
        <Link href="/orcamento?e=pessoal" className={key === 'pessoal' ? 'on' : ''}>{firstName}</Link>
        <Link href="/orcamento" className={key === 'casal' ? 'on' : ''}>Família</Link>
      </nav>

      {totalLimit > 0 && (
        <section className="card stack">
          <div className="label">Gasto nas categorias com limite</div>
          <div className="big-number">{brl(totalSpent)} <span className="small muted" style={{ fontWeight: 500, letterSpacing: 0 }}>de {brl(totalLimit)}</span></div>
          <div className="bar"><span className={totalSpent > totalLimit ? 'warn' : ''} style={{ width: `${Math.min(100, Math.round((totalSpent / totalLimit) * 100))}%` }} /></div>
        </section>
      )}

      <form action={saveBudgetsAction} className="card stack">
        <input type="hidden" name="espaco" value={key} />
        <p className="small muted" style={{ margin: 0 }}>Defina quanto quer gastar por mês em cada categoria. Vale todo mês até você mudar. Deixe vazio para não ter limite.</p>
        <div className="list">
          {rows.map((c: any) => {
            const pct = c.limit > 0 ? Math.round((c.spent / c.limit) * 100) : 0;
            return (
              <div className="item" key={c.id} style={{ alignItems: 'center' }}>
                <div className="grow">
                  <div className="item-title">{c.name}</div>
                  <div className={`item-sub ${pct > 100 ? 'late' : pct >= 80 ? 'warn' : ''}`}>
                    Gasto {brl(c.spent)}{c.limit > 0 ? ` · ${pct}%` : ''}
                  </div>
                </div>
                <label className="sr-only" htmlFor={`b-${c.id}`}>Limite para {c.name}</label>
                <input
                  id={`b-${c.id}`}
                  className="input"
                  name={`b:${c.id}`}
                  inputMode="decimal"
                  placeholder="sem limite"
                  defaultValue={c.limit > 0 ? String(c.limit).replace('.', ',') : ''}
                  style={{ width: 120, textAlign: 'right' }}
                />
              </div>
            );
          })}
        </div>
        <button className="btn btn-primary btn-block">Salvar orçamento</button>
      </form>
    </main>
  );
}
