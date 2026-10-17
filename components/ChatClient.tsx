'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconCheck, IconSend } from './icons';

type Action = { kind: string; title: string; sub: string; amount?: number; income?: boolean };
type Msg = { id: string; role: 'user' | 'assistant' | 'action'; content: string; action?: Action };

const brl = (n?: number) => (n == null ? '' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n));

const SUGGESTIONS = ['Resumo do mês', 'Contas desta semana', 'Quanto gastamos com mercado?', 'Gastei 50 na farmácia'];

export default function ChatClient({ initial, firstName }: { initial: { id: string; role: 'user' | 'assistant'; content: string }[]; firstName: string }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, busy]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
    setText('');
    setBusy(true);
    setMsgs((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: message }]);
    try {
      const res = await fetch('/api/jarbas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => ({}));
      const actionMsgs: Msg[] = (data.actions ?? []).map((a: Action, i: number) => ({ id: `a${Date.now()}${i}`, role: 'action', content: '', action: a }));
      const reply = data.reply ?? data.error ?? 'Não consegui responder agora.';
      setMsgs((m) => [...m, ...actionMsgs, { id: `b${Date.now()}`, role: 'assistant', content: reply }]);
      if (actionMsgs.length) router.refresh();
    } catch {
      setMsgs((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', content: 'Sem conexão. Tente de novo.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="chat" style={{ paddingBottom: 150 }}>
        {msgs.length === 0 && (
          <div className="bubble bot">
            Oi, {firstName}! Eu sou o Jarbas. Me conte seus gastos do jeito que falaria com alguém, por exemplo “gastei 85 no mercado no cartão”, e eu lanço tudo. Também cadastro contas a pagar e respondo como estão as finanças.
          </div>
        )}
        {msgs.map((m) =>
          m.role === 'action' && m.action ? (
            <div className="action-card" key={m.id}>
              <div className={`item-icon ${m.action.income ? 'income' : ''}`} style={{ width: 36, height: 36, borderRadius: 10 }}>
                {m.action.kind === 'paid' || m.action.kind === 'goal' ? <IconCheck /> : m.action.title.charAt(0)}
              </div>
              <div className="grow">
                <div className="item-title">{m.action.title}</div>
                <div className="item-sub">{m.action.sub}</div>
              </div>
              {m.action.amount != null && (
                <span className={`amount ${m.action.income ? 'income' : ''}`} style={{ fontSize: 15, fontWeight: 700 }}>
                  {m.action.kind === 'deleted' ? <s>{brl(m.action.amount)}</s> : brl(m.action.amount)}
                </span>
              )}
            </div>
          ) : (
            <div key={m.id} className={`bubble ${m.role === 'user' ? 'user' : 'bot'}`}>{m.content}</div>
          ),
        )}
        {busy && <div className="typing" role="status">Jarbas está pensando…</div>}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <div className="composer-inner">
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>
            ))}
          </div>
          <form
            className="row"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <label htmlFor="msg" className="sr-only">Mensagem para o Jarbas</label>
            <input
              id="msg"
              className="input"
              style={{ borderRadius: 22, height: 44 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Fale com o Jarbas…"
              autoComplete="off"
              enterKeyHint="send"
            />
            <button className="btn btn-primary btn-icon" aria-label="Enviar" disabled={busy || !text.trim()}>
              <IconSend />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
