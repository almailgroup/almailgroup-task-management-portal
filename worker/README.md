# The assistant's model

A Cloudflare Worker that stands between the portal and Google Gemini.

It exists for one reason: **the Gemini key lives here and never goes near
Vercel.** Anything the Next.js app holds is one `NEXT_PUBLIC_` typo away from
the browser; a key on Cloudflare cannot leak that way. The portal calls this
Worker server-to-server, so the browser never learns its address either.

If the Worker is not deployed, or is down, or answers anything but `200`, the
portal falls back to its own local brain — the counting answers in
`src/lib/assistant/local-brain.ts`. The panel is never simply dead.

---

## What you need

- A Google account (for the Gemini key)
- A Cloudflare account — the free plan is enough
- Node 18+ on the machine you run these commands from

---

## 1. Get a Gemini API key

Open **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)** →
**Create API key**. Copy it somewhere safe; Google shows it once.

> **Read this before pointing it at the real board.** On the *free* tier Google
> uses what you send to improve its products, and human reviewers may read it.
> Your board carries client names, shipment details and staff names. Adding a
> billing account to the same key moves it to the paid tier, where prompts are
> not used for training — and at this app's volume Flash costs pennies a month.
> Free is fine for trying it out. Decide knowingly before it becomes the
> company's assistant.

## 2. Check which models your key can actually use

Model names come and go, and the free tier only ever carries some of them.
Ask your key rather than guessing:

```bash
curl -s https://generativelanguage.googleapis.com/v1beta/models \
  -H "x-goog-api-key: YOUR_KEY" | grep '"name"'
```

No terminal? Open this in a browser tab instead — it is a plain GET:

```
https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY
```

(That puts the key in your browser history. Fine for a one-off check; clear it
afterwards if it bothers you.)

Pick a **Flash** model from that list. The Worker defaults to the newest one
that was current when this was written; set the `GEMINI_MODEL` variable to
choose another.

Two things the list does not tell you. Every current model *thinks* before it
answers, and that reasoning is spent from the same token budget as the reply —
which is why `maxOutputTokens` here is 4096 rather than the few hundred an
answer needs. And a model appearing in the list is not proof it is free: the
list is what your key can see, the free tier is a separate quota. If the log
shows `429`, move down a step — `gemini-2.5-flash` has been on the free tier
the longest.

## 3. Make a shared secret

So that only the portal can spend your quota. Any 32+ random characters will
do. In a terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Or, with no terminal, in any browser's developer console (F12 → Console):

```js
crypto.randomUUID() + crypto.randomUUID()
```

Keep the output. It goes in two places, and they must match.

## 4. Deploy the Worker

Two routes. **A** needs nothing installed; **B** is better if you will be
changing the Worker more than once.

### A. In the Cloudflare dashboard, no computer setup

