import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { vapidKeys } from '@/lib/push';

export const runtime = 'nodejs';

// GET: chave pública para o iPhone se inscrever
export async function GET() {
  try {
    return NextResponse.json({ publicKey: vapidKeys().publicKey });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: salva a inscrição deste aparelho · DELETE: remove
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login novamente.' }, { status: 401 });

  const sub = await req.json().catch(() => null);
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'Inscrição inválida' }, { status: 400 });
  }

  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  const { error } = await supabase.from('push_subscriptions').insert({ user_id: user.id, endpoint: sub.endpoint, keys: sub.keys });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { endpoint } = await req.json().catch(() => ({}));
  if (endpoint) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
