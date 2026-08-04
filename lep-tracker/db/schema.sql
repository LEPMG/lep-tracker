-- ===========================================================================
-- LEP Tracker — database schema
-- Paste this whole file into the Supabase SQL Editor (or run with psql) to
-- create every table. Safe to re-run: it only creates things if missing.
-- ===========================================================================

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ---------- enums ----------------------------------------------------------
do $$ begin
  create type role as enum ('FIELD','ADMIN','MGMT_RW','MGMT_RO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type well_status as enum ('UP','DOWN','SHUT_IN','INACTIVE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tank_type as enum ('OIL','WATER','GAS_COND');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_type as enum ('OIL_SALE','WATER_HAUL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type downtime_status as enum ('OPEN','RESOLVED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type wo_status as enum ('OPEN','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type priority as enum ('LOW','MEDIUM','HIGH','URGENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cost_category as enum ('LABOR','EQUIPMENT','CHEMICAL','TRUCKING','ELECTRICAL','RENTAL','OTHER');
exception when duplicate_object then null; end $$;

-- ---------- users ----------------------------------------------------------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  name          text not null,
  password_hash text not null,
  role          role not null default 'FIELD',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- batteries ------------------------------------------------------
create table if not exists batteries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text unique,
  field      text,
  county     text,
  state      text,
  active     boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- wells ----------------------------------------------------------
create table if not exists wells (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  api_number  text unique,
  battery_id  uuid references batteries(id) on delete set null,
  status      well_status not null default 'UP',
  field       text,
  county      text,
  state       text,
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_wells_battery on wells(battery_id);
create index if not exists idx_wells_status on wells(status);

-- ---------- tanks ----------------------------------------------------------
create table if not exists tanks (
  id            uuid primary key default gen_random_uuid(),
  battery_id    uuid not null references batteries(id) on delete cascade,
  name          text not null,
  type          tank_type not null,
  size_bbls     double precision,
  height_inch   double precision,
  bbls_per_inch double precision not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_tanks_battery on tanks(battery_id);

-- ---------- gauge readings -------------------------------------------------
create table if not exists gauge_readings (
  id           uuid primary key default gen_random_uuid(),
  battery_id   uuid not null references batteries(id) on delete cascade,
  reading_date date not null,
  gauged_by_id uuid references users(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (battery_id, reading_date)
);
create index if not exists idx_gauge_battery_date on gauge_readings(battery_id, reading_date);

create table if not exists tank_readings (
  id               uuid primary key default gen_random_uuid(),
  gauge_reading_id uuid not null references gauge_readings(id) on delete cascade,
  tank_id          uuid not null references tanks(id) on delete cascade,
  feet             integer not null default 0,
  inches           double precision not null default 0,
  total_inches     double precision not null,
  barrels          double precision not null
);
create index if not exists idx_tank_readings_tank on tank_readings(tank_id);

-- ---------- run tickets (oil sales / water hauls) --------------------------
create table if not exists run_tickets (
  id            uuid primary key default gen_random_uuid(),
  battery_id    uuid not null references batteries(id) on delete cascade,
  ticket_date   date not null,
  type          ticket_type not null default 'OIL_SALE',
  gross_bbls    double precision not null,
  net_bbls      double precision,
  bsw           double precision,
  gravity_api   double precision,
  price_per_bbl double precision,
  ticket_number text,
  hauler        text,
  recorded_by_id uuid references users(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_run_tickets_battery_date on run_tickets(battery_id, ticket_date);

-- ---------- downtime events ------------------------------------------------
create table if not exists downtime_events (
  id           uuid primary key default gen_random_uuid(),
  well_id      uuid references wells(id) on delete set null,
  battery_id   uuid references batteries(id) on delete set null,
  status       downtime_status not null default 'OPEN',
  reason       text not null,
  category     text,
  start_at     timestamptz not null,
  end_at       timestamptz,
  est_bopd_loss double precision,
  owner_id     uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_downtime_status on downtime_events(status);
create index if not exists idx_downtime_well on downtime_events(well_id);

-- ---------- work orders ----------------------------------------------------
create sequence if not exists work_order_number_seq;
create table if not exists work_orders (
  id           uuid primary key default gen_random_uuid(),
  number       integer unique not null default nextval('work_order_number_seq'),
  title        text not null,
  description  text,
  status       wo_status not null default 'OPEN',
  priority     priority not null default 'MEDIUM',
  well_id      uuid references wells(id) on delete set null,
  battery_id   uuid references batteries(id) on delete set null,
  downtime_id  uuid references downtime_events(id) on delete set null,
  assigned_to_id uuid references users(id) on delete set null,
  created_by_id  uuid references users(id) on delete set null,
  vendor_id    uuid, -- FK added after vendors table is created (see bottom)
  due_date     timestamptz,
  completed_at timestamptz,
  est_cost     double precision,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_wo_status on work_orders(status);
create index if not exists idx_wo_well on work_orders(well_id);
create index if not exists idx_wo_battery on work_orders(battery_id);

-- vendors referenced above; create before work_orders in practice. Postgres
-- allows the forward reference only if vendors exists, so we create vendors
-- first at runtime (setup script orders this). For a raw paste, vendors is
-- defined below and the FK is added afterward.

-- ---------- vendors --------------------------------------------------------
create table if not exists vendors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  service    text,
  contact    text,
  phone      text,
  email      text,
  active     boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- action items ---------------------------------------------------
create table if not exists action_items (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  text          text not null,
  done          boolean not null default false,
  owner_id      uuid references users(id) on delete set null,
  due_date      timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_action_wo on action_items(work_order_id);

-- ---------- cost entries ---------------------------------------------------
create table if not exists cost_entries (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid references work_orders(id) on delete set null,
  vendor_id     uuid references vendors(id) on delete set null,
  category      cost_category not null default 'OTHER',
  description   text,
  amount        double precision not null,
  cost_date     date not null,
  invoice_no    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_cost_wo on cost_entries(work_order_id);
create index if not exists idx_cost_vendor on cost_entries(vendor_id);

-- ---------- comments -------------------------------------------------------
create table if not exists comments (
  id            uuid primary key default gen_random_uuid(),
  body          text not null,
  author_id     uuid references users(id) on delete set null,
  work_order_id uuid references work_orders(id) on delete cascade,
  downtime_id   uuid references downtime_events(id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- Add the work_orders -> vendors FK if it wasn't created above (raw-paste order).
do $$ begin
  alter table work_orders
    add constraint work_orders_vendor_fk
    foreign key (vendor_id) references vendors(id) on delete set null;
exception when duplicate_object then null; end $$;
