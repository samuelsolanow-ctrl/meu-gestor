'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { quickDeleteAction } from '@/app/(app)/actions';

/** "Lançado · Desfazer" por alguns segundos depois de salvar */
export default function UndoToast({ id, back }: { id?: string; back: string }) {
  const router = useRouter();
  const [show, setShow] = useState(!!id);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!id) return;
    setShow(true);
    const clean = back.replace(/([?&])desfazer=[^&]*&?/, '$1').replace(/[?&]$/, '');
    window.history.replaceState(null, '', clean);
    const t = setTimeout(() => setShow(false), 7000);
    return () => clearTimeout(t);
  }, [id, back]);
  if (!id || !show) return null;
  return (
    <div className="toast" role="status">
      <span>Lançado ✓</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await quickDeleteAction(id);
            setShow(false);
            router.refresh();
          })
        }
      >
        {pending ? 'Desfazendo…' : 'Desfazer'}
      </button>
    </div>
  );
}
