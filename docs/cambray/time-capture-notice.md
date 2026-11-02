# Time capture: notice to staff

Cambray Design Ltd, 2 November 2026. This notice is given under UK GDPR before anyone
installs the time capture agent. Keep it with your other staff documents.

## What is collected

A small program (`plan-time`) on the computer you work from reads ActivityWatch, an
open-source tracker that runs on that computer. Every 15 minutes it sends Plan blocks of
activity: the application name, the window title, the website domain (for example
`ads.google.com`, never the full address), and the start and end time. On a Mac with an
iPhone signed in to iCloud, and only if you run the agent with `--calls`, it also sends
your answered calls: the time, the length, the direction, and the contact's name or number.

It does not send screenshots, keystrokes, full URLs, document contents, messages or email
text. Time when you are away from the keyboard is dropped before anything is sent.

Anything on your private list is dropped on your computer and never sent. Banking, health
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
  which the project team sees as it does any logged time.
- Project owners see, per person: whether a device is set up, when it last synced, and the
  total confirmed and pending hours this week. Not what the blocks are.
- Suggestions are made by rules on the server. No AI model sees your blocks unless you
  review them in your own Claude through MCP.

## How long it is kept

- Blocks you have not reviewed are deleted after 30 days.
- Blocks you ignored are deleted after 7 days.
- Confirmed time stays as logged time on the ticket, like time entered by hand.
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
