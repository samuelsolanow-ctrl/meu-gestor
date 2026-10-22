import Link from 'next/link';
import { getContext, pickSpace } from '@/lib/context';
import { forecast } from '@/lib/forecast';
import ForecastView from '@/components/ForecastView';
import { IconBack } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function PrevisaoPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const ctx = await getContext();
  const { e } = await searchParams;
  const { space, key } = pickSpace(ctx, e);
  const f = await forecast(ctx.supabase, space.id);
  const firstName = ctx.name.split(' ')[0];
  return (
    <main className="page">
      <header className="row">
        <Link href={key === 'pessoal' ? '/?e=pessoal' : '/'} className="btn btn-icon" aria-label="Voltar ao início" style={{ border: 'none' }}><IconBack /></Link>
        <h1 className="page-title">Próximos 6 meses</h1>
      </header>
      <nav className="seg" aria-label="Espaço">
        <Link href="/previsao?e=pessoal" className={key === 'pessoal' ? 'on' : ''}>{firstName}</Link>
        <Link href="/previsao" className={key === 'casal' ? 'on' : ''}>Família</Link>
      </nav>
      <ForecastView months={f.months} history={f.monthsOfHistory} />
    </main>
  );
}
