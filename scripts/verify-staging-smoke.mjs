#!/usr/bin/env node
/**
 * V2-FE-148 — Build-time staging smoke gate enforcement.
 *
 * Reads the canonical staging artifact (`src/config/staging-smoke.json`) and
 * verifies, directly on disk, that every configured target's surface actually
 * exists in the codebase: a `page` target must resolve to at least one
 * `page.tsx` and an `api` target to at least one `route.ts` under `src/app`
 * (route groups `(...)` and dynamic `[seg]` segments are honored). The gate
 * NEVER fabricates a pass: a target whose page/handler is missing on disk is
 * an integrity failure and the build is refused.
 *
 * FAIL-CLOSED behavior:
 *  - Missing staging artifact or invalid schema                 -> exit 1
 *  - A `page` target with no matching `page.tsx` on disk       -> exit 1
 *  - An `api` target with no matching `route.ts` on disk       -> exit 1
 *  - Duplicate target ids, invalid expectedStatus, or a
 *    non-finite/negative latency budget                          -> exit 1
 *
 * Env overrides (for staged tightening, never to skip the gate):
 *  - STAGING_SMOKE_FILE       -> alternative staging-smoke JSON path
 *  - STAGING_SMOKE_SRC_DIR    -> alternative src directory location
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(process.cwd());
const SRC_DIR = process.env.STAGING_SMOKE_SRC_DIR
  ? resolve(process.env.STAGING_SMOKE_SRC_DIR)
  : join(ROOT, 'src');
const ARTIFACT_FILE = process.env.STAGING_SMOKE_FILE
  ? resolve(process.env.STAGING_SMOKE_FILE)
  : join(SRC_DIR, 'config', 'staging-smoke.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateArtifact(artifact) {
  const failures = [];
  if (!artifact || typeof artifact !== 'object') {
    throw new Error('Staging smoke artifact is not an object');
  }
  if (artifact.schemaVersion !== 1) {
    failures.push(`Unsupported schemaVersion: ${artifact.schemaVersion}`);
  }
  if (!Array.isArray(artifact.targets) || artifact.targets.length === 0) {
    failures.push('staging-smoke.json targets must be a non-empty array');
  }
  const seen = new Set();
  for (const target of artifact.targets ?? []) {
    if (typeof target?.id !== 'string' || target.id.length === 0) {
      failures.push(`Target must have a non-empty id: ${JSON.stringify(target)}`);
      continue;
    }
    if (seen.has(target.id)) failures.push(`Duplicate target id: ${target.id}`);
    seen.add(target.id);
    if (target.kind !== 'page' && target.kind !== 'api') {
      failures.push(`Target ${target.id} kind must be 'page' or 'api'`);
    }
    if (typeof target.name !== 'string' || target.name.length === 0) {
      failures.push(`Target ${target.id} name must be a non-empty string`);
    }
    if (typeof target.path !== 'string' || !target.path.startsWith('/')) {
      failures.push(`Target ${target.id} path must be /-prefixed`);
    }
    if (target.kind === 'api' && !target.path.startsWith('/api/')) {
      failures.push(`Target ${target.id} kind=api must have an /api/-prefixed path`);
    }
    if (!Number.isInteger(target.expectedStatus) || target.expectedStatus < 100 || target.expectedStatus > 599) {
      failures.push(`Target ${target.id} expectedStatus must be a 3-digit status code`);
    }
    if (!Number.isFinite(target.latencyMs) || target.latencyMs <= 0) {
      failures.push(`Target ${target.id} latencyMs must be a positive finite number`);
    }
  }
  return failures;
}

/** Split a route into segments, dropping route-group markers `(...)`. */
function routeSegments(pathname) {
  return pathname
    .split('/')
    .filter(Boolean)
    .filter((seg) => !(seg.startsWith('(') && seg.endsWith(')')));
}

/** True when the concrete `dirName` satisfies a dynamic `[seg]` placeholder. */
function segmentMatches(dirName, routeSeg) {
  if (routeSeg.startsWith('[') && routeSeg.endsWith(']')) return true;
  return dirName === routeSeg;
}

/** Collect `entryFile` paths under `appDir` matching the route (fail-closed). */
function findSurfaceFiles(appDir, segments, entryFile) {
  const matches = [];
  function walk(dirDeepPath, index) {
    if (!existsSync(dirDeepPath)) return;
    if (index === segments.length) {
      // The route ended: the handler must live directly in this directory
      // (or under a URL-invisible route group).
      const candidate = join(dirDeepPath, entryFile);
      if (existsSync(candidate)) matches.push(candidate);
      const entries = readdirSync(dirDeepPath, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          entry.name.startsWith('(') &&
          entry.name.endsWith(')')
        ) {
          walk(join(dirDeepPath, entry.name), index);
        }
      }
      return;
    }
    const entries = readdirSync(dirDeepPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('(') && entry.name.endsWith(')')) {
        // Route group: URL-invisible, consumes no segment.
        walk(join(dirDeepPath, entry.name), index);
        continue;
      }
      if (
        entry.name === segments[index] ||
        segmentMatches(entry.name, segments[index])
      ) {
        walk(join(dirDeepPath, entry.name), index + 1);
      }
    }
  }
  walk(appDir, 0);
  return matches;
}

try {
  if (!existsSync(ARTIFACT_FILE)) {
    throw new Error(`Missing staging artifact: ${ARTIFACT_FILE}. Refusing to verify.`);
  }

  const artifact = readJson(ARTIFACT_FILE);
  const schemaFailures = validateArtifact(artifact);
  if (schemaFailures.length > 0) {
    throw new Error(`Invalid staging smoke artifact:\n  - ${schemaFailures.join('\n  - ')}`);
  }

  const appDir = join(SRC_DIR, 'app');
  if (!existsSync(join(appDir, 'api'))) {
    console.warn(`Warning: ${join(appDir, 'api')} missing; api targets will FAIL CLOSED.`);
  }

  const rows = [];
  let integrityFailures = 0;
  for (const target of artifact.targets) {
    if (target.kind === 'page') {
      const files = findSurfaceFiles(appDir, routeSegments(target.path), 'page.tsx');
      if (files.length === 0) {
        integrityFailures += 1;
        rows.push({ id: target.id, path: target.path, status: 'MISSING page.tsx' });
        continue;
      }
      rows.push({ id: target.id, path: target.path, status: `ok (${files.length} page.tsx)` });
    } else {
      const files = findSurfaceFiles(appDir, routeSegments(target.path), 'route.ts');
      if (files.length === 0) {
        integrityFailures += 1;
        rows.push({ id: target.id, path: target.path, status: 'MISSING route.ts' });
        continue;
      }
      rows.push({ id: target.id, path: target.path, status: `ok (${files.length} route.ts)` });
    }
  }

  console.log('\nStaging smoke targets (on-disk surface verification):');
  for (const row of rows) {
    console.log(`  ${row.id.padEnd(20)} ${row.path.padEnd(36)} ${row.status}`);
  }

  if (integrityFailures > 0) {
    throw new Error(`${integrityFailures} staging target(s) missing on disk; refusing to pass.`);
  }

  console.log('Staging smoke gate: all configured targets resolve on disk and pass.');
  process.exit(0);
} catch (error) {
  console.error('Staging smoke verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
