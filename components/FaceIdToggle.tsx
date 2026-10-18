'use client';

import { useEffect, useState } from 'react';
import { disableFaceId, enableFaceId, faceIdAvailable, getLock } from '@/lib/faceid';

export default function FaceIdToggle({ userName }: { userName: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setOn(!!getLock());
    faceIdAvailable().then(setAvailable);
  }, []);

  async function toggle() {
    setMsg('');
    if (on) {
      disableFaceId();
      setOn(false);
      setMsg('Face ID desligado neste aparelho.');
      return;
    }
    setBusy(true);
    try {
      await enableFaceId(userName);
      setOn(true);
      setMsg('Pronto! O app vai pedir Face ID ao abrir.');
    } catch {
      setMsg('Não foi possível ativar. Confira se o Face ID está ligado no iPhone e tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-label="Face ID">
      <div className="card-head"><h2>Face ID</h2></div>
      {available === false ? (
        <p className="small muted">Este aparelho ou navegador não oferece Face ID. Abra pelo ícone do Meu Gestor na tela de início do iPhone.</p>
      ) : (
        <>
          <p className="small muted">
            {on
              ? 'Ligado: o app pede seu rosto ao abrir e quando você volta depois de 1 minuto.'
              : 'Seu login já fica salvo. Ative para o app pedir Face ID antes de mostrar suas finanças.'}
          </p>
          <button className={`btn btn-block ${on ? '' : 'btn-primary'}`} onClick={toggle} disabled={busy || available === null}>
            {busy ? 'Aguardando Face ID…' : on ? 'Desligar Face ID' : 'Ativar Face ID'}
          </button>
        </>
      )}
      {msg && <p className="small" role="status">{msg}</p>}
    </section>
  );
}
