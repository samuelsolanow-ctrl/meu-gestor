import crypto from 'node:crypto';

// Segredos derivados da chave secreta do Supabase (que a integração da Vercel
// já colocou nas variáveis). Assim nada precisa ser cadastrado à mão.
export function rootSecret(): string {
  const s = process.env.APP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_JWT_SECRET;
  if (!s) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY nas variáveis da Vercel');
  return s;
}

export function derive(label: string, bytes = 32): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', rootSecret(), 'meu-gestor', label, bytes));
}

const hex = (b: Buffer) => b.toString('hex');

/** Chave que o agendador do banco usa para chamar os lembretes */
export function cronKey(): string {
  return process.env.CRON_SECRET || hex(derive('cron', 24));
}

/** Assinatura do link do calendário de cada pessoa */
export function agendaSig(userId: string): string {
  return crypto.createHmac('sha256', derive('agenda')).update(userId).digest('hex').slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Endereço público do app (para o agendador e o link do calendário) */
export function appOrigin(host?: string | null): string {
  const h = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : host ? `https://${host}` : '');
  return h.replace(/\/$/, '');
}
