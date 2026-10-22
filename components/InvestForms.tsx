'use client';

import { useActionState, useState } from 'react';
import { createInvestmentAction, moveInvestmentAction } from '@/app/(app)/actions';

const KINDS: [string, string][] = [
  ['cdb', 'CDB / LCI / LCA'], ['tesouro', 'Tesouro Direto'], ['acoes', 'Ações'], ['fii', 'Fundos imobiliários'],
  ['fundo', 'Fundos'], ['previdencia', 'Previdência'], ['poupanca', 'Poupança'], ['cripto', 'Cripto'], ['outro', 'Outro'],
];
const PLACES = ['Ágora', 'Santander', 'Bradesco', 'Banco do Brasil', 'Caixa', 'Neon', 'XP', 'Nubank', 'Inter', 'BTG'];

export function KindSelect({ value }: { value?: string }) {
  return (
    <select className="input" name="tipo" defaultValue={value ?? 'cdb'}>
      {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function PlaceInput({ value }: { value?: string | null }) {
  return (
    <>
      <input className="input" name="instituicao" list="inv-places" defaultValue={value ?? ''} placeholder="Ágora, Santander…" />
      <datalist id="inv-places">{PLACES.map((p) => <option key={p} value={p} />)}</datalist>
    </>
  );
}

export function NewInvestmentForm({ owners }: { owners: string[] }) {
  const [state, action, pending] = useActionState(createInvestmentAction, { error: '' } as any);
  return (
    <form action={action} className="stack" style={{ marginTop: 14 }}>
      <label className="field"><span>Nome</span><input className="input" name="nome" placeholder="CDB 110% CDI, Tesouro Selic 2029…" required /></label>
      <div className="grid2">
        <label className="field"><span>Tipo</span><KindSelect /></label>
        <label className="field"><span>Onde está</span><PlaceInput /></label>
      </div>
      <div className="grid2">
        <label className="field"><span>Quanto aplicou (R$)</span><input className="input" name="aplicado" inputMode="decimal" placeholder="0,00" required /></label>
        <label className="field"><span>Vale hoje (R$)</span><input className="input" name="atual" inputMode="decimal" placeholder="igual ao aplicado" /></label>
      </div>
      <label className="field">
        <span>Titular</span>
        <select className="input" name="titular" defaultValue={owners[0] ?? ''}>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="Família">Família</option>
        </select>
      </label>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Salvando…' : 'Adicionar investimento'}</button>
    </form>
  );
}

export function MoveForm({ id, today }: { id: string; today: string }) {
  const [state, action, pending] = useActionState(moveInvestmentAction, { error: '' } as any);
  const [kind, setKind] = useState<'aporte' | 'resgate' | 'atualizacao'>('atualizacao');
  const label = kind === 'aporte' ? 'Quanto aplicou' : kind === 'resgate' ? 'Quanto resgatou' : 'Quanto vale hoje';
  return (
    <form action={action} className="stack">
      <input type="hidden" name="id" value={id} />
      <div className="seg" role="radiogroup" aria-label="O que aconteceu">
        <input type="radio" id={`k-at-${id}`} name="tipo" value="atualizacao" checked={kind === 'atualizacao'} onChange={() => setKind('atualizacao')} />
        <label htmlFor={`k-at-${id}`}>Atualizar</label>
        <input type="radio" id={`k-ap-${id}`} name="tipo" value="aporte" checked={kind === 'aporte'} onChange={() => setKind('aporte')} />
        <label htmlFor={`k-ap-${id}`}>Aporte</label>
        <input type="radio" id={`k-re-${id}`} name="tipo" value="resgate" checked={kind === 'resgate'} onChange={() => setKind('resgate')} />
        <label htmlFor={`k-re-${id}`}>Resgate</label>
      </div>
      <div className="grid2">
        <label className="field"><span>{label} (R$)</span><input className="input" name="valor" inputMode="decimal" placeholder="0,00" required /></label>
        <label className="field"><span>Data</span><input className="input" type="date" name="data" defaultValue={today} /></label>
      </div>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>
    </form>
  );
}
