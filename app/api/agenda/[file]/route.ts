import { serviceClient } from '@/lib/push';
import { agendaSig, safeEqual } from '@/lib/secrets';
import { buildIcs } from '@/lib/agenda';
import { ensureSchema } from '@/lib/migrate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Calendário assinado pelo app Calendário do iPhone: /api/agenda/<usuario>.<assinatura>.ics
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^([0-9a-f-]{36})\.([0-9a-f]{32})\.ics$/.exec(file);
  if (!m || !safeEqual(m[2], agendaSig(m[1]))) return new Response('Não encontrado', { status: 404 });
  const userId = m[1];

  await ensureSchema();
  const db = serviceClient();
  const { data: profile } = await db.from('profiles').select('family_id, display_name').eq('id', userId).maybeSingle();
  if (!profile?.family_id) return new Response('Não encontrado', { status: 404 });

  const { data: spaces } = await db.from('spaces').select('id, kind, owner_id').eq('family_id', profile.family_id);
  const ids = (spaces ?? []).filter((s: any) => s.kind === 'shared' || s.owner_id === userId).map((s: any) => s.id);

  const from = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data: events } = await db
    .from('events')
    .select('id, kind, title, notes, starts_at, ends_at, remind_at, created_at')
    .in('space_id', ids)
    .gte('starts_at', from)
    .order('starts_at')
    .limit(1000);

  return new Response(buildIcs(events ?? [], 'Meu Gestor · Jarbas'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'inline; filename="meu-gestor.ics"',
    },
  });
}
