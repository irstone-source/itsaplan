# Rize in It's a Plan — scope

Status: proposed, not built. Decisions for Ian are in section 6.

## 1. Goal

Show the hours tracked in Rize next to the work planned in It's a Plan, so a cycle shows
what it was estimated to be worth, what was tracked against it, and what can be billed.

## 2. What Rize offers (checked against its API on 30 Sep 2026)

| Need | Rize API |
| --- | --- |
| Endpoint | GraphQL, `https://api.rize.io/api/v1/graphql`, header `Authorization: Bearer <key>` |
| Key | Rize → Settings → API. The key acts as the user who made it. |
| Team time | `timeEntries(teamId, creatorEmails, startTime, endTime, …)` and `timeAllocation(groupBy: member/client/project/task, bucket)`; team-wide reads need a Rize team admin |
| Structure | `clients`, `projects`, `tasks`, `teamMembers` (with hourly and cost rates) |
| Extras | `summaries` (focus, meetings, breaks per day), `contracts` and `contractProfitability`, planned time allocations, AI time-entry suggestions awaiting approval |
| Writes | 64 mutations, including create client, project and task |
| Webhooks | Set up in the Rize app only, signed with `X-Webhook-Signature` (HMAC SHA-256). Event list not documented. |
| Rate limits | Not published for the GraphQL API |

## 3. Phase 1 — connection and sync

- **Setting.** God mode → Integrations → Rize: API key (stored encrypted with
  `@repo/crypto`, like the other secrets), the Rize team, "Sync now", last sync time and
  errors. The key is pasted in the page, never in chat or a file.
- **Sync.** The worker pulls time entries every 15 minutes: the last 3 days on each run,
  the last 60 days on the first run and on "Sync now". Entries are upserted by Rize id, so
  an edit or a deletion in Rize is reflected on the next run.
- **Table `rize_time_entry`.** Rize id, member email, start, end, seconds, billable,
  status, title, Rize client, project and task (id and name), the matched user and issue,
  synced at.
- **Matching.**
  - Person: Rize member email = It's a Plan user email.
  - Issue: an issue id in the Rize task or entry title (`CON-14 — …`); an old id
    (`LANO-2`) is found through the "Migrated from" line.
  - Client: a Rize client is mapped to a CON client label (a small mapping table,
    pre-filled by name).
  - Anything unmatched is kept and counted as "untagged" or "unmatched", never dropped.

## 4. Phase 2 — where the hours show

| Place | Shows |
| --- | --- |
| Ticket card and detail | Tracked hours next to the estimate; amber when tracked passes the estimate |
| Cycle strip | Tracked vs estimated hours; value (estimate × rate) vs tracked value (tracked × rate); per client; tracked time not matched to a ticket |
| Performance | Each person's completed billings beside their tracked billable hours and tracked value |
| Finance, per month | Tracked hours, billable share, utilisation (billable tracked ÷ working hours), untagged hours |
| Today | My tracked time today, focus and meeting time (from `summaries`) |

Members see their own tracked time; team totals are for the owner only, the same split as
Performance.

## 5. Phase 3 — push to Rize

When a CON ticket is created, create its Rize task (`CON-14 — title`) under the client's
Rize project, creating the project when missing. This replaces step 4 of the daily
intake routine and makes the naming that matching depends on automatic. The initiative
day rates can also be written to Rize contracts, so Rize's profitability view uses the
same rates.

## 6. Decisions for Ian

1. **Billing basis.** Keep billings as completed tickets × estimate (current), and show
   tracked value beside it; or bill day-rate work on tracked hours. Recommendation: show
   both now, switch day-rate clients to tracked once untagged time is under 10%.
2. **Key.** The key must come from a Rize team admin account (yours) to read everyone's
   time.
3. **Push (phase 3).** Let It's a Plan create Rize tasks, and drop that step from the
   daily routine.

## 7. Known risks

- 75% of Rize hours were untagged to a client in September; tracked figures mean little
  until tagging improves. The untagged figure is shown on every view so the gap is visible.
- Rize publishes no rate limit for GraphQL; the sync reads a small window and backs off
  on errors.
- Webhooks are not used: polling needs no public receiver and the event list is not
  documented.

## 8. Size

Phase 1: about a day. Phase 2: one to two days. Phase 3: half a day. Each phase ships on
its own.
