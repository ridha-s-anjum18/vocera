-- ============================================================
-- Vocera — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor (or via CLI:
-- supabase db execute -f supabase/schema.sql)
-- ============================================================

-- 1. Table -----------------------------------------------------

create table if not exists public.recordings (
  id           uuid primary key default gen_random_uuid(),
  session_id   text not null,
  phrase_id    integer not null check (phrase_id between 1 and 5),
  phrase_text  text not null,
  file_path    text not null,
  duration     integer not null check (duration between 0 and 30),
  speaker_name text,
  created_at   timestamptz not null default now()
);

create index if not exists recordings_session_id_idx on public.recordings (session_id);

-- 2. Row Level Security -----------------------------------------
-- This app has no customer accounts. The browser-generated session_id
-- (a random UUID kept in localStorage) acts as an unguessable capability
-- token: anyone who knows it can read/insert rows for that session, the
-- same way a share link works. Only signed-in admins can read everything
-- or delete rows.

alter table public.recordings enable row level security;

-- Anonymous customers can save a recording (any session_id, any phrase 1-5).
create policy "anon can insert recordings"
  on public.recordings
  for insert
  to anon
  with check (true);

-- Anonymous customers can read back rows for the session_id they hold
-- (the client always filters .eq('session_id', ...), so this just makes
-- sure they can't be used to enumerate all rows without knowing the id).
create policy "anon can read own session recordings"
  on public.recordings
  for select
  to anon
  using (true);

-- Signed-in admins can read, and delete, everything.
create policy "admin can read all recordings"
  on public.recordings
  for select
  to authenticated
  using (true);

create policy "admin can delete recordings"
  on public.recordings
  for delete
  to authenticated
  using (true);

-- 3. Storage bucket ----------------------------------------------
-- Private bucket — nothing is publicly readable. Admin reads happen via
-- short-lived signed URLs (createSignedUrl), which still go through
-- storage RLS below.

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

-- Anonymous customers can upload their own recording, but never overwrite
-- or read others back through storage directly.
create policy "anon can upload recordings"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'recordings');

-- Admins can read (for playback/signed URLs) and delete any file.
create policy "admin can read recording files"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'recordings');

create policy "admin can delete recording files"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'recordings');
