# Growth tracker (Boolean tracker) in It's a Plan — scope

Status: proposed, not built. Ian's decisions of 4 Oct 2026 are applied; the questions still
open are in section 13.

## 1. Goal

Growth on rails for every company Cambray runs or serves. Each company's growth is broken
into initiatives; each initiative carries a few measures with a target for every period;
every period each measure gets a colour. Zoomed out, the board shows how much of each
company's revenue loop and capital loop is on target, where the data is missing, and which
measures are drifting, early enough to act inside the month.

Two things must hold for that confidence:

1. **Every hole is visible and chased.** A missing or unverified figure is never shown as
   fine. It is black (missing) or carries a person marker (unverified), and a task chases
   it every working day until the figure is in.
2. **The colours are trustworthy.** Figures come from a system of record wherever one
   exists, targets cannot be moved silently, and a definition of every measure is written
   down before it is tracked.

## 2. What it is built on

- **Ian's tracker, 2023–25** (Firestarter origin; the Lanoguard Google Sheet; the "growth
  tracker / Growth 90" from Dec 2024). Weekly yes/no per item, entered by the person
  responsible, run by Zak in the weekly meeting. "Have you done it, haven't you done it."
  Several weeks of red means more resource or the wrong person. Tracked for 90 days it is
  "a heartbeat to the business". Sources: Otter 2024-05-10, 2024-08-14, 2024-08-28,
  2024-12-03; Fathom 2024-08-14, 2025-02-04, 2025-03-11, 2025-03-13.
- **The Lanoguard health board, 2026** (`~/unfair-advantage/lanoguard-health-board.html`,
  `scripts/update-boolean-tracker.js`, funnel definitions in
  `lanoguard-funnel-metrics-spec.md`). The rules kept here: four kinds of measure; colour
  by actual ÷ target; locked until enough data; a streak of reds raises a focus meeting
  that asks resource, performance or system.
- **It's a Plan today.** Initiatives show a health badge computed from ticket progress
  against the timeline (delivery, not outcomes). Agents exist as team users with their own
  key, schedules and a run log; they cannot be attached to an initiative yet.

## 3. Structure

```
Company (Cambray, George Stone Gardens, Forever Green Energy, Window Supply Direct, Lanoguard, …)
  └ Loop: Rev loop | Cap loop
      └ Initiative (owner, agent, status)
          └ Measure (≤ 5 per initiative; kind, definition, target rule, source)
              └ Period entry (actual, evidence, verification, colour)
```

- **Company** is new. A client's growth measures belong to the client, not to Cambray: the
  board never adds one company's revenue to another's. Cambray's own consulting
  initiatives (CON) are Cambray's measures; a client's sales are the client's.
- **Loops** (Ian, 4 Oct):
  - **Rev loop**: revenue operations. Cold email and the rest of RevOS: sends, replies,
    meetings, proposals, deals, revenue.
  - **Cap loop**: finance and operational reporting: cash, costs, contribution margin,
    break-even, funding.
- **Five measures at most per initiative.** "Everything not on this board is either support
  work or a distraction" (2026 board). The limit keeps the board readable.

## 4. Measures

| Field | Meaning |
| --- | --- |
| Kind | activity (controllable), engagement (influenced), outcome (lagging), guardrail (limit), gate (milestone checklist) |
| Definition | What counts, from which system, inclusion rules, ex- or inc-VAT, invoiced or collected, which time zone. Required before the first entry; versioned, and a change starts a new version |
| Direction | at least, or at most (guardrails) |
| Cadence | weekly or monthly; a monthly measure also shows a weekly pace line |
| Target rule | section 5 |
| Unlock rule | a number of periods or a minimum volume before the measure can be judged |
| Owner | the person accountable; enters the figure when no agent can |
| Source | manual, It's a Plan, RevOS, Xero, Rize, HubSpot, or another system; and the query or report |

Every company's Rev loop uses one shared set of funnel definitions (sends, bounces,
replies, positive replies, meetings booked, meetings held, proposals, deals, revenue), so
the same measure means the same thing for George Stone and for Lanoguard; only the targets
differ.

## 5. Target rules

Ian sets the rule; the period targets follow from it.

| Rule | Period target |
| --- | --- |
| Set amount | the same number every period (1 pallet a week) |
| Linear | start + step × period (+20 sends a week, every week) |
| Compounding | start × (1 + rate)^period (5% month on month) |
| Push to gate | a milestone by a date; between now and then the target is the pace needed to reach it, and on the date it is passed or failed |
| Shelf | hold a level: the target stays at the level reached, for a set number of periods, before the next rise |
| Leapfrog | step changes on set dates (e.g. +50% at the start of each quarter), flat in between |

