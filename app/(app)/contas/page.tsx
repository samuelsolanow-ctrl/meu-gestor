import Link from 'next/link';
import { getContext, pickSpace } from '@/lib/context';
import { brl, daysBetween, dueLabel, monthRange, todaySP } from '@/lib/format';
import { payBillAction, unpayBillAction } from '../actions';
import BillForm from '@/components/BillForm';
import PayButton from '@/components/PayButton';
import { IconCheck } from '@/components/icons';

export const dynamic = 'force-dynamic';

function BillRow({ b, today }: { b: any; today: string }) {
  const d = dueLabel(b.due_date, today);
  const tone = d.tone === 'late' ? 'late' : d.tone === 'soon' ? 'warn' : '';
  return (
    <div className="item">
      <Link href={`/contas/${b.id}`} className="row grow bill-link" aria-label={`Editar ${b.name}`}>
        <div className={`item-icon ${tone}`}>{b.name.charAt(0)}</div>
        <div className="grow">
          <div className="item-title">{b.name}</div>
          <div className={`item-sub ${tone}`}>
            {d.text}
            {b.recurrence === 'monthly' ? ' · todo mês' : b.recurrence === 'yearly' ? ' · todo ano' : ''}
          </div>
        </div>
        <span className="amount">{brl(b.amount)}</span>
      </Link>
      <form action={payBillAction}>
        <input type="hidden" name="id" value={b.id} />
        <PayButton name={b.name} />
      </form>
    </div>
  );
}

export default async function ContasPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const ctx = await getContext();
  const { e } = await searchParams;
  const { space, key } = pickSpace(ctx, e);
  const today = todaySP();
  const { start, end } = monthRange(today);

  const [{ data: open }, { data: paid }, { data: categories }] = await Promise.all([
    ctx.supabase.from('bills').select('id, name, amount, due_date, recurrence').eq('space_id', space.id).eq('status', 'open').order('due_date'),
    ctx.supabase.from('bills').select('id, name, amount, due_date, paid_at').eq('space_id', space.id).eq('status', 'paid').gte('due_date', start).lte('due_date', end).order('due_date', { ascending: false }),
    ctx.supabase.from('categories').select('id, name, kind').order('name'),
  ]);

  const openBills = open ?? [];
  const late = openBills.filter((b: any) => daysBetween(today, b.due_date) < 0);
  const week = openBills.filter((b: any) => { const d = daysBetween(today, b.due_date); return d >= 0 && d <= 7; });
  const later = openBills.filter((b: any) => daysBetween(today, b.due_date) > 7);
  const monthOpen = openBills.filter((b: any) => b.due_date <= end);
  const monthTotal = monthOpen.reduce((s: number, b: any) => s + Number(b.amount), 0);
  const firstName = ctx.name.split(' ')[0];

  const groups: [string, any[]][] = [
    ['Vencidas', late],
    ['Próximos 7 dias', week],
    ['Depois', later],
  ];

  return (
    <main className="page">
      <header className="topbar">
        <h1 className="page-title">Contas a pagar</h1>
      </header>

      <nav className="seg" aria-label="Espaço">
        <Link href="/contas?e=pessoal" className={key === 'pessoal' ? 'on' : ''}>{firstName}</Link>
        <Link href="/contas" className={key === 'casal' ? 'on' : ''}>Família</Link>
      </nav>

      <section className="card" aria-label="Resumo">
        <div className="label">Falta pagar até o fim do mês</div>
        <div className="big-number" style={{ fontSize: 44 }}>{brl(monthTotal)}</div>
        <div className="small muted">
          {monthOpen.length === 0 ? 'Tudo pago este mês' : monthOpen.length === 1 ? '1 conta em aberto' : `${monthOpen.length} contas em aberto`}
        </div>
      </section>

      <BillForm categories={categories ?? []} defaultSpace={key} myName={firstName} today={today} />

      {openBills.length === 0 && <p className="empty">Nenhuma conta em aberto aqui. Toque em “Nova conta a pagar” ou peça ao Jarbas.</p>}

      {groups.map(([title, list]) =>
        list.length === 0 ? null : (
          <section key={title} className="stack" style={{ gap: 8 }} aria-label={title}>
            <h2 className="section-label">{title}</h2>
            <div className="card list" style={{ padding: '4px 8px 4px 14px' }}>
              {list.map((b: any) => <BillRow key={b.id} b={b} today={today} />)}
            </div>
          </section>
        ),
      )}

      {(paid ?? []).length > 0 && (
        <section className="stack" style={{ gap: 8 }} aria-label="Pagas este mês">
          <h2 className="section-label">Pagas este mês · {(paid ?? []).length} {(paid ?? []).length === 1 ? 'conta' : 'contas'} · {brl((paid ?? []).reduce((s: number, b: any) => s + Number(b.amount), 0))}</h2>
          <div className="card list paid-list" style={{ padding: '4px 14px' }}>
            {(paid ?? []).map((b: any) => (
              <div className="item paid-row" key={b.id}>
                <Link href={`/contas/${b.id}`} className="row grow bill-link" aria-label={`${b.name}, paga. Abrir`}>
                  <div className="item-icon paid"><IconCheck /></div>
                  <div className="grow">
                    <div className="item-title">{b.name}</div>
                    <div className="item-sub paid-text">Paga{b.paid_at ? ` em ${String(b.paid_at).slice(8, 10)}/${String(b.paid_at).slice(5, 7)}` : ''}</div>
                  </div>
                  <span className="amount paid-text">{brl(b.amount)}</span>
                </Link>
                <form action={unpayBillAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="check on" aria-label={`Desmarcar ${b.name} como paga`}><span><IconCheck /></span></button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
