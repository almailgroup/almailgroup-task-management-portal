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
- **Attachments** — files (up to 25 MB, private storage, signed-URL download)
  and external links on any task.
- **Due dates with time of day**, stored as absolute instants and rendered in
  each viewer's own timezone.
- **Profile pictures** uploaded by each user, and **job positions** assigned by
  an admin from a preset list or free text.
- **Review gate** — assignees move work to In Review; only a manager or admin
  marks it Done.
- **General tasks** — assigned work belonging to no project, created by
  managers and admins.
- **Notifications** — live in-app bell for assignment, comments, @mentions,
  review requests and completions.
- **Today** — the daily review: overdue, due today, in progress, awaiting
  review, follow-ups to chase now, and a per-person view of where the day is
  concentrated. Every row reschedules inline.
- **Quick reschedule** — move a due date from any task row without opening the
  form: later today, tomorrow, in 3 days, next Monday, in a week, or a picker.
- **Follow-ups** — give a task a date to chase it on and a note saying what to
  chase. The General tasks page has a follow-up tab split into due and coming
  up.
- **Dashboard** — six clickable tiles (To Do, Pending, In Review, Completed,
  Due Today, Overdue), each opening the matching task list at `/tasks`,
  overall progress,
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

**Quickest — one paste.** Open the Supabase **SQL Editor**, paste the whole of
[`supabase/setup.sql`](supabase/setup.sql) and run it. That file is all five
migrations concatenated in order; it is safe to re-run.

**Or use the CLI**, which applies the migrations individually:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

`setup.sql` is generated — the migrations are the source of truth. After adding
or editing one, regenerate with `npm run db:bundle` so the bundle cannot drift.

| Migration                         | Contents                                     |
| --------------------------------- | -------------------------------------------- |
| `…0001_initial_schema.sql`        | Enums, tables, constraints, indexes           |
| `…0002_functions_and_triggers.sql`| Auth helpers, signup hook, audit triggers     |
| `…0003_row_level_security.sql`    | RLS policies and table grants                 |
| `…0004_realtime.sql`              | Realtime publication, replica identity        |
| `…0005_protect_last_admin.sql`    | Prevents locking out the last admin           |
| `…0006_general_tasks_and_review_gate.sql` | Nullable project_id, review gate      |
| `…0007_attachments.sql`           | Attachments table, storage bucket and policies |
| `…0008_notifications.sql`         | Notifications table and trigger fan-out       |
| `…0009_member_view_only_details.sql` | Members are view-only on task details      |
| `…0010_fix_delete_task_audit.sql` | Lets a task with assignees be deleted         |
| `…0011_due_time_and_positions.sql`| due_at with time, job_title, avatars bucket   |
| `…0012_project_membership.sql`    | Projects become private to their members      |
| `…0013_follow_ups.sql`            | Follow-up dates and notes, audited            |

### 3. Register the first user

Visit `/register`. **The first account created becomes the admin**, so a fresh
deployment is never locked out of project creation. Everyone after that joins as
a Team Member; an admin can change roles on `/team`.

## Authorisation model

**Projects are private to their members.** If you are not on a project you do
not see it, its tasks, its comments, its files or its history — it is simply
absent from your sidebar. Admins see every project so the workspace stays
administrable.

Membership is granted two ways, so assigning work can never produce a task its
assignee cannot open:

1. explicitly, by an admin or manager, from the **members** button on a project
2. automatically, when someone is assigned a task in that project

General tasks (belonging to no project) follow the same principle: assignees
and the creator see them, and so do managers and admins.

The **profile directory** stays readable workspace-wide — the assignee picker,
@mentions and the team page all need it, and a name and role are not the
sensitive part of a project.

On top of visibility, **writes** are gated by role:

| Action                                        | Admin | Manager      | Team Member             |
| --------------------------------------------- | :---: | :----------: | :---------------------: |
| Create / edit projects                        |  yes  | yes          | no                      |
| Delete a project                              |  yes  | own projects | no                      |
| Create tasks in a project                     |  yes  | yes          | yes                     |
| Create **general** tasks                      |  yes  | yes          | no                      |
| Edit title, description, priority, due date   |  yes  | yes          | **no — view only**      |
| Add or remove assignees                       |  yes  | yes          | **no**                  |
| Change a task's status                        |  yes  | yes          | assigned or created only |
| Move a task to **Done**                       |  yes  | yes          | **no — In Review only** |
| Reopen a completed task                       |  yes  | yes          | no                      |
| Reorder cards on the board                    |  yes  | yes          | yes                     |
| Delete a task                                 |  yes  | yes          | no                      |
| Attach files and links                        |  yes  | yes          | on tasks they work on   |
| Post comments                                 |  yes  | yes          | yes                     |
| Edit or delete comments (incl. their own)     |  yes  | yes          | **no**                  |
| See a project                                 |  all  | if a member  | if a member             |
| Add or remove project members                 |  yes  | yes          | no                      |
| Change roles                                  |  yes  | no           | no                      |
| Set job positions                             |  yes  | no           | no                      |
| Reschedule a due date                         |  yes  | yes          | no                      |
| Set a follow-up date and note                 |  yes  | yes          | no                      |
| Upload their own profile picture              |  yes  | yes          | yes                     |

**The member's lane.** Planning belongs to managers; members execute. A member
receives a task, works on it, attaches the result, comments, and moves it to In
Review. They cannot rewrite what they were asked to do, reassign it, remove
themselves from it, or delete the discussion around it.

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
- **Task details are guarded by a trigger**, like the review gate, and for the
  same reason: the rule is about *which columns changed*, which a `WITH CHECK`
  expression cannot see. Status and board position are deliberately left
  writable — reporting progress is exactly what an assignee is for.
- The **review gate** is a trigger, not a policy. The rule is about a
  *transition* — a `WITH CHECK` expression cannot see the previous row, so it
  could not tell "a member is closing this task" from "a member edited the
  title of a task that was already closed".
- **Notifications are private**, the one exception to the read-wide model: a
  row is visible only to its recipient. They have no INSERT policy or grant,
  so nobody can forge one — rows come only from triggers.
- Attachment links are constrained to `http(s)` in the database, so a
  `javascript:` URL cannot be stored and later rendered as a link.

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

- `profiles` — id, email, full_name, avatar_url, role, job_title, created_at,
  updated_at
- `projects` — id, name, description, created_by, created_at, updated_at
- `project_members` — project_id, user_id, added_by, added_at
- `tasks` — id, project_id, title, description, status, priority, due_at,
  follow_up_at, follow_up_note, position, created_by, created_at, updated_at
- `task_assignments` — task_id, user_id, assigned_at
- `comments` — id, task_id, user_id, content, created_at, updated_at
- `task_activity` — id, task_id, actor_id, action, field, old_value, new_value,
  created_at
- `task_attachments` — id, task_id, uploaded_by, kind (file|link), name,
  storage_path, url, mime_type, size_bytes, created_at
- `notifications` — id, user_id, actor_id, type, title, body, task_id,
  project_id, read_at, created_at

`tasks.project_id` is nullable: NULL marks a **general task**. Files live in
the private `task-attachments` storage bucket, reached only through short-lived
signed URLs.

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
