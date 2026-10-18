import Link from 'next/link';
import { getContext } from '@/lib/context';
import ChatClient from '@/components/ChatClient';
import { IconBack } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function JarbasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await getContext();
  const { q } = await searchParams;
  const { data } = await ctx.supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(40);

  return (
    <main>
      <header className="row" style={{ padding: 'calc(14px + env(safe-area-inset-top)) 16px 12px', borderBottom: '1px solid var(--surface-2)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 5 }}>
        <Link href="/" className="btn btn-icon" aria-label="Voltar ao painel" style={{ border: 'none' }}><IconBack /></Link>
        <div className="avatar">J</div>
        <div className="grow">
          <div style={{ fontWeight: 700 }}>Jarbas</div>
          <div className="tiny muted">Seu assessor · lança na Família, a menos que você diga que é pessoal</div>
        </div>
      </header>
      <ChatClient initial={(data ?? []).reverse()} firstName={ctx.name.split(' ')[0]} initialQuery={q?.slice(0, 2000)} />
    </main>
  );
}
