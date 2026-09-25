#!/usr/bin/env node
/**
 * V2-FE-130 — Build-time frontend performance budget enforcement.
 *
 * Reads the canonical budget artifact (`src/config/performance-budgets.json`)
 * and the Turbopack build diagnostics written by `next build`
 * (`.next/diagnostics/route-bundle-stats.json`), verifies the emitted client
 * chunks on disk (no fabricated sizes), and fails the build when any route's
 * first-load JS budget or the global client-JS budget is exceeded.
 *
 * FAIL-CLOSED behavior:
 *  - Missing budget artifact or invalid schema                 -> exit 1
 *  - Missing diagnostics (no build yet)                        -> exit 1
 *  - A listed chunk file missing on disk                       -> exit 1
 *  - On-disk chunk bytes disagree with reported first-load JS  -> exit 1 (drift)
 *
 * Env overrides (for staged tightening, never to skip the gate):
 *  - PERFORMANCE_BUDGETS_FILE          -> alternative budget JSON path
 *  - PERFORMANCE_BUDGET_DIAGNOSTICS    -> alternative diagnostics JSON path
 *  - PERFORMANCE_BUDGET_NEXT_DIR       -> .next directory location
 */
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join, isAbsolute, resolve } from 'path';

const ROOT = resolve(process.cwd());
const NEXT_DIR = process.env.PERFORMANCE_BUDGET_NEXT_DIR
  ? resolve(process.env.PERFORMANCE_BUDGET_NEXT_DIR)
  : join(ROOT, '.next');
const BUDGETS_FILE = process.env.PERFORMANCE_BUDGETS_FILE
  ? resolve(process.env.PERFORMANCE_BUDGETS_FILE)
  : join(ROOT, 'src', 'config', 'performance-budgets.json');
const DIAGNOSTICS_FILE = process.env.PERFORMANCE_BUDGET_DIAGNOSTICS
  ? resolve(process.env.PERFORMANCE_BUDGET_DIAGNOSTICS)
  : join(NEXT_DIR, 'diagnostics', 'route-bundle-stats.json');

const KIB = 1024;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function toKiB(bytes) {
  return bytes / KIB;
}

function validateBudgets(budgets) {
  const failures = [];
  if (!budgets || typeof budgets !== 'object') {
    throw new Error('Budget artifact is not an object');
  }
  if (budgets.schemaVersion !== 1) {
    failures.push(`Unsupported budget schemaVersion: ${budgets.schemaVersion}`);
  }
  if (!Array.isArray(budgets.routes) || budgets.routes.length === 0) {
    failures.push('budgets.routes must be a non-empty array');
  }
  const seen = new Map();
  for (const route of budgets.routes ?? []) {
    if (typeof route?.route !== 'string' || !route.route.startsWith('/')) {
      failures.push(`Route must have a /-prefixed name: ${JSON.stringify(route)}`);
      continue;
    }
    if (seen.has(route.route)) {
      failures.push(`Duplicate route budget: ${route.route}`);
    }
    seen.set(route.route, true);
    const limit = route.firstLoadJsKiB;
    if (!Number.isFinite(limit) || limit <= 0) {
      failures.push(`Route ${route.route} firstLoadJsKiB must be a positive finite number`);
    }
  }
  const globalBudget = budgets.global?.totalClientJsKiB;
  if (!Number.isFinite(globalBudget) || globalBudget <= 0) {
    failures.push('budgets.global.totalClientJsKiB must be a positive finite number');
  }
  return failures;
}

function walkJsBytes(dirPath) {
  let total = 0;
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += walkJsBytes(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      total += statSync(fullPath).size;
    }
  }
  return total;
}

