-- Kwickly: billing, earnings split, payouts and provider KYC onboarding.
-- Run ONCE in Supabase -> SQL Editor, AFTER schema.sql. Safe to run again.
--
-- What this adds
--   1. Visit fee split   : visit fee Rs 149 -> provider Rs 75, Kwickly Rs 74 (stored on every booking)
--   2. Platform settings : visit fee + service-charge % (default 20) editable by admin
--   3. Bills             : provider builds an itemised bill (items, labour, GST); Kwickly adds the
--                          service charge on top; customer sees it on the request
--   4. Item catalogue    : each provider's saved items / rates
--   5. Payouts           : admin records money paid to providers
--   6. Provider KYC      : business + ID details and private document storage
--   7. Approval workflow : admin approves / rejects (with reason); dashboard unlocks on approval

-- ───────────────────────── 0. fix the visit-fee default ─────────────────────────
alter table public.bookings alter column visit_fee set default 149;

-- ───────────────────────── 1. platform settings ─────────────────────────
create table if not exists public.platform_settings (
  id                     integer primary key default 1 check (id = 1),
  visit_fee              integer not null default 149 check (visit_fee >= 0),
  service_charge_percent numeric(5,2) not null default 20 check (service_charge_percent between 0 and 100),
  updated_at             timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
drop policy if exists "settings: read" on public.platform_settings;
create policy "settings: read" on public.platform_settings for select using (true);

create or replace function public.admin_update_settings(p_visit_fee integer, p_service_percent numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change pricing'; end if;
  if p_visit_fee is null or p_visit_fee < 0 then raise exception 'Visit fee must be 0 or more'; end if;
  if p_service_percent is null or p_service_percent < 0 or p_service_percent > 100 then
    raise exception 'Service charge must be between 0 and 100 percent';
  end if;
  update public.platform_settings
  set visit_fee = p_visit_fee, service_charge_percent = p_service_percent, updated_at = now()
  where id = 1;
end;
$$;

-- ───────────────────────── 2. visit-fee split on bookings ─────────────────────────
alter table public.bookings add column if not exists visit_provider_share integer not null default 75;
alter table public.bookings add column if not exists visit_platform_share integer not null default 74;

-- Existing bookings: provider gets the larger half (149 -> 75 / 74).
update public.bookings
set visit_provider_share = ceil(visit_fee / 2.0)::integer,
    visit_platform_share = visit_fee - ceil(visit_fee / 2.0)::integer;

create or replace function public.bookings_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee integer;
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(full_name, ''), email, '') into new.customer_name
    from public.profiles where id = new.user_id;
    new.customer_name := coalesce(new.customer_name, '');

    -- The fee and its split always come from the server, never from the browser.
    select visit_fee into v_fee from public.platform_settings where id = 1;
    new.visit_fee := coalesce(v_fee, 149);
    new.visit_provider_share := ceil(new.visit_fee / 2.0)::integer;
    new.visit_platform_share := new.visit_fee - new.visit_provider_share;
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

-- The old policy compared visit_fee to a placeholder; the trigger now sets it.
drop policy if exists "bookings: create own" on public.bookings;
create policy "bookings: create own" on public.bookings
  for insert with check (
    user_id = auth.uid()
    and status = 'awaiting_assignment'
    and quote_amount is null
    and provider_name is null
    and provider_id is null
    and rating is null
  );

-- ───────────────────────── 3. provider KYC fields ─────────────────────────
alter table public.provider_applications add column if not exists business_name        text;
alter table public.provider_applications add column if not exists business_type        text;
alter table public.provider_applications add column if not exists business_address     text;
alter table public.provider_applications add column if not exists gst_number           text;
alter table public.provider_applications add column if not exists years_experience     integer;
alter table public.provider_applications add column if not exists id_proof_type        text;
alter table public.provider_applications add column if not exists id_proof_number      text;
alter table public.provider_applications add column if not exists id_proof_path        text;
alter table public.provider_applications add column if not exists business_proof_type   text;
alter table public.provider_applications add column if not exists business_proof_path   text;
alter table public.provider_applications add column if not exists photo_path           text;
alter table public.provider_applications add column if not exists bank_holder          text;
alter table public.provider_applications add column if not exists bank_account         text;
alter table public.provider_applications add column if not exists bank_ifsc            text;
alter table public.provider_applications add column if not exists upi_id               text;
alter table public.provider_applications add column if not exists review_note          text;
alter table public.provider_applications add column if not exists reviewed_at          timestamptz;
alter table public.provider_applications add column if not exists reviewed_by          uuid references auth.users (id) on delete set null;

-- One open application per person.
create unique index if not exists provider_applications_one_pending
  on public.provider_applications (user_id) where status = 'pending';

-- New applications must carry ID proof + business proof, stored in the applicant's own folder.
drop policy if exists "applications: create own" on public.provider_applications;
create policy "applications: create own" on public.provider_applications
  for insert with check (
    user_id = auth.uid()
    and status = 'pending'
    and nullif(trim(business_name), '') is not null
    and id_proof_path is not null
    and business_proof_path is not null
    and id_proof_path like auth.uid()::text || '/%'
    and business_proof_path like auth.uid()::text || '/%'
  );

-- Private bucket for ID / business documents (5 MB, images or PDF).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provider-docs', 'provider-docs', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

drop policy if exists "provider-docs: upload own" on storage.objects;
create policy "provider-docs: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'provider-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "provider-docs: read own or admin" on storage.objects;
create policy "provider-docs: read own or admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'provider-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Approve / reject (with a reason). Approving unlocks the provider dashboard.
drop function if exists public.admin_review_application(uuid, text);
create or replace function public.admin_review_application(p_app uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_id   text;
  v_biz  text;
begin
  if not public.is_admin() then raise exception 'Only admins can review applications'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Invalid decision'; end if;

  select user_id, id_proof_path, business_proof_path into v_user, v_id, v_biz
  from public.provider_applications where id = p_app;
  if not found then raise exception 'Application not found'; end if;

  if p_decision = 'approved' and (v_id is null or v_biz is null) then
    raise exception 'This application has no ID proof or business proof. Reject it and ask the applicant to apply again.';
  end if;
  if p_decision = 'rejected' and coalesce(trim(p_note), '') = '' then
    raise exception 'Please give a reason so the applicant knows what to fix';
  end if;

  update public.provider_applications
  set status = p_decision, review_note = nullif(trim(p_note), ''), reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_app;

  if p_decision = 'approved' then
    update public.profiles set role = 'provider', available = true where id = v_user and role = 'customer';
  end if;
end;
$$;

-- ───────────────────────── 4. provider item catalogue ─────────────────────────
create table if not exists public.provider_items (
  id           bigint generated always as identity primary key,
  provider_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 120),
  kind         text not null default 'material' check (kind in ('material', 'labour', 'other')),
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  tax_percent  numeric(5,2) not null default 0 check (tax_percent between 0 and 28),
  created_at   timestamptz not null default now()
);
create unique index if not exists provider_items_unique_name on public.provider_items (provider_id, lower(name));

alter table public.provider_items enable row level security;
drop policy if exists "items: read own or admin" on public.provider_items;
create policy "items: read own or admin" on public.provider_items
  for select using (provider_id = auth.uid() or public.is_admin());
drop policy if exists "items: delete own" on public.provider_items;
create policy "items: delete own" on public.provider_items
  for delete using (provider_id = auth.uid());

create or replace function public.provider_save_item(p_name text, p_kind text, p_price numeric, p_tax numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'provider') then
    raise exception 'Only providers can save items';
  end if;
  if p_kind not in ('material', 'labour', 'other') then raise exception 'Invalid item type'; end if;
  insert into public.provider_items (provider_id, name, kind, unit_price, tax_percent)
  values (auth.uid(), left(trim(p_name), 120), p_kind, p_price, coalesce(p_tax, 0))
  on conflict (provider_id, lower(name))
  do update set kind = excluded.kind, unit_price = excluded.unit_price, tax_percent = excluded.tax_percent;
end;
$$;

-- ───────────────────────── 5. bills ─────────────────────────
create table if not exists public.bills (
  id                     bigint generated always as identity (start with 5000) primary key,
  booking_id             bigint not null unique references public.bookings (id) on delete cascade,
  provider_id            uuid not null references public.profiles (id) on delete restrict,
  customer_id            uuid not null references auth.users (id) on delete cascade,
  provider_name          text not null default '',
  business_name          text,
  provider_gst           text,
  items                  jsonb not null default '[]'::jsonb,
  materials_subtotal     numeric(12,2) not null default 0,
  labour_subtotal        numeric(12,2) not null default 0,
  subtotal               numeric(12,2) not null default 0,
  tax_total              numeric(12,2) not null default 0,
  service_charge_percent numeric(5,2)  not null default 20,
  service_charge         numeric(12,2) not null default 0,
  total                  numeric(12,2) not null default 0,
  provider_earning       numeric(12,2) not null default 0,
  notes                  text,
  status                 text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  paid_method            text,
  collected_by           text check (collected_by in ('platform', 'provider')),
  paid_at                timestamptz,
  sent_at                timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists bills_provider_idx on public.bills (provider_id);
create index if not exists bills_customer_idx on public.bills (customer_id);

alter table public.bills enable row level security;
drop policy if exists "bills: read involved" on public.bills;
create policy "bills: read involved" on public.bills
  for select using (
    provider_id = auth.uid()
    or public.is_admin()
    or (customer_id = auth.uid() and status <> 'draft')
  );

-- Create / update a bill. The server does ALL the maths, so the browser cannot change the totals.
--   subtotal       = items + labour
--   tax            = per-line GST
--   service charge = platform % of the subtotal (default 20%), added on top for the customer
--   total          = subtotal + tax + service charge          (what the customer pays)
--   provider gets  = subtotal + tax                           (work earning)
create or replace function public.provider_save_bill(p_booking bigint, p_items jsonb, p_notes text, p_send boolean)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b       record;
  v_bill    record;
  v_exists  boolean;
  v_pct     numeric;
  v_item    jsonb;
  v_clean   jsonb := '[]'::jsonb;
  v_name    text;
  v_kind    text;
  v_qty     numeric;
  v_price   numeric;
  v_taxp    numeric;
  v_amount  numeric;
  v_tax     numeric;
  v_mat     numeric := 0;
  v_lab     numeric := 0;
  v_sub     numeric := 0;
  v_taxsum  numeric := 0;
  v_service numeric;
  v_total   numeric;
  v_status  text;
  v_biz     text;
  v_gst     text;
  v_pname   text;
  v_id      bigint;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'provider') then
    raise exception 'Only providers can create bills';
  end if;

  select * into v_b from public.bookings where id = p_booking;
  if not found then raise exception 'Booking not found'; end if;
  if v_b.provider_id is distinct from auth.uid() then raise exception 'This booking is not assigned to you'; end if;
  if v_b.status not in ('in_progress', 'completed') then raise exception 'Start the job before creating a bill'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item or labour charge';
  end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'Too many lines (maximum 50)'; end if;

  select * into v_bill from public.bills where booking_id = p_booking;
  v_exists := found;
  if v_exists and v_bill.status = 'paid' then raise exception 'This bill is already paid and can no longer be changed'; end if;

  -- A bill already sent keeps the service-charge rate the customer saw; drafts use today's rate.
  if v_exists and v_bill.status = 'sent' then
    v_pct := v_bill.service_charge_percent;
  else
    select service_charge_percent into v_pct from public.platform_settings where id = 1;
    v_pct := coalesce(v_pct, 20);
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_name := left(trim(coalesce(v_item ->> 'name', '')), 120);
    if v_name = '' then raise exception 'Every line needs a description'; end if;
    v_kind := coalesce(v_item ->> 'kind', 'material');
    if v_kind not in ('material', 'labour', 'other') then raise exception 'Invalid line type on "%"', v_name; end if;

    begin
      v_qty   := (v_item ->> 'qty')::numeric;
      v_price := (v_item ->> 'price')::numeric;
      v_taxp  := coalesce((v_item ->> 'tax_percent')::numeric, 0);
    exception when others then
      raise exception 'Invalid number on line "%"', v_name;
    end;

    if v_qty is null or v_qty <= 0 or v_qty > 10000 then raise exception 'Quantity must be more than 0 on "%"', v_name; end if;
    if v_price is null or v_price < 0 or v_price > 10000000 then raise exception 'Invalid price on "%"', v_name; end if;
    if v_taxp < 0 or v_taxp > 28 then raise exception 'GST must be between 0 and 28 percent on "%"', v_name; end if;

    v_amount := round(v_qty * v_price, 2);
    v_tax    := round(v_amount * v_taxp / 100, 2);
    if v_kind = 'labour' then v_lab := v_lab + v_amount; else v_mat := v_mat + v_amount; end if;
    v_taxsum := v_taxsum + v_tax;

    v_clean := v_clean || jsonb_build_object(
      'name', v_name, 'kind', v_kind, 'qty', v_qty, 'price', v_price,
      'tax_percent', v_taxp, 'amount', v_amount, 'tax', v_tax);
  end loop;

  v_sub := v_mat + v_lab;
  if p_send and v_sub <= 0 then raise exception 'The bill must be more than zero before sending'; end if;
  v_service := round(v_sub * v_pct / 100, 2);
  v_total   := v_sub + v_taxsum + v_service;

  select business_name, gst_number into v_biz, v_gst
  from public.provider_applications
  where user_id = auth.uid() and status = 'approved'
  order by created_at desc limit 1;
  select coalesce(nullif(full_name, ''), email, '') into v_pname from public.profiles where id = auth.uid();

  -- A bill that was already sent stays sent (edits are visible to the customer straight away).
  v_status := case when p_send or (v_exists and v_bill.status = 'sent') then 'sent' else 'draft' end;

  if v_exists then
    update public.bills set
      provider_name = v_pname, business_name = v_biz, provider_gst = v_gst,
      items = v_clean, materials_subtotal = v_mat, labour_subtotal = v_lab, subtotal = v_sub,
      tax_total = v_taxsum, service_charge_percent = v_pct, service_charge = v_service,
      total = v_total, provider_earning = v_sub + v_taxsum,
      notes = nullif(trim(p_notes), ''), status = v_status,
      sent_at = case when v_status = 'sent' then coalesce(sent_at, now()) else null end,
      updated_at = now()
    where id = v_bill.id
    returning id into v_id;
  else
    insert into public.bills (
      booking_id, provider_id, customer_id, provider_name, business_name, provider_gst, items,
      materials_subtotal, labour_subtotal, subtotal, tax_total, service_charge_percent, service_charge,
      total, provider_earning, notes, status, sent_at)
    values (
      p_booking, auth.uid(), v_b.user_id, v_pname, v_biz, v_gst, v_clean,
      v_mat, v_lab, v_sub, v_taxsum, v_pct, v_service,
      v_total, v_sub + v_taxsum, nullif(trim(p_notes), ''), v_status,
      case when v_status = 'sent' then now() else null end)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.provider_delete_draft_bill(p_booking bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.bills
  where booking_id = p_booking and provider_id = auth.uid() and status = 'draft';
  if not found then raise exception 'Only draft bills can be deleted'; end if;
end;
$$;

-- Record that the customer has paid. Admin = collected by Kwickly; the assigned provider = collected
-- by the provider (cash / UPI in hand). That difference is used to settle the provider's balance.
create or replace function public.mark_bill_paid(p_booking bigint, p_method text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill      record;
  v_collector text;
begin
  if p_method not in ('cash', 'upi', 'card', 'bank_transfer', 'other') then raise exception 'Invalid payment method'; end if;

  select * into v_bill from public.bills where booking_id = p_booking;
  if not found then raise exception 'No bill for this booking'; end if;
  if v_bill.status <> 'sent' then raise exception 'Only a sent, unpaid bill can be marked as paid'; end if;

  if public.is_admin() then
    v_collector := 'platform';
  elsif v_bill.provider_id = auth.uid() then
    v_collector := 'provider';
  else
    raise exception 'You cannot change this bill';
  end if;

  update public.bills
  set status = 'paid', paid_method = p_method, collected_by = v_collector, paid_at = now(), updated_at = now()
  where id = v_bill.id;
end;
$$;

-- Providers cannot close a job while a half-written draft bill is open.
create or replace function public.provider_set_booking_status(p_booking bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider uuid;
  v_status   text;
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

  if p_status = 'completed' and exists (select 1 from public.bills where booking_id = p_booking and status = 'draft') then
    raise exception 'Send or delete the draft bill before completing this job';
  end if;

  update public.bookings set status = p_status where id = p_booking;
end;
$$;

-- ───────────────────────── 6. payouts ─────────────────────────
create table if not exists public.payouts (
  id           bigint generated always as identity primary key,
  provider_id  uuid not null references public.profiles (id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  method       text not null default 'bank_transfer',
  reference    text,
  note         text,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists payouts_provider_idx on public.payouts (provider_id);

alter table public.payouts enable row level security;
drop policy if exists "payouts: read own or admin" on public.payouts;
create policy "payouts: read own or admin" on public.payouts
  for select using (provider_id = auth.uid() or public.is_admin());

create or replace function public.admin_record_payout(p_provider uuid, p_amount numeric, p_method text, p_reference text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Only admins can record payouts'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payout amount must be more than 0'; end if;
  if not exists (select 1 from public.profiles where id = p_provider and role = 'provider') then
    raise exception 'Selected user is not a provider';
  end if;
  insert into public.payouts (provider_id, amount, method, reference, note)
  values (p_provider, p_amount, coalesce(nullif(trim(p_method), ''), 'bank_transfer'), nullif(trim(p_reference), ''), nullif(trim(p_note), ''));
end;
$$;

create or replace function public.admin_delete_payout(p_payout bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Only admins can delete payouts'; end if;
  delete from public.payouts where id = p_payout;
  if not found then raise exception 'Payout not found'; end if;
end;
$$;

-- ───────────────────────── 7. permissions ─────────────────────────
-- Money tables are written only through the functions above, never directly from the browser.
revoke insert, update, delete on public.platform_settings from anon, authenticated;
revoke insert, update, delete on public.bills             from anon, authenticated;
revoke insert, update, delete on public.payouts           from anon, authenticated;
revoke insert, update         on public.provider_items    from anon, authenticated;

grant select on public.platform_settings to anon, authenticated;
grant select on public.bills to authenticated;
grant select, delete on public.provider_items to authenticated;
grant select on public.payouts to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.admin_update_settings(integer, numeric)                           from public, anon;
revoke all on function public.admin_review_application(uuid, text, text)                        from public, anon;
revoke all on function public.provider_save_item(text, text, numeric, numeric)                  from public, anon;
revoke all on function public.provider_save_bill(bigint, jsonb, text, boolean)                  from public, anon;
revoke all on function public.provider_delete_draft_bill(bigint)                                from public, anon;
revoke all on function public.mark_bill_paid(bigint, text)                                      from public, anon;
revoke all on function public.provider_set_booking_status(bigint, text)                         from public, anon;
revoke all on function public.admin_record_payout(uuid, numeric, text, text, text)              from public, anon;
revoke all on function public.admin_delete_payout(bigint)                                       from public, anon;

grant execute on function public.admin_update_settings(integer, numeric)                        to authenticated;
grant execute on function public.admin_review_application(uuid, text, text)                     to authenticated;
grant execute on function public.provider_save_item(text, text, numeric, numeric)               to authenticated;
grant execute on function public.provider_save_bill(bigint, jsonb, text, boolean)               to authenticated;
grant execute on function public.provider_delete_draft_bill(bigint)                             to authenticated;
grant execute on function public.mark_bill_paid(bigint, text)                                   to authenticated;
grant execute on function public.provider_set_booking_status(bigint, text)                      to authenticated;
grant execute on function public.admin_record_payout(uuid, numeric, text, text, text)           to authenticated;
grant execute on function public.admin_delete_payout(bigint)                                    to authenticated;

-- ───────────────────────── 8. live updates ─────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.bills;
exception when duplicate_object then null; when undefined_object then null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table public.payouts;
exception when duplicate_object then null; when undefined_object then null;
end;
$$;
