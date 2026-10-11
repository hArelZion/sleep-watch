-- Sleep Watch: tables, access rules and the alarm feed for iOS Shortcuts.
-- Paste all of this into Supabase -> SQL Editor -> New query, then press Run.
-- Only the owner email below can read or write from the phone app.
-- The daily job (GitHub Actions) uses the secret key, which bypasses these rules.

-- Nights from COROS, one row per wake-up date. data = parsed fields (score, sleep_min, onset...).
create table if not exists public.nights (
  date        date primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Morning questionnaire: how you slept / how you woke up, 1-10 in half steps.
create table if not exists public.ratings (
  date        date primary key,               -- wake-up date
  slept       numeric(3,1) check (slept between 1 and 10 and slept * 2 = round(slept * 2)),
  woke        numeric(3,1) check (woke between 1 and 10 and woke * 2 = round(woke * 2)),
  note        text,
  created_at  timestamptz not null default now()
);

-- Key/value rows: 'settings' (alarms, deadlines, profile), 'model' (written by the daily job),
-- 'coros_auth' (login tokens; never readable from the phone).
create table if not exists public.control (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Tonight's plan (and history of plans), keyed by the evening the night starts.
create table if not exists public.plans (
  night_of    date primary key,
  data        jsonb not null,
  source      text not null default 'job',    -- 'job' or 'app' (re-planned after a change)
  updated_at  timestamptz not null default now()
);

alter table public.nights  enable row level security;
alter table public.ratings enable row level security;
alter table public.control enable row level security;
alter table public.plans   enable row level security;

drop policy if exists "owner reads nights" on public.nights;
create policy "owner reads nights" on public.nights
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com');

drop policy if exists "owner ratings" on public.ratings;
create policy "owner ratings" on public.ratings
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com');

drop policy if exists "owner plans" on public.plans;
create policy "owner plans" on public.plans
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com');

-- The phone may read/write settings and read the model, but never the COROS tokens.
drop policy if exists "owner control" on public.control;
create policy "owner control" on public.control
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com' and id in ('settings', 'model', 'insights', 'live'));
drop policy if exists "owner settings write" on public.control;
create policy "owner settings write" on public.control
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com' and id = 'settings')
  with check ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com' and id = 'settings');

-- ---- fitness, tennis, calendar, notifications ------------------------------------------------

-- Workouts from COROS (data: sport, times, HR, calories, load, FIT summary with HR curve, zones, court map).
create table if not exists public.activities (
  label_id    text primary key,
  date        date not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create index if not exists activities_date_idx on public.activities (date desc);

-- Daily COROS snapshot: VO2max, threshold pace, race predictions, recovery, training load.
create table if not exists public.fitness_daily (
  date        date primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Your notes on a workout: rating 1-10, and for tennis: type, format, result, score, partner.
create table if not exists public.activity_logs (
  label_id    text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Calendar: tennis matches and planned workouts. reminders = minutes before start.
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'tennis' check (kind in ('tennis', 'workout', 'other')),
  title       text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  level       text,                            -- 'קל' / 'בינוני' / 'קשה'
  data        jsonb not null default '{}'::jsonb, -- partner, format, notes, watch workout
  reminders   int[] not null default '{120,60}',
  created_at  timestamptz not null default now()
);
create index if not exists events_start_idx on public.events (starts_at);

-- Web push subscriptions of the phone (one per installed app).
create table if not exists public.push_subs (
  endpoint    text primary key,
  sub         jsonb not null,
  created_at  timestamptz not null default now()
);

-- Notifications already sent (so each one goes out once).
create table if not exists public.sent (
  id          text primary key,
  title       text,
  body        text,
  sent_at     timestamptz not null default now()
);

alter table public.activities    enable row level security;
alter table public.fitness_daily enable row level security;
alter table public.activity_logs enable row level security;
alter table public.events        enable row level security;
alter table public.push_subs     enable row level security;
alter table public.sent          enable row level security;

drop policy if exists "owner reads activities" on public.activities;
create policy "owner reads activities" on public.activities for select to authenticated
  using ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com');
drop policy if exists "owner reads fitness" on public.fitness_daily;
create policy "owner reads fitness" on public.fitness_daily for select to authenticated
  using ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com');
drop policy if exists "owner reads sent" on public.sent;
create policy "owner reads sent" on public.sent for select to authenticated
  using ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com');
drop policy if exists "owner logs" on public.activity_logs;
create policy "owner logs" on public.activity_logs for all to authenticated
  using ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com');
drop policy if exists "owner events" on public.events;
create policy "owner events" on public.events for all to authenticated
  using ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com');
drop policy if exists "owner push" on public.push_subs;
create policy "owner push" on public.push_subs for all to authenticated
  using ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'harelzionk@gmail.com');

-- Live updates in the app when the cloud writes new data.
do $$
begin
  begin alter publication supabase_realtime add table public.control;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.activities; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.nights;     exception when duplicate_object then null; end;
end $$;

-- Alarm feed for the iOS Shortcut. The Shortcut cannot log in, so it passes a long secret
-- (settings.data.feed_token, created by the app). Returns only tonight's alarm times.
create or replace function public.alarm_feed(token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'night_of',      p.night_of,
    'wake',          p.data ->> 'wake',
    'bed_reminder',  p.data ->> 'bed_reminder',
    'lights_out',    p.data ->> 'lights_out',
    'wake_enabled',  coalesce((s.data -> 'alarms' ->> 'wake')::boolean, true),
    'bed_enabled',   coalesce((s.data -> 'alarms' ->> 'bed')::boolean, true),
    'morning_enabled', coalesce((s.data -> 'alarms' ->> 'morning')::boolean, true)
  )
  from public.control s
  join public.plans p on true
  where s.id = 'settings'
    and length(token) >= 32
    and s.data ->> 'feed_token' = token
  order by p.night_of desc
  limit 1
$$;
revoke all on function public.alarm_feed(text) from public;
grant execute on function public.alarm_feed(text) to anon, authenticated;

-- Home-screen widget (Scriptable): tonight's times, readiness, today's training, next event.
create or replace function public.widget_feed(token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'lights_out', (select p.data ->> 'lights_out' from public.plans p order by p.night_of desc limit 1),
    'wake',       (select p.data ->> 'wake' from public.plans p order by p.night_of desc limit 1),
    'predicted',  (select p.data ->> 'predicted_score' from public.plans p order by p.night_of desc limit 1),
    'readiness',  i.data -> 'readiness' ->> 'score',
    'ready_label', i.data -> 'readiness' ->> 'label',
    'training',   i.data -> 'training' ->> 'level_he',
    'insights_date', i.data ->> 'date',
    'next_event', (select jsonb_build_object('title', e.title, 'starts_at', e.starts_at)
                   from public.events e where e.starts_at > now() order by e.starts_at limit 1)
  )
  from public.control s
  left join public.control i on i.id = 'insights'
  where s.id = 'settings'
    and length(token) >= 32
    and s.data ->> 'feed_token' = token
$$;
revoke all on function public.widget_feed(text) from public;
grant execute on function public.widget_feed(text) to anon, authenticated;
