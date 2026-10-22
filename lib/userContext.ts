import { createClient as createSupabase } from '@supabase/supabase-js';
import { serviceClient } from '@/lib/push';
import type { AppContext, Space } from '@/lib/context';

// Para a Siri e o SMS: abre uma sessão de verdade em nome da pessoa (sem senha),
// assim as regras de privacidade do banco continuam valendo como no app.
const sessions = new Map<string, { client: any; until: number }>();

async function userClient(userId: string) {
  const hit = sessions.get(userId);
  if (hit && hit.until > Date.now()) return hit.client;
  const admin = serviceClient();
  const { data: u, error } = await admin.auth.admin.getUserById(userId);
  if (error || !u?.user?.email) throw new Error('Pessoa não encontrada');
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
  if (linkErr || !link?.properties?.hashed_token) throw new Error('Não consegui abrir a sessão');
  const client = createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: sess, error: otpErr } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (otpErr || !sess?.session) throw new Error('Não consegui abrir a sessão');
  const ttl = Math.max(60, (sess.session.expires_in ?? 3600) - 300) * 1000;
  sessions.set(userId, { client, until: Date.now() + ttl });
  return client;
}

export async function contextForUser(userId: string): Promise<AppContext> {
  const supabase = await userClient(userId);
  const [{ data: profile }, { data: spaces }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, family_id').eq('id', userId).maybeSingle(),
    supabase.from('spaces').select('id, kind, name, owner_id'),
  ]);
  const casal = (spaces ?? []).find((s: Space) => s.kind === 'shared');
  const pessoal = (spaces ?? []).find((s: Space) => s.kind === 'personal' && s.owner_id === userId);
  if (!profile?.family_id || !casal || !pessoal) throw new Error('Família não configurada');
  return { supabase, userId, name: profile.display_name, familyId: profile.family_id, casal, pessoal };
}
