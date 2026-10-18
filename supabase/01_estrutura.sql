-- =====================================================================
-- Meu Gestor · Fase 1 · Estrutura do banco de dados
-- Cole este arquivo inteiro no SQL Editor do Supabase e toque em "Run".
-- Pode rodar de novo sem problema: ele não apaga dados existentes.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

-- Família (cada cliente do app no futuro é uma família)
create table if not exists public.families (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text not null unique,
  created_at   timestamptz not null default now()
);

-- Perfil de cada pessoa (ligado ao login do Supabase)
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  family_id     uuid references public.families(id) on delete set null,
  display_name  text not null,
  created_at    timestamptz not null default now()
);

-- Espaços: um pessoal para cada pessoa e um compartilhado (Casal)
create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  kind        text not null check (kind in ('personal', 'shared')),
  owner_id    uuid references public.profiles(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  check ((kind = 'personal' and owner_id is not null) or (kind = 'shared' and owner_id is null))
);
create unique index if not exists spaces_one_personal_per_user on public.spaces(owner_id) where kind = 'personal';
create unique index if not exists spaces_one_shared_per_family on public.spaces(family_id) where kind = 'shared';

-- Contas bancárias, cartões, dinheiro e investimentos
create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  name          text not null,
  institution   text,
  type          text not null check (type in ('checking', 'credit_card', 'cash', 'investment')),
  closing_day   smallint check (closing_day between 1 and 31),
  due_day       smallint check (due_day between 1 and 31),
  credit_limit  numeric(14,2),
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Categorias de receitas e despesas (por família)
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('income', 'expense')),
  icon        text,
  created_at  timestamptz not null default now(),
  unique (family_id, name, kind)
);

-- Lançamentos (receitas e despesas)
create table if not exists public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces(id) on delete cascade,
  account_id         uuid references public.accounts(id) on delete set null,
  category_id        uuid references public.categories(id) on delete set null,
  kind               text not null check (kind in ('income', 'expense')),
  amount             numeric(14,2) not null check (amount > 0),
  description        text not null,
  occurred_on        date not null default current_date,
  installment_no     smallint,
  installment_total  smallint,
  source             text not null default 'form' check (source in ('chat', 'form', 'import', 'photo')),
  created_by         uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now()
);
create index if not exists transactions_space_date on public.transactions(space_id, occurred_on desc);