- **Seasonality.** A rule can carry a seasonal profile (the 2024 tracker split weekly
  revenue by Lanoguard's seasonality) and the working-day calendar (bank holidays, the
  Christmas weeks), so a short week is not judged as a full one.
- **Changing a target.** A target can be changed only by the person who sets targets, with
  a reason. Each period is judged against the target in force at the time; past colours
  never change because a target moved. The change shows on the board.
- **Gate measures** (for rollouts): an ordered checklist with a date per step, e.g. RevOS
  for a client: domains bought → mailboxes warmed → list built → sequences live → first
  reply → first meeting. Each step is passed or not; the measure is green while the next
  step is on time.

## 6. Colours

| State | Colour | When |
| --- | --- | --- |
| On target | green | actual ≥ 90% of target |
| Close | amber | ≥ 70% |
| Off target | red | < 70%; a guardrail over its limit at once |
| No data | **black** | no figure by the deadline, from the owner or the agent |
| Unverified | colour + **person marker** | a figure exists but has not been checked against a system of record |
| Not judged yet | grey | before the unlock rule is met |
| Restated | colour + mark | a figure changed after the period closed; the old value is kept |

- **Black is a red with a different cause.** It counts toward a streak, and the chase in
  section 8 starts the same day. Black records why: owner did not report, or the agent
  could not reach the source (a system hole, e.g. a connector that does not authorise).
- **Small numbers.** A target of 1 a week can only be 0 or 1, so the 90/70 bands mean
  nothing. A measure with a target under 5 per period is also judged on its rolling
  four-period total, and the cell shows both.
- **Streaks.** A run of reds or blacks raises a focus flag: 2 periods for activity, 3 for
  engagement, 4 for outcome, 1 for a guardrail or a failed gate step. A green period
  restarts the count.
- **Model check.** When an initiative's activity measures are green for 4 periods running
  and its outcome is red for the same 4, the flag says the plan is wrong, not the people:
  the conversion assumptions behind the targets are revised.

## 7. The agent on each initiative

Every initiative has an architect agent, run as a Claude cloud routine (Ian, 4 Oct).

- **Schedule.** Every Monday at 07:00, before the weekly meeting, and daily at 07:00 while
  any cell of its initiative is black or unverified. "Run now" on the initiative page.
- **What it does.** Fetches each measure's figure from the source named in its definition;
  checks it; writes the period with its evidence; posts a report to the initiative feed:
  status per measure, change since last period, streaks about to trip, holes, and what to
  look at. When a focus flag trips it drafts the focus ticket: which of resource,
  performance or system the data points at, and why.
- **Verification.** Verified: read from a system of record, or two sources agree.
  Unverified: one soft source (a figure said in a meeting or Slack). Conflict: sources
  disagree; both values are shown and the cell carries the person marker.
- **What it may not do.** Set or change targets, change definitions, edit a closed period
  without marking it restated, or type a figure without a source. Only an initiative's own
  agent (and people) can write its measures.
- **What it reads is data, not instructions.** Emails, Slack messages and transcripts it
  reads can contain text aimed at agents; the routine treats them as data, as the daily
  intake routine does.
- **Cost and failure.** Each agent has a step limit and a monthly run budget. Two failed
  runs in a row turn the agent amber, three red, on the Agents board.

## 8. Chasing holes

| When | What happens |
| --- | --- |
| Period closes (Monday 12:00 for weekly) | cells without a figure go black; a task "Figure missing: <measure>, w/c <date>" is created for the owner, due today |
| Figure arrives unverified | person marker; a task "Check figure: <measure>" for the owner, with the agent's evidence |
| Every working day | the agent retries the source; the task stays open and its due date moves to today |
| Third working day | the task is assigned to Ian as well, and the cell shows how many days the hole is old |
| Figure in and verified | the task closes itself with the value and its source |

The chase stops only when the figure is in, or when Ian marks the hole as permanent (the
source does not exist), which is itself shown on the board.

## 9. Where it shows

- **Tracker page**: company and loop tabs; measures down the side, the last 13 periods
  across; above it the share of green, amber, red and black per loop, the trend, and a
  coverage figure (share of cells with a verified figure).
- **Pace and forecast.** Each outcome measure shows the run rate against the period and
  quarter target: "at this pace, 3.2 of 4 pallets this month". Confidence comes from
  seeing the projection, not only last week's colour.
- **Initiative page**: a Measures tab; the health badge shows the tracker colour when the
  initiative has measures.
