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
  profile management. The first account to register becomes the admin, and
  admins add everyone else from Team → Add teammate, which needs no email.
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
- **Reminders by email, Telegram or WhatsApp** — each person chooses their own
  channels and which events are worth interrupting them for.
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

> **Use a Supabase project created for this app.** Running the script against a
> database that already belongs to another application will stop with an
> explanation — the schema lives in `public` and would collide. Check the
> project selector at the top of the SQL editor before running.

**Quickest — one paste.** Open the Supabase **SQL Editor**, paste the whole of
[`supabase/setup.sql`](supabase/setup.sql) and run it. That file is every
migration concatenated in order; it is safe to re-run.

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
| `…0014_reminders.sql`             | Reminder preferences and outbound queue       |
| `…0015_members_see_only_assigned.sql` | Members see only their own tasks          |

### 3. Register the first user

Visit `/register`. **The first account created becomes the admin**, so a fresh
deployment is never locked out of project creation. Everyone after that joins as
a Team Member; an admin can change roles on `/team`.

### 4. Adding everyone else

**Team → Add teammate.** An admin fills in a name, an email and a role, and the
account exists immediately with a one-time password to hand over. Nothing is
emailed. This is the intended route for a workspace: access is granted by
whoever is responsible for it, rather than claimed.

A password somebody else chose and wrote down is only as private as wherever it
was written, so **the first sign-in lands on "Choose your password"** and the
app stays there until they have. The prompt is a flag on the account, cleared
the moment a password is set. Afterwards — and for anyone who simply wants a
new one — **Profile → Password → Change password** asks for the current
password and then the new one, without going anywhere near an email.

**Locked out?** An admin can issue a new password from Team → ⋯ → Reset
password, which works the same way: a one-time password to hand over, and the
account flagged so the next sign-in asks them to choose their own. An admin can
do this for anyone but themselves — their own password needs the current one,
on the profile page — and never learns the password anybody ends up using. It
is the one route that does not depend on email at all, which matters when the
alternative is a reset link and a mail quota.

Self-registration at `/register` still works, but it depends on a confirmation
email, and that is where a new Supabase project has a sharp edge — see below.

#### "email rate limit exceeded"

A Supabase project starts with a **shared, development-only mail service that
sends a handful of messages an hour** across confirmations and password resets
together. Onboarding a company through the sign-up form exhausts it quickly, and
the sign-up form then reports that no account was created. It is a quota, not a
fault, and it clears on its own within the hour.

Two ways past it, and they are worth doing both:

1. **Add people from Team → Add teammate**, which sends nothing at all. This
   needs `SUPABASE_SERVICE_ROLE_KEY` in the server environment — the same key
   the reminder dispatcher already uses.
2. **Connect your own mail service** in Supabase → Project Settings → Auth →
   SMTP Settings. Password resets go through the same quota, so until this is
   set, "Forgot password" is unreliable for exactly the same reason. If you are
   already sending reminders through Resend, the same account works as SMTP:
   host `smtp.resend.com`, port `465`, username `resend`, password your Resend
   API key, and a sender on a domain you have verified.

If you would rather people simply registered themselves without any of this,
turn off Authentication → Sign In / Providers → **Confirm email**. Sign-up then
returns a session straight away and no mail is sent — at the cost of nobody
proving they own the address they typed.

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
| Create tasks in a project                     |  yes  | yes          | **no**                  |
| Create **general** tasks                      |  yes  | yes          | no                      |
| See a task                                    |  all  | whole project | **only tasks assigned to them** |
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
sees **only the tasks assigned to them** — a project they belong to appears in
their sidebar so they can reach their own work, but none of the team's other
tasks in it are visible, and neither are the comments or files on them. On a
task they have been given they can read it, move its status up to In Review,
comment, and attach files. They do not create tasks, delete them, rewrite what
they were asked to do, reassign it, remove themselves from it, or delete the
discussion around it.

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

The palette is a near-neutral cool grey, anchored on `#f3f3f4` in light mode
and `#2c2d32` in dark. Softer than pure black and white, which is easier to
read against for a full working day, and it buys the thing a white page cannot:
**panels can lift off the background**.


- **Surfaces** — three tones, always in the same order: chrome (sidebar and
  header) sits behind the page, the page behind its cards. In dark mode the
  page is the darkest tone and panels step *up* towards the light, so depth
  reads from the ramp with almost no shadow at all.
