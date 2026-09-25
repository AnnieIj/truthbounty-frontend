/**
 * V2-FE-071 — Regression guard for reduced motion & cognitive accessibility.
 *
 * Mirrors the repo's existing guard pattern (cf. mock-removal, Stellar removal
 * tests): read source files directly so violations fail CI even if a future
 * refactor swaps in new runtime mocks.
 *
 * Guards:
 *  1. `animate-ping` (flashing attention cue) must not re-enter feature
 *     components — use text/color/static dots for attention instead.
 *  2. `scroll-behavior: smooth` must remain neutralized under reduced motion.
 *  3. The CSS reduced-motion block must keep killing the known animated
 *     utilities (flash risk) and the shimmer/ping/pulse/spin family.
 *  4. Status components must not gate their text label behind animation.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..')

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

function isTestFile(filePath: string): boolean {
  return (
    filePath.includes(`${path.sep}__tests__${path.sep}`) ||
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath)
  );
}

// ---------------------------------------------------------------------------
// 1. animate-ping must not re-enter feature components (flash risk, WCAG 2.3.1)
// ---------------------------------------------------------------------------

describe('animate-ping stays out of feature components', () => {
  const SCANNED_DIRS = [
    path.join(SRC, 'components', 'features'),
    path.join(SRC, 'components', 'ui'),
    path.join(SRC, 'app'),
  ];

  function collectFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        files.push(...collectFiles(full));
      } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name) && !isTestFile(full)) {
        files.push(full);
      }
    }
    return files;
  }

  it('no feature/ui/app component uses animate-ping', () => {
    const offenders: string[] = [];
    for (const dir of SCANNED_DIRS) {
      if (!fs.existsSync(dir)) continue;
      for (const file of collectFiles(dir)) {
        if (fs.readFileSync(file, 'utf8').includes('animate-ping')) {
          offenders.push(path.relative(SRC, `.${path.sep}${path.relative(SRC, file)}`));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2 & 3. globals.css must keep its reduced-motion guarantees
// ---------------------------------------------------------------------------

describe('globals.css reduced-motion layer', () => {
  let css = '';
  beforeAll(() => {
    css = fs.readFileSync(path.join(SRC, 'app', 'globals.css'), 'utf8');
  });

  it('contains a prefers-reduced-motion block', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  function reducedMotionBlock(): string {
    const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(start).toBeGreaterThanOrEqual(0);
    // Take a generous window after the block start; the block is the last
    // major section of globals.css before the code-font section.
    return css.slice(start, start + 2500);
  }

  it('kills every known animated utility class under reduced motion', () => {
    const block = reducedMotionBlock();
    for (const cls of [
      '.animate-ping',
      '.animate-pulse',
      '.animate-spin',
      '.animate-bounce',
      '.animate-fadeIn',
      '.animate-shimmer',
    ]) {
      expect(block).toContain(cls);
    }
  });

  it('neutralizes smooth scrolling under reduced motion', () => {
    const block = reducedMotionBlock();
    expect(block).toContain('scroll-behavior: auto');
  });

  it('disables hover transforms under reduced motion (motion ≠ comprehension)', () => {
    const block = reducedMotionBlock();
    expect(block).toContain('transform: none !important');
  });

  it('motion-free status/notice primitives exist for future consumers', () => {
    const status = fs.readFileSync(
      path.join(SRC, 'components', 'ui', 'MotionSafeStatus.tsx'),
      'utf8',
    );
    expect(status).toContain('role="status"');
    expect(status).toContain('aria-live');
    // The text label must not be conditionally suppressed by motion preference.
    expect(status).toMatch(/\{label\}/);
  });
});

// ---------------------------------------------------------------------------
// 4. DisputeVoting comprehension must not depend on motion
// ---------------------------------------------------------------------------

describe('DisputeVoting static attention cue', () => {
  it('keeps a visible static dot and text label (no motion dependency)', () => {
    const src = fs.readFileSync(
      path.join(SRC, 'components', 'features', 'disputes', 'DisputeVoting.tsx'),
      'utf8',
    );
    expect(src).toContain('Active Dispute Voting');
    expect(src).toContain('bg-red-500');
    expect(src).not.toContain('animate-ping');
  });
});
