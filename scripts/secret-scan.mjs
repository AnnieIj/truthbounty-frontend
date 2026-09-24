#!/usr/bin/env node
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, relative, resolve } from 'path';
import { spawnSync } from 'child_process';

const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml']);
const DEFAULT_DIRS = ['src', 'release', '.next'];
const ALLOW_MARKER = '// secret-scan-allow:';

const EVMPattern = /(?<![A-Za-z0-9])0x[a-fA-F0-9]{64}(?![A-Za-z0-9])/g;
const StripePattern = /(?<![A-Za-z0-9])(?:sk|pk)_(?:live|test)_[A-Za-z0-9_\-]{16,}/g;
const NEXT_PUBLIC_MARKERS = ['NEXT_PUBLIC_WORLDCOIN_APP_ID', 'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID'];
const SUSPICIOUS_SUBSTRINGS = ['private', 'secret', '-----BEGIN', 'Bearer '];

function loadGitIgnored(cwd) {
  try {
    const result = spawnSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.error || result.status !== 0) return null;
    const lines = result.stdout.split(/\r?\n/).filter(Boolean);
    const ignored = new Set();
    for (const line of lines) {
      ignored.add(resolve(cwd, line));
      try {
        const st = statSync(resolve(cwd, line));
        if (st.isDirectory()) {
          walkAdd(resolve(cwd, line), ignored);
        }
      } catch { /* noop */ }
    }
    return ignored;
  } catch {
    return null;
  }
}

function walkAdd(dir, set) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      set.add(full);
      if (e.isDirectory()) walkAdd(full, set);
    }
  } catch { /* noop */ }
}

function walk(dir, out, gitIgnored, cwd) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (gitIgnored && gitIgnored.has(resolve(cwd, full))) continue;
    if (e.isDirectory()) {
      walk(full, out, gitIgnored, cwd);
    } else if (e.isFile()) {
      let ok = false;
      for (const ext of SCAN_EXTS) {
        if (full.endsWith(ext)) { ok = true; break; }
      }
      if (ok) out.push(full);
    }
  }
}

function findMatches(lines, filePath) {
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineIndex = i;
    const prevLine = i > 0 ? lines[i - 1] : '';
    const hasAllow = prevLine.includes(ALLOW_MARKER);
    const inTests = filePath.includes('__tests__/');

    let m;

    EVMPattern.lastIndex = 0;
    while ((m = EVMPattern.exec(line)) !== null) {
      if (hasAllow && inTests) { EVMPattern.lastIndex = m.index + m[0].length; continue; }
      if (hasAllow && !inTests) { EVMPattern.lastIndex = m.index + m[0].length; continue; }
      matches.push({
        line: lineIndex + 1,
        col: m.index + 1,
        type: 'EVM_PRIVATE_KEY',
        reason: 'EVM private-key literal (64-hex 0x...)',
      });
      if (m.index === EVMPattern.lastIndex) EVMPattern.lastIndex++;
    }

    StripePattern.lastIndex = 0;
    while ((m = StripePattern.exec(line)) !== null) {
      if (hasAllow && inTests) { StripePattern.lastIndex = m.index + m[0].length; continue; }
      if (hasAllow && !inTests) { StripePattern.lastIndex = m.index + m[0].length; continue; }
      matches.push({
        line: lineIndex + 1,
        col: m.index + 1,
        type: 'STRIPE_TOKEN',
        reason: 'sk_/pk_ live/test token-like string',
      });
      if (m.index === StripePattern.lastIndex) StripePattern.lastIndex++;
    }

    for (const marker of NEXT_PUBLIC_MARKERS) {
      let pos = 0;
      while ((pos = line.indexOf(marker, pos)) !== -1) {
        const suspicious = SUSPICIOUS_SUBSTRINGS.some((s) => line.includes(s));
        if (suspicious) {
          const skip = (inTests && hasAllow) || (!inTests && hasAllow);
          if (!skip) {
            matches.push({
              line: lineIndex + 1,
              col: pos + 1,
              type: 'NEXT_PUBLIC_SUSPICIOUS',
              reason: `${marker} on same line as sensitive substring (private/secret/BEGIN/Bearer)`,
            });
          }
        }
        pos = pos + marker.length;
      }
    }
  }
  return matches;
}

export function scanDirectories(dirs, { cwd = process.cwd() } = {}) {
  const gitIgnored = loadGitIgnored(cwd);
  const files = [];
  for (const d of dirs) {
    const abs = resolve(cwd, d);
    if (!existsSync(abs)) continue;
    walk(abs, files, gitIgnored, cwd);
  }

  const findings = [];
  let scanned = 0;
  for (const f of files) {
    let content;
    try {
      content = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    scanned++;
    const lines = content.split(/\r?\n/);
    const rel = relative(cwd, f) || f;
    const fileMatches = findMatches(lines, rel);
    for (const m of fileMatches) {
      findings.push({ file: rel, ...m });
    }
  }
  return { scanned, findings };
}

export function runSecretScan(dirs) {
  const { scanned, findings } = scanDirectories(dirs);
  for (const f of findings) {
    process.stderr.write(`${f.file}:${f.line}:${f.col} ${f.type} ${f.reason}\n`);
  }
  if (findings.length > 0) {
    process.stderr.write(`Secret scan failed: ${findings.length} finding(s) in ${scanned} file(s)\n`);
    return { ok: false, scanned, findings };
  }
  process.stdout.write(`Secret scan passed, ${scanned} files scanned\n`);
  return { ok: true, scanned, findings };
}

if (process.argv[1] && process.argv[1].endsWith('secret-scan.mjs')) {
  const dirs = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_DIRS;
  const result = runSecretScan(dirs);
  process.exitCode = result.ok ? 0 : 1;
}
