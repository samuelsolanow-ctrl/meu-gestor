import { getContext, pickSpace } from '@/lib/context';
import { addDays, todaySP } from '@/lib/format';
import QuickAdd from '@/components/QuickAdd';

export const dynamic = 'force-dynamic';

export default async function LancarPage({ searchParams }: { searchParams: Promise<{ e?: string; tipo?: string }> }) {
  const ctx = await getContext();
  const { e, tipo } = await searchParams;
  const { key } = pickSpace(ctx, e);
  const today = todaySP();
  const [{ data: categories }, { data: accounts }, { data: recent }] = await Promise.all([
    ctx.supabase.from('categories').select('id, name, kind').order('name'),
    ctx.supabase.from('accounts').select('id, name, type, space_id').eq('archived', false).neq('type', 'investment').order('name'),
    ctx.supabase.from('transactions').select('category_id, account_id').gte('occurred_on', addDays(today, -120)).limit(1000),
  ]);
  // as mais usadas primeiro
  const useCat: Record<string, number> = {};
  const useAcc: Record<string, number> = {};
  for (const t of recent ?? []) {
    if (t.category_id) useCat[t.category_id] = (useCat[t.category_id] ?? 0) + 1;
    if (t.account_id) useAcc[t.account_id] = (useAcc[t.account_id] ?? 0) + 1;
  }
  const DEFAULT = ['Mercado', 'Restaurantes e delivery', 'Bebê', 'Transporte', 'Contas da casa', 'Saúde', 'Salário', 'Renda extra'];
  const rank = (c: any) => (useCat[c.id] ?? 0) * 100 + (DEFAULT.includes(c.name) ? 10 - DEFAULT.indexOf(c.name) : 0);
  const cats = [...(categories ?? [])].sort((a: any, b: any) => rank(b) - rank(a));
  const accs = [...(accounts ?? [])].sort((a: any, b: any) => (useAcc[b.id] ?? 0) - (useAcc[a.id] ?? 0));
  return (
    <main className="page" style={{ paddingBottom: 8 }}>
      <QuickAdd
        categories={cats as any}
        accounts={accs as any}
        myName={ctx.name.split(' ')[0]}
        today={today}
        yesterday={addDays(today, -1)}
        defaultSpace={key}
        defaultTipo={tipo === 'receita' ? 'receita' : 'despesa'}
        back={key === 'pessoal' ? '/?e=pessoal' : '/'}
      />
    </main>
  );
}
