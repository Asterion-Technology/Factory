#!/usr/bin/env bash
# Resolve a repo id from config/repos.yaml to its absolute local path.
# Usage:
#   resolve-repo.sh <id>               → prints absolute path
#   resolve-repo.sh --list             → prints all ids and paths
#   resolve-repo.sh --info <id>        → prints full YAML block for a repo
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/../config/repos.yaml"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Error: manifest not found at $MANIFEST" >&2
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "Error: node is required to parse the YAML manifest." >&2
  exit 1
fi

# Convert bash POSIX path to Windows absolute path for Node.js
WIN_MANIFEST="$(cygpath -w "$MANIFEST" 2>/dev/null || echo "$MANIFEST")"

CMD="${1:-}"

case "$CMD" in
  --list)
    REPO_MANIFEST="$WIN_MANIFEST" node --input-type=module <<'JSEOF'
import { readFileSync } from 'fs';
const txt = readFileSync(process.env.REPO_MANIFEST, 'utf8');
const baseMatch = txt.match(/^\s*base:\s*"?([^"\n]+)"?/m);
const base = (baseMatch ? baseMatch[1].trim() : '').replace(/\\/g, '/');
const ids   = [...txt.matchAll(/^\s*- id:\s*(\S+)/gm)].map(m => m[1]);
const paths = [...txt.matchAll(/^\s*local_path:\s*"?([^"\n]+)"?/gm)].map(m => m[1].trim());
const resolve = p => (p.match(/^([A-Za-z]:|\/)/) ? p : base + '/' + p).replace(/\\/g, '/');
ids.forEach((id, i) => console.log(id.padEnd(22) + resolve(paths[i])));
JSEOF
    ;;

  --info)
    ID="${2:-}"
    if [[ -z "$ID" ]]; then
      echo "Usage: resolve-repo.sh --info <id>" >&2
      exit 1
    fi
    REPO_MANIFEST="$WIN_MANIFEST" REPO_ID="$ID" node --input-type=module <<'JSEOF'
import { readFileSync } from 'fs';
const txt = readFileSync(process.env.REPO_MANIFEST, 'utf8');
const id = process.env.REPO_ID;
const re = new RegExp(`(- id:\\s+${id}[\\s\\S]+?)(?=\\n\\s+- id:|$)`);
const m = txt.match(re);
if (m) { console.log(m[1].trim()); }
else { console.error(`Repo '${id}' not found in manifest.`); process.exit(1); }
JSEOF
    ;;

  ""|--help|-h)
    echo "Usage:"
    echo "  resolve-repo.sh <id>          Print absolute local path for a repo id"
    echo "  resolve-repo.sh --list        List all repo ids and their paths"
    echo "  resolve-repo.sh --info <id>   Print full manifest entry for a repo"
    ;;

  *)
    REPO_MANIFEST="$WIN_MANIFEST" REPO_ID="$CMD" node --input-type=module <<'JSEOF'
import { readFileSync } from 'fs';
const txt = readFileSync(process.env.REPO_MANIFEST, 'utf8');
const id = process.env.REPO_ID;
const baseMatch = txt.match(/^\s*base:\s*"?([^"\n]+)"?/m);
const base = (baseMatch ? baseMatch[1].trim() : '').replace(/\\/g, '/');
const ids   = [...txt.matchAll(/^\s*- id:\s*(\S+)/gm)].map(m => m[1]);
const paths = [...txt.matchAll(/^\s*local_path:\s*"?([^"\n]+)"?/gm)].map(m => m[1].trim());
const resolve = p => (p.match(/^([A-Za-z]:|\/)/) ? p : base + '/' + p).replace(/\\/g, '/');
const idx = ids.indexOf(id);
if (idx === -1) { console.error(`Repo '${id}' not found in manifest.`); process.exit(1); }
console.log(resolve(paths[idx]));
JSEOF
    ;;
esac
