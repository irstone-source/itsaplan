# Cambray's It's a Plan

plan.cambray.co is Cambray's own instance of It's a Plan (upstream: croffasia/itsaplan,
AGPL-3.0), running on Railway, with Cambray changes on top. This document describes what
the instance holds, how the team uses it, and how it is changed and deployed.

## 1. What the instance is

| | |
| --- | --- |
| Web | https://plan.cambray.co |
| API and MCP | https://plan-api.cambray.co (MCP at `/mcp`) |
| Sign-in | Google (Cambray Workspace accounts). Email and password sign-in is off. |
| Brand | "Cambray", accent #00E5CC, ring mark on a dark tile (`scripts/cambray-mark-tile.svg`); light theme: the press kit "Dark on Light" ink mark (#1A1A1A) on a white tile (`scripts/cambray-mark-tile-light.svg`) |
| Hosting | Railway project `itsaplan`: services `api`, `web`, `worker`, `bot`, `postgres` |
| Code | github.com/irstone-source/itsaplan, branch `feat/v1.10-cambray`; `feat/evidence-dockets` holds v1.10.0-cambray.2 on top of it |
| Images | built in the public mirror github.com/irstone-source/itsaplan-images (AGPL source) |
| Version | upstream v1.10.0 plus the Cambray changes, released as `v1.10.0-cambray.N`. Pending: `v1.10.0-cambray.2` (evidence dockets: approval-gated time capture, ticket sessions with screenshots, agent run dockets) |

## 2. How the work is organised

| Project | Key | Holds | Who sees it |
| --- | --- | --- | --- |
| Consulting | CON | Client outcomes and their value, in monthly cycles | Team |
| Loops | LOOPS | Cambray's loops: the unit of sale, built and sold one at a time | Team |
| It's a Plan (Cambray) | PLAN | Development and releases of this instance (GitHub releases of `irstone-source/itsaplan`) | Team |
| Bridge Intelligence | BRIDGE | The Bridge product | Ian (Alex and Tom later) |
| Audience Intel | AI | The Audience Intel product | Team |
| Signal | SIG | The Signal product | Team |
| Administration | ADM | Bookkeeping, contracts, subscriptions, tooling | Team |
| Finance | FIN | Cash flow, forecasts, invoicing, funding, tax | Ian |

Only outcomes and their value go in It's a Plan; day-to-day work stays in Slack. The
projects and tickets were reset on 2 Nov 2026 (`scripts/cambray-reset.ts`, after a
backup): every ticket was deleted and the old client, Incubator, Cambray and rev-os
projects were removed. Consulting kept its cycles, initiatives, labels and playbook.

### Consulting (CON)

- **One initiative per paid workstream**, titled `<Client> — <commercial goal>`, with a
  description in five parts: Goal, We measure, Control, Tickets by workstream, Open. The
  numeric targets are left as "not set yet (Ian)" until Ian sets them.
- **One label per client** (GSG, FGE, Window Supply Direct, Lanoguard, Bike Ventures).
- **Monthly cycles** named like "October 2026", from the first Tuesday to the last Thursday
  of the month; the days between cycles are buffer. Cycles exist to September 2027. Work
  planned for the month goes into its cycle; work on a buffer day goes into the next one.

Rates (from the 12-week resource plan, 6 hours = 1 day):

| Initiative | Day rate | Model |
| --- | --- | --- |
| Lanoguard | £1,000 | retainer (£8,500/month) |
| FGE | £500 | retainer (1 day/week) |
| GSG | £450 | retainer (1 day/week) |
| Window Supply Direct — new site (Phase 1 build) | £450 | day rate |
| Window Supply Direct — ads & management | £1,000 | retainer (assumed rate) |
| Bike Ventures | not set | |
| Stewart Golf | none (completed, no longer a client) | |

## 3. Features added for Cambray

