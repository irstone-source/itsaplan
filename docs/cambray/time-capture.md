# Time capture: automatic tracking, daily review, tickets

Status: planned 2 Nov 2026, building as v1.5.0-cambray.3.

## 1. What it is for

Plan holds outcomes and their value. Time is measured only to keep each client inside
its monthly limit: a red flag at 60%, down tools at 70% (README section 5). Time capture
gets that measure from what people actually did, at a cost of about three minutes a
day each.

1. A small agent on each person's computer reads ActivityWatch, an open-source tracker
   that keeps the raw activity on the machine. On Ian's Mac it also reads the iPhone
   calls that iCloud syncs to the Mac.
2. The agent merges the raw activity into **blocks**, for example "09:10–10:25 Chrome,
   Google Ads, FGE account". It drops idle time and anything on the person's private
   list, then sends the blocks to Plan.
3. Plan suggests a ticket or a client for each block.
4. Each person reviews yesterday's blocks in Plan → My time, or in Claude through MCP.
   For each block they can accept the suggestion, change it, split it, ignore it, or
   capture it as a new task. Corrections become rules.
5. Confirmed time becomes logged time on the ticket, counts toward the client's limit on
   the Time page, and locks when its week has passed.

The Rize sync (`modules/rize`) stays in the code but is dormant; time capture replaces it
as the source of time.

## 2. Privacy

- Raw ActivityWatch data never leaves the machine. The agent sends blocks only: app,
  window title, website domain, start and end. It sends no screenshots, no keystrokes,
  no full URLs and no document contents.
- The private list is applied on the machine before anything is sent. Each person sets
  their own apps, domains and title words. Banking, health and personal messaging apps
  are on it by default.
- A person's blocks are visible to that person only, including to the instance owner
  through the routes. The team sees confirmed time as logged time on tickets and as
  totals on the Time page.
- Suggestions come from rules and from what Plan already holds. No model is called on
  the server. "Intelligent" review runs in the person's own Claude through MCP tools
  that act as that person.
- UK GDPR: monitoring staff needs a notice saying what is collected, why, who sees it,
  and how long it is kept. The text is `time-capture-notice.md`, which Ian sends before
  anyone installs.
- Retention: unconfirmed blocks are deleted after 30 days, and ignored blocks after 7.

## 3. Data (migration `0153_time_capture.sql`, re-runnable)

**`time_device`** — one row per computer of a person:
- `id`, `user_id` (FK, cascade), `name`, `platform` (`darwin`, `win32` or `linux`)
- `agent_version`, `last_seen_at`, `created_at`
- unique `(user_id, name)`

