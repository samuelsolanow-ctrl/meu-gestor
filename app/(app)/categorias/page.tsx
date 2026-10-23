import Link from 'next/link';
import { getContext } from '@/lib/context';
import { ensureSchema } from '@/lib/migrate';
import { monthRange, todaySP, brl } from '@/lib/format';
import CatIcon from '@/components/CatIcon';
import { IconBack } from '@/components/icons';
import { createCategoryAction, deleteCategoryAction, deleteRuleAction, renameCategoryAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CategoriasPage() {
  const ctx = await getContext();
  await ensureSchema();
  const { start, end } = monthRange(todaySP());
  const [{ data: cats }, { data: rules }, { data: txs }] = await Promise.all([
    ctx.supabase.from('categories').select('id, name, kind').order('name'),
    ctx.supabase.from('category_rules').select('id, pattern, category_id').order('pattern'),
    ctx.supabase.from('transactions').select('category_id, amount').gte('occurred_on', start).lte('occurred_on', end),
  ]);
  const month: Record<string, number> = {};
  for (const t of txs ?? []) if (t.category_id) month[t.category_id] = (month[t.category_id] ?? 0) + Number(t.amount);
  const nameOf = (id: string) => (cats ?? []).find((c: any) => c.id === id)?.name ?? '—';

  const block = (kind: 'expense' | 'income', title: string) => (
    <section className="card stack" aria-label={title}>
      <div className="section-head"><h2>{title}</h2></div>
      <div className="list">
        {(cats ?? []).filter((c: any) => c.kind === kind).map((c: any) => (
          <details key={c.id} className="goal-edit">
            <summary className="row" style={{ listStyle: 'none', cursor: 'pointer', minHeight: 52, gap: 12 }}>
              <CatIcon name={c.name} size={36} />
              <span className="grow" style={{ fontWeight: 700 }}>{c.name}</span>
              <span className="tiny muted">{month[c.id] ? `${brl(month[c.id])} no mês` : ''} ›</span>
            </summary>
            <form action={renameCategoryAction} className="row" style={{ gap: 8, marginTop: 8 }}>
              <input type="hidden" name="id" value={c.id} />
              <label className="sr-only" htmlFor={`n-${c.id}`}>Novo nome</label>
              <input id={`n-${c.id}`} className="input grow" name="nome" defaultValue={c.name} />
              <button className="btn btn-primary">Salvar</button>
            </form>
            <form action={deleteCategoryAction} style={{ marginTop: 6 }}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn btn-block" style={{ border: 'none', color: 'var(--late)' }}>Excluir categoria (os lançamentos ficam sem categoria)</button>
            </form>
          </details>
        ))}
      </div>
      <form action={createCategoryAction} className="row" style={{ gap: 8 }}>
        <input type="hidden" name="tipo" value={kind} />
        <label className="sr-only" htmlFor={`new-${kind}`}>Nova categoria</label>
        <input id={`new-${kind}`} className="input grow" name="nome" placeholder={kind === 'expense' ? 'Nova: Pet, Presentes…' : 'Nova: Aluguel recebido…'} required />
        <button className="btn">Adicionar</button>
      </form>
    </section>
  );

  return (
    <main className="page">
      <header className="row">
        <Link href="/mais" className="btn btn-icon" aria-label="Voltar" style={{ border: 'none' }}><IconBack /></Link>
        <h1 className="page-title">Categorias</h1>
      </header>
      {block('expense', 'Gastos')}
      {block('income', 'Entradas')}
      <section className="card stack" aria-label="Regras aprendidas">
        <div className="section-head"><h2>O app já aprendeu</h2></div>
        {(rules ?? []).length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>Quando você troca a categoria no extrato com “sempre usar”, a regra aparece aqui.</p>
        ) : (
          <div className="list">
            {(rules ?? []).map((r: any) => (
              <div className="item" key={r.id}>
                <CatIcon name={nameOf(r.category_id)} size={32} />
                <div className="grow">
                  <div className="item-title">“{r.pattern}”</div>
                  <div className="item-sub">sempre vai para {nameOf(r.category_id)}</div>
                </div>
                <form action={deleteRuleAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn" style={{ minHeight: 36, padding: '0 12px', fontSize: 13 }} aria-label={`Remover regra ${r.pattern}`}>Remover</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
