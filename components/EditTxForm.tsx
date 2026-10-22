'use client';

import { useActionState } from 'react';
import { deleteTransactionAction, updateTransactionAction } from '@/app/(app)/actions';

type Option = { id: string; name: string; kind?: string; space_id?: string };

export default function EditTxForm({
  tx,
  total,
  parts,
  categories,
  accounts,
  myName,
  casalId,
  back,
}: {
  tx: any;
  total: number;
  parts: number;
  categories: Option[];
  accounts: Option[];
  myName: string;
  casalId: string;
  back: string;
}) {
  const [state, action, pending] = useActionState(updateTransactionAction, { error: '' } as any);
  const cats = categories.filter((c) => c.kind === tx.kind);
  return (
    <>
      <form action={action} className="card stack">
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="voltar" value={back} />
        <label className="field">
          <span>{parts > 1 ? `Valor total (${parts}x)` : 'Valor (R$)'}</span>
          <input className="input money-input" name="valor" inputMode="decimal" defaultValue={total.toFixed(2).replace('.', ',')} required />
        </label>
        <label className="field">
          <span>Descrição</span>
          <input className="input" name="descricao" defaultValue={tx.description} required />
        </label>
        <label className="field">
          <span>Categoria</span>
          <select className="input" name="categoria" defaultValue={tx.category_id ?? ''}>
            <option value="">Sem categoria</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="grid2">
          <label className="field">
            <span>{parts > 1 ? 'Data da 1ª parcela' : 'Data'}</span>
            <input className="input" type="date" name="data" defaultValue={tx.first_date ?? tx.occurred_on} required />
          </label>
          <label className="field">
            <span>De quem é</span>
            <select className="input" name="espaco" defaultValue={tx.space_id === casalId ? 'casal' : 'pessoal'}>
              <option value="pessoal">{myName}</option>
              <option value="casal">Família</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Conta ou cartão</span>
          <select className="input" name="conta" defaultValue={tx.account_id ?? ''}>
            <option value="">Não informar</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {state?.error && <p className="error" role="alert">{state.error}</p>}
        <button className="btn btn-primary btn-block" disabled={pending}>{pending ? 'Salvando…' : 'Salvar alterações'}</button>
      </form>
      <form action={deleteTransactionAction}>
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="voltar" value={back} />
        <button className="btn btn-block" style={{ color: 'var(--late)' }}>{parts > 1 ? `Apagar as ${parts} parcelas` : 'Apagar lançamento'}</button>
      </form>
    </>
  );
}