| Feature | Where | What it does |
| --- | --- | --- |
| Billing | God mode → Billing; initiative £/day pill; project settings → Billing | Hours per day, internal day rate, a day rate and billing model per initiative, an internal flag per project |
| Ticket value | Card header, ticket detail → Value | Time estimate in days × the client's day rate, or an amount set by hand |
| Value edge | Board cards | A cyan line on the card edge, brighter for higher value; grey for internal cost |
| Cycle billables | Top of every cycle page | Net value (billable − internal cost) against a target, progress and amount to go, done, estimated hours, a per-client breakdown, and the tickets missing an estimate or a rate |
| Internal work | Initiative billing model "Internal", or an internal project | Costed at the internal day rate and taken off the net |
| Today | Sidebar → Today | Your assigned open work across all projects: overdue, due today, in progress, current cycle, start date reached |
| All work | Sidebar → All work | Every project's issues on one board |
| Add to projects | God mode → Users → a person | Add someone to several projects at once, across teams; remove per project |
| Branding | God mode → Branding | Product name, accent colour and logo |
| Performance | Sidebar → Performance | Each person's completed billings, share of break-even and bonus; the owner sees the team |
| Tracker | Sidebar → Tracker; God mode → Tracker | Growth measures per company and loop (Rev, Cap) on a project or initiative, a coloured cell per week or month: green/amber/red by the thresholds, black when the figure is missing, a person marker when unverified, a flag when a streak needs a focus meeting. Targets follow a versioned rule (set amount, linear, compounding, gate, shelf, leapfrog, or the Finance cycle targets); billings and completed tickets fill themselves. Scope: `boolean-tracker.md` |
| Finance | Sidebar → Finance (owner only) | The year's revenue target, spread over one project's cycles by working days; per month the cycle target, break-even, pool % and billings |
| Playbook | Sidebar → Playbook | Each client's repeatable deliverables with an outcome price, billing (billable, retainer, non-billable), cadence (monthly, quarterly in month 1–3 of the quarter, ad hoc) and an estimate used for capacity only. Each client shows what its items are priced at per month against its monthly retainer fee |
| Revenue class, fee and hours | Initiative £/day pill | Committed (retained income that must be delivered), New (a new client) or Management (MGM, running the consultancy), the monthly retainer fee, and the hours a month allocated to the client |
| Hours limit | Playbook, under each client; Time page | Hours this month (captured time, plus Rize while it is on) against the client's limit: red flag at 60%, down tools at 70% |
| My time | Sidebar → My time (`/time/my`) | Yesterday's blocks of activity and calls from your own computer, each with a suggested ticket or client and its confidence: accept, change, split, ignore or capture as a task; "Confirm suggested" for everything at 85 or more; a Rules tab for the mappings learned from your corrections. Only you see your blocks; a past week is read-only |
| Time capture setup | Sidebar → My time → Setup (`/time/setup`); Today banner | Five checked steps: install ActivityWatch, create an API key, install the `plan-time` agent (served at `/plan-time.mjs`), run watch, first review; plus Screen Recording and iPhone calls on a Mac. Scope: `time-capture.md`; staff notice: `time-capture-notice.md` |
| Team setup | Time page (owners) | Who has a device, when it was last seen, confirmed and pending hours this week |
| Repeatable work | Top of every open cycle page | The playbook items the cycle's month makes due, grouped committed → new → management, to add in one go or one by one; an item is added once per cycle. Each becomes a ticket under its initiative, valued at its price |
| Capacity and reserve | Cycle strip; God mode → Billing | Planned hours against capacity (working days × hours per day × the project's people, or a figure set on the cycle), with a reserve (20% by default) kept free for step-change work nobody has planned; the breakdown splits value and hours by revenue class |
| Client report | Cycle breakdown → the copy icon on a client | The client's delivered tickets with their value and what is still in progress, as markdown to paste to them |

## 4. How the team uses it

**Planning a month (Jo).** Open Consulting → Cycles → the month.
1. Click the target and enter what the month should bring in.
2. Add the month's tickets to the cycle and give each a time estimate. The card shows its
   value; the cycle strip adds it up.
3. For fixed-price work, type the price in the ticket's Value row instead.
4. The strip shows net value against the target and "£X to go". Keep adding work until it
   reads "Target met". The warning line lists tickets that still need an estimate or a rate.
5. Internal work planned in the month goes under an initiative with the "Internal" billing
   model, so its cost comes off the net.

With the playbook, steps 2 and 3 start from **Repeatable work** on the cycle page: press "Add
all due", then add the month's one-off tickets. Keep the capacity bar out of the striped
reserve; the reserve is for work nobody has planned yet, not for more planned work. Order of
priority when capacity is short: committed clients, then new clients, then everything else.

**Playbook upkeep.** Price each deliverable by the outcome the client pays for (a town page
is £250 however long it takes). For a retainer client, price the items until they add up to
the monthly fee; the bar on the client shows what is still unpriced or over. A non-billable
item adds nothing to billings and is a cost to challenge. Each committed client has a
quarterly strategic review, a month apart from the others, and a monthly outcome review.
Each deliverable can carry a result measure ("Cost per deal toward £750"), which goes
into the ticket's description. Tag requests outside a client's outcome list with the
"scope change" label.

**MGM.** The initiative "MGM — Consulting management" (label MGM, billing model Internal,
revenue class Management) holds the running of the consultancy: billing and invoicing, the
month-end finance review, retainer fee balance, cycle planning and close, playbook upkeep,
and a quarterly portfolio review. Its tickets are costed at the internal day rate and shown
as their own line in the cycle breakdown.

**Loading a playbook from a CSV.** Playbook → Import CSV. Columns: client, deliverable,
price, billing, cadence, quarter month, estimate hours, measure (client = the part of the initiative
title before " — "). With "Also set up MGM…" ticked it also marks the known clients
committed or new, creates the MGM initiative, label and items, and a quarterly review per
committed client. Choosing the file shows every change first; Apply writes them; a second
import skips what exists. Quote a price that contains a comma. Anyone who may create
initiatives in CON can import; the MCP tool `import_playbook` does the same for an agent.

**Daily.** Open Today for your own list. Tickets from the standup appear on their own (see
section 5).

**New client.** Create its label and an initiative titled `<Client> — <commercial goal>`,
set the day rate, revenue class and any monthly fee with the £/day pill, add its
deliverables to the Playbook, and file its tickets under that initiative.

**New teammate.** They sign in with Google; the account has no projects until someone adds
them (God mode → Users → Add to projects).

## 5. Automation

- **Time capture** (`plan-time` on each person's computer): every 15 minutes the agent
  reads ActivityWatch (and, with `--calls`, the iPhone calls iCloud syncs to a Mac), merges
  the raw activity into blocks of app, window title, website domain, start and end, drops
  idle time and the person's private list, and keeps the blocks on the computer. The person
  approves them with `plan-time review`, which posts them to the api with the person's API
  key. `plan-time start` / `finish` on a ticket adds screenshots and an evidence docket the
  person attaches to the ticket. The api suggests a ticket or a client for each block: a ticket id in the title,
  then a rule, then the person's in-progress ticket, then a call whose contact matches a
  client. The person reviews the day in **My time** (or in Claude through the MCP tools
  `get_my_time`, `allocate_time_block`, `split_time_block`, `capture_task_from_time`,
  `confirm_my_day`, `list_time_rules`, `add_time_rule`); a confirmed block with a ticket
  mirrors as logged time on it. A block of a past week (before Monday 00:00 London) is
  read-only to its person. The api deletes pending blocks after 30 days and ignored blocks
  after 7, once an hour. Design: `time-capture.md`.
- **Today banner**: with no device seen in the last 24 hours, Today shows "Set up time
  capture", which opens the Setup page; with a device seen but no block for 2 working days,
  it asks the person to run `plan-time review` (counted from the first device setup when
  no block has arrived). Dismissing it hides it for 7 days on that
  browser.
- **Agent dockets**: when an AI agent's run of an issue ends, the api drafts a docket of
  the run. The issue shows it above the activity feed, to people who can edit the issue
  only, until one of them attaches it as a comment or discards it (MCP: `list_issue_dockets`, `attach_docket`,
  `discard_docket`). Design: `time-capture.md`.
- **Team setup** (Time page, owners): each project member with their devices, when each
  was last seen, and confirmed and pending hours this week.
- **Rize sync** (God mode → Integrations → Rize): dormant. Time capture is the source of
  time; the sync stays in the code and still runs while a key is saved. With a Rize team
  admin's API key saved,
  the api copies the team's Rize time every 15 minutes (the last 3 days; 60 days the first
  time and on "Sync now"). Each entry is matched to a person by email, to a ticket by an
  identifier in its task or title (`CON-14 — …`), and to a client initiative through its
  ticket or through the Rize client map on the Time page. A matched entry shows as logged
  time on its ticket. An entry deleted in Rize goes on the next sync.
- **Time page** (Consulting → Time): each client's hours this month (confirmed blocks per
  initiative, through the ticket or set on the block, plus any Rize minutes) against its
  "Hours a month" limit, with a **red flag at 60%** and **down tools at 70%**; the Rize
  clients and the initiative each counts toward; and the entries not tied to a ticket,
  each with "Tie to ticket". A link made by hand is kept on later syncs. The Playbook
  shows the same tracked hours and state under each client.
