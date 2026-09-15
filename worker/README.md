# The assistant's model

A Cloudflare Worker that stands between the portal and Google Gemini.

It exists for one reason: **the Gemini key lives here and never goes near
Vercel.** Anything the Next.js app holds is one `NEXT_PUBLIC_` typo away from
the browser; a key on Cloudflare cannot leak that way. The portal calls this
Worker server-to-server, so the browser never learns its address either.

If the Worker is not deployed, or is down, or answers anything but `200`, the
portal falls back to its own local brain — the counting answers in
`src/lib/maham/local-brain.ts`. The panel is never simply dead.

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

Pick a **Flash** model from that list — they are the ones on the free tier —
and put it in `wrangler.toml` under `GEMINI_MODEL` if it differs from the
default.

## 3. Make a shared secret

So that only the portal can spend your quota:

```bash
openssl rand -base64 32
```

Keep the output. It goes in two places, and they must match.

## 4. Deploy the Worker

```bash
cd worker
npm install
npx wrangler login          # opens a browser once
npx wrangler secret put GEMINI_API_KEY   # paste the key from step 1
npx wrangler secret put SHARED_SECRET    # paste the secret from step 3
npx wrangler deploy
```

`wrangler deploy` prints the address, something like
`https://almailgroup-assistant.<your-subdomain>.workers.dev`. Copy it.

Secrets are stored encrypted on Cloudflare. Nothing you typed is written to
this repository — that is what `wrangler secret put` is for, rather than
`[vars]` in `wrangler.toml`.

## 5. Tell the portal about it

In **Vercel → your project → Settings → Environment Variables**, for
**Production and Preview**:

| Name | Value |
| --- | --- |
| `MAHAM_WORKER_URL` | the address from step 4 |
| `MAHAM_WORKER_SECRET` | the secret from step 3 |

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

Ask the assistant something while that is running.

| What you see | What it means |
| --- | --- |
| `Gemini replied 400: API key not valid` | Wrong key, or not saved. Re-run `wrangler secret put GEMINI_API_KEY`. |
| `Gemini replied 404` | That model name is not available to your key. Redo step 2. |
| `Gemini replied 429` | Free-tier limit hit. Wait, or add billing. |
| `401` from the Worker, nothing logged | `MAHAM_WORKER_SECRET` and `SHARED_SECRET` differ. |
| Nothing at all in `tail` | The portal is not calling it. `MAHAM_WORKER_URL` is unset or the deployment predates it — redeploy. |

Test the Worker without the portal:

```bash
curl -i -X POST "$MAHAM_WORKER_URL" \
  -H "authorization: Bearer $MAHAM_WORKER_SECRET" \
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

The wire types are imported from `../src/lib/maham/types.ts` rather than
copied, so the two ends cannot drift apart.

## Local development

```bash
cp .dev.vars.example .dev.vars   # then fill it in; it is gitignored
npm run dev
```
