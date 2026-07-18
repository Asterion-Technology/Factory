#!/usr/bin/env bash
# RTK Context Compression — thin wrapper around the cross-platform Node port.
# Kept so existing callers (changelog.sh, allow-list entries, docs) keep working.
#   git diff | scripts/rtk-compress.sh
#   cat build.log | scripts/rtk-compress.sh --model codellama:7b
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rtk-compress.js" "$@"
