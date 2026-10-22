'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createBillAction } from '@/app/(app)/actions';
import { REMIND_OPTIONS } from './EditBillForm';

type Option = { id: string; name: string; kind?: string };

export default function BillForm({
  categories,
  defaultSpace,
  myName,
  today,
}: {
  categories: Option[];
  defaultSpace: 'casal' | 'pessoal';
  myName: string;
  today: string;
}) {
  const [state, action, pending] = useActionState(createBillAction, { error: '' } as any);
  const formRef = useRef<HTMLFormElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      if (detailsRef.current) detailsRef.current.open = false;
    }
  }, [state]);

  return (
    <details className="card" ref={detailsRef}>
      <summary>
        Nova conta a pagar
        <span className="btn btn-primary" style={{ minHeight: 36, padding: '0 14px' }} aria-hidden="true">+</span>
      </summary>
      <form action={action} ref={formRef} className="stack">
        <label className="field">
          <span>Nome</span>
          <input className="input" name="nome" placeholder="Energia, escola, aluguel…" required />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Valor (R$)</span>
            <input className="input" name="valor" inputMode="decimal" placeholder="0,00" required />
          </label>
          <label className="field">
            <span>Vencimento</span>
            <input className="input" type="date" name="vencimento" defaultValue={today} required />
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            <span>Repete</span>
            <select className="input" name="recorrencia" defaultValue="monthly">
              <option value="none">Só uma vez</option>
              <option value="monthly">Todo mês</option>
              <option value="yearly">Todo ano</option>
            </select>
          </label>
          <label className="field">
            <span>Avisar</span>
            <select className="input" name="aviso" defaultValue="2">
              {REMIND_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            <span>De quem é</span>
            <select className="input" name="espaco" defaultValue={defaultSpace}>
              <option value="pessoal">{myName}</option>
              <option value="casal">Família</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Categoria</span>
          <select className="input" name="categoria" defaultValue="">
            <option value="">Sem categoria</option>
            {categories.filter((c) => c.kind === 'expense').map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        {state?.error && <p className="error" role="alert">{state.error}</p>}
        <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Salvando…' : 'Salvar conta'}</button>
      </form>
    </details>
  );
}
