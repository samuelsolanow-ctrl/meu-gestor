'use client';

import { useActionState, useState } from 'react';
import { createTransactionAction } from '@/app/(app)/actions';
import CatIcon from './CatIcon';
import { IconBack } from './icons';

type Cat = { id: string; name: string; kind: string };
type Acc = { id: string; name: string; type?: string; space_id?: string };

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];

export default function QuickAdd({
  categories,
  accounts,
  myName,
  today,
  yesterday,
  defaultSpace,
  defaultTipo,
  back,
}: {
  categories: Cat[];
  accounts: Acc[];
  myName: string;
  today: string;
  yesterday: string;
  defaultSpace: 'casal' | 'pessoal';
  defaultTipo: 'despesa' | 'receita';
  back: string;
}) {
  const [state, action, pending] = useActionState(createTransactionAction, { error: '' } as any);
  const [tipo, setTipo] = useState(defaultTipo);
  const [valor, setValor] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('');
  const [allCats, setAllCats] = useState(false);
  const [conta, setConta] = useState('');
  const [dia, setDia] = useState<'hoje' | 'ontem' | 'outro'>('hoje');
  const [data, setData] = useState(today);
  const [parcelas, setParcelas] = useState(1);
  const [espaco, setEspaco] = useState(defaultSpace);

  const kind = tipo === 'receita' ? 'income' : 'expense';
  const cats = categories.filter((c) => c.kind === kind);
  const shown = allCats ? cats : cats.slice(0, 6);
  const total = Number((valor || '0').replace(',', '.')) || 0;
  const date = dia === 'hoje' ? today : dia === 'ontem' ? yesterday : data;
  const catName = cats.find((c) => c.id === cat)?.name ?? '';

  function press(k: string) {
    setValor((v) => {
      if (k === '⌫') return v.slice(0, -1);
      if (k === ',') return v.includes(',') ? v : (v || '0') + ',';
      const [, dec] = v.split(',');
      if (dec !== undefined && dec.length >= 2) return v;
      if (v === '0') return k;
      return (v + k).slice(0, 10);
    });
  }

  return (
    <form action={action} className="qa">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="valor" value={valor} />
      <input type="hidden" name="categoria" value={cat} />
      <input type="hidden" name="conta" value={conta} />
      <input type="hidden" name="data" value={date} />
      <input type="hidden" name="parcelas" value={tipo === 'despesa' ? parcelas : 1} />
      <input type="hidden" name="espaco" value={espaco} />
      <input type="hidden" name="descricao" value={desc.trim() || catName || (tipo === 'receita' ? 'Entrada' : 'Gasto')} />

      <div className="qa-top">
        <a href={back} className="btn btn-icon" aria-label="Fechar" style={{ border: 'none' }}><IconBack /></a>
        <div className="seg qa-type" role="radiogroup" aria-label="Tipo">
          <input type="radio" id="qa-out" checked={tipo === 'despesa'} onChange={() => { setTipo('despesa'); setCat(''); }} />
          <label htmlFor="qa-out" className="out">Saiu</label>
          <input type="radio" id="qa-in" checked={tipo === 'receita'} onChange={() => { setTipo('receita'); setCat(''); setParcelas(1); }} />
          <label htmlFor="qa-in" className="in">Entrou</label>
        </div>
        <span style={{ width: 44 }} />
      </div>

      <div className="qa-amount" aria-live="polite">
        <span className="tiny muted">Quanto?</span>
        <span className={`qa-value ${valor ? '' : 'empty'}`}>R$ {valor || '0'}</span>
        {parcelas > 1 && total > 0 && <span className="tiny muted">{parcelas}x de {brl(Math.floor((total * 100) / parcelas) / 100)}</span>}
      </div>
      <label htmlFor="qa-desc" className="sr-only">Descrição</label>
      <input id="qa-desc" className="input qa-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={tipo === 'receita' ? 'De onde? (ex.: salário)' : 'O quê? (ex.: jantar)'} autoComplete="off" />

      <span className="qa-label">Categoria</span>
      <div className="qa-chips">
        {shown.map((c) => (
          <button key={c.id} type="button" className={`qa-chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(cat === c.id ? '' : c.id)} aria-pressed={cat === c.id}>
            <CatIcon name={c.name} size={24} />
            {c.name}
          </button>
        ))}
        {cats.length > 6 && (
          <button type="button" className="qa-chip" onClick={() => setAllCats(!allCats)}>{allCats ? 'Menos ▴' : 'Mais ▾'}</button>
        )}
      </div>

      {accounts.length > 0 && (
        <>
          <span className="qa-label">{tipo === 'receita' ? 'Entrou em' : 'Pagou com'}</span>
          <div className="qa-chips">
            {accounts.slice(0, 6).map((a) => (
              <button key={a.id} type="button" className={`qa-chip ${conta === a.id ? 'on' : ''}`} onClick={() => setConta(conta === a.id ? '' : a.id)} aria-pressed={conta === a.id}>{a.name}</button>
            ))}
          </div>
        </>
      )}

      <div className="qa-chips">
        <button type="button" className={`qa-chip ${dia === 'hoje' ? 'on' : ''}`} onClick={() => setDia('hoje')}>Hoje</button>
        <button type="button" className={`qa-chip ${dia === 'ontem' ? 'on' : ''}`} onClick={() => setDia('ontem')}>Ontem</button>
        <label className={`qa-chip ${dia === 'outro' ? 'on' : ''}`} style={{ position: 'relative' }}>
          {dia === 'outro' ? `${data.slice(8, 10)}/${data.slice(5, 7)}` : 'Outra data'}
          <input type="date" value={data} onChange={(e) => { setData(e.target.value || today); setDia('outro'); }} aria-label="Escolher data" style={{ position: 'absolute', inset: 0, opacity: 0 }} />
        </label>
        <button type="button" className={`qa-chip ${espaco === 'casal' ? 'on' : ''}`} onClick={() => setEspaco(espaco === 'casal' ? 'pessoal' : 'casal')}>
          {espaco === 'casal' ? 'Família' : myName}
        </button>
        {tipo === 'despesa' && (
          <label className={`qa-chip ${parcelas > 1 ? 'on' : ''}`} style={{ position: 'relative' }}>
            {parcelas > 1 ? `${parcelas}x` : 'Parcelar'}
            <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} aria-label="Parcelas" style={{ position: 'absolute', inset: 0, opacity: 0 }}>
              <option value={1}>À vista</option>
              {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}x</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="qa-keys">
        {KEYS.map((k) => (
          <button key={k} type="button" className="qa-key" onClick={() => press(k)} aria-label={k === '⌫' ? 'Apagar' : k}>{k}</button>
        ))}
      </div>

      {state?.error && <p className="error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-block qa-save" disabled={pending || !(total > 0)}>
        {pending ? 'Salvando…' : total > 0 ? `${tipo === 'receita' ? 'Lançar entrada de' : 'Lançar'} ${brl(total)}` : 'Digite o valor'}
      </button>
    </form>
  );
}
