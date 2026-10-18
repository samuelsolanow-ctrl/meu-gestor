'use client';

import { useEffect, useState } from 'react';

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);

async function subscribe() {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { publicKey } = await fetch('/api/push').then((r) => r.json());
  if (!publicKey) throw new Error('sem chave');
  let sub = await reg.pushManager.getSubscription();
  // Se a chave mudou, refaz a inscrição
  if (sub) {
    const current = sub.options?.applicationServerKey;
    const same = current && btoa(String.fromCharCode(...new Uint8Array(current as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === publicKey;
    if (!same) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) });
  const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
  if (!res.ok) throw new Error('falhou ao salvar');
}

export default function NotificationsToggle() {
  const [state, setState] = useState<'loading' | 'unsupported' | 'install' | 'off' | 'on' | 'denied'>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      if (!supported()) return setState(standalone() ? 'unsupported' : 'install');
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') {
        setState('on');
        subscribe().catch(() => {}); // mantém a inscrição em dia
      } else setState('off');
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      await subscribe();
      setState('on');
      setMsg('Pronto! O Jarbas vai te avisar das contas às 8h e perguntar dos gastos às 21h.');
    } catch {
      setMsg('Não consegui ativar agora. Tente de novo em instantes.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState('off');
      setMsg('Notificações desligadas neste aparelho.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-label="Notificações do Jarbas">
      <div className="card-head"><h2>Avisos do Jarbas</h2></div>
      {state === 'install' && (
        <p className="small muted">Para receber avisos, abra o Meu Gestor pelo ícone da tela de início do iPhone (Compartilhar › Adicionar à Tela de Início).</p>
      )}
      {state === 'unsupported' && <p className="small muted">Este aparelho não aceita notificações. No iPhone, é preciso iOS 16.4 ou mais novo.</p>}
      {state === 'denied' && (
        <p className="small muted">As notificações estão bloqueadas. Libere em Ajustes do iPhone › Notificações › Meu Gestor.</p>
      )}
      {(state === 'off' || state === 'on') && (
        <>
          <p className="small muted">
            {state === 'on'
              ? 'Ligado: às 8h ele avisa das contas que vencem, às 21h pergunta se teve algum gasto, e no domingo manda o resumo da semana.'
              : 'Deixe o Jarbas puxar conversa: aviso de contas às 8h, pergunta dos gastos às 21h e resumo da semana no domingo.'}
          </p>
          <button className={`btn btn-block ${state === 'on' ? '' : 'btn-primary'}`} onClick={state === 'on' ? disable : enable} disabled={busy}>
            {busy ? 'Aguarde…' : state === 'on' ? 'Desligar avisos' : 'Ativar avisos'}
          </button>
        </>
      )}
      {msg && <p className="small" role="status">{msg}</p>}
    </section>
  );
}
