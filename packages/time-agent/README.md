# @repo/time-agent (`plan-time`)

A small CLI that reads ActivityWatch on your own computer, turns the raw activity into
blocks (app, window title, website domain, start, end) and sends them to Plan. On a Mac it
can also read iPhone calls synced through iCloud. Raw data, full URLs, screenshots and
keystrokes never leave the machine. The design is in `docs/cambray/time-capture.md`.

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

## Commands

| Command                                      | What it does                                           |
| -------------------------------------------- | ------------------------------------------------------ |
| `sync [--calls] [--dry-run]`                 | send everything since the last sync, at most 7 days    |
| `watch [--calls]`                            | sync every 15 minutes in the foreground                |
| `install-autostart [--calls]`                | opt-in: launchd agent, Startup folder entry or systemd user unit for `watch` |
| `status`                                     | configuration, tracker state, last sync per source     |
| `private list`                               | the apps, domains and title words that are never sent  |
| `private add <apps\|domains\|titles> <value>` | extend the private list                               |
| `private remove <apps\|domains\|titles> <value>` | shrink it                                          |

`--calls` reads `~/Library/Application Support/CallHistoryDB/CallHistory.storedata` and the
AddressBook databases; the terminal (or `node`) needs Full Disk Access.

## How blocks are made

1. Window events are clipped to not-AFK time.
2. Browser windows get the domain (hostname only) of the web-watcher tab that overlaps them most.
3. The same app, title and domain separated by under 60 seconds are merged.
4. Blocks over 3 hours are split; blocks under 2 minutes are dropped.
5. The private list is applied.
6. `sourceKey` = sha256 of `device|app|title|start minute`, so a re-sent block updates
   rather than duplicates. Each sync re-reads from 3 hours before the last successful sync,
   earlier when the same activity was still running at that point, and sends the blocks
   that ended after it. Calls reach the Mac from iCloud some time after they end, so every
   sync re-reads the whole 7 days of calls.
7. On Windows an app is matched by its executable name without `.exe`.

## Development

```bash
bun test                # unit tests, nothing needs to be running
bun run typecheck
bun run build
```
