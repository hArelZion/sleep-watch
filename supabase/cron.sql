-- Schedules for the edge functions. Run once in Supabase -> SQL Editor AFTER the functions are
-- deployed. Replace PROJECT_REF (from the project URL) and CRON_SECRET (the same random text you
-- set as the CRON_SECRET function secret).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname) from cron.job where jobname in ('sleep-sync', 'sleep-notify');

-- Check COROS for new data every 10 minutes between 05:00 and 01:00 Israel time.
select cron.schedule('sleep-sync', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/sync',
    headers := jsonb_build_object('x-cron-secret', 'CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb)
$$);

-- Send due reminders every 5 minutes.
select cron.schedule('sleep-notify', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('x-cron-secret', 'CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb)
$$);
