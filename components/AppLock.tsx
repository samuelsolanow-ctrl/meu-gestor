'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getLock, verifyFaceId } from '@/lib/faceid';
import { IconLogo } from './icons';

const RELOCK_AFTER_MS = 15 * 60_000; // só pede de novo depois de 15 min sem usar
const LAST_KEY = 'mg-unlocked-at';

const recentlyUnlocked = () => {
  try {
    return Date.now() - Number(localStorage.getItem(LAST_KEY) || 0) < RELOCK_AFTER_MS;
  } catch {
    return false;
  }
};
const markActive = () => {
  try {
    localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {}
};

export default function AppLock({ children, initialLocked }: { children: React.ReactNode; initialLocked: boolean }) {
  // Sem trava: o app aparece direto. Com trava: já abre na tela do Face ID.
  const [state, setState] = useState<'locked' | 'open'>(initialLocked ? 'locked' : 'open');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  // auto = tentativa ao abrir (o iPhone pode exigir um toque; aí não mostramos erro)
  const unlock = useCallback(async (auto = false) => {
    const lock = getLock();
    if (!lock) return setState('open');
    setBusy(true);
    setFailed(false);
    const ok = await verifyFaceId(lock.credId);
    setBusy(false);
    if (ok) {
      markActive();
      setState('open');
    } else if (!auto) setFailed(true);
  }, []);

  useEffect(() => {
    if (getLock() && !recentlyUnlocked()) {
      setState('locked');
      unlock(true);
    } else {
      setState('open');
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        markActive(); // conta a partir da última vez que você usou
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS && getLock()) {
        setState('locked');
        unlock(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlock]);

  async function signInWithPassword() {
    await createClient().auth.signOut();
    window.location.href = '/entrar';
  }

  return (
    <>
      {children}
      {state !== 'open' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="App bloqueado"
          style={{
            position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 32,
          }}
        >
          {(
            <>
              <span className="brand-mark" style={{ width: 72, height: 72, borderRadius: 20 }}><IconLogo size={40} /></span>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 34 }}>Meu Gestor</div>
                <div className="small muted">{failed ? 'Não reconheci. Tente de novo.' : 'Bloqueado com Face ID'}</div>
              </div>
              <button className="btn btn-primary btn-block" style={{ maxWidth: 320 }} onClick={() => unlock(false)} disabled={busy}>
                {busy ? 'Aguardando Face ID…' : 'Desbloquear com Face ID'}
              </button>
              <button className="btn" style={{ border: 'none', color: 'var(--muted)' }} onClick={signInWithPassword}>
                Entrar com senha
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