- **Friday close** (a saved view in Consulting): the running cycle's tickets that are not
  done or canceled, for the Friday morning close-off.
- **Daily intake** (claude.ai routine `trig_01WYCwuAx9AbZc6SVCvEyfGP`): **disabled on 2 Nov
  2026.** It filed Slack and standup actions into CON; the Rize sync and the Friday close
  replace it. Its prompt is kept in the routine.

## 6. Changing and deploying

The branch is `feat/v1.4-cambray`. Every change is committed and pushed there.

| Script | Purpose |
| --- | --- |
| `scripts/ship.sh` | Deploy to production under the next free tag. `--plan` prints the plan, `--backup` only dumps the database. |
| `scripts/cambray-deploy.sh` | What ship.sh runs: preflight, rollback file, database dump over `railway ssh`, image build in the mirror, then api → worker → bot → web with a check after each. `--rollback FILE` puts the recorded images back. |
| `scripts/cambray-billing-setup.ts` | Applies the rates from the resource plan (dry run unless `--apply`) |
| `scripts/cambray-restructure.ts` | Folds client boards into CON (already run; safe to rerun) |
| `scripts/test-capped.sh` | Runs a command with a memory ceiling |

A deploy:
1. Commit and push the branch (ship.sh refuses a dirty tree or unpushed commits).
2. Run `scripts/ship.sh`. It needs `railway` (linked to project `itsaplan`, environment
   production) and `gh`, both signed in.
