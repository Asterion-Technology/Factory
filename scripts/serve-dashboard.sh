#!/usr/bin/env bash
# DEPRECATED: the Observation Deck is now served by factory-hub (which also
# provides the /api/* endpoints the dashboard needs). This wrapper just execs it.
FACTORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "[info] serve-dashboard.sh is deprecated — launching factory-hub instead"
exec node "${FACTORY_ROOT}/tools/factory-hub/server.mjs"
