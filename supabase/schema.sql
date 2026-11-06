-- Kwickly database schema for Supabase.
-- Run once: Supabase Dashboard → SQL Editor → New query → paste → Run.

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'customer' check (role in ('customer', 'provider', 'admin')),
  created_at timestamptz not null default now()
);

-- Create a profile automatically for every new auth user.
-- Only 'customer' or 'provider' can be chosen at sign-up; admins are set manually.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_user_meta_data ->> 'role' = 'provider' then 'provider' else 'customer' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used by policies (security definer avoids recursive RLS on profiles).
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ───────────────────────── bookings ─────────────────────────
create table if not exists public.bookings (
  id             bigint generated always as identity (start with 1000) primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  service        text not null,
  address        text not null,
  phone          text not null,
  description    text not null,
  scheduled_at   timestamptz not null,
  status         text not null default 'awaiting_assignment'
                 check (status in ('awaiting_assignment', 'assigned', 'in_progress', 'completed', 'cancelled')),
  visit_fee      integer not null default 149,
  quote_amount   integer,
  provider_name  text,
  created_at     timestamptz not null default now()
);
create index if not exists bookings_user_id_idx on public.bookings (user_id, created_at desc);

-- ─────────────────── provider_applications ───────────────────
create table if not exists public.provider_applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name   text not null,
  phone       text not null,
  email       text not null,
  city        text not null,
  service     text not null,
  experience  text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now()
);
create index if not exists provider_applications_user_id_idx on public.provider_applications (user_id);

-- ───────────────────────── security (RLS) ─────────────────────────
alter table public.profiles              enable row level security;
alter table public.bookings              enable row level security;
alter table public.provider_applications enable row level security;

-- profiles: read your own (admins read all). No client-side writes, so nobody can promote themselves.
drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- bookings
drop policy if exists "bookings: read own or admin" on public.bookings;
create policy "bookings: read own or admin" on public.bookings
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "bookings: create own" on public.bookings;
create policy "bookings: create own" on public.bookings
  for insert with check (
    user_id = auth.uid()
    and status = 'awaiting_assignment'
    and quote_amount is null
    and provider_name is null
  );

drop policy if exists "bookings: admin update" on public.bookings;
create policy "bookings: admin update" on public.bookings
  for update using (public.is_admin()) with check (public.is_admin());

-- provider applications
drop policy if exists "applications: read own or admin" on public.provider_applications;
create policy "applications: read own or admin" on public.provider_applications
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "applications: create own" on public.provider_applications;
create policy "applications: create own" on public.provider_applications
  for insert with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "applications: admin update" on public.provider_applications;
create policy "applications: admin update" on public.provider_applications
  for update using (public.is_admin()) with check (public.is_admin());

-- To make yourself an admin (replace the email), run:
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
-- Kwickly: admin / provider / customer workflow.
-- Run ONCE in Supabase -> SQL Editor, after schema.sql. Safe to run again.

-- ───────────────────────── 1. profiles ─────────────────────────
alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists available boolean not null default true;

-- Create missing profiles for older accounts, then fill in emails.
insert into public.profiles (id, full_name, email)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', ''), coalesce(u.email, '')
from auth.users u
on conflict (id) do nothing;

update public.profiles p set email = coalesce(u.email, '')
from auth.users u where u.id = p.id and p.email = '';

-- Everyone who signs up is a customer. Providers go through "Become a provider"
-- and are approved by an admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''), 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ───────────────────────── 2. bookings ─────────────────────────
alter table public.bookings add column if not exists customer_name text not null default '';
alter table public.bookings add column if not exists provider_id uuid references public.profiles (id) on delete set null;
alter table public.bookings add column if not exists rating smallint check (rating between 1 and 5);
alter table public.bookings add column if not exists feedback text;
alter table public.bookings add column if not exists completed_at timestamptz;
alter table public.bookings add column if not exists updated_at timestamptz not null default now();
create index if not exists bookings_provider_id_idx on public.bookings (provider_id);

update public.bookings b
set customer_name = coalesce(nullif(p.full_name, ''), p.email, '')
from public.profiles p
where p.id = b.user_id and b.customer_name = '';

update public.bookings set completed_at = coalesce(completed_at, updated_at)
where status = 'completed' and completed_at is null;

create or replace function public.bookings_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(full_name, ''), email, '') into new.customer_name
    from public.profiles where id = new.user_id;
    new.customer_name := coalesce(new.customer_name, '');
  end if;

  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bookings_before_write on public.bookings;
