import crypto from 'node:crypto';
import { createClient as createSupabase } from '@supabase/supabase-js';

// Chave secreta do Supabase (posta pela integração da Vercel). Só no servidor.
function serviceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
}

/** Cliente com acesso total: usado só pelas rotinas automáticas do servidor. */
export function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceKey();
  if (!url || !key) throw new Error('Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY na Vercel');
  return createSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Chaves das notificações (VAPID). São derivadas de um segredo que já existe
 * na Vercel, então não é preciso cadastrar nada. Se quiser chaves próprias,
 * defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.
 */
let cached: { publicKey: string; privateKey: string } | null = null;
export function vapidKeys() {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }
  const seed = process.env.VAPID_SEED || serviceKey();
  if (!seed) throw new Error('Sem segredo para as chaves de notificação');
  const ecdh = crypto.createECDH('prime256v1');
  for (let i = 0; i < 8; i++) {
    const priv = Buffer.from(crypto.hkdfSync('sha256', seed, 'meu-gestor', `vapid-${i}`, 32));
    try {
      ecdh.setPrivateKey(priv);
      cached = { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(priv) };
      return cached;
    } catch {
      // valor fora da curva (muito raro): tenta o próximo
    }
  }
  throw new Error('Não foi possível gerar as chaves de notificação');
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/** Envia para todos os aparelhos da pessoa; apaga inscrições que expiraram. */
export async function pushToUser(db: any, userId: string, payload: PushPayload): Promise<number> {
  const webpush = (await import('web-push')).default as any;
  const { publicKey, privateKey } = vapidKeys();
  webpush.setVapidDetails('mailto:contato@meugestor.app', publicKey, privateKey);

  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, keys').eq('user_id', userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 60 * 60 * 6 });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await db.from('push_subscriptions').delete().eq('id', s.id);
      } else {
        console.error('push error', e?.statusCode, e?.body);
      }
    }
  }
  return sent;
}
