#!/bin/bash
# Runs every browser suite, each on a fresh throwaway stack (see e2e-up.sh),
# one after another. Prints one line per suite and exits non-zero if any
# suite failed. Full output of each suite: out-<suite>.txt.
#
#   bash run-all.sh            # feature suites + visual matrix in EN/MY/AR
#   bash run-all.sh --audit    # also C1 (demo seed) and the C4 audit checks
#                              # (npm audit and the deployed keep-alive ping
#                              #  need an internet connection)
SP="$(cd "$(dirname "$0")" && pwd)"
cd "$SP" || exit 1

SUITES="a2-walkthrough b1-reactions b2-media b3-stories b4-comments b5-audience b6-tabs b7-explore b8-pymk b9-dm b10-groups b11-settings b12-admin b13-groups b14-pages b15-lang b16-rtl c2-legal c3-landing day2-own-post"
failed=0

fresh_stack() {
  bash e2e-down.sh >/dev/null 2>&1
  bash e2e-up.sh >/dev/null 2>&1
}

report() { # name exit-code output-file
  local pass fail
  pass=$(grep -c '^PASS' "$3")
  fail=$(grep -c '^FAIL' "$3")
  printf '%-18s %s  (pass %s, fail %s) %s\n' "$1" "$([ "$2" = 0 ] && echo OK || echo FAILED)" "$pass" "$fail" "$(grep -h 'page checks' "$3")"
  [ "$2" = 0 ] || failed=1
}

for s in $SUITES; do
  fresh_stack
  node "$s.cjs" > "out-$s.txt" 2>&1
  report "$s" $? "out-$s.txt"
done

for lang in en my ar; do
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
