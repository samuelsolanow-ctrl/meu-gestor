import Link from 'next/link';
import { getContext } from '@/lib/context';
import { brl, monthName, todaySP } from '@/lib/format';
import { ensureSchema } from '@/lib/migrate';
import { cardColors, invoiceDates, invoiceToPay, loadCardData, shiftKey, type Card, type Invoice } from '@/lib/cards';
import { archiveCardAction, createAccountAction, toggleInvoicePaidAction, updateCardAction } from '../actions';
import TransactionForm from '@/components/TransactionForm';
import { IconChevron } from '@/components/icons';

export const dynamic = 'force-dynamic';

const BANKS = ['Santander', 'Bradesco', 'Neon', 'Caixa', 'Banco do Brasil', 'Nubank', 'Itaú', 'Inter'];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const monthLabel = (key: string) => {
  const m = monthName(`${key}-01`);
  return `${m.charAt(0).toUpperCase()}${m.slice(1)}${key.slice(0, 4) !== todaySP().slice(0, 4) ? ` ${key.slice(0, 4)}` : ''}`;
};
const STATUS: Record<string, { text: string; cls: string }> = {
  aberta: { text: 'Aberta', cls: '' },
  fechada: { text: 'Fechada · pagar', cls: 'warn' },
  vencida: { text: 'Vencida', cls: 'late' },
  paga: { text: 'Paga', cls: 'ok' },
};

