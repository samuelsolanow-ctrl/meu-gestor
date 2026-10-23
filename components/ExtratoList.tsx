'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { quickDeleteAction, setCategoryAction } from '@/app/(app)/actions';
import CatIcon from './CatIcon';

export type Row = {
  id: string;
  kind: 'income' | 'expense';
  amount: number;
  description: string;
  occurred_on: string;
  category_id: string | null;
  category: string | null;
  account: string | null;
  who: string | null;
  parcel: string | null;
  spaceLabel: string;
};
type Cat = { id: string; name: string; kind: string };

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function dayLabel(iso: string, today: string) {
  const d = new Date(Date.parse(iso + 'T12:00:00Z'));
  const base = `${WD[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const diff = Math.round((Date.parse(today + 'T12:00:00Z') - d.getTime()) / 86_400_000);
  return diff === 0 ? `Hoje · ${base}` : diff === 1 ? `Ontem · ${base}` : diff < 0 ? `${base} · futuro` : base;
}

export default function ExtratoList({ rows, categories, today, back }: { rows: Row[]; categories: Cat[]; today: string; back: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<Row | null>(null);
  const [always, setAlways] = useState(true);
  const [pending, start] = useTransition();
  const [local, setLocal] = useState<Record<string, string | null>>({});

  useEffect(() => setLocal({}), [rows]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const groups: [string, Row[]][] = [];
  for (const r of rows) {
    const g = groups[groups.length - 1];
    if (g && g[0] === r.occurred_on) g[1].push(r);
    else groups.push([r.occurred_on, [r]]);
  }
  const catName = (r: Row) => (r.id in local ? categories.find((c) => c.id === local[r.id])?.name ?? null : r.category);

  function pick(catId: string) {
    if (!open) return;
    const row = open;
    setLocal((l) => ({ ...l, [row.id]: catId }));
    setOpen(null);
    start(async () => {
      await setCategoryAction(row.id, catId, always);
      router.refresh();
    });
  }
  function remove() {
    if (!open) return;
    const row = open;
    if (!confirm(`Apagar “${row.description}”${row.parcel ? ' e todas as parcelas' : ''}?`)) return;
    setOpen(null);
    start(async () => {
      await quickDeleteAction(row.id);
      router.refresh();
    });
  }

  if (!rows.length) return <p className="empty">Nada por aqui neste mês com esses filtros.</p>;

  return (
    <>
      {groups.map(([day, list]) => {
        const total = list.reduce((s, r) => s + (r.kind === 'income' ? r.amount : -r.amount), 0);
        return (
          <section key={day} className="stack" style={{ gap: 6 }} aria-label={dayLabel(day, today)}>
            <div className="day-head">
              <span>{dayLabel(day, today)}</span>
              <span>{total >= 0 ? '+ ' : '− '}{brl(Math.abs(total))}</span>
            </div>
            <div className="card ext-card">
              {list.map((r) => {
                const cn = catName(r);
                return (
                  <button key={r.id} type="button" className="ext-row" onClick={() => { setAlways(true); setOpen(r); }} aria-label={`${r.description}, ${brl(r.amount)}. Trocar categoria`}>
                    <CatIcon name={cn} income={r.kind === 'income'} />
                    <span className="grow ext-main">
                      <span className="item-title">
                        {r.description}
                        {r.parcel && <span className="parcel">{r.parcel}</span>}
                      </span>
                      <span className={`item-sub ${cn ? '' : 'warn'}`}>
                        {cn ? [cn, r.account, r.who].filter(Boolean).join(' · ') : 'Sem categoria · toque para classificar'}
                      </span>
                    </span>
                    <span className={`amount ${r.kind === 'income' ? 'income' : ''}`}>{r.kind === 'income' ? '+ ' : '− '}{brl(r.amount)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={`Lançamento ${open.description}`} onClick={(e) => e.stopPropagation()}>
            <span className="sheet-grip" aria-hidden="true" />
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{open.description}</span>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{brl(open.amount)}</span>
            </div>
            <span className="tiny muted">{[dayLabel(open.occurred_on, today), open.account, open.who, open.spaceLabel, open.parcel ? `parcela ${open.parcel}` : null].filter(Boolean).join(' · ')}</span>
            <span className="label" style={{ fontWeight: 700 }}>Categoria</span>
            <div className="cat-grid">
              {categories.filter((c) => c.kind === open.kind).map((c) => {
                const on = (open.id in local ? local[open.id] : open.category_id) === c.id;
                return (
                  <button key={c.id} type="button" className={`cat-pick ${on ? 'on' : ''}`} onClick={() => pick(c.id)} disabled={pending}>
                    <CatIcon name={c.name} size={28} />
                    <span>{c.name}</span>
                  </button>
                );
              })}
            </div>
            <label className="row small" style={{ gap: 10 }}>
              <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
              Sempre usar a categoria escolhida para “{open.description}”
            </label>
            <div className="grid2">
              <button type="button" className="btn" style={{ color: 'var(--late)' }} onClick={remove} disabled={pending}>Apagar</button>
              <Link href={`/lancamento/${open.id}?voltar=${encodeURIComponent(back)}`} className="btn btn-primary">Editar tudo</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
