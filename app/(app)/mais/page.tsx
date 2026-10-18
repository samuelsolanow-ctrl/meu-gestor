import { getContext } from '@/lib/context';
import { brl } from '@/lib/format';
import { createAccountAction, createGoalAction, signOutAction } from '../actions';
import FaceIdToggle from '@/components/FaceIdToggle';
import NotificationsToggle from '@/components/NotificationsToggle';

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
  const [{ data: family }, { data: members }, { data: accounts }, { data: goals }] = await Promise.all([
    ctx.supabase.from('families').select('name, invite_code').maybeSingle(),
    ctx.supabase.from('profiles').select('id, display_name'),
    ctx.supabase.from('accounts').select('id, name, institution, type, space_id, closing_day, due_day').eq('archived', false).order('name'),
    ctx.supabase.from('goals').select('id, name, target_amount, current_amount, space_id').order('created_at'),
  ]);
  const whose = (spaceId: string) => (spaceId === ctx.casal.id ? 'Família' : firstName);

  return (
    <main className="page">
      <h1 className="page-title">Mais</h1>

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

      <section className="card stack" aria-label="Contas e cartões">
        <div className="card-head"><h2>Contas e cartões</h2></div>
        {(accounts ?? []).length === 0 ? (
          <p className="empty">Cadastre seus bancos e cartões para o Jarbas saber onde lançar.</p>
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
          <summary className="btn" style={{ listStyle: 'none' }}>Adicionar conta ou cartão</summary>
          <form action={createAccountAction} className="stack" style={{ marginTop: 14 }}>
            <label className="field"><span>Nome</span><input className="input" name="nome" placeholder="Cartão Santander" required /></label>
            <div className="grid2">
              <label className="field">
                <span>Tipo</span>
                <select className="input" name="tipo" defaultValue="credit_card">
                  {Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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
            <div className="grid2">
              <label className="field"><span>Fecha dia (cartão)</span><input className="input" name="fechamento" inputMode="numeric" placeholder="ex.: 10" /></label>
              <label className="field"><span>Vence dia (cartão)</span><input className="input" name="vencimento" inputMode="numeric" placeholder="ex.: 20" /></label>
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

      <section className="card stack" id="metas" aria-label="Metas">
        <div className="card-head"><h2>Metas</h2></div>
        {(goals ?? []).map((g: any) => (
          <div className="row small" key={g.id} style={{ justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>{g.name} <span className="muted">· {whose(g.space_id)}</span></span>
            <span className="muted">{brl(g.current_amount)} de {brl(g.target_amount)}</span>
          </div>
        ))}
        <details>
          <summary className="btn" style={{ listStyle: 'none' }}>Criar meta</summary>
          <form action={createGoalAction} className="stack" style={{ marginTop: 14 }}>
            <label className="field"><span>Nome da meta</span><input className="input" name="nome" placeholder="Viagem de férias" required /></label>
            <div className="grid2">
              <label className="field"><span>Quanto precisa (R$)</span><input className="input" name="alvo" inputMode="decimal" required /></label>
              <label className="field"><span>Já tem (R$)</span><input className="input" name="atual" inputMode="decimal" placeholder="0" /></label>
            </div>
            <div className="grid2">
              <label className="field"><span>Prazo</span><input className="input" type="date" name="prazo" /></label>
              <label className="field">
                <span>De quem é</span>
                <select className="input" name="espaco" defaultValue="casal">
                  <option value="pessoal">{firstName}</option>
                  <option value="casal">Família</option>
                </select>
              </label>
            </div>
            <button className="btn btn-primary btn-block">Salvar meta</button>
          </form>
        </details>
      </section>

      <NotificationsToggle />

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
