'use client';

import { useMemo, useState } from 'react';
import type { MonthForecast } from '@/lib/forecast';

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
const parse = (s: string) => {
  let t = s.replace(/[^\d,.-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return Number(t) || 0;
};

export default function ForecastView({ months, history }: { months: MonthForecast[]; history: number }) {
  const [valor, setValor] = useState('');
  const [parcelas, setParcelas] = useState(10);
  const [inicio, setInicio] = useState(1);
  const total = parse(valor);

  const rows = useMemo(
    () =>
      months.map((m, i) => {
        const extra = total > 0 && i >= inicio && i < inicio + parcelas ? total / parcelas : 0;
        return { ...m, extra, sim: m.balance - extra };
      }),
    [months, total, parcelas, inicio],
  );
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.sim)), ...rows.map((r) => Math.abs(r.balance)));
  const worst = rows.reduce((a, b) => (b.sim < a.sim ? b : a), rows[0]);

  return (
    <>
      <section className="card stack" aria-label="Sobra prevista por mês">
        <div className="section-head"><h2>Quanto vai sobrar</h2><span className="tiny muted">por mês</span></div>
        <div className="fc-chart" role="img" aria-label={rows.map((r) => `${r.label}: ${brl(r.sim)}`).join(', ')}>
          {rows.map((r) => {
            const h = Math.round((Math.abs(r.sim) / max) * 100);
            return (
              <div className="fc-col" key={r.key}>
                <span className={`fc-val ${r.sim < 0 ? 'neg' : ''}`}>{brl(r.sim)}</span>
                <div className="fc-track">
                  <span className={`fc-bar ${r.sim < 0 ? 'neg' : ''} ${r.extra ? 'sim' : ''}`} style={{ height: `${Math.max(4, h)}%` }} />
                </div>
                <span className={`fc-label ${r.current ? 'on' : ''}`}>{r.label}</span>
              </div>
            );
          })}
        </div>
        {history === 0 && <p className="tiny muted" style={{ margin: 0 }}>Ainda há pouco histórico: a previsão fica melhor depois de um ou dois meses de lançamentos.</p>}
      </section>

      <section className="card stack" aria-label="Simular compra parcelada">
        <div className="section-head"><h2>E se eu comprar…?</h2></div>
        <div className="grid2">
          <label className="field"><span>Valor total (R$)</span><input className="input" inputMode="decimal" placeholder="ex.: 4.100" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
          <label className="field">
            <span>Parcelas</span>
            <select className="input" value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x${total > 0 ? ` de ${brl(total / n)}` : ''}`}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Primeira parcela</span>
          <select className="input" value={inicio} onChange={(e) => setInicio(Number(e.target.value))}>
            {months.slice(0, 3).map((m, i) => <option key={m.key} value={i}>{i === 0 ? 'Este mês' : `${m.label} (${i === 1 ? 'próxima fatura' : 'daqui a 2 meses'})`}</option>)}
          </select>
        </label>
        {total > 0 && (
          <p className="small" style={{ margin: 0, color: worst.sim < 0 ? 'var(--late)' : 'var(--ok)', fontWeight: 600 }}>
            {worst.sim < 0
              ? `Aperta em ${worst.label}: faltariam ${brl(-worst.sim)} nesse mês.`
              : `Cabe: o mês mais apertado (${worst.label}) ainda sobra ${brl(worst.sim)}.`}
          </p>
        )}
      </section>

      <section className="card stack" aria-label="Detalhe dos meses">
        <div className="section-head"><h2>De onde vem a conta</h2></div>
        <div className="fc-table" role="table">
          <div className="fc-tr fc-th" role="row">
            <span role="columnheader">Mês</span><span role="columnheader">Entra</span><span role="columnheader">Fixas</span><span role="columnheader">Parcelas</span><span role="columnheader">Dia a dia</span><span role="columnheader">Sobra</span>
          </div>
          {rows.map((r) => (
            <div className="fc-tr" role="row" key={r.key}>
              <span role="cell" style={{ textTransform: 'capitalize', fontWeight: 700 }}>{r.label}</span>
              <span role="cell">{brl(r.income)}</span>
              <span role="cell">{brl(r.bills)}</span>
              <span role="cell">{brl(r.installments + r.extra)}</span>
              <span role="cell">{brl(r.current ? r.spent - r.installments + r.variable : r.variable)}</span>
              <span role="cell" style={{ fontWeight: 800, color: r.sim < 0 ? 'var(--late)' : 'var(--text)' }}>{brl(r.sim)}</span>
            </div>
          ))}
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>Entra = média do que entrou nos últimos meses. Fixas = contas a pagar (as mensais se repetem). Dia a dia = média dos gastos soltos. No mês atual já conta o que foi gasto.</p>
      </section>
    </>
  );
}
