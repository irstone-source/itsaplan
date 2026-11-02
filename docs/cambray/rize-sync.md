# Rize in It's a Plan

Status: built in v1.5.0-cambray.2 (2 Nov 2026). The day-to-day use is in README section 5.

## How it works

- **Connection.** God mode → Integrations → Rize holds the API key, encrypted in
  `app_secret` under `rize`. A key from a Rize team admin reads the whole team. The last
  sync time and error are in `app_setting` `rize`.
- **Sync.** `modules/rize/service.ts` `syncRize(days)`, run by the api's background loop
  every 15 minutes (`RIZE_SYNC_INTERVAL_MS`) under a Postgres advisory lock, so one
  replica syncs at a time. It reads the last 3 days (60 on the first run and on "Sync
  now") through `modules/rize/client.ts`, the one file that knows Rize's GraphQL shape.
- **Table `rize_time_entry`.** One row per Rize entry, upserted by Rize id; rows inside the
  window that Rize no longer returns are deleted. `user_id`, `issue_id` and
  `initiative_id` are what the entry was matched to; `match_source` is `auto`, `manual`
  or `none`.
- **Matching** (`modules/rize/match.ts`): the person by email; the ticket by the first
  identifier (`CON-14`) in the task name, then the entry title, then the project name;
  the client initiative from the ticket, else from `rize_client_map` (Rize client name →
  initiative, set on the Time page). A manual link (Time → "Tie to ticket") is kept on
  later syncs.
- **Worklogs.** A matched entry with a person keeps one `issue_worklog` row
  (`rize_entry_id`), so the ticket shows the time as logged.
- **Limits.** Each initiative's `monthly_minutes` is the client's monthly limit; the
  state is `flag` from 60% tracked and `stop` from 70% (`timeState`).

## Routes

`GET/PUT /god/rize`, `POST /god/rize/sync` (god only); `GET /projects/:key/time?month=`,
`POST /projects/:key/time/entries/:entryId/link`, `PUT /projects/:key/time/clients`
(MCP: `get_tracked_time`, `link_time_entry`, `map_rize_client`).

## Not built

- Creating the Rize task when a ticket is created (`CON-14 — title`), which the old daily
  routine did. Until then, name Rize tasks with the ticket id by hand, or tie entries on
  the Time page.
- Billing on tracked hours: billings stay outcome-priced; time measures the limit.