**`time_block`** — one row per merged block of activity or call:
- `id`, `user_id` (FK, cascade), `device`
- `source`: `activity` | `call` | `manual`
- `source_key`: a stable hash from the agent, unique per user
- `started_at`, `ended_at`, `seconds`
- `app`, `title`, `domain`; `detail` (jsonb, small: for a call, the direction and the number's contact name)
- `status`: `pending` | `confirmed` | `ignored`
- `issue_id` and `initiative_id`: the allocation (FK, set null)
- the suggestion: `suggested_issue_id`, `suggested_initiative_id`, `confidence` (0–100), `reason` (text)
- `rule_id`: the rule that suggested it (FK, set null)
- `confirmed_at`, `created_at`
- index `(user_id, started_at)`

**`time_rule`** — a person's or the team's learned mapping:
- `id`, `user_id`: null for a team rule, written by a project owner
- `field`: `app` | `title` | `domain` | `contact`
- `pattern`: case-insensitive substring
- the target: `issue_id`, `initiative_id`, or `ignore` (boolean)
- `hits`, `created_at`

**`issue_worklog.time_block_id`** (unique, FK cascade): a confirmed block that has a
ticket mirrors as one worklog, in the same way as `rize_entry_id`.

## 4. Suggestions (deterministic, in this order)

1. **A ticket id** (`CON-14`) in the block title → that ticket. Confidence 95.
2. **A rule** that matches the block → its target. Personal rules come before team rules,
   and longer patterns before shorter ones. Confidence 85.
3. **An in-progress ticket**: the person's ticket that was in a started column during the
   block (from `issue_status` and the assignee) → that ticket. Confidence 60 when it is
   the only one, 40 when there are several, taking the most recent.
4. **A call** whose contact name or number matches an initiative's client label → that
   initiative. Confidence 70.
5. **Nothing matches** → none. The block waits for the person.

"Confirm suggested" confirms every pending block of the day at confidence 85 or more.
Lower suggestions are offered with one tap.

**Learning.** Changing a block's allocation offers "Always do this": it creates a
personal rule from the block's domain, else its app plus a distinctive title word. Ignoring
a block offers "Always ignore". An owner can promote a personal rule to a team rule.

## 5. Agent (`packages/time-agent`, CLI `plan-time`)

- **Runtime.** Plain Node 20+, with no Bun APIs, the same as `packages/runner`. It is
  bundled to a single file, `apps/web/public/plan-time.mjs`, so Plan serves it at
  `https://plan.cambray.co/plan-time.mjs`.
- **Install.** `curl -fsSL https://plan.cambray.co/plan-time.mjs -o ~/.local/bin/plan-time.mjs`,
  then `node ~/.local/bin/plan-time.mjs setup`. Setup asks for the Plan URL and an API key
  and stores the key:
  - in the macOS Keychain as `itsaplan_time_key`
  - elsewhere in `~/.config/plan-time/credentials` with mode 0600
  - a device name
- **Commands.**
  - `sync`: send everything since the last cursor, at most the last 7 days.
  - `watch`: sync every 15 minutes in the foreground.
  - `install-autostart`: opt-in only, a launchd agent or a Windows Startup shortcut. Ian's
    Mac never uses it.
  - `status`; `private add|list|remove`.
- **ActivityWatch** (`http://localhost:5600/api/0`):
  - buckets `aw-watcher-window_<host>`, `aw-watcher-afk_<host>` and `aw-watcher-web-*`
  - window events are clipped to not-AFK time
  - the web bucket gives the domain for browser windows
  - the same app plus title separated by less than 60 seconds is merged
  - blocks under 2 minutes are dropped and blocks are capped at 3 hours
  - the private list is applied
  - `source_key` = sha256 of device | app | title | start minute
- **Calls** (macOS, only with `--calls`; needs Full Disk Access for the terminal or Node):
  - `~/Library/Application Support/CallHistoryDB/CallHistory.storedata`, table
    `ZCALLRECORD`: `ZDATE` (seconds since 2001-01-01), `ZDURATION`, `ZADDRESS`,
    `ZORIGINATED`, `ZANSWERED`
  - names from the AddressBook database (`ZABCDPHONENUMBER` → `ZABCDRECORD`: first, last, organisation)
  - unanswered calls are skipped
  - title "Call with <name or number>", with the contact as `detail.contact`
- **Heartbeat.** Every sync posts the device, platform and version.
- **Failure.** When ActivityWatch is down, the sync says so and sends a heartbeat with
  `awOk: false`, which Plan shows as "tracker not running".

## 6. API (`apps/api/src/modules/timecap`)

**Agent** (the user's API key or session):
- `POST /time/agent/heartbeat` `{ device, platform, version, awOk }`
- `POST /time/agent/blocks` `{ device, blocks: [{ sourceKey, source, startedAt, endedAt, app, title, domain, detail }] }`
  - at most 2,000 blocks per call
  - upserts by `(user, sourceKey)`
  - never changes a confirmed or ignored block
  - suggests on insert
  - answers the inserted and skipped counts

**The person**:
- `GET /me/time?date=YYYY-MM-DD` returns:
  - the day's blocks with their suggestions and allocations
  - totals (captured, confirmed, pending)
  - the person's devices with when each was last seen
- `POST /me/time/blocks/:id` `{ action: 'confirm' | 'ignore' | 'reset', issueId?, initiativeId?, remember? }`
- `POST /me/time/blocks/:id/split` `{ at }`: an ISO time inside the block, giving two blocks
- `POST /me/time/blocks/:id/capture` `{ projectKey, title, initiativeId? }`: creates the ticket assigned to the person and confirms the block to it
- `POST /me/time/confirm-day` `{ date, minConfidence? }`
- `GET /me/time/rules`, `POST /me/time/rules`, `DELETE /me/time/rules/:id`
- `GET /me/time/status`: whether any device was seen in the last 24 hours (the Today banner)

**The team** (project owners and God):
- `GET /projects/:key/time/team`: each project member, their devices, last seen, and
  confirmed hours this week
- `POST /projects/:key/time/rules/:id/promote`

**Time page totals.** `getTimeOverview` adds confirmed blocks per initiative to the Rize
minutes: the ticket's initiative, or the block's own initiative.

**Lock.** A block of a day before the current week's Monday 00:00 (Europe/London) is
read-only to its person. God can still change it.

**Retention.** The api background loop deletes pending blocks older than 30 days and
ignored blocks older than 7, once an hour.

**MCP tools**, generated from the routes:
- `get_my_time`, `allocate_time_block`, `split_time_block`, `capture_task_from_time`
- `confirm_my_day`, `list_time_rules`, `add_time_rule`

## 7. Web

- **My time** (sidebar under Today, `/time/my`):
  - a day picker, opening on yesterday
  - the device status line
  - the blocks in time order, each with its suggestion chip and confidence, and **Accept**,
    **Change** (ticket and initiative picker), **Split**, **Ignore** and **Capture as task**
  - "Confirm suggested (n)"
  - an "Always do this" toast after a change
  - a "Rules" tab
- **Setup** (`/time/setup`): the four steps, each with a check:
  1. install ActivityWatch
  2. create an API key, linking to the account's API keys
  3. download and set up the agent, with commands to copy
  4. the first sync seen
  - plus Calls (Mac): Full Disk Access and `--calls`
- **Today banner.** With no device seen in 24 hours: "Set up time capture" → Setup. It
  can be dismissed for 7 days.
- **Time page** (Consulting): a "Team setup" list (who has a device, last seen,
  confirmed this week) for owners, and the client totals now include captured time.
- **i18n.** `timecap` namespace in all 10 locales.

## 8. Tests

- **API integration:**
  - upload is idempotent and never overwrites a confirmed block
  - suggestion order (id, rule, in progress, call)
  - another person cannot read or change a block (404)
  - confirm makes a worklog; reset removes it
  - split keeps the seconds
  - capture creates an assigned ticket
  - remember creates a rule that the next upload uses
  - lock refuses an old week
  - confirm-day honours the confidence
  - team view is for owners only
  - Time page totals include captured time
- **Agent unit**, against fixture data, with no ActivityWatch needed:
  - clipping to AFK, merging, minimum and maximum length
  - the private list and the stable `source_key`
  - call parsing from a fixture SQLite file
- **Rendered check:** the local stack with a fake ActivityWatch server; screenshots of
  My time, Setup, the Today banner, and the Time page team list.

## 9. Rollout

1. Deploy as v1.5.0-cambray.3.
2. Ian sends the notice.
3. Ian installs first, with calls.
4. Jo, Zak and Tim install.
5. One week later, review whether three minutes a day holds. Tune the confidence
   thresholds and the default private list.