create trigger bookings_before_write
  before insert or update on public.bookings
  for each row execute function public.bookings_before_write();

-- Who can see / create bookings
drop policy if exists "bookings: read own or admin" on public.bookings;
drop policy if exists "bookings: read involved" on public.bookings;
create policy "bookings: read involved" on public.bookings
  for select using (user_id = auth.uid() or provider_id = auth.uid() or public.is_admin());

drop policy if exists "bookings: create own" on public.bookings;
create policy "bookings: create own" on public.bookings
  for insert with check (
    user_id = auth.uid()
    and status = 'awaiting_assignment'
    and visit_fee = 149
    and quote_amount is null
    and provider_name is null
    and provider_id is null
    and rating is null
  );

-- ───────────────────────── 3. services ─────────────────────────
create table if not exists public.services (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  detail     text not null default '',
  icon       text not null default 'wrench',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.services enable row level security;

drop policy if exists "services: read active or admin" on public.services;
create policy "services: read active or admin" on public.services
  for select using (active or public.is_admin());

drop policy if exists "services: admin insert" on public.services;
create policy "services: admin insert" on public.services
  for insert with check (public.is_admin());

drop policy if exists "services: admin update" on public.services;
create policy "services: admin update" on public.services
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "services: admin delete" on public.services;
create policy "services: admin delete" on public.services
  for delete using (public.is_admin());

insert into public.services (name, detail, icon) values
  ('Electrician', 'Wiring, repairs & installs', 'zap'),
  ('Plumbing',    'Leaks, taps & pipes',        'droplets'),
  ('Carpentry',   'Furniture & woodwork',       'hammer'),
  ('Mechanic',    'Repairs at your door',       'wrench'),
  ('Car wash',    'A fresh shine, at home',     'car'),
  ('Catering',    'Events made delicious',      'utensils')
on conflict (name) do nothing;

-- ───────────────────────── 4. actions (RPC) ─────────────────────────
-- Admin: assign (or unassign) a provider
create or replace function public.admin_assign_booking(p_booking bigint, p_provider uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_name text;
begin
  if not public.is_admin() then raise exception 'Only admins can assign providers'; end if;

  select status into v_status from public.bookings where id = p_booking;
  if not found then raise exception 'Booking not found'; end if;
  if v_status in ('completed', 'cancelled') then raise exception 'Closed bookings cannot be reassigned'; end if;

  if p_provider is null then
    update public.bookings
    set provider_id = null,
        provider_name = null,
        status = case when status in ('assigned', 'in_progress') then 'awaiting_assignment' else status end
    where id = p_booking;
  else
    select coalesce(nullif(full_name, ''), email) into v_name
    from public.profiles where id = p_provider and role = 'provider';
    if not found then raise exception 'Selected user is not a provider'; end if;

    update public.bookings
    set provider_id = p_provider,
        provider_name = v_name,
        status = case when status = 'awaiting_assignment' then 'assigned' else status end
    where id = p_booking;
  end if;
end;
$$;

-- Admin: change status of any booking
create or replace function public.admin_set_booking_status(p_booking bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change booking status'; end if;
  if p_status not in ('awaiting_assignment', 'assigned', 'in_progress', 'completed', 'cancelled') then
    raise exception 'Invalid status';
  end if;

  if p_status in ('assigned', 'in_progress', 'completed')
     and not exists (select 1 from public.bookings where id = p_booking and provider_id is not null) then
    raise exception 'Assign a provider before setting this status';
  end if;

  update public.bookings
  set status = p_status,
      provider_id   = case when p_status = 'awaiting_assignment' then null else provider_id end,
      provider_name = case when p_status = 'awaiting_assignment' then null else provider_name end
  where id = p_booking;
  if not found then raise exception 'Booking not found'; end if;
end;
$$;

-- Admin: set the work quote
create or replace function public.admin_set_quote(p_booking bigint, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Only admins can set quotes'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'Quote must be positive'; end if;
  update public.bookings set quote_amount = p_amount where id = p_booking;
  if not found then raise exception 'Booking not found'; end if;
end;
$$;

-- Admin: approve / reject a provider application
create or replace function public.admin_review_application(p_app uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then raise exception 'Only admins can review applications'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Invalid decision'; end if;

  update public.provider_applications set status = p_decision where id = p_app returning user_id into v_user;
  if not found then raise exception 'Application not found'; end if;

  if p_decision = 'approved' then
    update public.profiles set role = 'provider' where id = v_user and role = 'customer';
  end if;
end;
$$;

-- Admin: switch a user between customer and provider
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change roles'; end if;
  if p_role not in ('customer', 'provider') then raise exception 'Role must be customer or provider'; end if;

  update public.profiles set role = p_role where id = p_user and role <> 'admin';
  if not found then raise exception 'User not found, or user is an admin'; end if;

  if p_role = 'customer' then
    update public.bookings
    set provider_id = null, provider_name = null, status = 'awaiting_assignment'
    where provider_id = p_user and status in ('assigned', 'in_progress');
  end if;
end;
$$;

-- Provider: update status of a job assigned to you
create or replace function public.provider_set_booking_status(p_booking bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider uuid;
  v_status text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'provider') then
    raise exception 'Only providers can update job status';
  end if;
  if p_status not in ('assigned', 'in_progress', 'completed') then
    raise exception 'Providers can only set Assigned, In progress or Completed';
  end if;

  select provider_id, status into v_provider, v_status from public.bookings where id = p_booking;
  if not found then raise exception 'Booking not found'; end if;
  if v_provider is distinct from auth.uid() then raise exception 'This booking is not assigned to you'; end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'This booking is closed. Ask an admin to change it.';
  end if;

  update public.bookings set status = p_status where id = p_booking;
end;
$$;

-- Provider: availability switch
create or replace function public.set_my_availability(p_available boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set available = p_available where id = auth.uid() and role = 'provider';
  if not found then raise exception 'Only providers can change availability'; end if;
end;
$$;

-- Customer: cancel your own booking (before work starts)
create or replace function public.customer_cancel_booking(p_booking bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.bookings where id = p_booking and user_id = auth.uid();
  if not found then raise exception 'Booking not found'; end if;
  if v_status not in ('awaiting_assignment', 'assigned') then
    raise exception 'This booking can no longer be cancelled';
  end if;
  update public.bookings set status = 'cancelled' where id = p_booking;
end;
$$;

-- Customer: rate a completed booking (once)
create or replace function public.customer_rate_booking(p_booking bigint, p_rating integer, p_feedback text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_rating smallint;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Rating must be 1 to 5'; end if;

  select status, rating into v_status, v_rating from public.bookings where id = p_booking and user_id = auth.uid();
  if not found then raise exception 'Booking not found'; end if;
  if v_status <> 'completed' then raise exception 'You can rate a booking once it is completed'; end if;
  if v_rating is not null then raise exception 'You have already rated this booking'; end if;

  update public.bookings set rating = p_rating, feedback = nullif(trim(p_feedback), '') where id = p_booking;
end;
$$;

-- ───────────────────────── 5. permissions ─────────────────────────
grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.bookings to authenticated;
grant select, insert, update on public.provider_applications to authenticated;
grant select on public.services to anon, authenticated;
grant insert, update, delete on public.services to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant execute on function public.is_admin() to anon, authenticated;

revoke all on function public.admin_assign_booking(bigint, uuid)               from public, anon;
revoke all on function public.admin_set_booking_status(bigint, text)           from public, anon;
revoke all on function public.admin_set_quote(bigint, integer)                 from public, anon;
revoke all on function public.admin_review_application(uuid, text)             from public, anon;
revoke all on function public.admin_set_role(uuid, text)                       from public, anon;
revoke all on function public.provider_set_booking_status(bigint, text)        from public, anon;
revoke all on function public.set_my_availability(boolean)                     from public, anon;
revoke all on function public.customer_cancel_booking(bigint)                  from public, anon;
revoke all on function public.customer_rate_booking(bigint, integer, text)     from public, anon;

grant execute on function public.admin_assign_booking(bigint, uuid)            to authenticated;
grant execute on function public.admin_set_booking_status(bigint, text)        to authenticated;
grant execute on function public.admin_set_quote(bigint, integer)              to authenticated;
grant execute on function public.admin_review_application(uuid, text)          to authenticated;
grant execute on function public.admin_set_role(uuid, text)                    to authenticated;
grant execute on function public.provider_set_booking_status(bigint, text)     to authenticated;
grant execute on function public.set_my_availability(boolean)                  to authenticated;
grant execute on function public.customer_cancel_booking(bigint)               to authenticated;
grant execute on function public.customer_rate_booking(bigint, integer, text)  to authenticated;

-- ───────────────────────── 6. live updates ─────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.bookings;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;