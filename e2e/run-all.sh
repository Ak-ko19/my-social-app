#!/bin/bash
# Runs every browser suite, each on a fresh throwaway stack (see e2e-up.sh),
# one after another. Prints one line per suite and exits non-zero if any
# suite failed. Full output of each suite: out-<suite>.txt.
#
#   bash run-all.sh            # feature suites + visual matrix in EN/AR
#   bash run-all.sh --audit    # also C1 (demo seed) and the C4 audit checks
#                              # (npm audit and the deployed keep-alive ping
#                              #  need an internet connection)
#   E2E_ONLY="b9-dm a3" bash run-all.sh   # just these suites ("a3" = the
#                              # visual matrix); CI's smoke job uses this
SP="$(cd "$(dirname "$0")" && pwd)"
cd "$SP" || exit 1

SUITES="a2-walkthrough b1-reactions b2-media b3-stories b4-comments b5-audience b6-tabs b7-explore b8-pymk b9-dm b10-groups b11-settings b12-admin b13-groups b14-pages b15-lang b16-rtl c2-legal c3-landing day2-own-post day5-email-off day8-sessions day8-sessions-list day12-report day12-review day16-language day19-links day20-only-me day23-mute day24-report-places day26-a11y day27-perf day28-export day30-guard day31-reactions day32-forward day33-group-admins day34-group-photo day36-profile day36-cover day36-pinned day37-friends day39-pymk day40-hashtag-top day42-search day43-zawgyi day44-polls"
# Suites that test production-only behaviour (e.g. browser error reporting,
# off in dev): always run on the production build with the real headers.
DIST_SUITES="day10-errors day19-share"
# Suites that need the backend's real bot checks (Day 11): on for them only,
# since other suites sign users up straight through the API.
BOT_SUITES="day11-bots"
# Turnstile on (local stub verifier), on the production build so the CSP
# must allow Cloudflare's script and frame.
TURNSTILE_SUITES="day11-turnstile"
# Push on (throwaway VAPID keys + a stub push service), production build so
# the real service worker runs (Day 22).
PUSH_SUITES="day22-push"
failed=0

# E2E_ONLY: every name must be a real suite, so a typo can't make CI run
# (and pass) nothing.
wanted() { [ -z "$E2E_ONLY" ] || [[ " $E2E_ONLY " == *" $1 "* ]]; }
for name in $E2E_ONLY; do
  if [[ " $SUITES $DIST_SUITES $BOT_SUITES $TURNSTILE_SUITES $PUSH_SUITES a3 " != *" $name "* ]]; then
    echo "E2E_ONLY: unknown suite \"$name\""
    exit 2
  fi
done

# The stack's own output goes to stack.log (kept by CI when a run fails).
fresh_stack() { # [dist|bots|turnstile|push]
  bash e2e-down.sh >/dev/null 2>&1
  case "$1" in
    dist) E2E_FRONTEND=dist bash e2e-up.sh > stack.log 2>&1 ;;
    bots) BOT_CHECKS_IN_TESTS=1 bash e2e-up.sh > stack.log 2>&1 ;;
    turnstile) E2E_TURNSTILE=1 E2E_FRONTEND=dist bash e2e-up.sh > stack.log 2>&1 ;;
    push) E2E_PUSH=1 E2E_FRONTEND=dist bash e2e-up.sh > stack.log 2>&1 ;;
    *) bash e2e-up.sh > stack.log 2>&1 ;;
  esac
}

report() { # name exit-code output-file
  local pass fail
  pass=$(grep -c '^PASS' "$3")
  fail=$(grep -c '^FAIL' "$3")
  printf '%-18s %s  (pass %s, fail %s) %s\n' "$1" "$([ "$2" = 0 ] && echo OK || echo FAILED)" "$pass" "$fail" "$(grep -h 'page checks' "$3")"
  [ "$2" = 0 ] || failed=1
}

for s in $SUITES; do
  wanted "$s" || continue
  fresh_stack
  node "$s.cjs" > "out-$s.txt" 2>&1
  report "$s" $? "out-$s.txt"
done

for s in $DIST_SUITES; do
  wanted "$s" || continue
  fresh_stack dist
  node "$s.cjs" > "out-$s.txt" 2>&1
  report "$s" $? "out-$s.txt"
done

for s in $BOT_SUITES; do
  wanted "$s" || continue
  fresh_stack bots
  node "$s.cjs" > "out-$s.txt" 2>&1
  report "$s" $? "out-$s.txt"
done

for s in $TURNSTILE_SUITES; do
  wanted "$s" || continue
  fresh_stack turnstile
  node "$s.cjs" > "out-$s.txt" 2>&1
  report "$s" $? "out-$s.txt"
done

for s in $PUSH_SUITES; do
  wanted "$s" || continue
  fresh_stack push
  node "$s.cjs" > "out-$s.txt" 2>&1
  report "$s" $? "out-$s.txt"
done

for lang in en ar; do
  wanted a3 || continue
  fresh_stack
  A3_LANG=$lang node a3-visual.cjs > "out-a3-$lang.txt" 2>&1
  report "a3-visual ($lang)" $? "out-a3-$lang.txt"
done

if [ "$1" = "--audit" ]; then
  fresh_stack
  (cd ../backend && DATABASE_URL=postgresql://testuser@localhost:55433/mysocialapp_e2e node scripts/seed-demo.js >/dev/null 2>&1)
  node c1-seed.cjs > out-c1-seed.txt 2>&1
  report "c1-seed" $? out-c1-seed.txt
  node c4-audit-checks.cjs > out-c4-audit-checks.txt 2>&1
  report "c4-audit-checks" $? out-c4-audit-checks.txt
fi

bash e2e-down.sh >/dev/null 2>&1
[ "$failed" = 0 ] && echo "ALL PASSED" || echo "SOME SUITES FAILED -- see out-*.txt"
exit $failed
