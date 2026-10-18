import Link from 'next/link';
import JarbasBar from '@/components/JarbasBar';
import { getContext, pickSpace } from '@/lib/context';
import { monthSummary } from '@/lib/finance';
import { fmtWhen } from '@/lib/agenda';
import { brl, daysBetween, dueLabel, monthName, monthRange, shortDate, todaySP } from '@/lib/format';
import {
  IconArrowDown, IconArrowUp, IconBills, IconCalendar, IconChat, IconList, IconMinus, IconPlus, IconReceipt, IconTarget,
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

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const ctx = await getContext();
  const { e } = await searchParams;
  const { space, key } = pickSpace(ctx, e);
  const db = ctx.supabase;
  const today = todaySP();
  const { end } = monthRange(today);
  const daysLeft = daysBetween(today, end);
  const q = key === 'pessoal' ? '?e=pessoal' : '';

  const [summary, billsRes, goalsRes, txRes, evRes] = await Promise.all([
    monthSummary(db, space.id, today),
    db.from('bills').select('id, name, amount, due_date').eq('space_id', space.id).eq('status', 'open').order('due_date').limit(4),
    db.from('goals').select('id, name, target_amount, current_amount, deadline').eq('space_id', space.id).order('created_at'),
    db.from('transactions').select('id, kind, amount, description, occurred_on, categories(name)').eq('space_id', space.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(5),
    db.from('events').select('id, kind, title, starts_at, space_id').gte('starts_at', new Date(Date.now() - 3_600_000).toISOString()).order('starts_at').limit(4),
  ]);
  const events = evRes.error ? [] : evRes.data ?? [];
  const bills = billsRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const txs = txRes.data ?? [];

  const spentPct = summary.income > 0 ? Math.min(100, Math.round((summary.expense / summary.income) * 100)) : 0;
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

      <section className="hero" aria-label="Resumo do mês">
        <div className="hero-top">
          <span className="chip-soft" style={{ textTransform: 'capitalize' }}>{monthName(today)} · {spaceLabel}</span>
          <span className="tiny muted">{daysLeft === 0 ? 'Último dia do mês' : `${daysLeft} dias para fechar`}</span>
        </div>
        <div>
          <div className="label">Sobra até o fim do mês</div>
          <div className={`big-number ${summary.balance < 0 ? 'neg' : ''}`}>{brl(summary.balance)}</div>
        </div>
        <div>
          <div className="bar" aria-label={`${spentPct}% das entradas já gastos`}>
            <span className={spentPct >= 90 ? 'warn' : ''} style={{ width: `${spentPct}%` }} />
          </div>
          <div className="bar-labels">
            <span>{summary.income > 0 ? `${spentPct}% das entradas já usadas` : 'Lance uma entrada para ver o progresso'}</span>
          </div>
        </div>
        <div className="flow">
          <div className="flow-item">
            <div className="flow-row">
              <span className="flow-icon in"><IconArrowDown size={15} /></span>
              <span className="tiny muted">Entradas</span>
            </div>
            <div className="value">{brl(summary.income)}</div>
          </div>
          <div className="flow-item">
            <div className="flow-row">
              <span className="flow-icon out"><IconArrowUp size={15} /></span>
              <span className="tiny muted">Saídas</span>
            </div>
            <div className="value">{brl(summary.expense)}</div>
          </div>
        </div>
      </section>

      <nav className="quick" aria-label="Atalhos">
        <Link href={`/lancar${q}`}><span className="quick-icon"><IconMinus /></span>Gasto</Link>
        <Link href={`/lancar${q ? q + '&' : '?'}tipo=receita`}><span className="quick-icon"><IconPlus /></span>Entrada</Link>
        <Link href={`/contas${q}`}><span className="quick-icon"><IconReceipt /></span>Contas</Link>
        <Link href="/mais#metas"><span className="quick-icon"><IconTarget /></span>Metas</Link>
      </nav>


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
                <div className="item" key={b.id}>
                  <div className={`item-icon ${tone}`}>{b.name.charAt(0)}</div>
                  <div className="grow">
                    <div className="item-title">{b.name}</div>
                    <div className={`item-sub ${tone}`}>{d.text}</div>
                  </div>
                  <span className="amount">{brl(b.amount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

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
              <div className="item" key={t.id}>
                <div className={`item-icon ${t.kind === 'income' ? 'income' : ''}`}>{(t.categories?.name ?? t.description).charAt(0)}</div>
                <div className="grow">
                  <div className="item-title">{t.description}</div>
                  <div className="item-sub">{t.categories?.name ?? 'Sem categoria'} · {shortDate(t.occurred_on)}</div>
                </div>
                <span className={`amount ${t.kind === 'income' ? 'income' : ''}`}>{t.kind === 'income' ? '+ ' : '− '}{brl(t.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
