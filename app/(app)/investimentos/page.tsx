import Link from 'next/link';
import { getContext } from '@/lib/context';
import { brl, todaySP } from '@/lib/format';
import { INV_COLORS, INV_KINDS, listInvestments } from '@/lib/investments';
import { deleteInvestmentAction, updateInvestmentAction } from '../actions';
import { KindSelect, MoveForm, NewInvestmentForm, PlaceInput } from '@/components/InvestForms';
import { IconBack } from '@/components/icons';

export const dynamic = 'force-dynamic';

const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`;
const MOVE: Record<string, string> = { aporte: 'Aporte', resgate: 'Resgate', atualizacao: 'Atualização' };

export default async function InvestimentosPage({ searchParams }: { searchParams: Promise<{ i?: string }> }) {
  const ctx = await getContext();
  const { i } = await searchParams;
  const today = todaySP();
  const [{ items, invested, current, gain, gainPct }, { data: members }] = await Promise.all([
    listInvestments(ctx.supabase),
    ctx.supabase.from('profiles').select('display_name'),
  ]);
  const owners = (members ?? []).map((m: any) => String(m.display_name).split(' ')[0]);
  const me = ctx.name.split(' ')[0];
  owners.sort((a: string, b: string) => (a === me ? -1 : b === me ? 1 : 0));

  const byKind: Record<string, number> = {};
  const byOwner: Record<string, number> = {};
  for (const it of items) {
    byKind[it.kind] = (byKind[it.kind] ?? 0) + it.current_value;
    const o = it.owner_name || 'Família';
    byOwner[o] = (byOwner[o] ?? 0) + it.current_value;
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
        <h1 className="page-title">Investimentos</h1>
      </header>

      <section className="hero hero-blue" aria-label="Patrimônio investido">
        <div className="hero-top">
          <span className="hero-chip">Patrimônio investido</span>
          <span className="tiny" style={{ color: '#c9d6ff' }}>{items.length} {items.length === 1 ? 'aplicação' : 'aplicações'}</span>
        </div>
        <div className="big-number" style={{ color: '#fff' }}>{brl(current)}</div>
        <div className="hero-cols" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div><span>Aplicado</span><b>{brl(invested)}</b></div>
          <div><span>Rendimento</span><b style={{ color: gain < 0 ? '#ffb3a1' : '#8ff0b8' }}>{gain >= 0 ? '+' : ''}{brl(gain)} · {pct(gainPct)}</b></div>
        </div>
        <div className="tiny" style={{ color: '#c9d6ff' }}>Fica separado: não entra nas receitas, despesas nem no saldo do mês.</div>
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
          {Object.keys(byOwner).length > 1 && (
            <div className="row small" style={{ justifyContent: 'space-between', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              {Object.entries(byOwner).map(([o, v]) => <span key={o}><b>{o}</b> <span className="muted">{brl(v)}</span></span>)}
            </div>
          )}
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
                <Link key={it.id} href={it.id === i ? '/investimentos' : `/investimentos?i=${it.id}`} className={`item tx-link ${it.id === i ? 'inv-on' : ''}`} aria-expanded={it.id === i}>
                  <div className="item-icon" style={{ background: `${INV_COLORS[it.kind] ?? '#3a4870'}22`, color: INV_COLORS[it.kind] ?? 'var(--text-2)' }}>{it.name.charAt(0)}</div>
                  <div className="grow">
                    <div className="item-title">{it.name}</div>
                    <div className="item-sub">{[it.institution, it.owner_name, INV_KINDS[it.kind]].filter(Boolean).join(' · ')}</div>
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
          <NewInvestmentForm owners={owners} />
        </details>
      </section>

      {sel && (
        <section className="card stack" aria-label={`Detalhes de ${sel.name}`} id="detalhe">
          <div className="section-head"><h2>{sel.name}</h2><span className="tiny muted">{sel.institution}</span></div>
          <div className="grid2 small">
            <div><div className="muted">Aplicado</div><div style={{ fontWeight: 700 }}>{brl(sel.invested)}</div></div>
            <div style={{ textAlign: 'right' }}><div className="muted">Vale hoje</div><div style={{ fontWeight: 700 }}>{brl(sel.current_value)}</div></div>
          </div>
          <MoveForm id={sel.id} today={today} />
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
              <label className="field">
                <span>Titular</span>
                <select className="input" name="titular" defaultValue={sel.owner_name ?? 'Família'}>
                  {owners.map((o: string) => <option key={o} value={o}>{o}</option>)}
                  <option value="Família">Família</option>
                </select>
              </label>
              <button className="btn btn-primary btn-block">Salvar</button>
            </form>
            <form action={deleteInvestmentAction} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={sel.id} />
              <button className="btn btn-block" style={{ border: 'none', color: 'var(--late)' }}>Excluir investimento</button>
            </form>
          </details>
        </section>
      )}
    </main>
  );
}
