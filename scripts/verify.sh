#!/usr/bin/env bash
#
# MODALIS — everything that can be verified without network access or credentials.
#
#   bash scripts/verify.sh
#
# Exits non-zero if anything fails, so it works as a CI gate.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.foundry/bin:$PATH"

FAILED=0
step() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
check() {
  if "$@" >/tmp/modalis-verify.log 2>&1; then
    printf '    \033[0;32mPASS\033[0m\n'
  else
    printf '    \033[0;31mFAIL\033[0m\n'
    tail -25 /tmp/modalis-verify.log | sed 's/^/      /'
    FAILED=1
  fi
}

step "Contracts build"
check bash -c 'cd contracts && forge build'

step "Contract tests (mandate enforcement, Kuru adapter, CRE report decoding)"
(cd contracts && forge test) || FAILED=1

step "Package tests"
for p in packages/portfolio packages/execution packages/ai packages/chain packages/db \
         packages/auth packages/domain apps/web; do
  printf '  %-34s' "$p"
  check bash -c "cd $p && node --test --experimental-strip-types test/*.test.ts"
done

step "Type checks"
for p in packages/chain packages/execution packages/ai packages/portfolio packages/db \
         packages/auth packages/domain services/risk-monitor services/demo \
         integrations/chainlink-cre apps/web; do
  printf '  %-34s' "$p"
  check bash -c "cd $p && npx tsc --noEmit"
done

step "Envio config against Envio's own JSON schema"
check bash -c 'cd integrations/envio && python3 scripts/validate-config.py'

step "Database schema and row-level security (needs PostgreSQL; skipped if absent)"
if ls -d /usr/lib/postgresql/*/bin >/dev/null 2>&1; then
  check bash -c 'bash supabase/scripts/db-local.sh up && bash supabase/scripts/db-local.sh check'
else
  printf '    SKIP (install postgresql to run this)\n'
fi

step "Web app production build"
check bash -c 'cd apps/web && npx next build'

if [ "$FAILED" -eq 0 ]; then
  printf '\n\033[0;32mAll checks passed.\033[0m\n'
else
  printf '\n\033[0;31mSome checks failed.\033[0m\n'
fi
exit "$FAILED"
