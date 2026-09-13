# Almailgroup Task Management Portal

Projects, tasks and real-time collaboration for Almailgroup teams. Built with
Next.js (App Router), TypeScript, Tailwind CSS, Supabase and a deliberately
monochrome interface.

**All five phases are complete.** The app is ready to deploy — see
[Deploying to Vercel](#deploying-to-vercel).

## Stack

| Layer      | Choice                                                     |
| ---------- | ---------------------------------------------------------- |
| Framework  | Next.js 15.5 (App Router, React 19, TypeScript)             |
| Styling    | Tailwind CSS v4 (CSS-first `@theme` configuration)          |
| Components | shadcn-style primitives on Radix UI, `lucide-react` icons   |
| Typography | Geist Sans / Geist Mono via `next/font`                     |
| Backend    | Supabase — Postgres, Auth, Row Level Security, Realtime     |
| Drag/drop  | `@dnd-kit` (pointer + keyboard sensors)                     |
| Deployment | Vercel                                                      |

## Features

- **Auth** — email/password sign-in and registration, email confirmation,
  profile management. The first account to register becomes the admin.
- **Roles** — Admin, Manager, Team Member, enforced in the database.
- **Projects** — multi-project workspace with a switcher; create, edit, delete.
- **Tasks** — title, description, priority (Low/Medium/High/Urgent), status
  (To Do/In Progress/In Review/Done), due date, multiple assignees.
- **Kanban board** — drag and drop between and within columns, keyboard
  accessible, with order persisted.
- **List view** — filter by search, status, priority and assignee.
- **Audit history** — every task change recorded by database triggers.
- **Realtime** — live comment threads and live task updates.
- **@mentions** — autocomplete in the comment box.
- **Dashboard** — completed vs pending, overdue, due today, overall progress,
  your assigned work, items needing attention, and per-user workload.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase credentials
npm run dev
```

Open http://localhost:3000. Until credentials are present the app serves the
landing page with a setup checklist, and authenticated routes redirect there
rather than erroring.

### 1. Create the Supabase project

Create a project at [supabase.com](https://supabase.com), then copy the values
from **Project Settings → API** into `.env.local`:

| Variable                        | Purpose                                     |
| ------------------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable anon key (safe for the browser)  |
| `NEXT_PUBLIC_SITE_URL`          | Base URL, used for auth email redirect links |

The `service_role` key is **never** used by this app. Every table is guarded by
Row Level Security instead, so the browser only ever holds a powerless key.

### 2. Apply the migrations

Either paste each file in `supabase/migrations/` into the Supabase SQL editor in
filename order, or use the CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

| Migration                         | Contents                                     |
| --------------------------------- | -------------------------------------------- |
| `…0001_initial_schema.sql`        | Enums, tables, constraints, indexes           |
| `…0002_functions_and_triggers.sql`| Auth helpers, signup hook, audit triggers     |
| `…0003_row_level_security.sql`    | RLS policies and table grants                 |
| `…0004_realtime.sql`              | Realtime publication, replica identity        |
| `…0005_protect_last_admin.sql`    | Prevents locking out the last admin           |

### 3. Register the first user

Visit `/register`. **The first account created becomes the admin**, so a fresh
deployment is never locked out of project creation. Everyone after that joins as
a Team Member; an admin can change roles on `/team`.

## Authorisation model

This is a single-tenant internal portal, so every signed-in employee can **read**
the whole workspace — that is what makes project switching, assignee pickers and
@mentions work. **Writes** are what the roles gate:

| Action                        | Admin | Manager        | Team Member            |
| ----------------------------- | :---: | :------------: | :--------------------: |
| Create / edit projects        |  yes  | yes            | no                     |
| Delete a project              |  yes  | own projects   | no                     |
| Create tasks                  |  yes  | yes            | yes                    |
| Edit / delete any task        |  yes  | yes            | own or assigned only   |
| Comment                       |  yes  | yes            | yes                    |
| Delete others' comments       |  yes  | no             | no                     |
| Change roles                  |  yes  | no             | no                     |

Notes on how this is enforced:

- RLS is **enabled and forced** on all six tables, so a mistake in a
  `SECURITY DEFINER` function cannot quietly grant unrestricted access.
- Reads require both the `authenticated` role **and** a JWT subject. The `anon`
  role is granted nothing — there is no public read surface.
- Server Actions do **not** re-check roles. They let the database reject the
  write and translate the error, so there is exactly one source of truth.
- `task_activity` has a SELECT policy and no write policies or write grants,
  which is what makes the audit log genuinely append-only.
- Users can edit their own name and avatar but not their role: a trigger blocks
  self-promotion, and another prevents removing the last admin.

## Design system

The palette is strictly monochrome: pure white and pure black anchors with the
`zinc` ramp between them. No saturated hue is defined anywhere in
`src/app/globals.css` — a palette audit of the compiled CSS finds only neutrals
and black-alpha scrims.

- **Surfaces** — white on light; pure black page with `zinc-950` cards on dark.
- **Separation** — 1px `zinc-200` / `zinc-800` micro-borders rather than shadows.
- **Status** — differentiated by badge fill weight, not colour.
- **Priority** — a four-bar greyscale severity ramp.
- **Overdue** — weight plus a dotted underline rather than red.
- **Themes** — light/dark via `next-themes`; all tokens redefined under `.dark`.

## Project structure

```
src/
├── app/
│   ├── (app)/                  # authenticated shell
│   │   ├── dashboard/          # metrics
│   │   ├── projects/[id]/      # board + list workspace
│   │   ├── profile/
│   │   └── team/               # roster, admin role management
│   ├── (auth)/                 # login, register
│   ├── auth/callback/          # email confirmation exchange
│   ├── error.tsx, not-found.tsx
│   ├── globals.css             # monochrome design tokens
│   └── layout.tsx              # fonts, theme provider, toaster
├── components/
│   ├── auth/  dashboard/  layout/  profile/  projects/
│   ├── tasks/                  # board, table, dialog, comments, mentions
│   ├── theme/                  # provider + toggle
│   └── ui/                     # Radix-based primitives
├── lib/
│   ├── action-result.ts        # typed Server Action results
│   ├── constants.ts            # status, priority, role vocabulary
│   ├── mentions.tsx            # @mention parsing and rendering
│   ├── metrics.ts              # dashboard aggregation
│   ├── validation.ts           # zod schemas
│   ├── data/                   # queries + Server Actions
│   ├── realtime/               # live task subscription
│   └── supabase/               # clients, types, session middleware
└── middleware.ts
```

### How a request flows

1. `src/middleware.ts` runs on every non-static request and calls
   `updateSession()`, which refreshes the Supabase session cookie.
2. Unauthenticated visitors to a private route are redirected to `/login` with
   the intended destination preserved in `?next=`. Only relative single-slash
   paths are accepted back, so this cannot become an open redirect.
3. The `(app)` layout calls `requireProfile()`, a second gate behind the
   middleware.
4. Page queries run as the signed-in user, so RLS — not application code —
   decides what comes back.

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

Regenerate database types after changing the schema:

```bash
npx supabase gen types typescript --project-id <ref> --schema public \
  > src/lib/supabase/database.types.ts
```

## Database schema

- `profiles` — id, email, full_name, avatar_url, role, created_at, updated_at
- `projects` — id, name, description, created_by, created_at, updated_at
- `tasks` — id, project_id, title, description, status, priority, due_date,
  position, created_by, created_at, updated_at
- `task_assignments` — task_id, user_id, assigned_at
- `comments` — id, task_id, user_id, content, created_at, updated_at
- `task_activity` — id, task_id, actor_id, action, field, old_value, new_value,
  created_at

Enums: `user_role` (admin, manager, member), `task_status` (todo, in_progress,
in_review, done), `task_priority` (low, medium, high, urgent).

Three additions beyond the original blueprint, each required by a requested
feature:

- **`task_activity`** — the task audit history has to be stored somewhere, and
  triggers writing it are what make the log tamper-resistant.
- **`tasks.position`** — Kanban drag-and-drop needs a persistable order. Cards
  are placed at the midpoint between their neighbours, so one drag rewrites
  exactly one row.
- **`updated_at`** — maintained by trigger, used for ordering and staleness.

`created_by` and `comments.user_id` are nullable with `ON DELETE SET NULL`, so
offboarding a user never cascades away their projects, tasks or comment threads.

## Deploying to Vercel

1. **Apply the migrations** to your Supabase project (see above) — do this
   first, or the deployed app will have nothing to talk to.
2. **Import the repository** at [vercel.com/new](https://vercel.com/new).
   Next.js is detected automatically; `vercel.json` pins the framework, build
   and install commands, and region.
3. **Add environment variables** under **Settings → Environment Variables**, for
   Production *and* Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` — your deployment URL, e.g.
     `https://almailgroup-tasks.vercel.app`
4. **Configure Supabase auth URLs** under **Authentication → URL
   Configuration**:
   - *Site URL*: your production URL
   - *Redirect URLs*: add `https://<your-domain>/auth/callback`, and
     `https://*-<your-team>.vercel.app/auth/callback` if you want preview
     deployments to handle email confirmation
5. **Deploy**, then visit `/register` to create the admin account.

Set `NEXT_PUBLIC_SITE_URL` to the deployment's own URL. It is what confirmation
emails link back to, so a stale value sends new users to the wrong host.

### Changing the region

`vercel.json` sets `regions: ["fra1"]`. Put the app in the region closest to
your Supabase project to keep query latency low.
