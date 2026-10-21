import Link from 'next/link';
import { getContext, pickSpace } from '@/lib/context';
import { todaySP } from '@/lib/format';
import TransactionForm from '@/components/TransactionForm';
import { IconBack } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function LancarPage({ searchParams }: { searchParams: Promise<{ e?: string; tipo?: string }> }) {
  const ctx = await getContext();
  const { e, tipo } = await searchParams;
  const { key } = pickSpace(ctx, e);
  const [{ data: categories }, { data: accounts }] = await Promise.all([
    ctx.supabase.from('categories').select('id, name, kind').order('name'),
    ctx.supabase.from('accounts').select('id, name, space_id, type').eq('archived', false).order('name'),
  ]);

  return (
    <main className="page">
      <header className="row">
        <Link href="/" className="btn btn-icon" aria-label="Voltar ao painel" style={{ border: 'none' }}><IconBack /></Link>
        <h1 className="page-title">{tipo === 'receita' ? 'Nova entrada' : 'Novo gasto'}</h1>
      </header>
      <p className="small muted">Dica: é mais rápido pedir ao <Link href="/jarbas">Jarbas</Link>, como “gastei 85 no mercado”.</p>
      <TransactionForm
        categories={categories ?? []}
        accounts={accounts ?? []}
        defaultSpace={key}
        myName={ctx.name.split(' ')[0]}
        today={todaySP()}
        casalId={ctx.casal.id}
        pessoalId={ctx.pessoal.id}
        defaultTipo={tipo === 'receita' ? 'receita' : 'despesa'}
      />
    </main>
  );
}
