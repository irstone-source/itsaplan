# Boolean tracker in It's a Plan — scope

Status: proposed, not built. Decisions for Ian are in section 9.

## 1. Goal

Every growth initiative carries the measures that say whether it is on the rails. Each week
each measure gets a colour. Zoomed out, the board shows how much of acquisition, delivery
and marketing operations is green, amber or red, and a run of reds forces a conversation
about resource, performance or system before the month is lost.

## 2. What it is built on

- **Ian's tracker, 2023–25** (Firestarter origin; the Lanoguard Google Sheet; renamed the
  "growth tracker / Growth 90" in Dec 2024). Weekly yes/no per item, entered by the person
  responsible, run by Zak in the weekly meeting. "Have you done it, haven't you done it."
  Several weeks of red means more resource or the wrong person. Tracked for 90 days it is
  "a heartbeat to the business". Sources: Otter 2024-05-10, 2024-08-14, 2024-08-28,
  2024-12-03; Fathom 2024-08-14, 2025-02-04, 2025-03-11, 2025-03-13.
- **The Lanoguard health board, 2026** (`~/unfair-advantage/lanoguard-health-board.html`,
  `scripts/update-boolean-tracker.js`). The built version, and the rules this scope keeps:
  - Four kinds of measure: activity (controllable), engagement (influenced), outcome
    (lagging), guardrail (trip switch).
  - Cell colour by actual ÷ target: green at 90% or more, amber at 70% or more, red below.
  - Locked (grey) until there is enough data; a locked measure cannot go red and is left
    out of the roll-up.
  - A run of reds raises a focus meeting: 2 weeks for activity, 3 for engagement, 4 for
    outcome; a guardrail trips at once. The meeting asks one question: resource,
    performance or system? If the target was wrong, change it and record why.
- **What It's a Plan already has.** Initiatives show a health badge (on track, at risk,
  off track), but it is computed from ticket progress against the timeline: it measures
  delivery, not outcomes. The tracker adds the outcome side and reuses the same colours.

## 3. Data

| Table | Holds |
| --- | --- |
| `measure` | Initiative, name, kind (activity, engagement, outcome, guardrail), lane, unit, direction (at least / at most), owner, weekly target or target rule, unlock rule, source, active from |
| `measure_week` | Measure, ISO week, actual, done (yes/no measures), note, entered by, entered at |

- **Target rules.** A fixed weekly number ("1 pallet sale a week"); yes/no (target = done);
  growth ("5% month on month" from a baseline month, split into weeks by the cycle's working
  days); a ceiling for guardrails ("marketing spend at most £X a week").
- **Unlock rule.** A number of weeks or a minimum volume (the 2026 board unlocks reply
  rate at a set number of sends) before the measure can be judged.
- **Lane.** The roll-up group: Acquisition, Delivery, Marketing operations, Finance (list
  to confirm).

## 4. Colours

| Measure | Green | Amber | Red |
| --- | --- | --- | --- |
| Number, at least | actual ≥ 90% of target | ≥ 70% | < 70% |
| Number, at most (guardrail) | within the limit | — | over the limit, at once |
| Yes/no activity | done | not done, first week | not done, second week running |
| Any, before unlock | grey | grey | grey |

A week with no entry shows as "not reported" (section 8, decision 2). A green week
restarts every count.

## 5. Where it shows

- **Tracker page** (sidebar, across projects, like Today): measures down the side grouped
  by lane, the last 13 weeks across, one coloured cell per week. Above it, this week's
  share of green, amber and red per lane and the trend over 13 weeks. Filter by project or
  client initiative.
- **Initiative page:** a Measures tab with the same grid for that initiative. When an
  initiative has measures, its health badge shows the tracker colour (worst current
  colour) instead of the timeline estimate.
- **Weekly check-in:** "Your measures this week" on Today, one line per measure the person
  owns: a number or a done tick, and a note. Due by Monday 12:00 for the week before.
- **Focus flag:** when a streak trips, the measure is flagged and a ticket is created in
  the initiative's project, "Focus: <measure> — resource, performance or system?",
  assigned to the owner and due that week. The flag clears on the next green week.

## 6. Automatic actuals

| Source | Measures it can fill |
| --- | --- |
| It's a Plan | Billings (completed client work), cycle net value, tickets completed, tickets created per label |
| Finance page | Month target and growth baseline |
| Rize (after the Rize sync) | Tracked and billable hours per client |
| Xero (after the Xero connection) | Cash collected per client |
| Agents | The daily intake routine and the MCP can write an actual stated in the standup or Slack, marked as agent-entered |
| Lanoguard data | The 2026 tracker's sends, replies and deals, by the same script writing to the API |

Anything else is entered by hand.

