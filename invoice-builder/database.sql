-- Run once in Supabase SQL Editor. Private, user-owned invoice/payment history.
create extension if not exists pgcrypto;

create table if not exists public.personal_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null,
  currency text not null check (currency in ('GBP','EUR','USD','CAD')),
  total numeric(14,2) not null default 0 check (total >= 0),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_invoices_user_number_key unique (user_id,invoice_number),
  constraint personal_invoices_id_user_key unique (id,user_id)
);
create index if not exists personal_invoices_user_date_idx
  on public.personal_invoices (user_id,updated_at desc);

create table if not exists public.personal_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('GBP','EUR','USD','CAD')),
  paid_on date not null,
  method text not null default 'Bank transfer',
  reference text not null default '',
  created_at timestamptz not null default now(),
  constraint personal_payments_invoice_owner_fk
    foreign key (invoice_id,user_id)
    references public.personal_invoices(id,user_id) on delete restrict
);
create index if not exists personal_payments_user_invoice_idx
  on public.personal_payments (user_id,invoice_id,paid_on desc);

create or replace function public.personal_invoice_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists personal_invoice_updated_at on public.personal_invoices;
create trigger personal_invoice_updated_at
before update on public.personal_invoices
for each row execute function public.personal_invoice_touch();

-- Prevent recording a payment under a different currency from the invoice.
create or replace function public.personal_payment_currency_guard()
returns trigger language plpgsql set search_path = '' as $$
declare invoice_currency text;
begin
  select currency into invoice_currency
    from public.personal_invoices
    where id = new.invoice_id and user_id = new.user_id;
  if invoice_currency is null or invoice_currency <> new.currency then
    raise exception 'Payment currency must equal invoice currency';
  end if;
  return new;
end;
$$;
drop trigger if exists personal_payment_currency_check on public.personal_payments;
create trigger personal_payment_currency_check
before insert on public.personal_payments
for each row execute function public.personal_payment_currency_guard();

create or replace function public.personal_invoice_currency_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.currency <> old.currency and exists (
    select 1 from public.personal_payments
    where invoice_id = old.id and user_id = old.user_id
  ) then
    raise exception 'Cannot change currency after a payment is recorded';
  end if;
  return new;
end;
$$;
drop trigger if exists personal_invoice_currency_check on public.personal_invoices;
create trigger personal_invoice_currency_check
before update of currency on public.personal_invoices
for each row execute function public.personal_invoice_currency_guard();

alter table public.personal_invoices enable row level security;
alter table public.personal_payments enable row level security;

drop policy if exists "read own invoices" on public.personal_invoices;
create policy "read own invoices" on public.personal_invoices
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "create own invoices" on public.personal_invoices;
create policy "create own invoices" on public.personal_invoices
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "edit own invoices" on public.personal_invoices;
create policy "edit own invoices" on public.personal_invoices
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "read own payments" on public.personal_payments;
create policy "read own payments" on public.personal_payments
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "record own payments" on public.personal_payments;
create policy "record own payments" on public.personal_payments
for insert to authenticated with check ((select auth.uid()) = user_id);

-- Keep financial records: no browser-side delete or mutation of payment entries.
revoke all on public.personal_invoices from anon;
revoke all on public.personal_payments from anon;
grant select, insert, update on public.personal_invoices to authenticated;
revoke delete on public.personal_invoices from authenticated;
grant select, insert on public.personal_payments to authenticated;
revoke update, delete on public.personal_payments from authenticated;