-- Contas a pagar (boletos, contas fixas, faturas)
create table if not exists public.bills (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  account_id   uuid references public.accounts(id) on delete set null,
  category_id  uuid references public.categories(id) on delete set null,
  name         text not null,
  amount       numeric(14,2) not null check (amount > 0),
  due_date     date not null,
  status       text not null default 'open' check (status in ('open', 'paid')),
  paid_at      timestamptz,
  recurrence   text not null default 'none' check (recurrence in ('none', 'monthly', 'yearly')),
  barcode      text,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists bills_space_due on public.bills(space_id, status, due_date);

-- Orçamento mensal por categoria
create table if not exists public.budgets (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  category_id  uuid not null references public.categories(id) on delete cascade,
  month        date not null check (extract(day from month) = 1),
  amount       numeric(14,2) not null check (amount > 0),
  unique (space_id, category_id, month)
);

-- Metas (viagem, reserva de emergência, carro...)
create table if not exists public.goals (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null references public.spaces(id) on delete cascade,
  name            text not null,
  target_amount   numeric(14,2) not null check (target_amount > 0),
  current_amount  numeric(14,2) not null default 0 check (current_amount >= 0),
  deadline        date,
  created_at      timestamptz not null default now()
);

-- Conversa com o Jarbas
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_user_time on public.chat_messages(user_id, created_at desc);

-- Aparelhos que recebem avisos (iPhone com o app instalado)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  endpoint    text not null unique,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Funções de acesso
-- ---------------------------------------------------------------------

-- Família de quem está logado
create or replace function public.my_family_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select family_id from public.profiles where id = auth.uid();
$$;

-- Pode ver/editar este espaço? (o próprio espaço pessoal ou o Casal da família)
create or replace function public.can_access_space(sid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = sid
      and s.family_id = public.my_family_id()
      and (s.kind = 'shared' or s.owner_id = auth.uid())
  );
$$;

-- Cria o perfil automaticamente quando alguém se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cria o perfil de quem já tinha se cadastrado antes deste script
insert into public.profiles (id, display_name)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- Categorias iniciais de uma família nova
create or replace function public.seed_categories(fid uuid)
returns void
language sql security definer set search_path = public
as $$
  insert into public.categories (family_id, name, kind, icon) values
    (fid, 'Moradia',                 'expense', 'home'),
    (fid, 'Mercado',                 'expense', 'cart'),
    (fid, 'Contas da casa',          'expense', 'bolt'),
    (fid, 'Transporte',              'expense', 'car'),
    (fid, 'Saúde',                   'expense', 'heart'),
    (fid, 'Educação',                'expense', 'school'),
    (fid, 'Restaurantes e delivery', 'expense', 'food'),
    (fid, 'Lazer',                   'expense', 'smile'),
    (fid, 'Assinaturas',             'expense', 'repeat'),
    (fid, 'Compras',                 'expense', 'bag'),
    (fid, 'Outros',                  'expense', 'dots'),
    (fid, 'Salário',                 'income',  'wallet'),
    (fid, 'Renda extra',             'income',  'plus'),
    (fid, 'Rendimentos',             'income',  'chart')
  on conflict do nothing;
$$;

-- Primeira pessoa cria a família (gera o Casal e o código de convite)
create or replace function public.create_family(family_name text, my_name text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  fid  uuid;
  code text;
begin
  if auth.uid() is null then
    raise exception 'Faça login primeiro';
  end if;
  if (select family_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'Você já faz parte de uma família';
  end if;

  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.families (name, invite_code) values (family_name, code) returning id into fid;

  insert into public.profiles (id, display_name, family_id)
  values (auth.uid(), coalesce(nullif(my_name, ''), 'Eu'), fid)
  on conflict (id) do update
    set family_id = fid, display_name = coalesce(nullif(my_name, ''), public.profiles.display_name);

  insert into public.spaces (family_id, kind, name) values (fid, 'shared', 'Casal');
  insert into public.spaces (family_id, kind, owner_id, name)
  values (fid, 'personal', auth.uid(), coalesce(nullif(my_name, ''), 'Pessoal'));

  perform public.seed_categories(fid);
  return code;
end;
$$;

-- Segunda pessoa entra na família com o código de convite
create or replace function public.join_family(code text, my_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  fid uuid;
begin
  if auth.uid() is null then
    raise exception 'Faça login primeiro';
  end if;
  if (select family_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'Você já faz parte de uma família';
  end if;

  select id into fid from public.families where invite_code = upper(trim(code));
  if fid is null then
    raise exception 'Código de convite inválido';
  end if;

  insert into public.profiles (id, display_name, family_id)
  values (auth.uid(), coalesce(nullif(my_name, ''), 'Eu'), fid)
  on conflict (id) do update
    set family_id = fid, display_name = coalesce(nullif(my_name, ''), public.profiles.display_name);

  insert into public.spaces (family_id, kind, owner_id, name)
  values (fid, 'personal', auth.uid(), coalesce(nullif(my_name, ''), 'Pessoal'));

  return fid;
end;
$$;

revoke all on function public.create_family(text, text) from public, anon;
revoke all on function public.join_family(text, text) from public, anon;
revoke all on function public.seed_categories(uuid) from public, anon, authenticated;
grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.join_family(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Segurança: cada pessoa só enxerga o próprio espaço e o Casal
-- ---------------------------------------------------------------------

alter table public.families           enable row level security;
alter table public.profiles           enable row level security;
alter table public.spaces             enable row level security;
alter table public.accounts           enable row level security;
alter table public.categories         enable row level security;
alter table public.transactions       enable row level security;
alter table public.bills              enable row level security;
alter table public.budgets            enable row level security;
alter table public.goals              enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists families_read on public.families;
create policy families_read on public.families
  for select to authenticated using (id = public.my_family_id());

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (id = auth.uid() or family_id = public.my_family_id());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and family_id is not distinct from public.my_family_id());

drop policy if exists spaces_read on public.spaces;
create policy spaces_read on public.spaces
  for select to authenticated using (public.can_access_space(id));

drop policy if exists categories_all on public.categories;
create policy categories_all on public.categories
  for all to authenticated
  using (family_id = public.my_family_id())
  with check (family_id = public.my_family_id());

drop policy if exists accounts_all on public.accounts;
create policy accounts_all on public.accounts
  for all to authenticated
  using (public.can_access_space(space_id)) with check (public.can_access_space(space_id));

drop policy if exists transactions_all on public.transactions;
create policy transactions_all on public.transactions
  for all to authenticated
  using (public.can_access_space(space_id)) with check (public.can_access_space(space_id));

drop policy if exists bills_all on public.bills;
create policy bills_all on public.bills
  for all to authenticated
  using (public.can_access_space(space_id)) with check (public.can_access_space(space_id));

drop policy if exists budgets_all on public.budgets;
create policy budgets_all on public.budgets
  for all to authenticated
  using (public.can_access_space(space_id)) with check (public.can_access_space(space_id));

drop policy if exists goals_all on public.goals;
create policy goals_all on public.goals
  for all to authenticated
  using (public.can_access_space(space_id)) with check (public.can_access_space(space_id));

drop policy if exists chat_own on public.chat_messages;
create policy chat_own on public.chat_messages
  for all to authenticated
  using (user_id = auth.uid() and public.can_access_space(space_id))
  with check (user_id = auth.uid() and public.can_access_space(space_id));

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Avisa o Supabase para recarregar as funções novas
notify pgrst, 'reload schema';

-- Pronto! Se apareceu "Success. No rows returned", deu tudo certo.
