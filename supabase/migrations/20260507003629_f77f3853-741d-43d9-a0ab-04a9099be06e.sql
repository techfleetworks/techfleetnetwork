create table if not exists public.web_vital_samples (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  metric_name text not null check (metric_name in ('LCP','INP','CLS','FCP','TTFB','FID')),
  value double precision not null check (value >= 0 and value < 600000),
  rating text not null check (rating in ('good','needs-improvement','poor')),
  route text not null check (length(route) <= 256),
  navigation_type text check (navigation_type in ('navigate','reload','back-forward','back-forward-cache','prerender','restore')),
  connection_type text check (length(connection_type) <= 32),
  save_data boolean,
  device_memory double precision,
  viewport_w int check (viewport_w is null or (viewport_w between 0 and 16384)),
  viewport_h int check (viewport_h is null or (viewport_h between 0 and 16384)),
  user_agent text check (length(user_agent) <= 512)
);

create index if not exists web_vital_samples_created_at_metric_idx
  on public.web_vital_samples (created_at desc, metric_name);

create index if not exists web_vital_samples_route_metric_idx
  on public.web_vital_samples (route, metric_name, created_at desc);

alter table public.web_vital_samples enable row level security;

revoke all on public.web_vital_samples from anon, authenticated;

create policy "Admins read web vitals"
  on public.web_vital_samples
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

comment on table public.web_vital_samples is
  'Real User Monitoring (RUM): per-pageview Core Web Vitals samples, written by the record-web-vital edge function only. 7-day retention.';

create or replace function public.web_vitals_p75(window_hours int default 24)
returns table (
  route text,
  metric_name text,
  sample_count bigint,
  p75 double precision,
  p95 double precision,
  good_pct double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    route,
    metric_name,
    count(*)::bigint as sample_count,
    percentile_cont(0.75) within group (order by value)::double precision as p75,
    percentile_cont(0.95) within group (order by value)::double precision as p95,
    (count(*) filter (where rating = 'good'))::double precision
      / nullif(count(*),0)::double precision * 100 as good_pct
  from public.web_vital_samples
  where created_at >= now() - make_interval(hours => greatest(window_hours, 1))
  group by route, metric_name
  having count(*) >= 5
  order by route, metric_name;
$$;

revoke all on function public.web_vitals_p75(int) from anon, authenticated;
grant execute on function public.web_vitals_p75(int) to authenticated;

create or replace function public.web_vitals_trend(window_hours int default 24)
returns table (
  metric_name text,
  bucket timestamptz,
  p75 double precision,
  sample_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    metric_name,
    date_trunc('hour', created_at) as bucket,
    percentile_cont(0.75) within group (order by value)::double precision as p75,
    count(*)::bigint as sample_count
  from public.web_vital_samples
  where created_at >= now() - make_interval(hours => greatest(window_hours, 1))
  group by metric_name, bucket
  order by metric_name, bucket;
$$;

revoke all on function public.web_vitals_trend(int) from anon, authenticated;
grant execute on function public.web_vitals_trend(int) to authenticated;