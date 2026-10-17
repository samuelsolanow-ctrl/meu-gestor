import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Space = { id: string; kind: 'personal' | 'shared'; name: string; owner_id: string | null };

export type AppContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  name: string;
  familyId: string;
  casal: Space;
  pessoal: Space;
};

/** Carrega quem está logado, a família e os dois espaços (Casal e pessoal). */
export async function getContext(): Promise<AppContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/entrar');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, family_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.family_id) redirect('/bem-vindo');

  const { data: spaces } = await supabase.from('spaces').select('id, kind, name, owner_id');
  const casal = (spaces ?? []).find((s: Space) => s.kind === 'shared');
  const pessoal = (spaces ?? []).find((s: Space) => s.kind === 'personal' && s.owner_id === user.id);
  if (!casal || !pessoal) redirect('/bem-vindo');

  return {
    supabase,
    userId: user.id,
    name: profile.display_name,
    familyId: profile.family_id,
    casal,
    pessoal,
  };
}

/** "pessoal" na URL abre o espaço pessoal; qualquer outra coisa abre o Casal. */
export function pickSpace(ctx: AppContext, e?: string | string[]): { space: Space; key: 'casal' | 'pessoal' } {
  return e === 'pessoal' ? { space: ctx.pessoal, key: 'pessoal' } : { space: ctx.casal, key: 'casal' };
}
