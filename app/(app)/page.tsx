import Link from 'next/link';
import { getContext, pickSpace } from '@/lib/context';
import { monthSummary } from '@/lib/finance';
import { brl, daysBetween, dueLabel, monthName, monthRange, shortDate, todaySP } from '@/lib/format';
import { IconLogo } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const ctx = await getContext();
  const { e } = await searchParams;
  const { space, key } = pickSpace(ctx, e);
  const db = ctx.supabase;
  const today = todaySP();
  const { end } = monthRange(today);
  const daysLeft = daysBetween(today, end);

  const [summary, billsRes, goalsRes, txRes] = await Promise.all([
    monthSummary(db, space.id, today),
    db.from('bills').select('id, name, amount, due_date').eq('space_id', space.id).eq('status', 'open').order('due_date').limit(5),
    db.from('goals').select('id, name, target_amount, current_amount, deadline').eq('space_id', space.id).order('created_at'),
    db.from('transactions').select('id, kind, amount, description, occurred_on, categories(name)').eq('space_id', space.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(6),
  ]);
  const bills = billsRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const txs = txRes.data ?? [];

  const spentPct = summary.income > 0 ? Math.min(100, Math.round((summary.expense / summary.income) * 100)) : 0;

  // Aviso do Jarbas: conta mais urgente ou maior categoria do mês
  const urgent = bills.find((b: any) => daysBetween(today, b.due_date) <= 3);
  let tip = 'Me conte um gasto, como “mercado 85 no débito”, que eu lanço para você.';
  if (urgent) {
    const d = dueLabel(urgent.due_date, today);
    tip = `${urgent.name}: ${d.text.toLowerCase()} (${brl(urgent.amount)}). Quer que eu marque como paga quando pagar?`;
  } else if (summary.categories[0]) {
    tip = `Neste mês, o maior gasto está em ${summary.categories[0].name}: ${brl(summary.categories[0].total)}.`;
  }

  const firstName = ctx.name.split(' ')[0];

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><IconLogo /></span>
          Meu Gestor
        </div>
        <span className="small muted">Olá, {firstName}</span>
      </header>

      <nav className="seg" aria-label="Espaço">
        <Link href="/" className={key === 'casal' ? 'on' : ''} aria-current={key === 'casal' ? 'page' : undefined}>Casal</Link>
        <Link href="/?e=pessoal" className={key === 'pessoal' ? 'on' : ''} aria-current={key === 'pessoal' ? 'page' : undefined}>{firstName}</Link>
      </nav>

      <section className="card stack" aria-label="Resumo do mês">
        <div className="card-head">
          <span className="small muted" style={{ textTransform: 'capitalize' }}>{monthName(today)} · {space.kind === 'shared' ? 'Casal' : firstName}</span>
          <span className="tiny muted">{daysLeft === 0 ? 'Último dia do mês' : `${daysLeft} dias restantes`}</span>
        </div>
        <div>
          <div className="label">Sobra até o fim do mês</div>
          <div className={`big-number ${summary.balance < 0 ? 'neg' : ''}`}>{brl(summary.balance)}</div>
        </div>
        <div className="bar" aria-label={`${spentPct}% das entradas já gastos`}>
          <span className={spentPct >= 90 ? 'warn' : ''} style={{ width: `${spentPct}%` }} />
        </div>
        <div className="grid2">
          <div><div className="tiny muted">Entradas</div><div className="value">{brl(summary.income)}</div></div>
          <div><div className="tiny muted">Saídas</div><div className="value">{brl(summary.expense)}</div></div>
        </div>
      </section>

      <section className="card card-accent row" style={{ alignItems: 'flex-start' }} aria-label="Aviso do Jarbas">
        <div className="avatar">J</div>
        <div className="stack grow" style={{ gap: 10 }}>
          <div>
            <div className="small" style={{ fontWeight: 700 }}>Jarbas</div>
            <div style={{ color: '#d7e2dd', fontSize: 14 }}>{tip}</div>
          </div>
          <Link href="/jarbas" className="btn btn-primary" style={{ alignSelf: 'flex-start', minHeight: 40 }}>Conversar</Link>
        </div>
      </section>

      <section className="card" aria-label="Próximas contas">
        <div className="card-head">
          <h2>Próximas contas</h2>
          <Link href={key === 'pessoal' ? '/contas?e=pessoal' : '/contas'} className="small" style={{ fontWeight: 600 }}>Ver todas</Link>
        </div>
        {bills.length === 0 ? (
          <p className="empty">Nenhuma conta em aberto. Cadastre em Contas ou peça ao Jarbas.</p>
        ) : (
          <div className="list">
            {bills.map((b: any) => {
              const d = dueLabel(b.due_date, today);
              return (
                <div className="item" key={b.id}>
                  <div className={`item-icon ${d.tone === 'late' ? 'late' : d.tone === 'soon' ? 'warn' : ''}`}>{b.name.charAt(0)}</div>
                  <div className="grow">
                    <div className="item-title">{b.name}</div>
                    <div className={`item-sub ${d.tone === 'late' ? 'late' : d.tone === 'soon' ? 'warn' : ''}`}>{d.text}</div>
                  </div>
                  <span className="amount">{brl(b.amount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card stack" aria-label="Metas">
        <div className="card-head">
          <h2>{space.kind === 'shared' ? 'Metas da família' : 'Minhas metas'}</h2>
          <Link href="/mais#metas" className="small" style={{ fontWeight: 600 }}>Nova meta</Link>
        </div>
        {goals.length === 0 ? (
          <p className="empty">Nenhuma meta ainda. Que tal uma reserva de emergência?</p>
        ) : (
          goals.map((g: any) => {
            const pct = Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100));
            return (
              <div className="stack" style={{ gap: 8 }} key={g.id}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{g.name}</span>
                  <span className="muted">{brl(g.current_amount)} de {brl(g.target_amount)}</span>
                </div>
                <div className="bar"><span style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })
        )}
      </section>

      <section className="card" aria-label="Últimos lançamentos">
        <div className="card-head">
          <h2>Últimos lançamentos</h2>
          <Link href={key === 'pessoal' ? '/lancar?e=pessoal' : '/lancar'} className="small" style={{ fontWeight: 600 }}>Lançar</Link>
        </div>
        {txs.length === 0 ? (
          <p className="empty">Nada lançado ainda neste mês.</p>
        ) : (
          <div className="list">
            {txs.map((t: any) => (
              <div className="item" key={t.id}>
                <div className={`item-icon ${t.kind === 'income' ? 'income' : ''}`}>{(t.categories?.name ?? t.description).charAt(0)}</div>
                <div className="grow">
                  <div className="item-title">{t.description}</div>
                  <div className="item-sub">{t.categories?.name ?? 'Sem categoria'} · {shortDate(t.occurred_on)}</div>
                </div>
                <span className={`amount ${t.kind === 'income' ? 'income' : ''}`}>{t.kind === 'income' ? '+ ' : ''}{brl(t.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
