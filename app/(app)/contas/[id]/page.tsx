import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/lib/context';
import { ensureSchema } from '@/lib/migrate';
import { brl, longDate } from '@/lib/format';
import EditBillForm from '@/components/EditBillForm';
import { unpayBillAction } from '../../actions';
import { IconBack, IconCheck } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  await ensureSchema();
  const { id } = await params;
  const [{ data: bill }, { data: categories }] = await Promise.all([
    ctx.supabase.from('bills').select('*').eq('id', id).maybeSingle(),
    ctx.supabase.from('categories').select('id, name, kind').order('name'),
  ]);
  if (!bill) notFound();
  return (
    <main className="page">
      <header className="row">
        <Link href="/contas" className="btn btn-icon" aria-label="Voltar para contas" style={{ border: 'none' }}><IconBack /></Link>
        <h1 className="page-title">Editar conta</h1>
      </header>
      {bill.status === 'paid' && (
        <div className="paid-banner" role="status">
          <IconCheck />
          <span className="grow">Paga{bill.paid_at ? ` em ${longDate(String(bill.paid_at).slice(0, 10))}` : ''} · {brl(bill.amount)}</span>
          <form action={unpayBillAction}>
            <input type="hidden" name="id" value={bill.id} />
            <input type="hidden" name="ficar" value="1" />
            <button className="unpay-btn">Não paguei</button>
          </form>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>“Não paguei” volta a conta para em aberto e apaga o gasto lançado no pagamento.</p>
      )}
      <EditBillForm bill={bill} categories={categories ?? []} myName={ctx.name.split(' ')[0]} casalId={ctx.casal.id} />
    </main>
  );
}
