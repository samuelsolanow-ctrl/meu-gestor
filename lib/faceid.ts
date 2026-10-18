'use client';

// Trava do app com Face ID (WebAuthn com o autenticador do próprio iPhone).
// A sessão continua salva; isto só exige o rosto para abrir o app.

const KEY = 'mg-faceid';

const toB64 = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function getLock(): { credId: string } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function faceIdAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export async function enableFaceId(userName: string): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Meu Gestor', id: location.hostname },
      user: { id: random(16), name: userName, displayName: userName },
      challenge: random(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Face ID cancelado');
  try {
    localStorage.setItem(KEY, JSON.stringify({ credId: toB64(cred.rawId) }));
    document.cookie = 'mg-lock=1; path=/; max-age=31536000; samesite=lax; secure';
  } catch {
    throw new Error('Não foi possível salvar neste aparelho');
  }
}

export function disableFaceId() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  document.cookie = 'mg-lock=; path=/; max-age=0';
}

export async function verifyFaceId(credId: string): Promise<boolean> {
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromB64(credId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!res;
  } catch {
    return false;
  }
}