function AddCardForm({ firstName, open }: { firstName: string; open?: boolean }) {
  return (
    <details open={open}>
      <summary className="btn btn-block" style={{ listStyle: 'none' }}>Adicionar cartão</summary>
      <form action={createAccountAction} className="stack" style={{ marginTop: 14 }}>
        <input type="hidden" name="tipo" value="credit_card" />
        <div className="grid2">
          <label className="field"><span>Nome</span><input className="input" name="nome" placeholder="Santander Unique" required /></label>
          <label className="field">
            <span>Banco</span>
            <select className="input" name="banco" defaultValue="">
              <option value="">Outro</option>
              {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        </div>
        <div className="grid2">
          <label className="field"><span>Fecha dia</span><input className="input" name="fechamento" inputMode="numeric" placeholder="ex.: 5" required /></label>
          <label className="field"><span>Vence dia</span><input className="input" name="vencimento" inputMode="numeric" placeholder="ex.: 12" required /></label>
        </div>
        <div className="grid2">
          <label className="field"><span>Limite (R$)</span><input className="input" name="limite" inputMode="decimal" placeholder="ex.: 15.000" /></label>
          <label className="field">
            <span>De quem é</span>
            <select className="input" name="espaco" defaultValue="casal">
              <option value="pessoal">{firstName}</option>
              <option value="casal">Família</option>
            </select>
          </label>
        </div>
        <button className="btn btn-primary btn-block">Salvar cartão</button>
      </form>
    </details>
  );
}

export default async function CartoesPage({ searchParams }: { searchParams: Promise<{ c?: string; f?: string }> }) {
  const ctx = await getContext();
  const { c, f } = await searchParams;
  const firstName = ctx.name.split(' ')[0];
  const today = todaySP();
  await ensureSchema();

  const [{ data: cardRows }, { data: categories }, { data: accounts }] = await Promise.all([
    ctx.supabase.from('accounts').select('id, name, institution, space_id, closing_day, due_day, credit_limit').eq('type', 'credit_card').eq('archived', false).order('name'),
    ctx.supabase.from('categories').select('id, name, kind').order('name'),
    ctx.supabase.from('accounts').select('id, name, space_id, type').eq('archived', false).order('name'),
  ]);
  const cards = (cardRows ?? []) as Card[];

  if (!cards.length) {
    return (
      <main className="page">
        <header className="topbar"><h1 className="page-title">Cartões</h1></header>
        <section className="card stack">
          <p className="small muted" style={{ margin: 0 }}>
            Cadastre seus cartões com o dia de fechamento e de vencimento. Assim cada compra, e cada parcela, cai na fatura certa.
          </p>
          <AddCardForm firstName={firstName} open />
        </section>
      </main>
    );
  }

  const data = await loadCardData(ctx.supabase, cards, today);
  const card = cards.find((x) => x.id === c) ?? cards[0];
  const d = data.get(card.id)!;
  const pay = invoiceToPay(d.invoices, d.current);
  const key = f && /^\d{4}-\d{2}$/.test(f) ? f : pay.key;
  const inv: Invoice = d.invoices.get(key) ?? { key, total: 0, items: [], status: 'aberta', ...invoiceDates(key, card.closing_day, card.due_day) };
  const st = STATUS[inv.status];
  const limit = card.credit_limit ? Number(card.credit_limit) : 0;
  const usedPct = limit ? Math.min(100, Math.round((d.used / limit) * 100)) : 0;
  const future = [...d.invoices.values()].filter((i) => i.key > d.current && i.total > 0).sort((a, b) => (a.key < b.key ? -1 : 1)).slice(0, 8);
  const futureMax = Math.max(1, ...future.map((i) => i.total));
  const whose = (spaceId: string) => (spaceId === ctx.casal.id ? 'Família' : firstName);
  const base = `/cartoes?c=${card.id}`;

  return (
    <main className="page">
      <header className="topbar"><h1 className="page-title">Cartões</h1></header>

      <nav className="cc-rail" aria-label="Seus cartões">
        {cards.map((x) => {
          const [a, b] = cardColors(x);
          const cur = data.get(x.id)!.invoices.get(data.get(x.id)!.current)!;
          return (
            <Link key={x.id} href={`/cartoes?c=${x.id}`} className={`cc ${x.id === card.id ? 'on' : ''}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} aria-current={x.id === card.id ? 'true' : undefined}>
              <span className="cc-top">
                <span className="cc-name">{x.name}</span>
                <span className="cc-chip" aria-hidden="true" />
              </span>
              <span className="cc-bottom">
                <span>
                  <span className="cc-label">Fatura atual</span>
                  <span className="cc-value">{brl(cur.total)}</span>
                </span>
                <span className="cc-label">{whose(x.space_id)}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="card stack" aria-label="Fatura">
        <div className="inv-nav">
          <Link href={`${base}&f=${shiftKey(key, -1)}`} className="btn btn-icon" aria-label="Fatura anterior" style={{ transform: 'rotate(180deg)' }}><IconChevron /></Link>
          <div style={{ textAlign: 'center' }}>
            <div className="label">Fatura de {monthLabel(key)}</div>
            <span className={`status-pill ${st.cls}`}>{st.text}</span>
          </div>
          <Link href={`${base}&f=${shiftKey(key, 1)}`} className="btn btn-icon" aria-label="Próxima fatura"><IconChevron /></Link>
        </div>
        <div className={`big-number ${inv.status === 'vencida' ? 'neg' : ''}`} style={{ fontSize: 46, textAlign: 'center' }}>{brl(inv.total)}</div>
        <div className="small muted" style={{ textAlign: 'center' }}>Fecha {ddmm(inv.closesOn)} · Vence {ddmm(inv.dueOn)}</div>
        {inv.total > 0 && (
          <form action={toggleInvoicePaidAction}>
            <input type="hidden" name="id" value={card.id} />
            <input type="hidden" name="fatura" value={key} />
            {inv.status === 'paga' ? (
              <button className="btn btn-block" name="desfazer" value="1">Desmarcar como paga</button>
            ) : (
              <button className={`btn btn-block ${inv.status !== 'aberta' ? 'btn-primary' : ''}`}>Marcar fatura como paga</button>
            )}
          </form>
        )}
      </section>

      <section className="card stack" aria-label="Limite">
        <div className="card-head"><h2>Limite</h2>{limit > 0 && <span className="small muted">{usedPct}% usado</span>}</div>
        {limit > 0 ? (
          <>
            <div className="bar" role="img" aria-label={`${usedPct}% do limite usado`}><span style={{ width: `${usedPct}%`, background: usedPct > 85 ? 'var(--late)' : usedPct > 60 ? 'var(--warn)' : undefined }} /></div>
            <div className="grid2 small">
              <div><div className="muted">Usado</div><div style={{ fontWeight: 700 }}>{brl(d.used)}</div></div>
              <div style={{ textAlign: 'right' }}><div className="muted">Disponível</div><div style={{ fontWeight: 700, color: 'var(--accent)' }}>{brl(Math.max(0, limit - d.used))}</div></div>
            </div>
            <div className="tiny muted">Inclui as parcelas que ainda vão vencer. Limite total {brl(limit)}.</div>
          </>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>Informe o limite em “Editar cartão” para ver quanto ainda está disponível. Usado agora: {brl(d.used)}.</p>
        )}
      </section>

      <section className="card stack" aria-label="Compras da fatura">
        <div className="card-head"><h2>Compras</h2><span className="small muted">{inv.items.length}</span></div>
        <Link href="/jarbas" className="import-tip">Tem a fatura em PDF? Mande para o Jarbas pelo clipe que ele importa todas as compras, com parcelas e sem duplicar.</Link>
        <details>
          <summary className="btn btn-block btn-primary" style={{ listStyle: 'none' }}>Nova compra no {card.name}</summary>
          <div style={{ marginTop: 14 }}>
            <TransactionForm
              categories={categories ?? []}
              accounts={accounts ?? []}
              defaultSpace={card.space_id === ctx.casal.id ? 'casal' : 'pessoal'}
              myName={firstName}
              today={today}
              casalId={ctx.casal.id}
              pessoalId={ctx.pessoal.id}
              defaultAccount={card.id}
              backTo="cartoes"
            />
          </div>
        </details>
        {inv.items.length === 0 ? (
          <p className="empty">Nenhuma compra nesta fatura. Dica: diga ao Jarbas “gastei 4.100 em 10x no {card.name}”.</p>
        ) : (
          <div className="list">
            {inv.items.map((t) => (
              <Link href={`/lancamento/${t.id}?voltar=${encodeURIComponent(`/cartoes?c=${card.id}&f=${key}`)}`} className="item tx-link" key={t.id}>
                <div className={`item-icon ${t.kind === 'income' ? 'income' : ''}`}>{t.description.charAt(0)}</div>
                <div className="grow">
                  <div className="item-title">
                    {t.description}
                    {t.installment_total ? <span className="chip-soft" style={{ marginLeft: 8 }}>{t.installment_no}/{t.installment_total}</span> : null}
                  </div>
                  <div className="item-sub">{ddmm(t.occurred_on)} · {t.categories?.name ?? 'Sem categoria'}</div>
                </div>
                <span className={`amount ${t.kind === 'income' ? 'income' : ''}`}>{t.kind === 'income' ? '−' : ''}{brl(t.amount)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {future.length > 0 && (
        <section className="card stack" aria-label="Próximas faturas">
          <div className="card-head"><h2>Próximas faturas</h2><span className="small muted">já comprometido</span></div>
          <div className="stack" style={{ gap: 10 }}>
            {future.map((i) => (
              <Link key={i.key} href={`${base}&f=${i.key}`} className="fut-row">
                <span className="fut-month">{monthLabel(i.key).slice(0, 3)}</span>
                <span className="fut-bar"><span style={{ width: `${Math.max(4, Math.round((i.total / futureMax) * 100))}%` }} /></span>
                <span className="fut-val">{brl(i.total)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card stack" aria-label="Editar cartão">
        <details>
          <summary className="btn btn-block" style={{ listStyle: 'none' }}>Editar cartão</summary>
          <form action={updateCardAction} className="stack" style={{ marginTop: 14 }}>
            <input type="hidden" name="id" value={card.id} />
            <label className="field"><span>Nome</span><input className="input" name="nome" defaultValue={card.name} /></label>
            <div className="grid2">
              <label className="field"><span>Fecha dia</span><input className="input" name="fechamento" inputMode="numeric" defaultValue={card.closing_day ?? ''} /></label>
              <label className="field"><span>Vence dia</span><input className="input" name="vencimento" inputMode="numeric" defaultValue={card.due_day ?? ''} /></label>
            </div>
            <label className="field"><span>Limite (R$)</span><input className="input" name="limite" inputMode="decimal" defaultValue={card.credit_limit ? String(card.credit_limit).replace('.', ',') : ''} /></label>
            <button className="btn btn-primary btn-block">Salvar</button>
          </form>
          <form action={archiveCardAction} style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={card.id} />
            <button className="btn btn-block" style={{ border: 'none', color: 'var(--late)' }}>Remover cartão</button>
          </form>
        </details>
        <AddCardForm firstName={firstName} />
      </section>
    </main>
  );
}
