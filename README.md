# Almailgroup Task Management Portal

Projects, tasks and real-time collaboration for Almailgroup teams. Built with
Next.js (App Router), TypeScript, Tailwind CSS, Supabase and a deliberately
monochrome interface.

> **Status — Phase 1 complete.** The foundation (tooling, design system,
> Supabase wiring) is in place and builds clean. Phases 2–5 are outlined below.

## Stack

| Layer      | Choice                                                      |
| ---------- | ----------------------------------------------------------- |
| Framework  | Next.js 15.5 (App Router, React 19, TypeScript)              |
| Styling    | Tailwind CSS v4 (CSS-first `@theme` configuration)           |
| Components | shadcn-style primitives on Radix UI, `lucide-react` icons    |
| Typography | Geist Sans / Geist Mono via `next/font`                      |
| Backend    | Supabase — Postgres, Auth, Row Level Security, Realtime      |
| Deployment | Vercel                                                       |

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase credentials
npm run dev
```

Open http://localhost:3000. The landing page reports whether Supabase
credentials have been detected.

### Environment variables

| Variable                        | Purpose                                      |
| ------------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable anon key (safe for the browser)   |
| `NEXT_PUBLIC_SITE_URL`          | Base URL used for auth email redirect links   |

Both Supabase values come from **Project Settings → API** in the Supabase
dashboard. The `service_role` key is never used in this app — every table is
guarded by Row Level Security instead.

## Design system

The palette is strictly monochrome: pure white and pure black anchors with the
`zinc` ramp between them. No saturated hue is defined anywhere in
`src/app/globals.css`, so a stray coloured utility stands out immediately in
review.

- **Surfaces** — white on light, pure black page with `zinc-950` cards on dark.
- **Separation** — 1px `zinc-200` / `zinc-800` micro-borders rather than shadows.
- **Status & priority** — differentiated by fill weight, border and a four-bar
  severity ramp instead of colour. See `src/lib/constants.ts`.
- **Themes** — light/dark via `next-themes` (`class` strategy); all tokens are
  redefined under `.dark`.

Components live in `src/components/ui` and follow shadcn conventions, so
`components.json` is present and future components can be added in the same
style.

## Project structure

```
src/
├── app/
│   ├── (app)/dashboard/      # authenticated shell (Phase 4)
│   ├── (auth)/login/         # auth flows (Phase 3)
│   ├── globals.css           # monochrome design tokens
│   ├── layout.tsx            # fonts, theme provider, toaster
│   └── page.tsx              # foundation / setup page
├── components/
│   ├── theme/                # theme provider + toggle
│   └── ui/                   # Radix-based primitives
├── lib/
│   ├── constants.ts          # status, priority and role vocabulary
│   ├── supabase/
│   │   ├── client.ts         # browser client (Client Components, Realtime)
│   │   ├── server.ts         # server client (RSC, Actions, Route Handlers)
│   │   ├── middleware.ts     # session refresh + route protection
│   │   ├── database.types.ts # typed public schema
│   │   └── env.ts            # validated environment access
│   └── utils.ts              # cn() class merger
└── middleware.ts             # Next.js middleware entry
```

### How auth requests flow

`src/middleware.ts` runs on every non-static request and calls
`updateSession()`, which refreshes the Supabase session cookie and redirects
unauthenticated visitors to `/login` (preserving the intended destination in a
`next` query parameter). Signed-in users hitting `/login` or `/register` are
sent to `/dashboard`.

Until Supabase credentials are present the middleware passes requests through
untouched, so the app still runs on a fresh clone.

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

## Database schema

The typed schema in `src/lib/supabase/database.types.ts` describes the tables
the SQL migrations will create in Phase 2:

- `profiles` — id, email, full_name, avatar_url, role, created_at
- `projects` — id, name, description, created_by, created_at
- `tasks` — id, project_id, title, description, status, priority, due_date,
  created_by, created_at
- `task_assignments` — task_id, user_id
- `comments` — id, task_id, user_id, content, created_at

Enums: `user_role` (admin, manager, member), `task_status` (todo, in_progress,
in_review, done), `task_priority` (low, medium, high, urgent).

Regenerate the types once migrations are applied:

```bash
npx supabase gen types typescript --project-id <ref> --schema public \
  > src/lib/supabase/database.types.ts
```

## Deploying to Vercel

1. Import the repository into Vercel — Next.js is detected automatically.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `NEXT_PUBLIC_SITE_URL` under **Settings → Environment Variables**.
3. Add your production URL to Supabase under **Authentication → URL
   Configuration → Redirect URLs**.

`vercel.json` pins the framework, build/install commands and region.

## Roadmap

- **Phase 1 — Foundation.** ✅ Tooling, monochrome design system, typography,
  UI primitives, Supabase clients and route protection.
- **Phase 2 — Database.** SQL migrations: schema, enums, indexes, the
  `profiles` trigger on signup, and Row Level Security policies.
- **Phase 3 — Auth & shell.** Email/password sign-in and registration, sidebar
  and header navigation, profile management.
- **Phase 4 — Projects & tasks.** Project CRUD with workspace switching, the
  Kanban board (drag and drop) and the filterable task table.
- **Phase 5 — Realtime.** Live comment threads with @mentions, live task
  updates, and the dashboard metric cards.