1. **[dash.cloudflare.com](https://dash.cloudflare.com)** → **Workers & Pages**
   → **Create** → **Start with Hello World!** → **Deploy**.
   Name it `almailgroup-task-management`. First time, Cloudflare asks you to pick a
   `workers.dev` subdomain — any name; it becomes part of the address.
2. On the Worker, choose **Edit code**. Select everything in the editor and
   replace it with the whole of
   [`worker/src/index.js`](src/index.js) — it is plain JavaScript with nothing
   imported, so it pastes in as it is. **Deploy**.
3. Back on the Worker → **Settings** → **Variables and Secrets** → **Add**:

   | Type | Name | Value |
   | --- | --- | --- |
   | Secret | `GEMINI_API_KEY` | the key from step 1 |
   | Secret | `SHARED_SECRET` | the value from step 3 |
   | Text | `GEMINI_MODEL` | only if step 2's list had no `gemini-2.5-flash` |

   Then **Deploy** again, so the variables take effect.
4. The Worker's address is on its overview page:
   `https://almailgroup-task-management.<your-subdomain>.workers.dev`. Copy it.

The cost of this route: the dashboard now holds the deployed code, and this
repository no longer matches it. Change the Worker here and you must paste it
across again. Route B keeps the two in step.

### B. From a terminal

```bash
cd worker
npm install
npx wrangler login          # opens a browser once
npx wrangler deploy         # creates the Worker and prints its address
npx wrangler secret put GEMINI_API_KEY   # paste the key from step 1
npx wrangler secret put SHARED_SECRET    # paste the secret from step 3
```

Deploy first, then the secrets: `wrangler secret put` needs the Worker to
exist, and secrets take effect immediately without another deploy. Between the
two commands the Worker refuses every request — it has no secret to check
against, and an endpoint that spends your Gemini quota should not sit open
while you fetch the next command.

Secrets are stored encrypted on Cloudflare. Nothing you typed is written to
this repository — that is what `wrangler secret put` and the dashboard's
**Secret** type are for, rather than `[vars]` in `wrangler.toml`.

## 5. Tell the portal about it

In **Vercel → your project → Settings → Environment Variables**, for
**Production and Preview**:

| Name | Value |
| --- | --- |
| `ALMAIL_AI_WORKER_URL` | the address from step 4 |
| `ALMAIL_AI_WORKER_SECRET` | the secret from step 3 |

Then **redeploy** — environment variables are read at build time, so an
existing deployment will not pick them up on its own.

## 6. Check it

Open the portal, click **AI assistant** at the foot of the sidebar, and ask
*"what is overdue?"*. A real answer in prose means Gemini is answering. A
terse, counted answer means it fell back to the local brain — see below.

---

## When it does not work

The portal never shows you the reason, on purpose: whoever is asking cannot
act on it. The reason is in the Worker's log.

```bash
npx wrangler tail
```

Or, with no terminal: the Worker's page in the dashboard → **Logs** → **Begin
log stream**. Ask the assistant something while it is running.

| What you see | What it means |
| --- | --- |
| `Gemini replied 400: API key not valid` | Wrong key, or not saved. Re-run `wrangler secret put GEMINI_API_KEY`. |
| `Gemini replied 404` | That model name is not available to your key. Redo step 2. |
| `Gemini replied 429` | Free-tier limit hit. Wait, or add billing. |
| `401`, and `SHARED_SECRET is not set` | You deployed but never set it. Run `wrangler secret put SHARED_SECRET`. |
| `401` from the Worker, nothing logged | `ALMAIL_AI_WORKER_SECRET` and `SHARED_SECRET` differ. |
| Nothing at all in `tail` | The portal is not calling it. `ALMAIL_AI_WORKER_URL` is unset or the deployment predates it — redeploy. |

Test the Worker without the portal:

```bash
curl -i -X POST "$ALMAIL_AI_WORKER_URL" \
  -H "authorization: Bearer $ALMAIL_AI_WORKER_SECRET" \
  -H "content-type: application/json" \
  -d '{"messages":[{"id":"1","role":"user","text":"What is overdue?","at":"2026-01-01T00:00:00Z"}],
       "snapshot":{"viewer":{"name":"Admin","role":"admin"},"locale":"en","timeZone":"Asia/Dubai",
       "takenAt":"2026-01-01T00:00:00Z","tasks":[],"counts":{"total":0,"todo":0,"inProgress":0,
       "inReview":0,"done":0,"overdue":0,"dueToday":0,"unassigned":0,"noDueDate":0}}}'
```

`200` with `{"text":"…"}` is a working Worker.

---

## What it sends, and what it does not

Only the snapshot the portal already built — and that snapshot is the asker's
own view of the board, assembled through the same row-level security as the
rest of the app. A member's question carries only the tasks assigned to them.
There is no service-role access here and no permission logic of its own.

It does not send: email addresses, passwords, attachments, comments, or
anything about anyone the asker could not already see in the UI.

The wire types are imported from `../src/lib/assistant/types.ts` rather than
copied, so the two ends cannot drift apart.

## Tests

```bash
cd worker && npm test
```

Node's own runner, no framework, the same file that goes into Cloudflare's
editor, and Gemini stubbed. It covers the failures that are invisible from the
portal — a reply that is all reasoning and no answer, a blocked prompt, a bad
key — plus the two properties worth keeping: the API key never appears in a
URL, and a Worker with no secret of its own serves nobody.

## Local development

```bash
cp .dev.vars.example .dev.vars   # then fill it in; it is gitignored
npm run dev
```
