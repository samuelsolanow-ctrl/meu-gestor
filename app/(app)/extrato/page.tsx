import Link from 'next/link';
import { getContext, pickSpace } from '@/lib/context';
import { addMonths, brl, monthName, monthRange, todaySP } from '@/lib/format';
import { getBudgets } from '@/lib/budget';
import ExtratoList, { type Row } from '@/components/ExtratoList';
import UndoToast from '@/components/UndoToast';
import CatIcon from '@/components/CatIcon';
import { IconChevron, IconPlus } from '@/components/icons';

export const dynamic = 'force-dynamic';

type SP = { m?: string; tipo?: string; cat?: string; conta?: string; q?: string; e?: string; desfazer?: string };

export default async function ExtratoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const { space, key } = pickSpace(ctx, sp.e);
  const today = todaySP();
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const { start, end } = monthRange(`${month}-01`);
  const db = ctx.supabase;

  const [{ data: txs }, { data: cats }, { data: accs }, { data: members }, budgets] = await Promise.all([
    db
      .from('transactions')
      .select('id, kind, amount, description, occurred_on, installment_no, installment_total, category_id, account_id, created_by, categories(name), accounts(name)')
      .eq('space_id', space.id)
      .gte('occurred_on', start)
      .lte('occurred_on', end)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(800),
    db.from('categories').select('id, name, kind').order('name'),
    db.from('accounts').select('id, name, type').eq('archived', false).order('name'),
    db.from('profiles').select('id, display_name'),
    sp.cat && sp.cat !== 'sem' ? getBudgets(db, space.id, `${month}-01`) : Promise.resolve([]),
  ]);

  const names: Record<string, string> = Object.fromEntries((members ?? []).map((m: any) => [m.id, String(m.display_name).split(' ')[0]]));
  const all = (txs ?? []) as any[];
  const income = all.filter((t) => t.kind === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = all.filter((t) => t.kind === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  const q = (sp.q ?? '').trim().toLowerCase();
  const filtered = all.filter(
    (t) =>
      (sp.tipo === 'gastos' ? t.kind === 'expense' : sp.tipo === 'entradas' ? t.kind === 'income' : true) &&
      (sp.cat === 'sem' ? !t.category_id : sp.cat ? t.category_id === sp.cat : true) &&
      (sp.conta ? t.account_id === sp.conta : true) &&
      (q ? String(t.description).toLowerCase().includes(q) || String(t.categories?.name ?? '').toLowerCase().includes(q) : true),
  );
  const rows: Row[] = filtered.map((t) => ({
    id: t.id,
    kind: t.kind,
    amount: Number(t.amount),
    description: t.description,
    occurred_on: t.occurred_on,
    category_id: t.category_id,
    category: t.categories?.name ?? null,
    account: t.accounts?.name ?? null,
    who: key === 'casal' && t.created_by ? names[t.created_by] ?? null : null,
    parcel: t.installment_total ? `${t.installment_no}/${t.installment_total}` : null,
    spaceLabel: key === 'casal' ? 'Família' : 'Pessoal',
  }));
  const fTotal = filtered.reduce((s, t) => s + (t.kind === 'income' ? -1 : 1) * Number(t.amount), 0);
  const uncategorized = all.filter((t) => !t.category_id).length;

  // monta links mantendo os outros filtros
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged: any = { m: month === today.slice(0, 7) ? undefined : month, tipo: sp.tipo, cat: sp.cat, conta: sp.conta, q: sp.q, e: sp.e, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return `/extrato${s ? `?${s}` : ''}`;
  };
  const here = link({});
  const catSel = (cats ?? []).find((c: any) => c.id === sp.cat);
  const accSel = (accs ?? []).find((a: any) => a.id === sp.conta);
  const budget = catSel ? (budgets as any[]).find((b) => b.categoryId === catSel.id) : null;
  const mLabel = `${monthName(`${month}-01`).replace(/^./, (c) => c.toUpperCase())} ${month.slice(0, 4)}`;
  const firstName = ctx.name.split(' ')[0];

  return (
    <main className="page">
      <header className="topbar">
        <h1 className="page-title">{catSel ? '' : 'Extrato'}{catSel && <Link href={link({ cat: undefined })} className="back-inline" aria-label="Voltar ao extrato completo">‹ Extrato</Link>}</h1>
        <Link href={`/lancar${key === 'pessoal' ? '?e=pessoal' : ''}`} className="btn btn-primary" style={{ minHeight: 40, padding: '0 14px' }}><IconPlus size={18} />Lançar</Link>
      </header>

      <nav className="seg" aria-label="Espaço">
        <Link href={link({ e: 'pessoal', cat: undefined, conta: undefined })} className={key === 'pessoal' ? 'on' : ''}>{firstName}</Link>
        <Link href={link({ e: undefined, cat: undefined, conta: undefined })} className={key === 'casal' ? 'on' : ''}>Família</Link>
      </nav>

      <div className="month-nav">
        <Link href={link({ m: addMonths(`${month}-01`, -1).slice(0, 7) })} className="btn btn-icon" aria-label="Mês anterior" style={{ transform: 'rotate(180deg)' }}><IconChevron /></Link>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800 }}>{mLabel}</div>
          <div className="tiny muted">Entrou <b style={{ color: 'var(--ok)' }}>{brl(income)}</b> · Saiu <b style={{ color: 'var(--exp)' }}>{brl(expense)}</b></div>
        </div>
        <Link href={link({ m: addMonths(`${month}-01`, 1).slice(0, 7) })} className="btn btn-icon" aria-label="Próximo mês"><IconChevron /></Link>
      </div>

      {catSel && (
        <section className="card row" style={{ gap: 12 }}>
          <CatIcon name={catSel.name} size={44} />
          <div className="grow">
            <div style={{ fontWeight: 800 }}>{catSel.name}</div>
            <div className="tiny muted">{rows.length} lançamentos · {brl(Math.abs(fTotal))}{budget ? ` de ${brl(budget.limit)}` : ''}</div>
            {budget && <div className="bar thin" style={{ marginTop: 8 }}><span className={budget.spent >= budget.limit * 0.8 ? 'warn' : ''} style={{ width: `${Math.min(100, Math.round((budget.spent / budget.limit) * 100))}%` }} /></div>}
          </div>
        </section>
      )}

      <form action="/extrato" className="search-row" role="search">
        {sp.e && <input type="hidden" name="e" value={sp.e} />}
        {sp.m && <input type="hidden" name="m" value={sp.m} />}
        <label htmlFor="busca" className="sr-only">Buscar no extrato</label>
        <input id="busca" className="input" name="q" defaultValue={sp.q ?? ''} placeholder="Buscar: mercado, uber, farmácia…" enterKeyHint="search" />
      </form>

      <div className="chips" aria-label="Filtros">
        <Link href={link({ tipo: undefined })} className={`chip ${!sp.tipo ? 'on' : ''}`}>Tudo</Link>
        <Link href={link({ tipo: 'gastos' })} className={`chip ${sp.tipo === 'gastos' ? 'on' : ''}`}>Gastos</Link>
        <Link href={link({ tipo: 'entradas' })} className={`chip ${sp.tipo === 'entradas' ? 'on' : ''}`}>Entradas</Link>
        {uncategorized > 0 && <Link href={link({ cat: sp.cat === 'sem' ? undefined : 'sem' })} className={`chip chip-warn ${sp.cat === 'sem' ? 'on' : ''}`}>Sem categoria · {uncategorized}</Link>}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <details className="filter-dd grow">
          <summary className={`chip ${catSel ? 'on' : ''}`}>{catSel ? catSel.name : 'Categoria'} ▾</summary>
          <div className="dd-menu">
            <Link href={link({ cat: undefined })}>Todas</Link>
            {(cats ?? []).map((c: any) => <Link key={c.id} href={link({ cat: c.id })} className="row" style={{ gap: 8 }}><CatIcon name={c.name} size={24} />{c.name}</Link>)}
          </div>
        </details>
        <details className="filter-dd grow">
          <summary className={`chip ${accSel ? 'on' : ''}`}>{accSel ? accSel.name : 'Conta/cartão'} ▾</summary>
          <div className="dd-menu">
            <Link href={link({ conta: undefined })}>Todas</Link>
            {(accs ?? []).map((a: any) => <Link key={a.id} href={link({ conta: a.id })}>{a.name}</Link>)}
          </div>
        </details>
      </div>

      {(sp.tipo || sp.cat || sp.conta || q) && (
        <div className="small muted">{rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'} · total {brl(Math.abs(fTotal))}</div>
      )}

      <ExtratoList rows={rows} categories={(cats ?? []) as any} today={today} back={here} />
      <UndoToast id={sp.desfazer} back={here} />
    </main>
  );
}
