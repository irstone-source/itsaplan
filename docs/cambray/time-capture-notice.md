# Time capture: notice to staff

Cambray Design Ltd, 21 November 2026. This notice is given under UK GDPR before anyone
installs the time capture agent. Keep it with your other staff documents.

## What is collected

A small program (`plan-time`) on the computer you work from reads ActivityWatch, an
open-source tracker that runs on that computer. Every 15 minutes it builds blocks of
activity: the application name, the window title, the website domain (for example
`ads.google.com`, never the full address), and the start and end time. On a Mac with an
iPhone signed in to iCloud, and only if you run the agent with `--calls`, it also builds
blocks for your answered calls: the time, the length, the direction, and the contact's
name or number.

**Nothing is sent without your approval.** The blocks are kept on your computer until you
open `plan-time review`, look at them, untick any you do not want sent, and approve the
rest. Unticked blocks are deleted on your computer. The only thing sent automatically is a
heartbeat: the computer's name, its operating system, the agent version and whether
ActivityWatch is running. It contains no activity.

**Screenshots.** When you start work on a ticket with `plan-time start CON-12`, the agent
takes a screenshot of your screen every 5 minutes until you finish or pause. Outside a
ticket session no screenshots are taken. No screenshot is taken while you are away from
the keyboard, while an app, window title or website on your private list is in front, or
whenever ActivityWatch cannot tell what is in front or whether you are away.

A screenshot shows everything on your screen at that moment, not only the window in
front: other windows, other monitors and notifications. The private list stops a
screenshot being taken while a private app is in front; it does not hide a private app
that is visible elsewhere on the screen. On a Mac, large screenshots are made smaller on
your computer.

Screenshots are kept on your computer. When you finish the ticket
(`plan-time finish CON-12`), a review page on your computer shows every screenshot; untick
any you do not want sent. Only the screenshots you leave ticked are sent, and only when you
attach the evidence docket. The docket itself contains the session's app names, window
titles and websites, the ticked screenshots and what you write as the evidence the work
is complete, or the blocker.

It does not record keystrokes, full URLs, document contents, messages or email text. Time
when you are away from the keyboard is dropped.

`plan-time sent` lists every request the agent has ever attempted from your computer,
including any that failed to connect: when, where to, how large, and what it was.

Activity blocks for anything on your private list are dropped on your computer and never
sent. Banking, health
and personal messaging apps are on the list from the start, and you add your own apps,
domains and title words with `plan-time private add`.

## Why

Plan holds each client's work and the hours a month the client pays for. Time is measured
only to keep each client inside that limit (a red flag at 60%, down tools at 70%) and to
show logged time on the tickets you worked on. The lawful basis is our legitimate interest
in managing client work and billing, balanced against your privacy by the limits above.
The data is not used to assess individual performance, and no automated decision is made
from it.

## Who sees it

- Your blocks, your suggestions and your rules are visible to you only, including through
  the Plan routes and MCP tools, which act as you. Nobody else, including Ian as the
  instance owner, can list or open your blocks through Plan.
- When you confirm a block to a ticket, the time appears on that ticket as logged time,
  which the project team sees as it does any logged time. Blocks you send by attaching a
  ticket's docket are confirmed to that ticket in the same way.
- An evidence docket you attach becomes a comment on the ticket, and its screenshots
  become ticket attachments. Everyone who can see the ticket sees them. An attachment
  also has a direct link that opens without signing in: anyone who is given that link can
  view the screenshot.
- When an AI agent works on a ticket, Plan drafts a docket of that run (what it did, the
  tools it used, the files it named and its answer). Until a person approves it, the draft
  is visible only to people who can edit the ticket, and it is added to the ticket only
  when one of them attaches it.
- Project owners see, per person: whether a device is set up, when it last synced, and the
  total confirmed and pending hours this week. Not what the blocks are.
- Suggestions are made by rules on the server. No AI model sees your blocks unless you
  review them in your own Claude through MCP.

## How long it is kept

- Blocks you have not reviewed are deleted after 30 days.
- Blocks you ignored are deleted after 7 days.
- Confirmed time stays as logged time on the ticket, like time entered by hand.
- An attached docket and its screenshots stay on the ticket like any comment and
  attachment, until they or the ticket are deleted.
- Screenshots of a session you discard, or leave unticked, are deleted on your computer.
- The raw ActivityWatch data stays on your computer and is yours to delete.

## Your rights

You can see everything held about you in Plan → My time and Rules. You can ignore any
block, delete any rule, and change or remove the agent at any time (`plan-time status`
shows what is configured; delete `~/.config/plan-time` and the API key to stop). You have
the right to access, correct and erase your data, to object to this processing, and to
complain to the ICO (ico.org.uk). Installing the agent is a choice you make after reading
this notice; nothing is collected until you install it.

## Contact

Ian Stone, ian@cambraydesign.co.uk.