- **Monday agenda**: generated from the board: only red, black, unverified, conflicts and
  focus flags, with last week's decisions and whether they were done.
- **Agents board**: each initiative's agent, last and next run, holes, share verified,
  conflicts, runs and cost this month.
- **Client view**: a read-only share link per company, showing that company's board only.

## 10. Focus meetings and what comes after

A focus flag creates a ticket: "Focus: <measure> — resource, performance or system?" The
meeting must record one outcome:

| Outcome | Effect |
| --- | --- |
| Re-resource | more hours or a different owner; the capacity check (section 11) must pass |
| Fix the system | a ticket for the system fix, linked to the measure |
| Re-target | a new target with its reason (section 5) |
| Shelf | hold the current level for N periods |
| Stop | the initiative is shelved; its measures stop, history is kept, and it leaves the roll-up |

A measure still red two focus meetings later goes to Ian.

## 11. Things the targets depend on

- **Capacity.** Green plans that need more hours than the team has will not happen. Each
  initiative's planned hours (cycle estimates) are checked against available hours (Rize,
  once synced); "resource" in a focus meeting is answered from that, not from opinion.
- **Margin guardrails.** Revenue growth bought at a loss is not green. Every revenue
  initiative carries a guardrail from the Cap loop: contribution margin or cost per
  acquisition within its limit.
- **Cash, not books.** Cap loop figures use bank receipts as the source of truth (Ian's
  rule); where the books and the bank differ the cell is a conflict.
- **Ex-VAT.** All money measures are ex-VAT unless the definition says otherwise.

## 12. Sources and readiness (checked 4 Oct 2026)

Many cells will be black on day one. That is intended: the first job is closing the holes.

| Source | State | Effect |
| --- | --- | --- |
| It's a Plan | ready | billings, cycle value, tickets |
| RevOS | live for George Stone; just running for Lanoguard; not set up for Forever Green Energy or Window Supply Direct | one adapter for RevOS, not one per client; Rev loop cells black for clients without it, and their RevOS rollout tracked as gate measures |
| Lanoguard 2026 tracker data | ready, except "engaged": Saleshandy open tracking is off | the engaged row stays black until tracking is on or the measure is dropped |
| Slack | the connector does not authorise in routine runs | figures said in Slack are unreachable until the read-only bot token is added |
| Fathom | works in routines | figures said in meetings, always unverified |
| Rize | not synced; 75% of hours untagged to a client | capacity checks wait for the Rize sync and tagging |
| Xero | Cambray's token is on Ian's Mac (Keychain), which cloud routines cannot reach; bank feeds unreconciled since early August | Cap loop cash figures need a server-side Xero connection, and reconciliation |
| HubSpot | a different portal per client | one source entry per company |
| Object storage (S3) | not configured on production | not needed for cloud-routine agents |

## 13. Open questions for Ian

1. **Cambray's growth measure.** 5% month on month of which figure (billings, cash
   collected, or monthly recurring revenue), from which starting month.
2. **Loops.** Two loops, Rev and Cap, with contribution margin and break-even inside the
   Cap loop — or a third group for unit economics.
3. **Target rule names.** Section 5 reads "shelf" as holding a level and "leapfrog" as
   step changes on set dates. Correct?
4. **Who sets targets.** Ian for every company, or each company's lead with Ian's
   approval.
5. **Client access.** Do client staff see their own board (share link) from the start, or
   later.
6. **First companies and measures.** Suggested start: the RevOS rollout as a gate measure
   for each of the four clients, George Stone's Rev loop funnel, Lanoguard's pallet sales
   (1 a week), and Cambray's growth measure.

## 14. Phases

1. **Structure and entry.** Company and loop, measures with definitions and target rules,
   period entry with evidence, colours including black and the person marker, Tracker page,
   initiative tab. About three days.
2. **Chasing and focus.** Hole and check tasks, the daily chase, focus flags and outcomes,
   Monday agenda. About two days.
3. **Agents.** `initiative.agent_id` and the write rule, the routine template, the first
   two agents (Lanoguard and George Stone), Agents board. About two days, then a routine
   per initiative.
4. **Sources and confidence.** RevOS adapter, pace and forecast, small-number rule, model
   check, capacity check, margin guardrails, client share link. About three days, plus
   Rize and Xero as they land.

## 15. Not found in the transcripts

"One pallet sale per week" and the Ryan Deiss reference do not appear in the Otter or
Fathom transcripts searched; they come from Ian's brief of 4 Oct 2026. The original Google
Sheet and Zak's setup notes are not on this Mac.
