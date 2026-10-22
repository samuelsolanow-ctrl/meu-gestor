import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/lib/context';
import EditTxForm from '@/components/EditTxForm';
import { IconBack } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function LancamentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ voltar?: string }> }) {
  const ctx = await getContext();
  const { id } = await params;
  const { voltar } = await searchParams;
  const back = voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/';
  const { data: tx } = await ctx.supabase.from('transactions').select('*').eq('id', id).maybeSingle();
  if (!tx) notFound();
  let total = Number(tx.amount);
  let parts = 1;
  if (tx.installment_group) {
    const { data: all } = await ctx.supabase.from('transactions').select('amount, occurred_on, installment_no').eq('installment_group', tx.installment_group).order('installment_no');
    parts = all?.length ?? 1;
    total = (all ?? []).reduce((s: number, x: any) => s + Number(x.amount), 0);
    tx.first_date = all?.[0]?.occurred_on;
  }
  const [{ data: categories }, { data: accounts }] = await Promise.all([
    ctx.supabase.from('categories').select('id, name, kind').order('name'),
    ctx.supabase.from('accounts').select('id, name, space_id').eq('archived', false).order('name'),
  ]);
  return (
    <main className="page">
      <header className="row">
        <Link href={back} className="btn btn-icon" aria-label="Voltar" style={{ border: 'none' }}><IconBack /></Link>
        <h1 className="page-title">Editar {tx.kind === 'income' ? 'entrada' : 'gasto'}</h1>
      </header>
      {parts > 1 && <p className="small muted" style={{ margin: 0 }}>Compra em {parts}x. As mudanças valem para todas as parcelas.</p>}
      <EditTxForm tx={tx} total={Math.round(total * 100) / 100} parts={parts} categories={categories ?? []} accounts={accounts ?? []} myName={ctx.name.split(' ')[0]} casalId={ctx.casal.id} back={back} />
    </main>
  );
}
