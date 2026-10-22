import { appOrigin, cronKey } from '@/lib/secrets';

// O próprio app atualiza a estrutura do banco quando precisa.
// Usa a conexão direta POSTGRES_URL que a integração Supabase + Vercel já criou.
const VERSION = 5;

let running: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!running) running = migrate().catch((e) => {
    running = null; // tenta de novo na próxima vez
    console.error('migração falhou', e?.message);
  });
  return running;
}

async function migrate() {
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) {
    console.warn('Sem POSTGRES_URL: migração automática desligada');
    return;
  }
  const postgres = (await import('postgres')).default as any;
  const sql = postgres(url, { ssl: 'require', prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });
  try {
    await sql.unsafe(`create table if not exists public._meu_gestor_meta (id int primary key, version int not null)`);
    await sql.unsafe(`revoke all on public._meu_gestor_meta from anon, authenticated`);
    const rows = await sql.unsafe(`select version from public._meu_gestor_meta where id = 1`);
    const current = rows[0]?.version ?? 0;
    if (current >= VERSION) return;

    // v1 → agenda e lembretes
    await sql.unsafe(`
      create table if not exists public.events (
        id           uuid primary key default gen_random_uuid(),
        space_id     uuid not null references public.spaces(id) on delete cascade,
        user_id      uuid not null references public.profiles(id) on delete cascade default auth.uid(),
        kind         text not null default 'event' check (kind in ('event', 'reminder')),
        title        text not null,
        notes        text,
        starts_at    timestamptz not null,
        ends_at      timestamptz,
        remind_at    timestamptz,
        reminded_at  timestamptz,
        created_at   timestamptz not null default now()
      );
      create index if not exists events_space_start on public.events(space_id, starts_at);
      create index if not exists events_pending on public.events(remind_at) where reminded_at is null;
      alter table public.events enable row level security;
      drop policy if exists events_all on public.events;
      create policy events_all on public.events for all to authenticated
        using (public.can_access_space(space_id))
        with check (public.can_access_space(space_id));
      grant select, insert, update, delete on public.events to authenticated;
    `);

    // v3 → compras parceladas e faturas de cartão pagas
    await sql.unsafe(`
      alter table public.transactions add column if not exists installment_group uuid;
      create index if not exists transactions_group on public.transactions(installment_group) where installment_group is not null;
      create index if not exists transactions_account_date on public.transactions(account_id, occurred_on);
      create table if not exists public.card_invoices (
        account_id   uuid not null references public.accounts(id) on delete cascade,
        invoice_key  text not null,
        paid_at      timestamptz not null default now(),
        paid_by      uuid references public.profiles(id) on delete set null default auth.uid(),
        primary key (account_id, invoice_key)
      );
      alter table public.card_invoices enable row level security;
      drop policy if exists card_invoices_all on public.card_invoices;
      create policy card_invoices_all on public.card_invoices for all to authenticated
        using (exists (select 1 from public.accounts a where a.id = account_id and public.can_access_space(a.space_id)))
        with check (exists (select 1 from public.accounts a where a.id = account_id and public.can_access_space(a.space_id)));
      grant select, insert, update, delete on public.card_invoices to authenticated;
    `);

    // v4 → memória do Jarbas (fatos que a pessoa contou)
    await sql.unsafe(`
      create table if not exists public.jarbas_memory (
        id          uuid primary key default gen_random_uuid(),
        space_id    uuid not null references public.spaces(id) on delete cascade,
        user_id     uuid references public.profiles(id) on delete set null default auth.uid(),
        fact        text not null,
        created_at  timestamptz not null default now()
      );
      create index if not exists jarbas_memory_space on public.jarbas_memory(space_id, created_at desc);
      alter table public.jarbas_memory enable row level security;
      drop policy if exists jarbas_memory_all on public.jarbas_memory;
      create policy jarbas_memory_all on public.jarbas_memory for all to authenticated
        using (public.can_access_space(space_id))
        with check (public.can_access_space(space_id));
      grant select, insert, update, delete on public.jarbas_memory to authenticated;
    `);

    // v5 → aviso de contas (dias antes) e investimentos (separados de receitas/despesas)
    await sql.unsafe(`
      alter table public.bills add column if not exists remind_days smallint not null default 2;
      create table if not exists public.investments (
        id             uuid primary key default gen_random_uuid(),
        space_id       uuid not null references public.spaces(id) on delete cascade,
        owner_name     text,
        name           text not null,
        institution    text,
        kind           text not null default 'outro',
        invested       numeric(14,2) not null default 0,
        current_value  numeric(14,2) not null default 0,
        notes          text,
        archived       boolean not null default false,
        updated_at     timestamptz not null default now(),
        created_at     timestamptz not null default now()
      );
      create table if not exists public.investment_moves (
        id             uuid primary key default gen_random_uuid(),
        investment_id  uuid not null references public.investments(id) on delete cascade,
        kind           text not null check (kind in ('aporte', 'resgate', 'atualizacao')),
        amount         numeric(14,2) not null,
        value_after    numeric(14,2) not null,
        occurred_on    date not null default current_date,
        created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
        created_at     timestamptz not null default now()
      );
      create index if not exists investment_moves_inv on public.investment_moves(investment_id, occurred_on desc);
      alter table public.investments enable row level security;
      alter table public.investment_moves enable row level security;
      drop policy if exists investments_all on public.investments;
      create policy investments_all on public.investments for all to authenticated
        using (public.can_access_space(space_id)) with check (public.can_access_space(space_id));
      drop policy if exists investment_moves_all on public.investment_moves;
      create policy investment_moves_all on public.investment_moves for all to authenticated
        using (exists (select 1 from public.investments i where i.id = investment_id and public.can_access_space(i.space_id)))
        with check (exists (select 1 from public.investments i where i.id = investment_id and public.can_access_space(i.space_id)));
      grant select, insert, update, delete on public.investments, public.investment_moves to authenticated;
    `);

    // v2 → agendador do banco chama os lembretes a cada minuto
    let cronOk = false;
    const origin = appOrigin();
    if (origin) {
      const target = `${origin}/api/cron/lembretes?k=${cronKey()}`;
      try {
        await sql.unsafe(`create extension if not exists pg_cron`);
        await sql.unsafe(`create extension if not exists pg_net`);
        await sql.unsafe(`select cron.unschedule(jobid) from cron.job where jobname = 'jarbas-lembretes'`);
        await sql`select cron.schedule('jarbas-lembretes', '* * * * *', ${`select net.http_get(url := '${target.replace(/'/g, "''")}', timeout_milliseconds := 25000)`})`;
        cronOk = true;
      } catch (e: any) {
        console.error('agendador não configurado', e?.message);
      }
    }

    await sql.unsafe(`notify pgrst, 'reload schema'`);
    const done = cronOk ? VERSION : 1; // sem agendador, tenta de novo depois
    await sql`insert into public._meu_gestor_meta (id, version) values (1, ${done})
              on conflict (id) do update set version = excluded.version`;
  } finally {
    await sql.end({ timeout: 2 });
  }
}