## 7. An agent per initiative

Every initiative gets its own agent: the initiative's architect. It fetches the figures,
checks them, fills the week, and writes a short report on where the initiative stands and
what to look at. It is also how the agent workforce stays under control: one agent per
initiative, a fixed remit, and every run on record.

**What It's a Plan already has.** Agents are first-class users of a team: an internal
agent has a model, instructions, a tool list, its own API key and permissions, a step
limit, and runs on a schedule (`agent_schedule`: cron, prompt, project), on a mention or
when an issue is delegated to it; every run is kept in `agent_run`. An external agent
(Claude Code through the runner or the MCP) acts with its own key. Missing: an agent
cannot be attached to an initiative, and the built-in tools do not reach Xero, HubSpot,
Rize or Slack.

**What is added.**
- `initiative.agent_id`: the initiative's architect. Only that agent (and people) may
  write the initiative's measures; any other agent is refused.
- A weekly schedule per initiative, Monday 07:00, before the weekly meeting, plus "Run
  now" on the initiative page.
- Agent-entered weeks carry their evidence: the source of each figure (a query, a report
  link, a meeting or Slack permalink) and a check result: **verified** (two sources
  agree, or the source is a system of record), **unverified** (one soft source, e.g. a
  figure said in a meeting) or **conflict** (sources disagree; both shown). An unverified
  or conflicting figure colours the cell but is marked, and waits for the owner to
  confirm it.
- The report is posted to the initiative's activity feed: status per measure, what
  changed since last week, what to look for, any streak about to trip, and the figures it
  could not get.
- When a focus flag trips, the agent writes the first pass of the focus ticket: which of
  resource, performance or system the data points at, and why.

**Where it runs.** Two options:
1. *Cloud routine per initiative* (recommended to start). A Claude routine, like the daily
   intake, that already has the Fathom, Slack, Rize, HubSpot and Calendar connectors,
   reads and writes It's a Plan through its MCP as the initiative's agent user. No new
   integrations are needed.
2. *Internal agent.* Runs inside It's a Plan on the worker. Needs custom tools for Xero,
   HubSpot, Rize and Slack, and object storage (S3) for agent skills, which production
   does not have yet.

**Control of the workforce.** An Agents board: each initiative, its agent, last run, next
run, figures filled vs missing, share verified, conflicts open, runs this month and their
cost. An agent that fails two runs running, or whose figures are mostly unverified, goes
amber and red on that board by the same rules as a measure.

**Data rule.** Client figures go only to model routes with zero data retention and a
data processing agreement; an internal agent's model credential is chosen to match.

## 8. Phases

1. **Measures, weekly entry, colours, Tracker page, initiative tab.** About two days.
2. **Focus flag and tickets, streak rules, automatic actuals from It's a Plan, agent
   writes through the MCP.** About a day.
3. **Growth targets from the Finance year, driver chains (an outcome worked back into its
   activity targets, e.g. one pallet a week → meetings → calls → emails), Rize, Xero and
   Lanoguard sources, a read-only share link so a client sees their own board.** About two
   days.
4. **Initiative agents.** `initiative.agent_id`, the write rule, evidence and check result
   on each week, the weekly report, the Agents board, and the first routine (Lanoguard or
   Cambray growth) as the pilot. About two days, plus a routine per initiative.

## 9. Decisions for Ian

1. **Colour rule for numbers.** The 90% / 70% bands from the 2026 board (recommended), or
   your amber-then-red rule applied to numbers as well (hit = green, first miss = amber,
   second miss running = red).
2. **A week with no entry.** Red (the 2024 rule: not reported = not done), or a separate
   "not reported" mark that counts toward the streak. Recommendation: red for activity,
   "not reported" for the rest.
3. **Lanes.** Acquisition, Delivery, Marketing operations, Finance — or your own list.
4. **Who enters.** Each owner enters their own, Zak runs the weekly meeting (the 2024
   practice), or Zak enters for everyone.
5. **Cambray growth measure.** 5% month on month of which number (billings, cash
   collected, or monthly recurring revenue), from which baseline month.
6. **First measures.** Which initiatives start on the board. Suggested: the five CON
   client initiatives, Cambray growth, and Lanoguard (one pallet a week).
7. **Where the agents run.** Cloud routines first (recommended), or internal agents.
8. **Unverified figures.** Colour the cell and mark it (recommended), or leave it grey
   until a person confirms.

## 10. Not found in the transcripts

The amber-then-red rule as stated here, "one pallet sale per week", and the Ryan Deiss
reference do not appear in the Otter or Fathom transcripts searched; they are taken from
Ian's brief of 4 Oct 2026. The original Google Sheet and Zak's setup notes are not on this
Mac.
