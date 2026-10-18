'use client';

import { useFormStatus } from 'react-dom';
import { IconCheck } from './icons';

// Marca como paga na hora do toque, sem esperar o servidor responder.
export default function PayButton({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="check" aria-label={`Marcar ${name} como paga`} disabled={pending}>
      {pending ? (
        <span style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center' }}>
          <IconCheck />
        </span>
      ) : (
        <span />
      )}
    </button>
  );
}
