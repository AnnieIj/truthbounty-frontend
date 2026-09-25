import { execFile } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const SCRIPT = resolve(__dirname, '../../../scripts/verify-performance-budgets.mjs');
const VERIFIER_ROOT = resolve(__dirname, '../../../..');

/**
 * Integration test for the build-time performance budget gate. Uses explicit
 * fixtures (no mocks) so the gate's within/over/fail-closed behavior is
 * verified end to end against the real script and the real budget artifact.
 */
describe('verify-performance-budgets.mjs gate', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'truthbounty-perf-budgets-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function runVerifier(opts: {
    budgets: object;
    routeStats: unknown;
    chunks?: Record<string, string>;
  }): Promise<{ code: number | null; stdout: string; stderr: string }> {
    const budgetsFile = join(dir, 'budgets.json');
    const nextDir = join(dir, '.next');
    const chunksDir = join(nextDir, 'static', 'chunks');
    mkdirSync(chunksDir, { recursive: true });
    if (opts.chunks) {
      for (const [name, contents] of Object.entries(opts.chunks)) {
        writeFileSync(join(chunksDir, name), contents);
      }
    }
    const diagnosticsDir = join(nextDir, 'diagnostics');
    mkdirSync(diagnosticsDir, { recursive: true });
    writeFileSync(join(diagnosticsDir, 'route-bundle-stats.json'), JSON.stringify(opts.routeStats));
    writeFileSync(budgetsFile, JSON.stringify(opts.budgets));

    try {
      const { stdout, stderr } = await execFileAsync('node', [SCRIPT], {
        cwd: VERIFIER_ROOT,
        env: {
          ...process.env,
          PERFORMANCE_BUDGETS_FILE: budgetsFile,
          PERFORMANCE_BUDGET_NEXT_DIR: nextDir,
        },
        // The script exits non-zero on breach: treat that as a normal result.
        maxBuffer: 1024 * 1024,
      });
      return { code: 0, stdout, stderr };
    } catch (err) {
      const failure = err as { code?: number | null; stdout?: string; stderr?: string };
      return {
        code: failure.code ?? null,
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? '',
      };
    }
  }

  const budgetArtifact = {
    schemaVersion: 1,
    unit: 'KiB',
    routes: [{ route: '/', firstLoadJsKiB: 100 }],
    global: { totalClientJsKiB: 100 },
    webVitals: { lcpMs: 2500, cls: 0.1, inpMs: 200, ttfbMs: 800, fcpMs: 1800, tbtMs: 300 },
    stalenessMs: 30000,
  };

  function routeStats(firstLoadUncompressedJsBytes: number, chunkNames: string[]) {
    return [
      {
        route: '/',
        firstLoadUncompressedJsBytes,
        firstLoadChunkPaths: chunkNames.map((name) => join(dir, '.next', 'static', 'chunks', name)),
      },
    ];
  }

  it('passes when every route respects its budget and chunks match on disk', async () => {
    const result = await runVerifier({
      budgets: budgetArtifact,
      routeStats: routeStats(90 * 1024, ['route.js']),
      chunks: { 'route.js': 'x'.repeat(90 * 1024) },
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('all routes and the global client-JS budget pass');
  });

  it('fails when a route exceeds its first-load JS budget', async () => {
    const result = await runVerifier({
      budgets: budgetArtifact,
      routeStats: routeStats(101 * 1024, ['route.js']),
      chunks: { 'route.js': 'x'.repeat(101 * 1024) },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('budget(s) breached');
  });

  it('fails when the on-disk chunks disagree with the reported bytes (drift)', async () => {
    const result = await runVerifier({
      budgets: budgetArtifact,
      routeStats: routeStats(90 * 1024, ['route.js']),
      chunks: { 'route.js': 'x'.repeat(50 * 1024) },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('integrity failure');
  });

  it('fails closed when a listed chunk is missing on disk', async () => {
    const result = await runVerifier({
      budgets: budgetArtifact,
      routeStats: routeStats(90 * 1024, ['missing.js']),
      chunks: {},
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('chunk missing on disk');
  });

  it('fails closed when build diagnostics are missing (no build yet)', async () => {
    const result = await runVerifier({
      budgets: budgetArtifact,
      routeStats: null,
      chunks: {},
    });
    // routeStats null writes "null" — diagnostics must be an array; fails.
    expect(result.code).toBe(1);
  });

  it('fails closed on an invalid budget artifact schema', async () => {
    const result = await runVerifier({
      budgets: { schemaVersion: 1, routes: [], global: { totalClientJsKiB: -1 } },
      routeStats: routeStats(10, ['a.js']),
      chunks: { 'a.js': 'x' },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Invalid performance budget artifact');
  });
});