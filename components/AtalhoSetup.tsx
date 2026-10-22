'use client';

import { useState } from 'react';

function Copy({ value, label }: { value: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="copy-row">
      <code className="copy-code">{value}</code>
      <button
        type="button"
        className="btn"
        style={{ minHeight: 36, padding: '0 12px', fontSize: 13, flex: 'none' }}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setOk(true);
            setTimeout(() => setOk(false), 1800);
          } catch {}
        }}
        aria-label={`Copiar ${label}`}
      >
        {ok ? 'Copiado ✓' : 'Copiar'}
      </button>
    </div>
  );
}

export default function AtalhoSetup({ siriUrl, smsUrl }: { siriUrl: string; smsUrl: string }) {
  return (
    <section className="card stack" aria-label="Siri e atalhos">
      <div className="card-head"><h2>Siri e lançamento automático</h2></div>
      <p className="small muted" style={{ margin: 0 }}>Fale com o Jarbas sem abrir o app, e deixe as compras do SMS do banco entrarem sozinhas. Os links abaixo são só seus: não compartilhe.</p>

      <details className="howto">
        <summary>1. “E aí Siri, Jarbas” (2 minutos)</summary>
        <ol>
          <li>Abra o app <b>Atalhos</b> no iPhone e toque em <b>+</b>. Dê o nome <b>Jarbas</b>.</li>
          <li>Adicione a ação <b>Ditar Texto</b> (idioma Português).</li>
          <li>Adicione <b>Obter Conteúdo do URL</b> e cole este link:</li>
        </ol>
        <Copy value={siriUrl} label="link da Siri" />
        <ol start={4}>
          <li>Na mesma ação toque em <b>Mostrar Mais</b>: Método <b>POST</b>, Corpo da Solicitação <b>JSON</b>, toque em <b>Adicionar novo campo › Texto</b>, chave <b>texto</b> e valor a variável <b>Texto Ditado</b>.</li>
          <li>Adicione <b>Falar Texto</b> com o <b>Conteúdo do URL</b>.</li>
          <li>Pronto: diga “E aí Siri, Jarbas” e fale normalmente, por exemplo “gastei 80 de gasolina”.</li>
        </ol>
        <p className="tiny muted">Dica: em Ajustes › Ação (iPhone 15/16) ou no toque duplo nas costas do iPhone você pode chamar o atalho Jarbas na hora.</p>
      </details>

      <details className="howto">
        <summary>2. Lançar sozinho pelo SMS do banco</summary>
        <ol>
          <li>No app <b>Atalhos</b>, vá em <b>Automação › +</b> e escolha <b>Mensagem</b>.</li>
          <li>Em <b>A Mensagem Contém</b>, escreva <b>compra</b> (crie outra igual com <b>Pix</b> se quiser).</li>
          <li>Marque <b>Executar Imediatamente</b> e toque em Seguinte.</li>
          <li>Adicione <b>Obter Conteúdo do URL</b> com este link:</li>
        </ol>
        <Copy value={smsUrl} label="link do SMS" />
        <ol start={5}>
          <li>Em <b>Mostrar Mais</b>: Método <b>POST</b>, Corpo da Solicitação <b>JSON</b>, campo <b>Texto</b> com chave <b>texto</b> e valor a variável <b>Entrada do Atalho</b> (o conteúdo da mensagem).</li>
          <li>Pronto: quando chegar o SMS de compra, o Jarbas lança e te avisa por notificação. Ele ignora códigos e propagandas e não duplica.</li>
        </ol>
        <p className="tiny muted">Funciona com bancos que mandam SMS. Avisos dentro do app do banco o iPhone não deixa ler; nesses casos ative o SMS de compras no app do banco.</p>
      </details>
    </section>
  );
}
