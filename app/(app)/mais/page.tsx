import { getContext } from '@/lib/context';
import Link from 'next/link';
import { createAccountAction, signOutAction } from '../actions';
import FaceIdToggle from '@/components/FaceIdToggle';
import NotificationsToggle from '@/components/NotificationsToggle';
import CalendarConnect from '@/components/CalendarConnect';
import VoicePicker from '@/components/VoicePicker';
import { headers } from 'next/headers';
import { agendaSig, appOrigin, atalhoToken } from '@/lib/secrets';
import AtalhoSetup from '@/components/AtalhoSetup';
import { IconBills, IconCalendar, IconList, IconPie, IconTrend } from '@/components/icons';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  checking: 'Conta corrente',
  credit_card: 'Cartão de crédito',
  cash: 'Dinheiro',
  investment: 'Investimentos',
};

export default async function MaisPage() {
  const ctx = await getContext();
  const firstName = ctx.name.split(' ')[0];
  const [{ data: family }, { data: members }, { data: accounts }] = await Promise.all([
    ctx.supabase.from('families').select('name, invite_code').maybeSingle(),
    ctx.supabase.from('profiles').select('id, display_name'),
    ctx.supabase.from('accounts').select('id, name, institution, type, space_id, closing_day, due_day').eq('archived', false).neq('type', 'credit_card').order('name'),
  ]);
  let calendar: { webcal: string; https: string } | null = null;
  let atalho: { siri: string; sms: string } | null = null;
  try {
    const origin = appOrigin((await headers()).get('host'));
    const k = atalhoToken(ctx.userId);
    atalho = { siri: `${origin}/api/atalho?k=${k}`, sms: `${origin}/api/atalho?k=${k}&origem=sms` };
    const path = `/api/agenda/${ctx.userId}.${agendaSig(ctx.userId)}.ics`;
    calendar = { https: origin + path, webcal: origin.replace(/^https?:/, 'webcal:') + path };
  } catch {}
  const whose = (spaceId: string) => (spaceId === ctx.casal.id ? 'Família' : firstName);

  return (
    <main className="page">
      <h1 className="page-title">Mais</h1>

      <nav className="card menu-list" aria-label="Atalhos do app">
        <Link href="/contas"><span className="menu-ic"><IconBills /></span><span className="grow">Contas a pagar</span>›</Link>
        <Link href="/investimentos"><span className="menu-ic"><IconTrend /></span><span className="grow">Patrimônio · investimentos e metas</span>›</Link>
        <Link href="/orcamento"><span className="menu-ic"><IconPie /></span><span className="grow">Orçamento por categoria</span>›</Link>
        <Link href="/previsao"><span className="menu-ic"><IconCalendar /></span><span className="grow">Previsão dos próximos meses</span>›</Link>
        <Link href="/categorias"><span className="menu-ic"><IconList /></span><span className="grow">Categorias e regras</span>›</Link>
      </nav>

      <section className="card stack" aria-label="Família">
        <div className="card-head"><h2>{family?.name ?? 'Família'}</h2></div>
        <div className="small muted">
          Pessoas: {(members ?? []).map((m: any) => m.display_name).join(' e ')}
        </div>
        <div>
          <div className="label">Código de convite</div>
          <div className="code" style={{ fontSize: 36 }}>{family?.invite_code}</div>
          <div className="tiny muted">Quem entrar com esse código passa a ver o espaço da Família. O seu espaço pessoal continua só seu.</div>
        </div>
      </section>

      <section className="card stack" aria-label="Contas bancárias">
        <div className="card-head"><h2>Contas bancárias</h2><Link href="/cartoes" className="small">Cartões ›</Link></div>
        {(accounts ?? []).length === 0 ? (
          <p className="empty">Cadastre conta corrente, Pix e dinheiro. Os cartões de crédito ficam na aba Cartões.</p>
        ) : (
          <div className="list">
            {(accounts ?? []).map((a: any) => (
              <div className="item" key={a.id}>
                <div className="item-icon">{a.name.charAt(0)}</div>
                <div className="grow">
                  <div className="item-title">{a.name}</div>
                  <div className="item-sub">
                    {TYPES[a.type]}{a.institution ? ` · ${a.institution}` : ''} · {whose(a.space_id)}
                    {a.type === 'credit_card' && a.due_day ? ` · vence dia ${a.due_day}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <details>
          <summary className="btn" style={{ listStyle: 'none' }}>Adicionar conta</summary>
          <form action={createAccountAction} className="stack" style={{ marginTop: 14 }}>
            <label className="field"><span>Nome</span><input className="input" name="nome" placeholder="Cartão Santander" required /></label>
            <div className="grid2">
              <label className="field">
                <span>Tipo</span>
                <select className="input" name="tipo" defaultValue="checking">
                  {Object.entries(TYPES).filter(([v]) => v !== 'credit_card' && v !== 'investment').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Banco</span>
                <select className="input" name="banco" defaultValue="">
                  <option value="">Outro</option>
                  {['Santander', 'Bradesco', 'Neon', 'Caixa', 'Banco do Brasil', 'Ágora'].map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
            </div>
            <label className="field">
              <span>De quem é</span>
              <select className="input" name="espaco" defaultValue="casal">
                <option value="pessoal">{firstName}</option>
                <option value="casal">Família</option>
              </select>
            </label>
            <button className="btn btn-primary btn-block">Salvar</button>
          </form>
        </details>
      </section>



      {atalho && <AtalhoSetup siriUrl={atalho.siri} smsUrl={atalho.sms} />}

      <VoicePicker firstName={firstName} />

      <NotificationsToggle />

      {calendar && <CalendarConnect webcal={calendar.webcal} https={calendar.https} />}

      <FaceIdToggle userName={ctx.name} />

      <section className="card stack" aria-label="Instalar no iPhone">
        <div className="card-head"><h2>Instalar no iPhone</h2></div>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)' }}>
          <li>Abra este site no Safari.</li>
          <li>Toque em Compartilhar (quadrado com a seta para cima).</li>
          <li>Escolha “Adicionar à Tela de Início” e toque em Adicionar.</li>
        </ol>
      </section>

      <form action={signOutAction}>
        <button className="btn btn-block">Sair da conta</button>
      </form>
    </main>
  );
}
