# Time capture: automatic tracking, daily review, tickets

Status: built 2 Nov 2026, released as v1.5.0-cambray.3. Approval-gated sending, ticket
sessions and evidence dockets: v1.10.0-cambray.2, pending.

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
   list, and keeps the blocks on the computer. The person approves them with
   `plan-time review`; only approved blocks are sent to Plan.
3. Plan suggests a ticket or a client for each block.
4. Each person reviews yesterday's blocks in Plan → My time, or in Claude through MCP.
   For each block they can accept the suggestion, change it, split it, ignore it, or
   capture it as a new task. Corrections become rules.
5. Confirmed time becomes logged time on the ticket, counts toward the client's limit on
   the Time page, and locks when its week has passed.
6. Working on one ticket, a person (or a coding agent on their computer) runs
   `plan-time start CON-12` and `plan-time finish CON-12`. The session records activity
   and a screenshot every 5 minutes on the computer, and finish builds an **evidence
   docket**: timeline, apps and sites, screenshots, and either the evidence that the work is
   complete or the blocker. The person reviews it and attaches it to the ticket. The server
   stamps it with a number, its own time and a fingerprint (section 8); a complete docket
   goes to a lead for review, a blocked one marks the ticket "At risk". The session's blocks
   are sent already allocated to the ticket.
7. An AI agent's run on an issue gets a draft docket on the server when it ends. A person
   attaches it, which stamps it and posts it as a comment, or discards it.

The Rize sync (`modules/rize`) stays in the code but is dormant; time capture replaces it
as the source of time.

## 2. Privacy

- Nothing leaves the machine without the person's approval. Raw ActivityWatch data is
  never sent. Blocks (app, window title, website domain, start and end) are held in a
  local outbox until the person approves them in `plan-time review`; a block they untick
  is deleted on the computer and never sent.
- The only thing sent without a review is the heartbeat: device name, platform, agent
  version and whether ActivityWatch is running. It carries no activity.
- Screenshots are taken only during a ticket session (`plan-time start`), every 5
  minutes. One is skipped while the person is away, while an app, title or domain on the
  private list is in front, and whenever ActivityWatch cannot tell what is in front or
  whether the person is away.
- A screenshot shows everything on the screen at that moment: windows behind the one in
  front, other monitors and notifications. The private list stops a screenshot being
  taken while a private app is in front; it does not hide a private app that is visible
  elsewhere on the screen. The review page is where the person unticks any screenshot
  they do not want sent.
- On a Mac, a large screenshot is downscaled on the computer before review.
- Screenshots are kept on the computer and sent only when the person attaches the docket,
  and only the ones left ticked.
- The docket comment contains the session's app names, window titles and sites, the
  ticked screenshots and the evidence or blocker the person wrote. An `@` handle or markdown in a window title is
  neutralised, so a title mentions nobody and adds no formatting.
- An attached screenshot is a ticket attachment. Its raw link
  (`/attachments/<id>/raw`) opens without signing in, so anyone who has the link can view
  it. The id is random and is not listed anywhere outside the ticket.
