'use client';

import { useState } from 'react';

export default function CalendarConnect({ webcal, https }: { webcal: string; https: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(https);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }
  return (
    <section className="card stack" aria-label="Calendário do iPhone">
      <div className="card-head"><h2>Calendário do iPhone</h2></div>
      <p className="small muted">
        Tudo que o Jarbas agendar aparece no app Calendário, com alarme. Toque abaixo e confirme em “Assinar”. Isso só precisa ser feito uma vez.
      </p>
      <a className="btn btn-primary btn-block" href={webcal}>Conectar ao Calendário</a>
      <button type="button" className="btn btn-block" onClick={copy}>{copied ? 'Link copiado' : 'Copiar link (outros calendários)'}</button>
      <p className="tiny muted">Se o botão não abrir: Ajustes › Calendário › Contas › Adicionar Conta › Outra › Adicionar Calendário Assinado, e cole o link.</p>
    </section>
  );
}
