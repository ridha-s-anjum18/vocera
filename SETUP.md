# Vocera — Setup & Deployment Guide

Architecture: this build talks to Supabase directly from the browser (no
custom backend server). Customers never sign in — a random session id in
`localStorage` groups their 5 recordings. Admins sign in with Supabase Auth
(email/password) to review, play back, and delete recordings, or download a
session as a zip.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Once it's up, go to **Project Settings → API** and copy:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`

## 2. Run the schema

Open **SQL Editor** in the Supabase dashboard, paste the contents of
`supabase/schema.sql`, and run it. This creates:

- `public.recordings` table (session_id, phrase_id, phrase_text, file_path, duration, created_at)
- Row Level Security policies (anon can insert/read; only signed-in admins can delete or list everything)
- A **private** `recordings` storage bucket with matching storage policies

## 3. Create your admin account

Supabase Auth doesn't have public sign-up enabled here — you create the one
admin user by hand:

1. Dashboard → **Authentication → Users → Add user**.
2. Enter the admin's email + a password, and set **Auto Confirm User** to on.
3. That's the login for `/login/admin`.

(Want more than one admin later? Just add more users the same way — the RLS
policies already treat every authenticated user as an admin.)

## 4. Configure the app locally

```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

npm install
npm run dev -- --host 127.0.0.1
```

- Customer flow: `http://127.0.0.1:5173/`
- Admin login: `http://127.0.0.1:5173/login/admin`
- Admin dashboard: `http://127.0.0.1:5173/admin`

## 5. Deploy

Any static host works since it's a Vite SPA. Vercel is the path of least
resistance:

1. Push this project to a GitHub repo.
2. [vercel.com](https://vercel.com) → **New Project** → import the repo.
3. Framework preset: **Vite**. Build command `npm run build`, output dir `dist`.
4. Add the two env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in
   **Project Settings → Environment Variables**.
5. Deploy. Because this is a client-side router (`react-router-dom`), add a
   rewrite so deep links like `/admin/sessions/xyz` don't 404 on refresh —
   Vercel does this automatically for Vite/SPA presets; if you use Netlify,
   add a `public/_redirects` file containing:
   ```
   /*  /index.html  200
   ```

That's it — no server to run, no Dockerfile, no cron jobs.

## Notes on scope vs. the original PRD

The PRD describes full customer accounts (JWT, bcrypt, `/login/customer`)
and a custom Express-style backend. The frontend you uploaded (`VoiceRecorderPage.tsx`)
was already built against a simpler **no-account, session-based** model —
that's what this backend matches, since it's what your actual UI expects.
If you want real customer accounts later, swap the local `session_id` for
`supabase.auth.getUser().id` and tighten the `recordings` SELECT policy to
`using (auth.uid()::text = session_id)`.

**Security note on the current RLS:** anonymous read access to `recordings`
is intentionally permissive (see comments in `schema.sql`) — the session id
itself is the only thing gating access, the way an unlisted share link
works. That's fine for an FYP demo with non-sensitive placeholder phrases,
but if this ever handles real user data, add real customer auth instead.

## What's included

```
src/
  lib/
    supabase.ts       Supabase client
    phrases.ts         the 5 phrases + timing constants
    utils.ts           cn(), formatDate() (as uploaded)
  services/
    api.ts              customer-side: session + upload + fetch
    adminApi.ts         admin-side: auth, list, signed URLs, delete, zip
  pages/
    VoiceRecorderPage.tsx     (as uploaded, unmodified logic)
    AdminLoginPage.tsx
    AdminSessionsPage.tsx
    AdminSessionDetailPage.tsx
  components/
    RequireAdminAuth.tsx      route guard
    ui/                       button, checkbox, separator, input
supabase/
  schema.sql            run this once in the SQL editor
```
