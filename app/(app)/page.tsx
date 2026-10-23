import Link from 'next/link';
import JarbasBar from '@/components/JarbasBar';
import CatIcon from '@/components/CatIcon';
import UndoToast from '@/components/UndoToast';
import { getContext, pickSpace } from '@/lib/context';
import { getBudgets } from '@/lib/budget';
import { forecast as getForecast } from '@/lib/forecast';
import { invoiceToPay, loadCardData, type Card } from '@/lib/cards';
import { catStyle } from '@/lib/catIcons';
import { fmtWhen } from '@/lib/agenda';
import { addDays, brl, daysBetween, dueLabel, monthName, monthRange, todaySP } from '@/lib/format';
import { IconBills, IconCalendar, IconCard, IconPie, IconPlus, IconTrend } from '@/components/icons';

export const dynamic = 'force-dynamic';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function longToday() {
  const t = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date());
  return t.charAt(0).toUpperCase() + t.slice(1);
}

type Alert = { key: string; href: string; icon: React.ReactNode; title: string; sub: string; tone: 'late' | 'warn' | 'info' };

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ e?: string; desfazer?: string }> }) {
  const ctx = await getContext();
  const { e, desfazer } = await searchParams;
  const { space, key } = pickSpace(ctx, e);
  const db = ctx.supabase;
  const today = todaySP();
  const { start, end } = monthRange(today);
  const daysLeft = daysBetween(today, end);
  const q = key === 'pessoal' ? '?e=pessoal' : '';

  const [txRes, billsRes, budgets, cardsRes, evRes, fc] = await Promise.all([
    db.from('transactions').select('kind, amount, category_id, categories(name)').eq('space_id', space.id).gte('occurred_on', start).lte('occurred_on', end),
    db.from('bills').select('id, name, amount, due_date, categories(name)').eq('space_id', space.id).eq('status', 'open').order('due_date').limit(40),
    getBudgets(db, space.id, today),
    db.from('accounts').select('id, name, institution, space_id, closing_day, due_day, credit_limit').eq('space_id', space.id).eq('type', 'credit_card').eq('archived', false),
    db.from('events').select('id, kind, title, starts_at').gte('starts_at', new Date(Date.now() - 3_600_000).toISOString()).lte('starts_at', `${addDays(today, 1)}T23:59:59-03:00`).order('starts_at').limit(4),
    getForecast(db, space.id, today).catch(() => null),
  ]);

  // mês: entradas, saídas e gastos por categoria
  const txs = (txRes.data ?? []) as any[];
  let income = 0;
  let expense = 0;
  let uncategorized = 0;
  const byCat: Record<string, { id: string | null; name: string; total: number }> = {};
  for (const t of txs) {
    const v = Number(t.amount);
    if (t.kind === 'income') income += v;
    else {
      expense += v;
      if (!t.category_id) uncategorized++;
      const k = t.category_id ?? 'sem';
      byCat[k] = byCat[k] ?? { id: t.category_id, name: t.categories?.name ?? 'Sem categoria', total: 0 };
      byCat[k].total += v;
    }
  }
  const balance = income - expense;
  const catsSorted = Object.values(byCat).sort((a, b) => b.total - a.total);
  const top = catsSorted.slice(0, 5);
  const rest = catsSorted.slice(5).reduce((s, c) => s + c.total, 0);
  const pie = rest > 0 ? [...top, { id: null, name: 'Outros', total: rest }] : top;
  const pieSum = pie.reduce((s, p) => s + p.total, 0) || 1;

  const bills = (billsRes.data ?? []) as any[];
  const billsLeft = bills.filter((b) => b.due_date <= end).reduce((s, b) => s + Number(b.amount), 0);
  const forecast = balance - billsLeft;

  // ---------- Atenção hoje: só o que pede ação
  const alerts: Alert[] = [];
  for (const b of bills) {
    const d = daysBetween(today, b.due_date);
    if (d > 3) break;
    alerts.push({
      key: `b${b.id}`,
      href: `/contas/${b.id}`,
      icon: b.categories?.name ? <CatIcon name={b.categories.name} size={36} /> : <span className="al-ic"><IconBills size={18} /></span>,
      title: `${b.name} · ${brl(b.amount)}`,
      sub: dueLabel(b.due_date, today).text,
      tone: d < 0 ? 'late' : 'warn',
    });
  }
  const cards = (cardsRes.data ?? []) as Card[];
  if (cards.length) {
    const cd = await loadCardData(db, cards, today).catch(() => new Map());
    for (const c of cards) {
      const d = cd.get(c.id);
      if (!d) continue;
      const inv = invoiceToPay(d.invoices, d.current);
      const days = daysBetween(today, inv.dueOn);
      if (inv.total > 0 && inv.status !== 'paga' && (inv.status === 'vencida' || inv.status === 'fechada' || days <= 3)) {
        alerts.push({ key: `c${c.id}`, href: `/cartoes?c=${c.id}`, icon: <span className="al-ic"><IconCard size={18} /></span>, title: `Fatura ${c.name} · ${brl(inv.total)}`, sub: inv.status === 'vencida' ? 'Fatura vencida' : `Vence ${inv.dueOn.slice(8, 10)}/${inv.dueOn.slice(5, 7)}`, tone: inv.status === 'vencida' ? 'late' : 'warn' });
      }
    }
  }
  for (const bd of budgets.filter((x) => x.spent >= x.limit * 0.9).slice(0, 2)) {
    alerts.push({
      key: `o${bd.categoryId}`,
      href: `/extrato?cat=${bd.categoryId}${key === 'pessoal' ? '&e=pessoal' : ''}`,
      icon: <CatIcon name={bd.name} size={36} />,
      title: bd.spent > bd.limit ? `${bd.name} passou do limite` : `${bd.name} perto do limite`,
      sub: `${brl(bd.spent)} de ${brl(bd.limit)}`,
      tone: bd.spent > bd.limit ? 'late' : 'warn',
    });
  }
  for (const ev of (evRes.error ? [] : evRes.data ?? []) as any[]) {
    alerts.push({ key: `e${ev.id}`, href: '/jarbas', icon: <span className="al-ic"><IconCalendar size={18} /></span>, title: ev.kind === 'reminder' ? `Lembrete: ${ev.title}` : ev.title, sub: fmtWhen(ev.starts_at), tone: 'info' });
  }
  if (uncategorized > 0) {
    alerts.push({ key: 'sem', href: `/extrato?cat=sem${key === 'pessoal' ? '&e=pessoal' : ''}`, icon: <CatIcon name="Sem categoria" size={36} />, title: `${uncategorized} ${uncategorized === 1 ? 'lançamento sem categoria' : 'lançamentos sem categoria'}`, sub: 'Toque para classificar', tone: 'info' });
  }

  const firstName = ctx.name.split(' ')[0];
  const spaceLabel = key === 'pessoal' ? firstName : 'Família';
  const urgent = alerts.find((a) => a.tone === 'late') ?? alerts[0];
  const tip = urgent ? `${urgent.title}: ${urgent.sub.toLowerCase()}.` : '';
  const fcMax = fc ? Math.max(1, ...fc.months.map((m) => Math.abs(m.balance))) : 1;
  const fcWorst = fc ? fc.months.reduce((a, b) => (b.balance < a.balance ? b : a), fc.months[0]) : null;
  const openCount = bills.filter((b) => b.due_date <= end).length;

  return (
    <main className="page">
      <header className="hello">
        <div className="hello-text">
          <span className="hello-date">{longToday()}</span>
          <h1 className="hello-name">{greeting()}, {firstName}</h1>
        </div>
        <Link href="/mais" className="avatar-btn" aria-label="Perfil e ajustes">{firstName.charAt(0)}</Link>
      </header>

      <JarbasBar tip={tip} />

      <nav className="seg" aria-label="Espaço">
        <Link href="/?e=pessoal" className={key === 'pessoal' ? 'on' : ''} aria-current={key === 'pessoal' ? 'page' : undefined}>{firstName}</Link>
        <Link href="/" className={key === 'casal' ? 'on' : ''} aria-current={key === 'casal' ? 'page' : undefined}>Família</Link>
      </nav>

      <section className="hero hero-blue" aria-label="Resumo do mês">
        <div className="hero-top">
          <span className="hero-chip" style={{ textTransform: 'capitalize' }}>Saldo de {monthName(today)} · {spaceLabel}</span>
          <span className="tiny" style={{ color: '#c9d6ff' }}>{daysLeft === 0 ? 'Último dia' : `${daysLeft} dias para fechar`}</span>
        </div>
        <div className="big-number" style={{ color: balance < 0 ? '#ffb3a1' : '#fff' }}>{brl(balance)}</div>
        <div className="hero-cols">
          <div><span>Entrou</span><b>{brl(income)}</b></div>
          <div><span>Saiu</span><b>{brl(expense)}</b></div>
          <div><span>Fim do mês</span><b style={{ color: forecast < 0 ? '#ffb3a1' : undefined }}>{brl(forecast)}</b></div>
        </div>
      </section>

      <Link href={`/lancar${q}`} className="btn btn-primary btn-block add-big"><IconPlus size={20} />Lançar gasto ou entrada</Link>

      <section className="card stack" aria-label="Atenção hoje">
        <div className="section-head"><h2>Atenção hoje</h2>{alerts.length > 0 && <span className="tiny muted">{alerts.length}</span>}</div>
        {alerts.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>Tudo em dia: nenhuma conta vencendo, orçamento sob controle. 👌</p>
        ) : (
          <div className="list">
            {alerts.slice(0, 6).map((a) => (
              <Link key={a.key} href={a.href} className={`item tx-link alert-${a.tone}`}>
                {a.icon}
                <div className="grow">
                  <div className="item-title">{a.title}</div>
                  <div className={`item-sub ${a.tone === 'late' ? 'late' : a.tone === 'warn' ? 'warn' : ''}`}>{a.sub}</div>
                </div>
                <span className="muted" aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        )}
        <div className="home-links">
          <Link href={`/contas${q}`}><IconBills size={16} />Contas{openCount ? ` · ${openCount}` : ''}</Link>
          <Link href={`/orcamento${q}`}><IconPie size={16} />Orçamento</Link>
          <Link href={`/investimentos${key === 'casal' ? '?e=casal' : ''}`}><IconTrend size={16} />Patrimônio</Link>
        </div>
      </section>

      {fc && fcWorst && (
        <Link href={`/previsao${q}`} className="card stack tx-link" aria-label="Previsão dos próximos 6 meses">
          <div className="section-head">
            <h2>Próximos 6 meses</h2>
            <span className="tiny" style={{ color: 'var(--accent)', fontWeight: 600 }}>Simular compra</span>
          </div>
          <div className="mini-fc" aria-hidden="true">
            {fc.months.map((m) => (
              <div key={m.key}>
                <span className={`b ${m.balance < 0 ? 'neg' : ''}`} style={{ height: `${Math.max(6, Math.round((Math.abs(m.balance) / fcMax) * 70))}%` }} />
                <span className="l">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="tiny" style={{ color: fcWorst.balance < 0 ? 'var(--late)' : 'var(--muted)' }}>
            {fcWorst.balance < 0 ? `Atenção: ${fcWorst.label} fecha no vermelho (${brl(fcWorst.balance)}).` : `Mês mais apertado: ${fcWorst.label}, sobra ${brl(fcWorst.balance)}.`}
          </div>
        </Link>
      )}

      {pie.length > 0 && (
        <section className="card stack" aria-label="Para onde foi o dinheiro">
          <div className="section-head">
            <h2>Para onde foi o dinheiro</h2>
            <Link href={`/extrato${q}`}>Extrato</Link>
          </div>
          <div className="row" style={{ gap: 16, alignItems: 'center' }}>
            <Donut items={pie.map((p) => ({ name: p.name, total: p.total, color: p.name === 'Outros' ? '#3a4870' : catStyle(p.name).color }))} />
            <div className="grow stack" style={{ gap: 2 }}>
              {pie.map((c) => (
                <Link
                  key={c.name}
                  href={c.name === 'Outros' ? `/extrato${q}` : `/extrato?cat=${c.id ?? 'sem'}${key === 'pessoal' ? '&e=pessoal' : ''}`}
                  className="pie-row"
                >
                  <CatIcon name={c.name === 'Outros' ? 'Outros' : c.name} size={26} />
                  <span className="grow pie-name">{c.name}</span>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>{Math.round((c.total / pieSum) * 100)}%</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="tiny muted">Toque numa categoria para ver os lançamentos dela.</div>
        </section>
      )}

      <UndoToast id={desfazer} back={`/${q}`} />
    </main>
  );
}

function Donut({ items }: { items: { name: string; total: number; color: string }[] }) {
  const C = 2 * Math.PI * 36;
  const sum = items.reduce((s, i) => s + i.total, 0) || 1;
  let off = 0;
  const label = items.map((i) => `${i.name} ${Math.round((i.total / sum) * 100)}%`).join(', ');
  return (
    <svg width="112" height="112" viewBox="0 0 100 100" role="img" aria-label={`Gastos por categoria: ${label}`} style={{ flex: 'none' }}>
      <circle cx="50" cy="50" r="36" fill="none" stroke="var(--surface-2)" strokeWidth="14" />
      {items.map((it) => {
        const L = (C * it.total) / sum;
        const el = (
          <circle key={it.name} cx="50" cy="50" r="36" fill="none" stroke={it.color} strokeWidth="14"
            strokeDasharray={`${Math.max(0, L - (items.length > 1 ? 1.5 : 0))} ${C}`} strokeDashoffset={-off} transform="rotate(-90 50 50)" />
        );
        off += L;
        return el;
      })}
    </svg>
  );
}
