-- =============================================================================
--  ASPRO CONSTRUCTION — public testimonials + video uploads
--  -----------------------------------------------------------------------
--  HOW TO RUN THIS (about 30 seconds):
--    1. Open your Supabase project  ->  SQL Editor  ->  New query
--    2. Paste this whole file in
--    3. Click RUN
--
--  Safe to run more than once. It will NOT un-approve anything you have
--  already approved, and it only touches the "testimonials" table and the
--  "site-images" storage bucket.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Add the "approved" flag.
--    Anything already on the website stays visible; only NEW visitor
--    submissions start out as pending.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'testimonials'
      and column_name  = 'approved'
  ) then
    alter table public.testimonials
      add column approved boolean not null default false;

    -- Runs once, only on the very first run: keep the current site as-is.
    update public.testimonials set approved = true;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 2. Record when each testimonial arrived (handy for reviewing the queue).
-- -----------------------------------------------------------------------------
alter table public.testimonials
  add column if not exists submitted_at timestamptz not null default now();


-- -----------------------------------------------------------------------------
-- 3. Security rules.
--    Clear out any older rules on this table first, so there is exactly one
--    well-defined set and nothing quietly leaks pending submissions.
-- -----------------------------------------------------------------------------
alter table public.testimonials enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'testimonials'
  loop
    execute format('drop policy %I on public.testimonials', pol.policyname);
  end loop;
end $$;

-- Visitors can read ONLY approved testimonials.
create policy "testimonials_public_read_approved"
  on public.testimonials
  for select
  to anon
  using (approved = true);

-- Visitors can submit a testimonial, but cannot self-approve, and the text
-- has to look like a real testimonial. This is the spam guard.
create policy "testimonials_public_submit"
  on public.testimonials
  for insert
  to anon
  with check (
    approved = false
    and char_length(btrim(author)) between 2 and 80
    and char_length(btrim(quote))  between 10 and 2000
  );

-- You, signed in to /admin.html, can read, edit, approve and delete everything.
create policy "testimonials_staff_full_access"
  on public.testimonials
  for all
  to authenticated
  using (true)
  with check (true);


-- -----------------------------------------------------------------------------
-- 4. Let the media bucket accept videos as well as photos.
--    NOTE: Supabase enforces a hard 50 MB per-file cap on the Free plan.
--    If you upgrade, raise the number below AND raise maxVideoMB in config.js.
-- -----------------------------------------------------------------------------
update storage.buckets
set public             = true,
    file_size_limit    = 52428800,   -- 50 MB
    allowed_mime_types = null        -- null = allow any type (images + video)
where id = 'site-images';


-- -----------------------------------------------------------------------------
-- 5. Quick check — run this any time to see what's waiting for you.
-- -----------------------------------------------------------------------------
select
  count(*) filter (where approved)     as published,
  count(*) filter (where not approved) as pending_review
from public.testimonials;