- **Separation** — 1px micro-borders, plus the tonal step between surfaces.
- **Status** — differentiated by badge fill weight, not colour.
- **Priority** — a four-bar greyscale severity ramp.
- **Overdue** — weight plus a dotted underline rather than red.
- **Themes** — light/dark via `next-themes`; all tokens redefined under `.dark`.
- **Elevation** — four restrained shadows, tinted with the palette's own ink
  rather than pure black, and all but removed in dark mode where tone already
  does the work.
- **Contrast** — every text/surface pair is checked against WCAG AA. The
  tightest is muted text on a card in dark mode at 4.92:1.
- **Motion** — one easing curve for the whole interface, and everything is
  disabled under `prefers-reduced-motion`.

Shared UI primitives keep pages consistent: `PageShell` and `PageHeader` give
every page one container and one title rhythm, `EmptyState` replaced four
hand-rolled variants, and each route has a `loading.tsx` skeleton shaped like
the page it precedes.

Press <kbd>⌘K</kbd> (or <kbd>Ctrl</kbd>+<kbd>K</kbd>) anywhere for the command
palette — every page, saved filter and project, one search away.

**The sidebar is resizable.** Drag its right edge, or focus the separator and
use the arrow keys (<kbd>Shift</kbd> for larger steps, <kbd>Home</kbd> and
<kbd>End</kbd> for the limits). Double-click or press <kbd>Enter</kbd> to
reset. The width is remembered per browser between 208px and 440px, and is
applied before first paint so it never snaps into place on load.

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
- `notification_preferences` — user_id, per-channel toggles and destinations,
  per-event toggles, due_soon_lead_hours
- `reminder_queue` — id, user_id, task_id, channel, kind, recipient, subject,
  body, status, attempts, last_error, dedupe_key, scheduled_for, sent_at

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

## Reminders

Each person picks their own channels on **Profile → Task reminders**, and which
events are worth a message: assigned to me, due soon (with their own lead time),
overdue, or a follow-up coming due.

**The app works without any of this.** Unconfigured channels appear disabled in
the profile page with the reason, rather than silently doing nothing.

### How it works

Reminders are queued, not sent inline. `enqueue_task_reminders()` builds rows
from the current state of the tasks table; a scheduled call to
`/api/reminders/dispatch` drains the queue and calls the providers. That means a
provider outage cannot lose a reminder, retries are bounded and visible in
`reminder_queue.last_error`, and nothing is ever sent twice — every row carries
a `dedupe_key`. Changing a due date changes that key, which is exactly why a
rescheduled task legitimately reminds again, while re-running the scheduler ten
times does not.

Permanent failures (a blocked bot, a bad number) are not retried; transient ones
back off and are retried up to four times.

### Server environment

All of these are **server secrets** — never prefix them `NEXT_PUBLIC_`, which
would compile them into the browser bundle. See `.env.example` for the full list.

| Variable | For |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for any delivery. The dispatcher reads every user's queue, so it cannot run as any one of them. |
| `CRON_SECRET` | Authenticates the dispatcher. `openssl rand -hex 32`. |
| `RESEND_API_KEY`, `REMINDER_EMAIL_FROM` | Email |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | Telegram |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | WhatsApp |

### Scheduling

`vercel.json` registers a daily cron at 07:00 UTC — 08:00 in Zurich in winter,
09:00 in summer, so the digest lands around the start of the working day. **Vercel's Hobby plan only
allows one run per day** — enough for a morning digest, but "due in 2 hours"
will not be accurate. For finer granularity either upgrade to Pro, or drive it
from Supabase instead, which has no such limit:

```sql
-- In the Supabase SQL editor, once.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'dispatch-task-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url    := 'https://YOUR-APP.vercel.app/api/reminders/dispatch',
    headers:= jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET')
  );
  $$
);
```

### Setting up each channel

**Email (Resend).** Create an account, verify the domain you will send from,
create an API key. The free tier covers a small team.

**Telegram.** Message `@BotFather`, `/newbot`, keep the token. Then register the
webhook once:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://YOUR-APP.vercel.app/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Each user then opens Profile → Task reminders → Connect Telegram, and sends the
one-time code to the bot. The bot replies to confirm. The chat id can only come
from Telegram itself, which is why this handshake exists.

