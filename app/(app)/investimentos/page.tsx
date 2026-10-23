import Link from 'next/link';
import { getContext } from '@/lib/context';
import { brl, todaySP } from '@/lib/format';
import { INV_COLORS, INV_KINDS, listInvestments } from '@/lib/investments';
import { createGoalAction, deleteGoalAction, deleteInvestmentAction, updateGoalAction, updateInvestmentAction } from '../actions';
import { KindSelect, MoveForm, NewInvestmentForm, PlaceInput } from '@/components/InvestForms';
import { IconBack } from '@/components/icons';

export const dynamic = 'force-dynamic';

const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`;
const MOVE: Record<string, string> = { aporte: 'Aporte', resgate: 'Resgate', atualizacao: 'Atualização' };

export default async function InvestimentosPage({ searchParams }: { searchParams: Promise<{ i?: string; e?: string }> }) {
  const ctx = await getContext();
  const { i, e } = await searchParams;
  const today = todaySP();
  // Aqui o padrão é o seu: cada um vê os próprios investimentos; Família mostra os do casal
  const espaco: 'pessoal' | 'casal' = e === 'casal' ? 'casal' : 'pessoal';
  const spaceId = espaco === 'casal' ? ctx.casal.id : ctx.pessoal.id;
  const me = ctx.name.split(' ')[0];
  const [{ items, invested, current, gain, gainPct }, { data: goals }] = await Promise.all([
    listInvestments(ctx.supabase, spaceId),
    ctx.supabase.from('goals').select('id, name, target_amount, current_amount, deadline').eq('space_id', spaceId).order('created_at'),
  ]);
  const q = espaco === 'casal' ? '&e=casal' : '';

  const byKind: Record<string, number> = {};
  for (const it of items) {
    byKind[it.kind] = (byKind[it.kind] ?? 0) + it.current_value;
  }
  const kinds = Object.entries(byKind).sort((a, b) => b[1] - a[1]);
  const sel = items.find((x: any) => x.id === i);
  const { data: moves } = sel
    ? await ctx.supabase.from('investment_moves').select('id, kind, amount, value_after, occurred_on').eq('investment_id', sel.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(20)
    : { data: [] as any[] };

  return (
    <main className="page">
      <header className="row">
        <Link href="/" className="btn btn-icon" aria-label="Voltar ao início" style={{ border: 'none' }}><IconBack /></Link>
        <h1 className="page-title">Patrimônio</h1>
      </header>

      <nav className="seg" aria-label="De quem">
        <Link href="/investimentos" className={espaco === 'pessoal' ? 'on' : ''}>{me}</Link>
        <Link href="/investimentos?e=casal" className={espaco === 'casal' ? 'on' : ''}>Família</Link>
      </nav>

      <section className="hero hero-blue" aria-label="Patrimônio investido">
        <div className="hero-top">
          <span className="hero-chip">{espaco === 'pessoal' ? 'Seus investimentos · só você vê' : 'Investimentos da Família'}</span>
          <span className="tiny" style={{ color: '#c9d6ff' }}>{items.length} {items.length === 1 ? 'aplicação' : 'aplicações'}</span>
        </div>
        <div className="big-number" style={{ color: '#fff' }}>{brl(current)}</div>
        <div className="hero-cols" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div><span>Aplicado</span><b>{brl(invested)}</b></div>
          <div><span>Rendimento</span><b style={{ color: gain < 0 ? '#ffb3a1' : '#8ff0b8' }}>{gain >= 0 ? '+' : ''}{brl(gain)} · {pct(gainPct)}</b></div>
        </div>
        <div className="tiny" style={{ color: '#c9d6ff' }}>Fica separado: não entra nas receitas, despesas nem no saldo do mês.{espaco === 'pessoal' ? ' Os de cada pessoa ficam no perfil dela.' : ''}</div>
      </section>

      {items.length > 0 && (
        <section className="card stack" aria-label="Distribuição">
          <div className="section-head"><h2>Onde está o dinheiro</h2></div>
          <div className="who-bar" aria-hidden="true" style={{ height: 12 }}>
            {kinds.map(([k, v]) => <span key={k} style={{ width: `${(v / (current || 1)) * 100}%`, background: INV_COLORS[k] ?? '#3a4870' }} />)}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {kinds.map(([k, v]) => (
              <div className="row small" key={k} style={{ gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: INV_COLORS[k] ?? '#3a4870', flex: 'none' }} aria-hidden="true" />
                <span className="grow">{INV_KINDS[k] ?? k}</span>
                <span className="muted">{brl(v)} · {Math.round((v / (current || 1)) * 100)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card stack" aria-label="Aplicações">
        <div className="section-head"><h2>Aplicações</h2></div>
        {items.length === 0 ? (
          <p className="empty" style={{ margin: 0 }}>Cadastre suas aplicações (Ágora, Santander…) para acompanhar o patrimônio. Ou diga ao Jarbas “tenho 20 mil num CDB na Ágora”.</p>
        ) : (
          <div className="list">
            {items.map((it: any) => {
              const g = it.invested > 0 ? ((it.current_value - it.invested) / it.invested) * 100 : 0;
              return (
                <Link key={it.id} href={it.id === i ? `/investimentos${q ? '?e=casal' : ''}` : `/investimentos?i=${it.id}${q}`} className={`item tx-link ${it.id === i ? 'inv-on' : ''}`} aria-expanded={it.id === i}>
                  <div className="item-icon" style={{ background: `${INV_COLORS[it.kind] ?? '#3a4870'}22`, color: INV_COLORS[it.kind] ?? 'var(--text-2)' }}>{it.name.charAt(0)}</div>
                  <div className="grow">
                    <div className="item-title">{it.name}</div>
                    <div className="item-sub">{[it.institution, INV_KINDS[it.kind]].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="amount" style={{ fontWeight: 800 }}>{brl(it.current_value)}</div>
                    <div className="tiny" style={{ color: g < 0 ? 'var(--late)' : 'var(--ok)' }}>{pct(g)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <details open={items.length === 0}>
          <summary className="btn btn-block" style={{ listStyle: 'none' }}>Adicionar investimento</summary>
          <NewInvestmentForm espaco={espaco} />
        </details>
      </section>

      {sel && (
        <section className="card stack" aria-label={`Detalhes de ${sel.name}`} id="detalhe">
          <div className="section-head"><h2>{sel.name}</h2><span className="tiny muted">{sel.institution}</span></div>
          <div className="grid2 small">
            <div><div className="muted">Aplicado</div><div style={{ fontWeight: 700 }}>{brl(sel.invested)}</div></div>
            <div style={{ textAlign: 'right' }}><div className="muted">Vale hoje</div><div style={{ fontWeight: 700 }}>{brl(sel.current_value)}</div></div>
          </div>
          <MoveForm id={sel.id} today={today} espaco={espaco} />
          {(moves ?? []).length > 0 && (
            <div className="list" aria-label="Histórico">
              {(moves ?? []).map((m: any) => (
                <div className="item" key={m.id} style={{ minHeight: 44 }}>
                  <div className="grow">
                    <div className="item-title" style={{ fontSize: 14 }}>{MOVE[m.kind]}</div>
                    <div className="item-sub">{m.occurred_on.slice(8, 10)}/{m.occurred_on.slice(5, 7)}/{m.occurred_on.slice(0, 4)} · ficou {brl(m.value_after)}</div>
                  </div>
                  <span className="amount" style={{ color: m.kind === 'resgate' ? 'var(--late)' : m.kind === 'aporte' ? 'var(--ok)' : 'var(--text-2)' }}>
                    {m.kind === 'resgate' ? '−' : m.kind === 'aporte' ? '+' : ''}{brl(m.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <details>
            <summary className="btn btn-block" style={{ listStyle: 'none' }}>Editar dados</summary>
            <form action={updateInvestmentAction} className="stack" style={{ marginTop: 14 }}>
              <input type="hidden" name="id" value={sel.id} />
              <label className="field"><span>Nome</span><input className="input" name="nome" defaultValue={sel.name} /></label>
              <div className="grid2">
                <label className="field"><span>Tipo</span><KindSelect value={sel.kind} /></label>
                <label className="field"><span>Onde está</span><PlaceInput value={sel.institution} /></label>
              </div>
              <div className="grid2">
                <label className="field"><span>Aplicado (R$)</span><input className="input" name="aplicado" inputMode="decimal" defaultValue={String(sel.invested).replace('.', ',')} /></label>
                <label className="field"><span>Vale hoje (R$)</span><input className="input" name="atual" inputMode="decimal" defaultValue={String(sel.current_value).replace('.', ',')} /></label>
              </div>
              <input type="hidden" name="espaco" value={espaco} />
              <button className="btn btn-primary btn-block">Salvar</button>
            </form>
            <form action={deleteInvestmentAction} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={sel.id} />
              <input type="hidden" name="espaco" value={espaco} />
              <button className="btn btn-block" style={{ border: 'none', color: 'var(--late)' }}>Excluir investimento</button>
            </form>
          </details>
        </section>
      )}
      <section className="card stack" id="metas" aria-label="Metas">
        <div className="section-head"><h2>Metas</h2><span className="tiny muted">{espaco === 'pessoal' ? 'suas' : 'da Família'}</span></div>
        {(goals ?? []).length === 0 && <p className="empty" style={{ margin: 0 }}>Nenhuma meta ainda. Que tal uma reserva de emergência?</p>}
        {(goals ?? []).map((g: any) => {
          const pctG = Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100));
          return (
            <details key={g.id} className="goal-edit">
              <summary className="stack" style={{ gap: 6, listStyle: 'none', cursor: 'pointer' }}>
                <div className="row small" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700 }}>{g.name}</span>
                  <span className="muted">{pctG}% ›</span>
                </div>
                <div className="bar thin"><span style={{ width: `${pctG}%` }} /></div>
                <div className="tiny muted">{brl(g.current_amount)} de {brl(g.target_amount)}{g.deadline ? ` · até ${g.deadline.slice(8, 10)}/${g.deadline.slice(5, 7)}/${g.deadline.slice(0, 4)}` : ''}</div>
              </summary>
              <form action={updateGoalAction} className="stack" style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={g.id} />
                <label className="field"><span>Nome</span><input className="input" name="nome" defaultValue={g.name} /></label>
                <div className="grid2">
                  <label className="field"><span>Quanto precisa (R$)</span><input className="input" name="alvo" inputMode="decimal" defaultValue={String(g.target_amount).replace('.', ',')} /></label>
                  <label className="field"><span>Já tem (R$)</span><input className="input" name="atual" inputMode="decimal" defaultValue={String(g.current_amount).replace('.', ',')} /></label>
                </div>
                <label className="field"><span>Prazo</span><input className="input" type="date" name="prazo" defaultValue={g.deadline ?? ''} /></label>
                <button className="btn btn-primary btn-block">Salvar meta</button>
              </form>
              <form action={deleteGoalAction} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={g.id} />
                <button className="btn btn-block" style={{ border: 'none', color: 'var(--late)' }}>Excluir meta</button>
              </form>
            </details>
          );
        })}
        <details>
          <summary className="btn btn-block" style={{ listStyle: 'none' }}>Criar meta</summary>
          <form action={createGoalAction} className="stack" style={{ marginTop: 14 }}>
            <input type="hidden" name="espaco" value={espaco} />
            <label className="field"><span>Nome da meta</span><input className="input" name="nome" placeholder="Viagem, reserva, carro…" required /></label>
            <div className="grid2">
              <label className="field"><span>Quanto precisa (R$)</span><input className="input" name="alvo" inputMode="decimal" required /></label>
              <label className="field"><span>Já tem (R$)</span><input className="input" name="atual" inputMode="decimal" placeholder="0" /></label>
            </div>
            <label className="field"><span>Prazo</span><input className="input" type="date" name="prazo" /></label>
            <button className="btn btn-primary btn-block">Salvar meta</button>
          </form>
        </details>
      </section>
    </main>
  );
}
