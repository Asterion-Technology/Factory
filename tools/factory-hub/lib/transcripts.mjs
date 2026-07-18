// Incremental Claude Code transcript parser.
//
// Walks ~/.claude/projects/**/*.jsonl and aggregates per-day, per-model token
// usage. A cursor file records how many bytes of each transcript have been
// consumed, so each sweep reads only appended bytes — never the full corpus
// (157 MB+ on this machine). ONLY model IDs, token counts, and timestamps are
// extracted; message content is never read into the aggregates (transcripts
// contain code and terminal output that may echo secrets).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHUNK = 4 * 1024 * 1024;
const RECENT_KEYS_MAX = 200;
const NL = 0x0a;

export class TranscriptAggregator {
  constructor({ dataDir, projectsRoot } = {}) {
    this.projectsRoot = projectsRoot || path.join(os.homedir(), '.claude', 'projects');
    this.cursorPath = path.join(dataDir, 'transcripts-cursor.json');
    this.aggPath = path.join(dataDir, 'usage-aggregates.json');
    fs.mkdirSync(dataDir, { recursive: true });
    this.cursor = readJson(this.cursorPath) || { files: {} };
    this.agg = readJson(this.aggPath) || { days: {} };
    this.lastSweep = null;
  }

  sweep() {
    const started = Date.now();
    let bytesRead = 0;
    let filesTouched = 0;
    for (const file of walkJsonl(this.projectsRoot)) {
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      const cur = this.cursor.files[file] || { bytesRead: 0, recentKeys: [] };
      if (st.size < cur.bytesRead) cur.bytesRead = 0; // truncated/rotated
      if (st.size === cur.bytesRead) { cur.size = st.size; cur.mtimeMs = st.mtimeMs; this.cursor.files[file] = cur; continue; }
      bytesRead += this.consumeFile(file, cur, st);
      filesTouched++;
      this.cursor.files[file] = cur;
    }
    // drop cursors for deleted transcripts
    for (const file of Object.keys(this.cursor.files)) {
      if (!fs.existsSync(file)) delete this.cursor.files[file];
    }
    writeJson(this.cursorPath, this.cursor);
    writeJson(this.aggPath, this.agg);
    this.lastSweep = { at: new Date().toISOString(), ms: Date.now() - started, bytesRead, filesTouched };
    return this.lastSweep;
  }

  consumeFile(file, cur, st) {
    let fd;
    try { fd = fs.openSync(file, 'r'); } catch { return 0; }
    const startOffset = cur.bytesRead;
    let pos = cur.bytesRead;
    let carry = Buffer.alloc(0);
    let consumed = 0;
    const recent = new Set(cur.recentKeys || []);
    const recentOrder = [...(cur.recentKeys || [])];
    try {
      const buf = Buffer.alloc(CHUNK);
      for (;;) {
        const n = fs.readSync(fd, buf, 0, CHUNK, pos);
        if (n <= 0) break;
        pos += n;
        let chunk = Buffer.concat([carry, buf.subarray(0, n)]);
        let start = 0;
        for (;;) {
          const nl = chunk.indexOf(NL, start);
          if (nl === -1) break;
          const line = chunk.subarray(start, nl);
          start = nl + 1;
          consumed = pos - (chunk.length - start);
          this.ingestLine(line, recent, recentOrder);
        }
        carry = chunk.subarray(start);
        if (n < CHUNK) break;
      }
    } finally {
      fs.closeSync(fd);
    }
    // bytesRead advances only past complete lines; a partial trailing line is re-read next sweep
    cur.bytesRead = consumed > cur.bytesRead ? consumed : cur.bytesRead;
    cur.size = st.size;
    cur.mtimeMs = st.mtimeMs;
    cur.recentKeys = recentOrder.slice(-RECENT_KEYS_MAX);
    return cur.bytesRead - startOffset;
  }

  ingestLine(lineBuf, recent, recentOrder) {
    if (lineBuf.length < 20 || !lineBuf.includes('"usage"')) return;
    let j;
    try { j = JSON.parse(lineBuf.toString('utf8')); } catch { return; }
    const m = j.message;
    const u = m && m.usage;
    if (!u || !m.model || m.model === '<synthetic>') return;
    // One assistant message spans multiple JSONL lines (one per content block),
    // each repeating identical usage — count each (requestId, message.id) once.
    const key = `${j.requestId || ''}:${m.id || ''}`;
    if (key !== ':' ) {
      if (recent.has(key)) return;
      recent.add(key);
      recentOrder.push(key);
      if (recentOrder.length > RECENT_KEYS_MAX * 2) {
        const trimmed = recentOrder.splice(0, recentOrder.length - RECENT_KEYS_MAX);
        for (const k of trimmed) recent.delete(k);
      }
    }
    const day = localDate(j.timestamp);
    const dayAgg = (this.agg.days[day] ||= { models: {} });
    const mm = (dayAgg.models[m.model] ||= { in: 0, out: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, requests: 0 });
    mm.in += u.input_tokens || 0;
    mm.out += u.output_tokens || 0;
    mm.cacheRead += u.cache_read_input_tokens || 0;
    const cc = u.cache_creation;
    if (cc && (cc.ephemeral_5m_input_tokens || cc.ephemeral_1h_input_tokens)) {
      mm.cacheWrite5m += cc.ephemeral_5m_input_tokens || 0;
      mm.cacheWrite1h += cc.ephemeral_1h_input_tokens || 0;
    } else {
      mm.cacheWrite5m += u.cache_creation_input_tokens || 0;
    }
    mm.requests += 1;
  }
}

function localDate(ts) {
  const d = ts ? new Date(ts) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function* walkJsonl(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkJsonl(p);
    else if (e.isFile() && e.name.endsWith('.jsonl')) yield p;
  }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJson(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  fs.renameSync(tmp, p);
}