**WhatsApp (Twilio).** This one is not just an API key. For testing, join the
Twilio WhatsApp sandbox from the console and use the sandbox number. For real
use you need a WhatsApp Business account, a verified sender number, and — this
is the part that surprises people — **message templates approved by Meta**,
which takes days. Outside a 24-hour window since the user last messaged you,
only approved templates are delivered; free-text messages are rejected. Set
`TWILIO_WHATSAPP_TEMPLATE_SID` once you have one approved.

## My List

A private daily list, reached from **My List** in the sidebar. It is shaped
like the Notes app on a phone: a list of notes on one side, the note on the
other, one screen at a time below `lg` with a back button.

Each note holds a checklist and a free-text area. Ticking a line writes
immediately and optimistically; the title and text save themselves on a
700ms debounce rather than behind a Save button. Enter adds the next line,
Backspace on an empty line removes it.

### It is genuinely private

`personal_notes` and `personal_note_items` are the only tables in this schema
with no manager or admin override. Every policy is `user_id = auth.uid()`, and
inserting an item additionally requires the note to be yours, so a forged
`note_id` cannot park a line on someone else's list. Verified against a real
Postgres: a second account sees zero rows, its updates and deletes affect zero
rows, and both forgery attempts are refused outright.

Ticking an item bumps the parent note's `updated_at` through a trigger, so a
list you are working through floats to the top of the sidebar.

## MAHAM AI

The in-app assistant, reached from the button above the clock at the foot of
the sidebar. It answers questions about where work stands: what is overdue,
what is due today, what to pick up next, what is waiting in review, and how
the board is split by status.

It opens **in the rail itself** rather than over the board — the sidebar
widens to make room and hands its column to the conversation, so you can read
a task while you ask about it. Closing returns the rail to navigation at its
previous width. While the assistant holds it, the rail can be dragged wider
than navigation allows (320–640px against 208–440px); that width is never
saved as the navigation width.

### What it can see

Nothing you could not already open yourself. `buildSnapshot` in
`src/lib/maham/snapshot.ts` reads through the ordinary RLS-scoped queries, so
a member's snapshot holds only the tasks assigned to them and a manager's
holds their projects. The assistant has no permission logic of its own and no
service-role access; it cannot widen what you see.

The snapshot is built server-side on every question. The browser never holds
it, and never learns the Worker's address or its secret.

### Connecting Gemini

Until `MAHAM_WORKER_URL` is set, answers come from the local brain in
`src/lib/maham/local-brain.ts` — deterministic, counted straight off the
board, and honest about the questions it cannot take. That brain stays on
afterwards as the fallback when the Worker call fails, so the panel is never
simply dead.

Set `MAHAM_WORKER_URL` (and ideally `MAHAM_WORKER_SECRET`) and the Server
Action forwards instead. The Worker receives:

```jsonc
POST <MAHAM_WORKER_URL>
Authorization: Bearer <MAHAM_WORKER_SECRET>   // only if the secret is set

{
  "messages": [{ "id": "…", "role": "user", "text": "What is overdue?", "at": "…" }],
  "snapshot": {
    "viewer":  { "name": "…", "role": "manager" },
    "takenAt": "2026-09-13T19:00:00.000Z",
    "tasks":   [{ "id": "…", "title": "…", "status": "todo", "priority": "high",
                  "project": "Gemellry", "dueAt": "…", "followUpAt": null,
                  "assignees": ["…"], "createdAt": "…" }],
    "counts":  { "total": 12, "todo": 4, "inProgress": 3, "inReview": 2, "done": 3,
                 "overdue": 1, "dueToday": 2, "unassigned": 1, "noDueDate": 4 }
  }
}
```

and must reply with `{ "text": "…" }`. Anything else — a non-2xx status, an
empty `text`, or no answer within 20 seconds — falls back to the local brain
rather than surfacing an error.

The Gemini API key belongs on the Worker, as a Cloudflare secret. It must not
be added to Vercel: anything this app holds is one `NEXT_PUBLIC_` typo away
from the browser, and the Worker exists precisely so the key never travels.

The shapes above are `src/lib/maham/types.ts`, which is deliberately free of
React and Supabase imports so the Worker can share the file verbatim.

## Signing in

### Forgotten passwords

**Sign in → Forgot password? → email → set a new one.** The link lands on
`/auth/callback`, which exchanges it for a session and forwards to
`/reset-password`. That page is therefore behind the middleware like any other
signed-in route: arriving without a valid link means no session, and the
middleware sends it to sign in, which is the correct answer.

