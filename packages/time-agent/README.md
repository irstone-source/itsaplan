# @repo/time-agent (`plan-time`)

A small CLI that reads ActivityWatch on your own computer, turns the raw activity into
blocks (app, window title, website domain, start, end) and sends them to Plan once you have
approved them. On a Mac it can also read iPhone calls synced through iCloud. During a work
session on a ticket it takes a screenshot every 5 minutes and builds an evidence docket for
the ticket. Raw data, full URLs and keystrokes never leave the machine. The design is in
`docs/cambray/time-capture.md`.

## What leaves the machine

Nothing about your activity is sent without your approval:

- `sync` and `watch` keep blocks in an outbox on this computer. `review` opens a page
  where you tick what to send; unticked blocks are deleted locally.
- Screenshots stay in the session folder until `finish`, where the same page shows each
  one with a tick box and the exact list of files and bytes **Attach** will upload.
- The only automatic request is the heartbeat: device name, platform, version and whether
  ActivityWatch answered. No activity.
- Every request this program makes to Plan, reads included, is written to
  `~/.config/plan-time/sent.log` first. `plan-time sent` prints it.

The review page is served on `127.0.0.1` on a random port, needs the one-time token in the
printed URL on every request, and stops after Attach, Send, Cancel or 30 minutes.

Attached screenshots and the docket file are served by Plan at
`/attachments/<id>/raw`, which needs no sign-in: anyone who has the link can view them.

Plain Node 20+, no Bun APIs in `src`: `bun run build` bundles `src/cli.ts` to
`dist/plan-time.mjs` and copies it to `apps/web/public/plan-time.mjs`, so Plan serves it.

## Install

```bash
curl -fsSL https://plan.cambray.co/plan-time.mjs -o ~/.local/bin/plan-time.mjs
node ~/.local/bin/plan-time.mjs setup https://plan-api.cambray.co
```

