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
| Brand | "Cambray", accent #00E5CC, ring mark on a dark tile |
| Hosting | Railway project `itsaplan`: services `api`, `web`, `worker`, `bot`, `postgres` |
| Code | github.com/irstone-source/itsaplan, branch `feat/v1.2-branding-today` |
| Images | built in the public mirror github.com/irstone-source/itsaplan-images (AGPL source) |
| Version | upstream v1.2.1 plus the Cambray changes, released as `v1.2.1-cambray.N` |

## 2. How the work is organised

| Project | Key | Holds | Who sees it |
| --- | --- | --- | --- |
| Consulting | CON | All consulting client work | Team |
| Incubator | IPD | Product bets before launch | Team |
| Administration | ADM | Bookkeeping, contracts, subscriptions, tooling | Team |
| Finance | FIN | Cash flow, forecasts, invoicing, funding, tax | Ian |
| Bridge Intelligence | BRIDGE | The Bridge company plan | Ian (Alex and Tom later) |
| Cambray | CAM | Mixed work still to be sorted | Team |

The old per-client boards (GSG, FGE, WSD, SGOLF, LANO, BIKEV) are empty: their issues moved
to CON, each with a "Migrated from GSG-12" line, and the originals are archived. They are
kept until they are deleted after a backup.

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
| Finance | Sidebar → Finance (owner only) | The year's revenue target, spread over one project's cycles by working days; per month the cycle target, break-even, pool % and billings |

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

**Daily.** Open Today for your own list. Tickets from the standup appear on their own (see
section 5).

**New client.** Create its label and an initiative titled `<Client> — <commercial goal>`,
set the day rate with the £/day pill, and file its tickets under that initiative.

**New teammate.** They sign in with Google; the account has no projects until someone adds
them (God mode → Users → Add to projects).

## 5. Automation

- **Daily intake** (claude.ai routine `trig_01WYCwuAx9AbZc6SVCvEyfGP`, 10:00 UTC): reads the
  Fathom standup and Slack, files work into CON under the right client initiative and the
  current month's cycle, sets a time estimate only when the meeting states one, mirrors
  real work as Rize tasks named with the issue id, and books focus blocks in Ian's calendar.
  It never changes initiative goals, targets, rates or billing models.
- **Slack**: the claude.ai Slack connector does not authorise in routine runs. The fix is a
  read-only Slack app (`scripts/slack-intake-app-manifest.yml`) whose bot token goes in the
  routine environment as `SLACK_BOT_TOKEN`. Not set up yet.

## 6. Changing and deploying

The branch is `feat/v1.2-branding-today`. Every change is committed and pushed there.

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

Updating from upstream: rebase the branch onto `upstream/main`, fix conflicts, check, push
and ship. Keep the Cambray changes as separate commits so they rebase cleanly.

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
- Xero (collected cash) and Rize (hours) reconciliation of billings.
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