3. Backups, rollback files and logs are written to `~/backups/itsaplan/`.

The api runs the database migrations when it starts. `SKIP_PRE_MIGRATION_BACKUP=1` is set on
the api because the deploy script takes the backup itself.

Rolling back: `scripts/cambray-deploy.sh --rollback ~/backups/itsaplan/rollback-<time>.txt`.
The database keeps the newer migrations; to restore the data as well, load the matching
`prod-<time>.sql.gz` (instructions are printed by `--rollback`).

Updating from upstream: merge the upstream release tag into the branch, fix conflicts, check,
push and ship. Upstream migration numbers win: a Cambray schema change goes in a new,
re-runnable migration after upstream's, and `migrate.ts` drops ledger records of migrations
that were renumbered away. Rehearse on a restored production backup before shipping.

### Local development and tests

- `bun install`, a local Postgres (Docker Desktop, or Homebrew `postgresql@17` started by
  hand with `pg_ctl`), `.env` and `apps/web/.env` as in `AGENTS.md`, then `bun run dev`.
- API tests: `NODE_ENV=test bun test --env-file=../../.env.test <paths>` from `apps/api`.
  The storage tests need S3 and fail without it.
- **Web tests: never run the whole suite bare.** `apps/web/src/components/layout/ProjectSwitcher.test.tsx`
  grows past 10 GB under bun on macOS. Run chosen files through `scripts/test-capped.sh`,
  and check web changes with `bun run typecheck`, `bun run lint` and `bun run build`.
- Every new UI string needs a translation in all nine languages under `apps/web/messages/`;
  `bun run lint` fails otherwise.

## 7. Open items

- The year's revenue target, break-even and pool % per month (Finance page).
- Xero (collected cash) reconciliation of billings.
- Growth tracker: phase 1 live; next are the hole-chasing tasks, the per-initiative agents and the RevOS, Rize and Xero sources (`boolean-tracker.md`).
- Product revenue (subscriptions, customers onboarded) as initiatives with gates, and a revenue share on it.

- The numeric targets in each client initiative.
- The internal day rate (internal work shows no cost until it is set).
- A day rate for Bike Ventures.
- The Slack bot token for the daily intake.
- Sorting the remaining CAM and IPD tickets into CON, Incubator, ADM and the live product
  projects (Audience Intel, ProofBell, Signal), then deleting the empty client boards and
  REVOS after a backup.
- Object storage (S3): not configured on production, so file attachments, document assets,
  imports and agent skills do not work.
- The table view does not show ticket values yet.
- Playbook: Jo's CSV of repeatable tasks, with billing marked per row (Playbook → Import
  CSV); monthly retainer fees on each committed client.
- Playbook items synced to the Stripe product catalogue (`playbook_item.stripe_price_id` is
  reserved for the price id).