Setup asks for the Plan API URL (the API's origin, `plan-api.cambray.co`, not the web
app's; the argument fills it in), an API key and a device name. The key goes into the macOS
Keychain (`itsaplan_time_key`), or `~/.config/plan-time/credentials` (mode 0600) elsewhere.
Everything else is in `~/.config/plan-time/config.json`.

Local data is in `~/.local/share/plan-time/` (mode 0700): `outbox/<date>.json` holds the
blocks waiting for review, `sessions/<id>/session.json` and `sessions/<id>/shots/*.png` the
open work session. With `PLAN_TIME_HOME` set, config and `sent.log` are in that directory
and local data in `$PLAN_TIME_HOME/data`.

## Commands

| Command                                          | What it does                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `sync [--calls] [--dry-run]`                     | read activity since the last sync, at most 7 days, into the outbox   |
| `watch [--calls]`                                | sync every 15 minutes in the foreground; screenshots for an open session |
| `review [--yes]`                                 | open the review page for the outbox; send what you tick              |
| `start <TICKET> [--agent <name>]`                | open a work session, offer to move the ticket to its first started column, screenshot every 5 minutes in the foreground |
| `pause` / `resume`                               | stop and restart screenshots; paused time is left out of the docket  |
| `finish <TICKET> [--keep]`                       | build the evidence docket and open the review page                   |
| `discard`                                        | delete the open session and its screenshots                          |
| `sent`                                           | print every request made to Plan                                     |
| `install-autostart [--calls]`                    | opt-in: launchd agent, Startup folder entry or systemd user unit for `watch` |
| `status`                                         | configuration, tracker, outbox, open session, last sync per source   |
| `private list`                                   | the apps, domains and title words that are never recorded            |
| `private add <apps\|domains\|titles> <value>`    | extend the private list                                              |
| `private remove <apps\|domains\|titles> <value>` | shrink it                                                            |

`review --yes` prints every block in the terminal and, at a terminal, asks before sending
all of them. Without a terminal it sends them after printing the list.

`--calls` reads `~/Library/Application Support/CallHistoryDB/CallHistory.storedata` and the
AddressBook databases; the terminal (or `node`) needs Full Disk Access.

## Work sessions and dockets

One session is open at a time. `start CON-158` reads the ticket and asks before moving it
to the project's first `started` column. Every 5 minutes it takes a screenshot into the
session folder, unless the ActivityWatch AFK watcher says you are away, the window in
front (app, title or site) is on the private list, ActivityWatch cannot say what is in
front or whether you are away (no AFK watcher, or its state is over 3 minutes old), or the
session is paused. `watch` takes the same screenshots while a session is
open; when both run, a shot taken by one is not repeated by the other.

Screenshots use `screencapture -x` on macOS (the terminal needs Screen Recording
permission), PowerShell `CopyFromScreen` on Windows, and `grim`, `gnome-screenshot` or
ImageMagick `import` on Linux. On macOS the file is then scaled down to at most 2560
pixels on its longer side with `sips`.

A screenshot shows everything on the screen at that moment, including windows that were
not in front and notifications. The private list only decides whether a shot is taken, from
the window in front. Unticking a screenshot on the review page is how to keep it off the
ticket. If none works, screenshots are off for that run, with one
warning.

`finish CON-158` builds the docket from the session window: the activity blocks (made as
below, cut to the session and its pauses), time per app and site, active and idle time,
and the screenshots. The review page asks for the outcome: **Complete**, with the evidence
that it is done, or **Blocked**, with the blocker. The text is required and is added to the
docket under "Evidence this is complete" or "Blocker". **Attach** then:

1. uploads each ticked screenshot to `POST /issues/:id/attachments`;
2. uploads the docket as `docket-CON-158-<date>.md` to the same route;
3. sends the docket to `POST /issues/:id/dockets`, with the session id as `clientKey` and
   the publicIds of the screenshots and the `.md` file. Plan stamps it with a number
   (`D-CON-158-001`), the server time and an HMAC-SHA256 fingerprint over the docket and the bytes
   of those files, and posts it to the ticket as a comment, with the screenshots embedded
   the way the web editor embeds an uploaded image (`/media/attachments/<id>/raw`). Window
   titles, app and site names, the ticket title and the agent name are escaped so they
   cannot mention anyone or render as markdown or HTML;
4. sends the ticked blocks to `POST /time/agent/blocks` with `issueId`, so they are stored
   confirmed against the ticket.

A complete docket waits for a lead to review it: approval moves the ticket to the first
`completed` column, a return moves it back to the first `started` column with a note. The
terminal prints `sent for review: D-CON-158-001`. A blocked docket leaves the ticket where it
is; Plan tells the assignee and the project leads and labels the ticket "At risk".

Unticked screenshots and blocks are deleted locally and never sent. Outbox blocks that fall
inside the session are removed, because the docket covers them. The session folder is
deleted after a successful attach unless `--keep` is given; Cancel keeps it open. Each
step of an approved attach is recorded in `session.json` as it completes, so if one fails,
running `finish` again resumes from that step without asking again or uploading twice.

## How blocks are made

1. Window events are clipped to not-AFK time.
2. Browser windows get the domain (hostname only) of the web-watcher tab that overlaps them most.
3. The same app, title and domain separated by under 60 seconds are merged.
4. Blocks over 3 hours are split; blocks under 2 minutes are dropped.
5. The private list is applied.
6. `sourceKey` = sha256 of `device|app|title|start minute`, so a re-read block replaces
   its copy in the outbox and a re-sent block updates rather than duplicates. Each sync re-reads from 3 hours before the last successful sync,
   earlier when the same activity was still running at that point, and keeps the blocks
   that ended after it. Calls reach the Mac from iCloud some time after they end, so every
   sync re-reads the whole 7 days of calls.
7. On Windows an app is matched by its executable name without `.exe`.

## Development

```bash
bun test                # unit tests, nothing needs to be running
bun run typecheck
bun run build
```
