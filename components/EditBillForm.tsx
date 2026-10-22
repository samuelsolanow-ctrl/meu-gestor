'use client';

import { useActionState } from 'react';
import { deleteBillAction, updateBillAction } from '@/app/(app)/actions';

type Option = { id: string; name: string; kind?: string };

export const REMIND_OPTIONS = [
  { v: 0, label: 'Só no dia' },
  { v: 1, label: '1 dia antes' },
  { v: 2, label: '2 dias antes' },
  { v: 3, label: '3 dias antes' },
  { v: 5, label: '5 dias antes' },
  { v: 7, label: '1 semana antes' },
];

export default function EditBillForm({ bill, categories, myName, casalId }: { bill: any; categories: Option[]; myName: string; casalId: string }) {
  const [state, action, pending] = useActionState(updateBillAction, { error: '' } as any);
  return (
    <>
      <form action={action} className="card stack">
        <input type="hidden" name="id" value={bill.id} />
        <label className="field">
          <span>Nome</span>
          <input className="input" name="nome" defaultValue={bill.name} required />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Valor (R$)</span>
            <input className="input" name="valor" inputMode="decimal" defaultValue={Number(bill.amount).toFixed(2).replace('.', ',')} required />
          </label>
          <label className="field">
            <span>Vencimento</span>
            <input className="input" type="date" name="vencimento" defaultValue={bill.due_date} required />
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            <span>Repete</span>
            <select className="input" name="recorrencia" defaultValue={bill.recurrence ?? 'none'}>
              <option value="none">Só uma vez</option>
              <option value="monthly">Todo mês</option>
              <option value="yearly">Todo ano</option>
            </select>
          </label>
          <label className="field">
            <span>Avisar</span>
            <select className="input" name="aviso" defaultValue={String(bill.remind_days ?? 2)}>
              {REMIND_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            <span>Categoria</span>
            <select className="input" name="categoria" defaultValue={bill.category_id ?? ''}>
              <option value="">Sem categoria</option>
              {categories.filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>De quem é</span>
            <select className="input" name="espaco" defaultValue={bill.space_id === casalId ? 'casal' : 'pessoal'}>
              <option value="pessoal">{myName}</option>
              <option value="casal">Família</option>
            </select>
          </label>
        </div>
        {state?.error && <p className="error" role="alert">{state.error}</p>}
        <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Salvando…' : 'Salvar alterações'}</button>
      </form>
      <form action={deleteBillAction}>
        <input type="hidden" name="id" value={bill.id} />
        <button className="btn btn-block" style={{ color: 'var(--late)' }}>Excluir conta</button>
      </form>
    </>
  );
}
