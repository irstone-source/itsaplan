#!/bin/bash
# Runs a command (e.g. `bun test <files>`) and kills its whole process group if its
# memory passes CAP_MB (default 4096). apps/web/src/components/layout/ProjectSwitcher.test.tsx
# grows past 10 GB under bun on macOS, so web tests are run through this, never bare.
CAP_MB=${CAP_MB:-4096}
set -m
"$@" & pid=$!
peak=0
while kill -0 $pid 2>/dev/null; do
  rss=$(ps -o rss= -p "$(pgrep -g $pid | paste -sd, -)" 2>/dev/null | awk "{s+=\$1} END {print int(s/1024)}")
  [ "${rss:-0}" -gt "$peak" ] && peak=$rss
  if [ "${rss:-0}" -gt "$CAP_MB" ]; then kill -9 -$pid 2>/dev/null; echo "KILLED at ${rss}MB (cap ${CAP_MB}MB)"; break; fi
  sleep 0.5
done
wait $pid 2>/dev/null; echo "exit $? peak ${peak}MB"