The confirmation screen says the same thing whether or not the address has an
account — "if an account exists for …". Saying otherwise would hand anyone a
way to test which company addresses are registered, which is the same reason
sign-in refuses to say which half of the credentials was wrong.

**One thing to set in Supabase:** Authentication → URL Configuration →
Redirect URLs must include `https://your-domain/auth/callback`. Without it
Supabase refuses the redirect and the link dead-ends. Set `NEXT_PUBLIC_SITE_URL`
too — though the actions now fall back to the request's own origin rather than
to `localhost:3000`, so a missing variable no longer sends production links to
a machine the recipient does not have.

### The password field

Passwords can be shown. Typing one you cannot see is the main reason people
fail to sign in on a phone, where a long password and a soft keyboard make a
typo likely and invisible. The toggle sits outside the tab order, so Tab still
runs from the password straight to the submit button, and Caps Lock is called
out when it is on — the other half of the same problem, since a masked field
gives no way to notice.

The strength meter on sign-up rates length above cleverness. It is not a
percentage and not a score: those imply a precision nobody has, and they
reward `P@ssw0rd!` for containing a symbol. It never blocks anything; the
eight-character minimum is enforced by the schema on the server.

## Tests

```bash
npm test          # unit — vitest, ~2s
npm run test:e2e  # end-to-end — Playwright against a production build
```

CI runs both on every push and pull request, along with types, lint, the
build, and a check that `supabase/setup.sql` still matches the migrations.

### What is covered, and why those things

The unit tests are deliberately weighted towards bugs this codebase has
actually had, not towards a coverage number:

- **`dates` / `validation`** — the due-date timezone bug. The server now
  refuses the raw `2026-09-15T17:30` an `<input type="datetime-local">`
  produces, so the mistake cannot come back quietly.
- **`client-boundary`** — the `/team` crash. Every export of a `"use client"`
  module becomes a client reference when a Server Component imports it, and
  calling one on the server throws. TypeScript and ESLint both pass on that
  code, so it gets its own static check. It was verified by reintroducing the
  original bug and watching it go red.
- **`reminders`** — which failures are worth retrying, and that an
  unconfigured channel or a thrown request never wedges the dispatcher.
- **`attachments`** — that a filename cannot climb out of its task's folder
  and that a `javascript:` URL cannot be stored as a link.
- **`metrics` / `task-filters` / `sidebar`** — the arithmetic behind the
  dashboard, the filters and the resizable rail.

The end-to-end tests cover the pages reachable without a session, plus two
rules that apply everywhere and keep getting broken by accident: no page may
scroll sideways, and no control on a touch device may be smaller than a thumb.
Point `BASE_URL` at a staging deployment to run them against real data.

### What is not covered

Two paths have never been exercised end to end, here or anywhere:

- **File and avatar uploads.** The bytes go straight from the browser to
  Supabase Storage, which needs a live bucket. The path-building and
  validation around them are tested; the upload itself is not.
- **Reminder delivery.** There are no provider credentials in CI and there
  should not be. Everything around the network call is tested with a stubbed
  `fetch`; no real email, Telegram message or WhatsApp has ever been sent by
  a test.

Both are worth one deliberate manual pass after deploying: attach a real file
to a task and download it again, set a profile picture, and set a due date a
few minutes out with each reminder channel switched on.

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
   - Optionally the reminder secrets above — see [Reminders](#reminders)
4. **Configure Supabase auth URLs** under **Authentication → URL
   Configuration**:
   - *Site URL*: your production URL
   - *Redirect URLs*: add `https://<your-domain>/auth/callback`, and
     `https://*-<your-team>.vercel.app/auth/callback` if you want preview
     deployments to handle email confirmation
5. **Deploy**, then visit `/register` to create the admin account.

Set `NEXT_PUBLIC_SITE_URL` to the deployment's own URL. It is what confirmation
emails link back to, so a stale value sends new users to the wrong host.

### Regions

**Not pinned.** `vercel.json` deliberately carries no `regions` key: on the
Hobby plan that property stops deployments from being created at all — silently,
with nothing appearing in the deployments list to explain why.

The Supabase project is in `eu-central-2` (Zurich), so the ideal placement is
`zrh1`. Reaching it needs a Pro plan, where the region can be set under
**Settings → Functions → Function Region**. Until then functions run in
Vercel's default region and each query crosses to it and back — noticeable,
but not worth breaking deployments over.