- No keystrokes, full URLs or document contents are read or sent.
- `plan-time sent` lists every request the agent has attempted, including one that
  failed to connect: time, method, path, size and what it was. Reads (looking up a
  ticket, the board's columns) are listed too.
- Draft agent dockets are visible only to people who can edit the ticket, until one of
  them attaches it.
- The private list is applied to blocks on the machine before review. Each person sets
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

## 3. Data (migration `0175_cambray.sql`, re-runnable)

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

**`issue_docket`** — a docket of work on an issue: a session docket from `plan-time finish`,
or a draft of an AI agent's run. The stamp columns are in section 8.
- `id`, `issue_id` (FK, cascade), `agent_run_id` (FK, set null)
- `status`: `draft` | `attached` | `discarded`
- `body`: the markdown that becomes the comment
- `created_at`, `decided_by` (user FK, set null), `decided_at`
- index `(issue_id, id desc)`; a revision trigger moves the issue's detail scope, so an
  open issue shows a new draft without a reload

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
  then `node ~/.local/bin/plan-time.mjs setup https://plan-api.cambray.co`. Setup asks for
  the API URL (the argument fills it in), an API key and a device name, and stores the key:
  - in the macOS Keychain as `itsaplan_time_key`
  - elsewhere in `~/.config/plan-time/credentials` with mode 0600
  - a device name
- **Local store.** `~/.local/share/plan-time/` (or `$PLAN_TIME_HOME/data`), mode 0700:
  `outbox/<date>.json` holds blocks waiting for review, `sessions/<id>/` a ticket
  session and its screenshots. `~/.config/plan-time/sent.log` is the append-only log of
  every request.
- **Commands.**
  - `sync`: read everything since the last cursor, at most the last 7 days, into the
    outbox. Nothing is sent.
  - `watch`: sync every 15 minutes in the foreground, and take a session's screenshots
    while one is open.
  - `review`: opens the local review page for the outbox. Approved blocks are sent to
    `POST /time/agent/blocks`; unticked ones are deleted. `--yes` sends the printed list
    from the terminal instead.
  - `start CON-12 [--agent "<name>"]`: checks the ticket exists, records the session start
    and asks before moving the ticket to its project's first started column.
  - `pause`, `resume`, `discard` (deletes the session folder).
  - `finish CON-12`: builds the docket from the session and opens the review page. On
    **Attach** the ticked screenshots are uploaded as attachments, the docket is uploaded
    as `docket-CON-12-<date>.md`, `POST /issues/:id/dockets` stamps it (the session id is
    its idempotency key, so a resumed Attach does not stamp twice), and the session's
    blocks are sent with `issueId`, so they are confirmed to the ticket. A complete docket
    logs "sent for review: <number>"; the ticket moves to its completed column when a lead
    approves it. The session folder is deleted afterwards (`--keep` retains it).
  - `sent`: prints the request log.
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
- **Review page.** A `node:http` server on `127.0.0.1` with a random port and a one-time
  token in the URL, opened in the browser. It closes after approve or cancel, or after 30
  minutes. It shows "Nothing has been sent", every block and screenshot with a tick box,
  a required "Evidence this is complete, or the blocker" box with a Complete / Blocked
  choice, and the exact files and bytes that Attach will upload.
- **Screenshots.** macOS `screencapture -x` (needs Screen Recording permission for the
  terminal or Node; the Setup page explains), Windows PowerShell `CopyFromScreen`, Linux
  `grim`, then `gnome-screenshot`, then `import`; with none of these, screenshots are off
  and the agent says so.
- **Heartbeat.** Every sync posts the device, platform, agent version and whether
  ActivityWatch is running.
- **Failure.** When ActivityWatch is down, the sync says so and sends a heartbeat with
  `awOk: false`, which Plan shows as "tracker not running".

## 6. API (`apps/api/src/modules/timecap`)

**Agent** (the user's API key or session):
- `POST /time/agent/heartbeat` `{ device, platform, version, awOk }`
- `POST /time/agent/blocks` `{ device, blocks: [{ sourceKey, source, startedAt, endedAt, app, title, domain, detail, issueId? }] }`
  - at most 2,000 blocks per call
  - upserts by `(user, sourceKey)`
  - never changes a confirmed or ignored block
  - suggests on insert
  - a block with `issueId` (an allocated block, from a finished session) is stored
    confirmed to that ticket, with its worklog, through the same path as a confirm in My
    time. The caller must be able to edit the ticket (`work_items` edit); otherwise the
    block is not stored and counts as skipped. A block of a closed week is stored pending,
    as its person could not confirm it either
  - answers the inserted, updated and skipped counts

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
- `GET /me/time/status`: whether any device was seen in the last 24 hours, and
  `lastBlockAt`, when the newest block arrived, and `firstDeviceAt`, when the person's
  first device was set up (the Today banner)

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

**Agent dockets** (`apps/api/src/modules/dockets`):
- When an agent's run of an issue ends (success or failed, internal or external), the api
  writes a draft docket: agent name, trigger, status, start, finish and duration, tokens,
  the tool calls by name and count, the file paths named in the tool calls' arguments
  (from `agent_run_trace`), and the output, cut at 4,000 characters. An `@` in the agent's
  text is written so that it mentions nobody when the docket is attached. A failure to
  draft is logged and never fails the run.
- `GET /issues/:issueId/dockets`: the issue's dockets, newest first (`work_items` read).
  Drafts and discarded dockets are listed only to callers with `work_items` edit: they hold
  agent output, tool and file names and errors nobody has approved.
- `POST /dockets/:id/attach`: stamps the draft (section 8), adds it to the issue as the
  caller's comment and marks it attached (`work_items` edit).
- `POST /dockets/:id/discard`: marks it discarded; nothing reaches the issue (`work_items`
  edit).
- Only a draft can be decided; a second decision is 409.

**MCP tools**, generated from the routes:
- `get_my_time`, `allocate_time_block`, `split_time_block`, `capture_task_from_time`
- `confirm_my_day`, `list_time_rules`, `add_time_rule`
- `list_issue_dockets`, `attach_docket`, `discard_docket`
- `create_session_docket`, `get_docket`, `verify_docket`, `list_project_dockets`,
  `review_docket`

## 7. Web

- **My time** (sidebar under Today, `/time/my`):
  - a day picker, opening on yesterday
  - the device status line
  - the blocks in time order, each with its suggestion chip and confidence, and **Accept**,
    **Change** (ticket and initiative picker), **Split**, **Ignore** and **Capture as task**
  - "Confirm suggested (n)"
  - an "Always do this" toast after a change
  - a "Rules" tab
- **Setup** (`/time/setup`): five steps, each with a check:
  1. install ActivityWatch
  2. create an API key, linking to the account's API keys
  3. download and set up the agent, with commands to copy
  4. run watch: checked by the device's heartbeat in the last 24 hours
  5. first review (`plan-time review`, and `start` / `finish` for a ticket): checked by a
     block having arrived
  - plus Screen Recording (Mac): System Settings → Privacy & Security → Screen Recording,
    allow the terminal app or Node; and Calls (Mac): Full Disk Access and `--calls`
- **Today banner.** With no device seen in 24 hours: "Set up time capture" → Setup. With
  a device seen but no new block for 2 working days: "Time is waiting on your
  computer", asking the person to run `plan-time review`. The 2 working days are counted
  from the last block, and from the first device setup when no block has arrived. Either
  can be dismissed for 7 days.
- **Issue detail.** Above the activity feed: the issue's stamped dockets (section 8), and
  each draft agent docket as "Agent docket waiting for approval", with a collapsed preview
  and **Attach** and **Discard**. Only people who can edit the issue see the drafts.
- **Time page** (Consulting): a "Team setup" list (who has a device, last seen,
  confirmed this week) for owners, and the client totals now include captured time.
- **i18n.** `timecap` and `dockets` namespaces, and `issue.dockets`, in every locale.

## 8. Stamped dockets

A docket is the record that a piece of work was done, or that it is blocked. Once
stamped it cannot change without the change showing.

**Stamp.** The server stamps a session docket when the agent sends it, and an agent docket
when a person attaches it. Stamping sets:
- `number`: `D-<ticket>-<NNN>`, for example `D-CON-12-001`; NNN counts the ticket's stamped
  dockets
- `stamped_at`: the server's clock, never the computer's
- each attachment's `sha256`, computed by the server from the stored bytes
- `fingerprint`: an HMAC-SHA256 of the canonical JSON `{ number, issueId, kind, outcome,
  evidence, body, stampedAt, authorUserId, device, sessionStartedAt, sessionEndedAt,
  activeSeconds, attachments: [{ publicId, filename, contentType, bytes, sha256 }] }`, keys
  in that order, under a key derived from `APP_ENCRYPTION_KEY`; `fingerprint_version` (1)
  names that form. Someone who can write the database cannot make a matching fingerprint.
  **Changing `APP_ENCRYPTION_KEY` makes every docket stamped before it fail verification.**
- the comment on the ticket: a header line with the number in a code span, the stamp in
  Europe/London and UTC, the outcome and a link to the docket page, then the body. No one
  can edit or delete this comment (409)

A session body is cleaned before it is stamped: an image is kept only when it points at
this instance's `/media/attachments/<id>/raw`, raw HTML is escaped, and every `@` is
written so that it mentions nobody. The agent also escapes the evidence text, so it shows
as typed.

**Create** (`POST /issues/:issueId/dockets`, `work_items` edit). `clientKey` is the agent's
session id, which ends in random hex. A repeat by the same person with the same key
returns the same docket (200) and only finishes a step an earlier try left undone; the
same key from another person is 409. The session must have ended no more than 2 minutes
in the future and started no more than 30 days ago, and `activeSeconds` cannot exceed its
length (400).

Other columns on `issue_docket`: `kind` (`session` | `agent`), `client_key` (the session
id, unique per issue and author), `outcome` (`complete` | `blocked`), `evidence` (the
evidence or the blocker), `author_user_id`, `device`, `session_started_at`,
`session_ended_at`, `active_seconds`, `attachments` (jsonb), `comment_id`, `flagged_at`
(when a blocked docket's people were told), `review_status`, `reviewed_by`, `reviewed_at`,
`review_note`, `review_moved`.

**Verify.** `GET /dockets/:id/verify` recomputes the fingerprint, compares the posted
comment with what was posted, and reads every attachment's bytes again, one at a time. It
answers `verified`, or `changed` with what differs: the docket's details, a comment that was
edited or deleted, or an attachment that is missing or whose bytes no longer match. A store
error other than a missing file is 502 (could not be checked). The attachment result is kept
in memory for 5 minutes per docket while no attachment is replaced.

**Docket page** (`/docket/<id>`, signed in, outside the app shell). The instance logo and
name, "Evidence docket", the number, and the stamp in UK time and UTC; the ticket, client,
person and device (or agent), the session in UK time and its active time; the outcome
(Complete green, Blocked amber), the evidence or blocker, the review state; the timeline
and apps tables; each screenshot full width with its file name and short sha256; and at
the foot the full fingerprint and the result of a verify run when the page opens.
**Save as PDF** prints the page: A4, light colours, no buttons, screenshots from a new page.

**Review.** A complete docket is stamped `pending`; a blocked one is not reviewed.
`POST /dockets/:id/review` `{ decision: 'approve' | 'return', note? }`, for God mode or a
project member with `workflow_config` edit, on a pending docket only (409 otherwise):
- the docket's author cannot review it (403), God included
- approve moves the ticket to the project's first completed column and removes its "At
  risk" label, unless a blocked docket was stamped after it
- return needs a note; it moves the ticket to the first started column and posts
  "Returned by <name>: <note>"
- either notifies the docket's author
- when the ticket cannot move (no such column, or a hard WIP limit), the comment says
  "(ticket not moved: <reason>)" and the docket's `moved` is false
- if a step fails, the comment, the move and the labels are put back and the docket is
  pending again

On the ticket, a reviewer sees **Approve** and **Return** on each pending docket; Return
asks for the note.

**Blocked.** A blocked docket adds the label "At risk" to the ticket (created in the
project when missing) and notifies the ticket's assignee and the project's
`workflow_config` editors.

**Register** (sidebar → Dockets, `/<team>/<project>/dockets`;
`GET /projects/:projectKey/dockets?month=&initiativeId=&outcome=&review=`): a month's
stamped dockets, newest first, filtered by client, outcome and review. Counts at the top:
Delivered (approved), Pending review, Blocked, Returned. Each row links to its docket
page; **Check** runs verify on that row only.

## 9. Tests

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
  - an allocated block is confirmed with a worklog; one for a ticket the person cannot
    edit is skipped; one of a closed week is stored pending
  - a run of an issue drafts a docket; attach writes one comment, discard none; a second
    decision is 409; a reader and a non-member can neither list nor decide
- **Agent unit**, against fixture data, with no ActivityWatch needed:
  - clipping to AFK, merging, minimum and maximum length
  - the private list and the stable `source_key`
  - call parsing from a fixture SQLite file
  - no request leaves before approval, apart from the heartbeat and reads; after Attach
    exactly the approved files and blocks are posted
  - a screenshot is skipped when idle or when a private app is in front
  - the review server binds 127.0.0.1 and refuses a request without the token
- **Rendered check:** the local stack with a fake ActivityWatch server; screenshots of
  My time, Setup, the Today banner, and the Time page team list.

## 10. Rollout

1. Deploy as v1.5.0-cambray.3.
2. Ian sends the notice.
3. Ian installs first, with calls.
4. Jo, Zak and Tim install.
5. One week later, review whether three minutes a day holds. Tune the confidence
   thresholds and the default private list.