try {
  if (!existsSync(BUDGETS_FILE)) {
    throw new Error(`Missing budget artifact: ${BUDGETS_FILE}. Refusing to verify.`);
  }
  if (!existsSync(DIAGNOSTICS_FILE)) {
    throw new Error(
      `Missing build diagnostics at ${DIAGNOSTICS_FILE}. Run \`next build\` before ` +
        `verifying performance budgets. Refusing to verify.`,
    );
  }

  const budgets = readJson(BUDGETS_FILE);
  const schemaFailures = validateBudgets(budgets);
  if (schemaFailures.length > 0) {
    throw new Error(`Invalid performance budget artifact:\n  - ${schemaFailures.join('\n  - ')}`);
  }

  const routeStats = readJson(DIAGNOSTICS_FILE);
  if (!Array.isArray(routeStats)) {
    throw new Error(`Build diagnostics must be an array of route stats.`);
  }
  if (routeStats.length === 0) {
    throw new Error('Build diagnostics contain no routes. Refusing to verify.');
  }

  const budgetByRoute = new Map(budgets.routes.map((r) => [r.route, r]));

  const rows = [];
  let breached = 0;
  let integrityFailures = 0;

  for (const stat of routeStats) {
    const route = stat.route;
    const reportedBytes = stat.firstLoadUncompressedJsBytes;
    const chunks = Array.isArray(stat.firstLoadChunkPaths) ? stat.firstLoadChunkPaths : [];

    let onDiskBytes = 0;
    for (const chunkPath of chunks) {
      const absPath = isAbsolute(chunkPath) ? chunkPath : join(ROOT, chunkPath);
      if (!existsSync(absPath)) {
        integrityFailures += 1;
        console.error(`Integrity failure: chunk missing on disk for ${route}: ${chunkPath}`);
        continue;
      }
      onDiskBytes += statSync(absPath).size;
    }

    if (!Number.isFinite(reportedBytes) || reportedBytes < 0) {
      integrityFailures += 1;
      console.error(`Integrity failure: invalid reported first-load bytes for ${route}`);
      continue;
    }
    if (chunks.length > 0 && onDiskBytes !== reportedBytes) {
      integrityFailures += 1;
      console.error(
        `Integrity failure: on-disk chunk bytes (${onDiskBytes}) differ from reported ` +
          `first-load bytes (${reportedBytes}) for ${route}`,
      );
      continue;
    }

    const budget = budgetByRoute.get(route);
    if (!budget) {
      console.warn(
        `Warning: no budget configured for route ${route}; skipping (build timings still tracked).`,
      );
      rows.push({
        route,
        firstLoadKiB: toKiB(reportedBytes).toFixed(1),
        budgetKiB: '—',
        status: 'unbudgeted',
      });
      continue;
    }

    const firstLoadKiB = toKiB(reportedBytes);
    const within = firstLoadKiB <= budget.firstLoadJsKiB;
    if (!within) breached += 1;
    rows.push({
      route,
      firstLoadKiB: firstLoadKiB.toFixed(1),
      budgetKiB: budget.firstLoadJsKiB.toFixed(0),
      status: within ? 'ok' : 'BREACH',
    });
  }

  // Global client JS budget: every emitted .js under .next/static/chunks.
  const chunksDir = join(NEXT_DIR, 'static', 'chunks');
  let totalClientJsKiB = 0;
  if (existsSync(chunksDir)) {
    totalClientJsKiB = toKiB(walkJsBytes(chunksDir));
  } else {
    integrityFailures += 1;
    console.error(`Integrity failure: ${chunksDir} missing`);
  }
  const globalWithin = totalClientJsKiB <= budgets.global.totalClientJsKiB;
  if (!globalWithin) breached += 1;

  console.log('\nFrontend performance budgets (first-load JS, raw KiB):');
  for (const row of rows) {
    const marker = row.status === 'BREACH' ? ' ✗' : row.status === 'ok' ? ' ✓' : ' -';
    console.log(
      `  ${row.route.padEnd(16)} ${row.firstLoadKiB.padStart(8)} ${String(
        row.budgetKiB,
      ).padStart(6)}  ${row.status}${marker}`,
    );
  }
  console.log(
    `  ${'[global client JS]'.padEnd(16)} ${totalClientJsKiB.toFixed(1).padStart(8)} ${String(
      budgets.global.totalClientJsKiB,
    ).padStart(6)}  ${globalWithin ? 'ok' : 'BREACH'}`,
  );

  if (integrityFailures > 0) {
    throw new Error(`${integrityFailures} integrity failure(s); refusing to pass.`);
  }
  if (breached > 0) {
    throw new Error(`${breached} budget(s) breached; refusing to pass.`);
  }

  console.log('Performance budgets: all routes and the global client-JS budget pass.');
  process.exit(0);
} catch (error) {
  console.error('Performance budget verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}