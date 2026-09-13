#!/usr/bin/env bash
# Moves the callcatch/ folder into its own GitHub repository, preserving history.
# Usage (from the Algorithmfront repo root, on the branch that contains callcatch/):
#   ./callcatch/scripts/split-to-new-repo.sh git@github.com:DattaDandamudi/callcatch.git
# Prerequisites: create the empty repo on GitHub first (no README), and have push access.
set -euo pipefail
REMOTE="${1:-}"
if [[ -z "$REMOTE" ]]; then
  echo "usage: $0 <new-repo-git-url>" >&2
  exit 1
fi
if [[ ! -d callcatch ]]; then
  echo "run this from the repository root that contains callcatch/" >&2
  exit 1
fi
BRANCH="callcatch-split-$(date +%Y%m%d%H%M%S)"
git subtree split --prefix=callcatch -b "$BRANCH"
git push "$REMOTE" "$BRANCH:main"
echo "Pushed callcatch/ history to $REMOTE (branch main). Local split branch: $BRANCH"
echo "Next: git clone $REMOTE && cd callcatch && cp .env.example .env.local && npm install"
