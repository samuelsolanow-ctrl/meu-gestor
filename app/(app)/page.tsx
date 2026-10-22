import Link from 'next/link';
import JarbasBar from '@/components/JarbasBar';
import { getContext, pickSpace } from '@/lib/context';
import { monthSummary } from '@/lib/finance';
import { getBudgets } from '@/lib/budget';
import { listInvestments } from '@/lib/investments';
import { cardColors, invoiceToPay, loadCardData, type Card } from '@/lib/cards';
import { fmtWhen } from '@/lib/agenda';
import { brl, daysBetween, dueLabel, monthName, monthRange, shortDate, todaySP } from '@/lib/format';
import {
  IconBills, IconCalendar, IconChat, IconList, IconMinus, IconPlus, IconTarget, IconPie, IconCard as IconCardSmall, IconTrend,
} from '@/components/icons';

export const dynamic = 'force-dynamic';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function longToday() {
  const t = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date());
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const DONUT = ['#7aa2ff', '#b69cff', '#5ee0c1', '#ff8a6b', '#3a4870'];

function Donut({ items }: { items: { name: string; total: number }[] }) {
  const C = 2 * Math.PI * 36;
  const sum = items.reduce((s, i) => s + i.total, 0) || 1;
  let off = 0;
  const label = items.map((i) => `${i.name} ${Math.round((i.total / sum) * 100)}%`).join(', ');
  return (
    <svg width="116" height="116" viewBox="0 0 100 100" role="img" aria-label={`Gastos por categoria: ${label}`} style={{ flex: 'none' }}>
      <circle cx="50" cy="50" r="36" fill="none" stroke="var(--surface-2)" strokeWidth="14" />
      {items.map((it, i) => {
        const L = (C * it.total) / sum;
        const el = (
          <circle key={it.name} cx="50" cy="50" r="36" fill="none" stroke={DONUT[i % DONUT.length]} strokeWidth="14"
            strokeDasharray={`${Math.max(0, L - (items.length > 1 ? 1.5 : 0))} ${C}`} strokeDashoffset={-off} transform="rotate(-90 50 50)" />
        );
        off += L;
        return el;
      })}
    </svg>
  );
}

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const ctx = await getContext();
  const { e } = await searchParams;
  const { space, key } = pickSpace(ctx, e);
  const db = ctx.supabase;
  const today = todaySP();
  const { end } = monthRange(today);
  const daysLeft = daysBetween(today, end);
  const q = key === 'pessoal' ? '?e=pessoal' : '';

  const { start } = monthRange(today);
  const [summary, billsRes, goalsRes, txRes, evRes, budgets, cardsRes, monthBillsRes, whoRes, membersRes, inv] = await Promise.all([
    monthSummary(db, space.id, today),
    db.from('bills').select('id, name, amount, due_date').eq('space_id', space.id).eq('status', 'open').order('due_date').limit(4),
    db.from('goals').select('id, name, target_amount, current_amount, deadline').eq('space_id', space.id).order('created_at'),
    db.from('transactions').select('id, kind, amount, description, occurred_on, categories(name)').eq('space_id', space.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(5),
    db.from('events').select('id, kind, title, starts_at, space_id').gte('starts_at', new Date(Date.now() - 3_600_000).toISOString()).order('starts_at').limit(4),
    getBudgets(db, space.id, today),
    db.from('accounts').select('id, name, institution, space_id, closing_day, due_day, credit_limit').eq('space_id', space.id).eq('type', 'credit_card').eq('archived', false).order('name'),
    db.from('bills').select('amount').eq('space_id', space.id).eq('status', 'open').lte('due_date', end),
    key === 'casal'
      ? db.from('transactions').select('amount, created_by').eq('space_id', space.id).eq('kind', 'expense').gte('occurred_on', start).lte('occurred_on', end)
      : Promise.resolve({ data: [] }),
    db.from('profiles').select('id, display_name'),
    listInvestments(db).catch(() => ({ items: [], invested: 0, current: 0, gain: 0, gainPct: 0 })),
  ]);
  const cards = (cardsRes.data ?? []) as Card[];
  const cardData = await loadCardData(db, cards, today);
  const billsLeft = (monthBillsRes.data ?? []).reduce((s: number, b: any) => s + Number(b.amount), 0);
  const forecast = Math.round((summary.balance - billsLeft) * 100) / 100;
  const budgetLimit = budgets.reduce((s, b) => s + b.limit, 0);
  const budgetSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const budgetPct = budgetLimit ? Math.round((budgetSpent / budgetLimit) * 100) : 0;
  const over = budgets.filter((b) => b.spent > b.limit);
  const top = summary.categories.slice(0, 4);
  const rest = summary.categories.slice(4).reduce((s, c) => s + c.total, 0);
  const pie = rest > 0 ? [...top, { name: 'Outros', total: Math.round(rest * 100) / 100 }] : top;
  const names: Record<string, string> = Object.fromEntries((membersRes.data ?? []).map((m: any) => [m.id, m.display_name.split(' ')[0]]));
  const byPerson: Record<string, number> = {};
  for (const t of (whoRes as any).data ?? []) {
    const who = t.created_by ?? 'x';
    byPerson[who] = (byPerson[who] ?? 0) + Number(t.amount);
  }
  const people = Object.entries(byPerson).map(([id, total]) => ({ name: names[id] ?? 'Outro', total })).sort((a, b) => b.total - a.total);
  const peopleSum = people.reduce((s, p) => s + p.total, 0);
  const events = evRes.error ? [] : evRes.data ?? [];
  const bills = billsRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const txs = txRes.data ?? [];

  const firstName = ctx.name.split(' ')[0];
  const spaceLabel = key === 'pessoal' ? firstName : 'Família';

  // Dica do Jarbas: conta mais urgente, maior gasto do mês ou um convite
  const urgent = bills.find((b: any) => daysBetween(today, b.due_date) <= 3);
  let tip = 'Me conte um gasto, como “mercado 85 no débito”, que eu lanço para você.';
  if (urgent) {
    tip = `${urgent.name} ${dueLabel(urgent.due_date, today).text.toLowerCase()}: ${brl(urgent.amount)}.`;
  } else if (summary.categories[0]) {
    tip = `O maior gasto do mês está em ${summary.categories[0].name}: ${brl(summary.categories[0].total)}.`;
  }

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
        <div className={`big-number ${summary.balance < 0 ? 'neg' : ''}`} style={{ color: summary.balance < 0 ? '#ffb3a1' : '#fff' }}>{brl(summary.balance)}</div>
        <div className="hero-cols">
          <div><span>Entrou</span><b>{brl(summary.income)}</b></div>
          <div><span>Saiu</span><b>{brl(summary.expense)}</b></div>
          <div><span>Fim do mês</span><b style={{ color: forecast < 0 ? '#ffb3a1' : undefined }}>{brl(forecast)}</b></div>
        </div>
        {billsLeft > 0 && <div className="tiny" style={{ color: '#c9d6ff' }}>“Fim do mês” já desconta {brl(billsLeft)} de contas que ainda vão vencer.</div>}
      </section>

      <nav className="quick" aria-label="Atalhos">
        <Link href={`/lancar${q}`}><span className="quick-icon"><IconMinus /></span>Gasto</Link>
        <Link href={`/lancar${q ? q + '&' : '?'}tipo=receita`}><span className="quick-icon"><IconPlus /></span>Entrada</Link>
        <Link href={`/orcamento${q}`}><span className="quick-icon"><IconPie /></span>Orçamento</Link>
        <Link href="/investimentos"><span className="quick-icon"><IconTrend /></span>Investir</Link>
      </nav>


      <section className="card stack" aria-label="Orçamento do mês">
        <div className="section-head">
          <h2>Orçamento do mês</h2>
          <Link href={`/orcamento${q}`}>{budgets.length ? 'Ajustar' : 'Definir'}</Link>
        </div>
        {budgets.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><IconPie /></span>
            <div><p>Defina quanto quer gastar por categoria e o app avisa quando estiver perto do limite.</p></div>
          </div>
        ) : (
          <>
            <div className="row small" style={{ justifyContent: 'space-between' }}>
              <span><b>{brl(budgetSpent)}</b> <span className="muted">de {brl(budgetLimit)}</span></span>
              <b style={{ color: budgetPct > 100 ? 'var(--late)' : budgetPct >= 80 ? 'var(--warn)' : 'var(--accent)' }}>{budgetPct}%</b>
            </div>
            <div className="bar"><span className={budgetPct >= 80 ? 'warn' : ''} style={{ width: `${Math.min(100, budgetPct)}%` }} /></div>
            {over.length > 0 ? (
              <div className="tiny" style={{ color: 'var(--late)' }}>
                {over.slice(0, 2).map((b) => `${b.name} passou do limite (${brl(b.spent)} de ${brl(b.limit)})`).join(' · ')}
              </div>
            ) : (
              <div className="tiny muted">{daysLeft} dias restantes · tudo dentro do limite</div>
            )}
          </>
        )}
      </section>

      {pie.length > 0 && (
        <section className="card stack" aria-label="Para onde foi o dinheiro">
          <div className="section-head">
            <h2>Para onde foi o dinheiro</h2>
            <span className="tiny muted" style={{ textTransform: 'capitalize' }}>{monthName(today)}</span>
          </div>
          <div className="row" style={{ gap: 16 }}>
            <Donut items={pie} />
            <div className="grow stack" style={{ gap: 8 }}>
              {pie.map((c, i) => (
                <div className="row small" key={c.name} style={{ gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: DONUT[i % DONUT.length], flex: 'none' }} aria-hidden="true" />
                  <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>{brl(c.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="card stack" aria-label="Cartões">
        <div className="section-head">
          <h2>Cartões</h2>
          <Link href="/cartoes">{cards.length ? 'Ver todos' : 'Cadastrar'}</Link>
        </div>
        {cards.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><IconCardSmall /></span>
            <div><p>Cadastre seus cartões para ver fatura, limite e parcelas aqui.</p></div>
          </div>
        ) : (
          cards.slice(0, 3).map((c) => {
            const d = cardData.get(c.id)!;
            const inv = invoiceToPay(d.invoices, d.current);
            const [ca, cb] = cardColors(c);
            const limit = Number(c.credit_limit ?? 0);
            const pct = limit ? Math.min(100, Math.round((d.used / limit) * 100)) : 0;
            return (
              <Link href={`/cartoes?c=${c.id}`} key={c.id} className="stack home-card" style={{ gap: 8 }}>
                <div className="row">
                  <span className="mini-card" style={{ background: `linear-gradient(135deg, ${ca}, ${cb})` }} aria-hidden="true" />
                  <div className="grow">
                    <div className="item-title">{c.name}</div>
                    <div className={`item-sub ${inv.status === 'vencida' ? 'late' : inv.status === 'fechada' ? 'warn' : ''}`}>
                      {inv.status === 'paga' ? 'Fatura paga' : `Fatura ${inv.status} · vence ${inv.dueOn.slice(8, 10)}/${inv.dueOn.slice(5, 7)}`}
                    </div>
                  </div>
                  <span className="amount" style={{ fontWeight: 800 }}>{brl(inv.total)}</span>
                </div>
                {limit > 0 && (
                  <>
                    <div className="bar thin"><span style={{ width: `${pct}%` }} /></div>
                    <div className="tiny muted">Disponível {brl(Math.max(0, limit - d.used))} de {brl(limit)}</div>
                  </>
                )}
              </Link>
            );
          })
        )}
      </section>

      <Link href="/investimentos" className="card stack tx-link" aria-label="Investimentos">
        <div className="section-head">
          <h2>Investimentos</h2>
          <span className="tiny" style={{ color: 'var(--accent)', fontWeight: 600 }}>{inv.items.length ? 'Ver' : 'Cadastrar'}</span>
        </div>
        {inv.items.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><IconTrend /></span>
            <div><p>Acompanhe Ágora, Santander e o que mais tiverem, separado das receitas e despesas.</p></div>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>{brl(inv.current)}</span>
            <span className="small" style={{ color: inv.gain < 0 ? 'var(--late)' : 'var(--ok)', fontWeight: 700 }}>
              {inv.gain >= 0 ? '+' : ''}{brl(inv.gain)} ({inv.gainPct.toFixed(1).replace('.', ',')}%)
            </span>
          </div>
        )}
      </Link>

      <section className="card" aria-label="Agenda">
        <div className="section-head">
          <h2>Agenda</h2>
          <Link href="/jarbas">Agendar</Link>
        </div>
        {events.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><IconCalendar /></span>
            <div>
              <p>Nada marcado. Diga ao Jarbas “amanhã tenho dentista às 8, me lembra 1 hora antes”.</p>
            </div>
          </div>
        ) : (
          <div className="list">
            {events.map((ev: any) => (
              <div className="item" key={ev.id}>
                <div className="item-icon"><IconCalendar size={18} /></div>
                <div className="grow">
                  <div className="item-title">{ev.kind === 'reminder' ? `Lembrete: ${ev.title}` : ev.title}</div>
                  <div className="item-sub">{fmtWhen(ev.starts_at)}{ev.space_id === ctx.casal.id ? ' · Família' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" aria-label="Próximas contas">
        <div className="section-head">
          <h2>Próximas contas</h2>
          {bills.length > 0 && <Link href={`/contas${q}`}>Ver todas</Link>}
        </div>
        {bills.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><IconBills /></span>
            <div>
              <p>Nenhuma conta em aberto. Cadastre luz, escola, aluguel e o app avisa antes de vencer.</p>
              <Link href={`/contas${q}`} className="btn">Cadastrar conta</Link>
            </div>
          </div>
        ) : (
          <div className="list">
            {bills.map((b: any) => {
              const d = dueLabel(b.due_date, today);
              const tone = d.tone === 'late' ? 'late' : d.tone === 'soon' ? 'warn' : '';
              return (
                <Link href={`/contas/${b.id}`} className="item tx-link" key={b.id}>
                  <div className={`item-icon ${tone}`}>{b.name.charAt(0)}</div>
                  <div className="grow">
                    <div className="item-title">{b.name}</div>
                    <div className={`item-sub ${tone}`}>{d.text}</div>
                  </div>
                  <span className="amount">{brl(b.amount)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {key === 'casal' && people.length > 0 && (
        <section className="card stack" aria-label="Quem gastou">
          <div className="section-head">
            <h2>Quem gastou</h2>
            <span className="tiny muted">na Família este mês</span>
          </div>
          <div className="who-bar" aria-hidden="true">
            {people.map((p, i) => <span key={p.name} style={{ width: `${(p.total / peopleSum) * 100}%`, background: DONUT[i % DONUT.length] }} />)}
          </div>
          <div className="row small" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            {people.map((p) => (
              <span key={p.name}><b>{p.name}</b> <span className="muted">{brl(p.total)} · {Math.round((p.total / peopleSum) * 100)}%</span></span>
            ))}
          </div>
        </section>
      )}

      <section className="card stack" aria-label="Metas">
        <div className="section-head">
          <h2>{key === 'casal' ? 'Metas da família' : 'Minhas metas'}</h2>
          {goals.length > 0 && <Link href="/mais#metas">Nova meta</Link>}
        </div>
        {goals.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><IconTarget /></span>
            <div>
              <p>Nenhuma meta ainda. Que tal começar por uma reserva de emergência?</p>
              <Link href="/mais#metas" className="btn">Criar meta</Link>
            </div>
          </div>
        ) : (
          goals.map((g: any) => {
            const pct = Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100));
            return (
              <div className="stack" style={{ gap: 8 }} key={g.id}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{g.name}</span>
                  <span className="muted">{pct}%</span>
                </div>
                <div className="bar"><span style={{ width: `${pct}%` }} /></div>
                <div className="tiny muted">{brl(g.current_amount)} de {brl(g.target_amount)}</div>
              </div>
            );
          })
        )}
      </section>

      <section className="card" aria-label="Últimos lançamentos">
        <div className="section-head">
          <h2>Últimos lançamentos</h2>
          {txs.length > 0 && <Link href={`/lancar${q}`}>Lançar</Link>}
        </div>
        {txs.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><IconList /></span>
            <div>
              <p>Nada lançado ainda. Diga ao Jarbas “gastei 50 no mercado” e pronto.</p>
              <Link href="/jarbas" className="btn"><IconChat size={16} />Falar com o Jarbas</Link>
            </div>
          </div>
        ) : (
          <div className="list">
            {txs.map((t: any) => (
              <Link href={`/lancamento/${t.id}?voltar=${encodeURIComponent('/' + q)}`} className="item tx-link" key={t.id} aria-label={`Editar ${t.description}`}>
                <div className={`item-icon ${t.kind === 'income' ? 'income' : ''}`}>{(t.categories?.name ?? t.description).charAt(0)}</div>
                <div className="grow">
                  <div className="item-title">{t.description}</div>
                  <div className="item-sub">{t.categories?.name ?? 'Sem categoria'} · {shortDate(t.occurred_on)}</div>
                </div>
                <span className={`amount ${t.kind === 'income' ? 'income' : ''}`}>{t.kind === 'income' ? '+ ' : '− '}{brl(t.amount)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
