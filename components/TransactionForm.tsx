'use client';

import { useActionState, useState } from 'react';
import { createTransactionAction } from '@/app/(app)/actions';
import { brl, parseMoney } from '@/lib/format';

type Option = { id: string; name: string; kind?: string; space_id?: string; type?: string };

export default function TransactionForm({
  categories,
  accounts,
  defaultSpace,
  myName,
  today,
  casalId,
  pessoalId,
  defaultTipo = 'despesa',
  defaultAccount = '',
  backTo,
}: {
  categories: Option[];
  accounts: Option[];
  defaultSpace: 'casal' | 'pessoal';
  myName: string;
  today: string;
  casalId: string;
  pessoalId: string;
  defaultTipo?: 'despesa' | 'receita';
  defaultAccount?: string;
  backTo?: 'cartoes';
}) {
  const [state, action, pending] = useActionState(createTransactionAction, { error: '' } as any);
  const [tipo, setTipo] = useState<'despesa' | 'receita'>(defaultTipo);
  const [espaco, setEspaco] = useState(defaultSpace);
  const cats = categories.filter((c) => c.kind === (tipo === 'receita' ? 'income' : 'expense'));
  const spaceId = espaco === 'pessoal' ? pessoalId : casalId;
  const accs = accounts.filter((a) => a.space_id === spaceId || a.id === defaultAccount);
  const [valor, setValor] = useState('');
  const [parcelas, setParcelas] = useState(1);
  const [conta, setConta] = useState(defaultAccount);
  const total = parseMoney(valor);
  const isCard = accounts.find((a) => a.id === conta)?.type === 'credit_card';

  return (
    <form action={action} className="stack">
      <div className="seg" role="radiogroup" aria-label="Tipo">
        <input type="radio" id="t-desp" name="tipo" value="despesa" checked={tipo === 'despesa'} onChange={() => setTipo('despesa')} />
        <label htmlFor="t-desp">Despesa</label>
        <input type="radio" id="t-rec" name="tipo" value="receita" checked={tipo === 'receita'} onChange={() => setTipo('receita')} />
        <label htmlFor="t-rec">Receita</label>
      </div>

      <label className="field">
        <span>{parcelas > 1 ? 'Valor total da compra (R$)' : 'Valor (R$)'}</span>
        <input className="input money-input" name="valor" inputMode="decimal" placeholder="0,00" required autoFocus value={valor} onChange={(e) => setValor(e.target.value)} />
      </label>

      {tipo === 'despesa' && (
        <label className="field">
          <span>Parcelas</span>
          <select className="input" name="parcelas" value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
            <option value={1}>À vista</option>
            {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>{n}x{total > 0 ? ` de ${brl(Math.floor((total * 100) / n) / 100)}` : ''}</option>
            ))}
          </select>
          {parcelas > 1 && (
            <span className="tiny muted" style={{ fontWeight: 400 }}>
              Entra uma parcela por mês{isCard ? ', cada uma na fatura certa do cartão' : ''}. No mês conta só a parcela, não o total.
            </span>
          )}
        </label>
      )}
      {backTo && <input type="hidden" name="voltar" value={backTo} />}

      <label className="field">
        <span>Descrição</span>
        <input className="input" name="descricao" placeholder={tipo === 'receita' ? 'Salário de outubro' : 'Mercado'} required />
      </label>

      <label className="field">
        <span>Categoria</span>
        <select className="input" name="categoria" defaultValue="">
          <option value="">Sem categoria</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>De quem é</span>
        <div className="seg" role="radiogroup" aria-label="Espaço">
          <input type="radio" id="e-pess" name="espaco" value="pessoal" checked={espaco === 'pessoal'} onChange={() => setEspaco('pessoal')} />
          <label htmlFor="e-pess">{myName}</label>
          <input type="radio" id="e-casal" name="espaco" value="casal" checked={espaco === 'casal'} onChange={() => setEspaco('casal')} />
          <label htmlFor="e-casal">Família</label>
        </div>
      </div>

      <div className="grid2">
        <label className="field">
          <span>Data</span>
          <input className="input" type="date" name="data" defaultValue={today} required />
        </label>
        <label className="field">
          <span>Conta ou cartão</span>
          <select className="input" name="conta" value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">Não informar</option>
            {accs.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      </div>

      {state?.error && <p className="error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-block" disabled={pending}>
        {pending ? 'Salvando…' : tipo === 'receita' ? 'Lançar receita' : 'Lançar despesa'}
      </button>
    </form>
  );
}
