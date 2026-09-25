// ---------------------------------------------------------------------------
// 8. Feature-branch regression checks — no mock/placeholder runtime deps
// ---------------------------------------------------------------------------

describe('V2-FE-048 — session lifecycle has no mock/placeholder dependencies', () => {
  const productionFiles = [
    path.resolve(__dirname, '../../lib/auth/session-lifecycle.ts'),
    path.resolve(__dirname, '../../lib/auth/session-sync.ts'),
    path.resolve(__dirname, '../../hooks/useSessionLifecycle.ts'),
    path.resolve(__dirname, '../../components/auth/SessionLifecycleBanner.tsx'),
  ];

  it.each(productionFiles)('%s does not import mocks or simulators', (filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).not.toMatch(/mock-wagmi|transaction-simulator|@stellar\/freighter-api/i);
    expect(content).not.toContain('Math.random');
  });

  it('session-lifecycle policy is pure — no React, wallet SDK, or storage', () => {
    const filePath = path.resolve(__dirname, '../../lib/auth/session-lifecycle.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).not.toMatch(/from 'react'|from 'wagmi'|localStorage|sessionStorage/);
  });
});

// ---------------------------------------------------------------------------
// 9. Production bundle must not import mock datasets or fabricate runtime state
// ---------------------------------------------------------------------------

describe('production bundle — mock isolation', () => {
  it('does not import mock data modules from production source files', () => {
    const srcRoot = path.resolve(__dirname, '../../');
    const files: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'mocks') continue;
          walk(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }

    walk(path.join(srcRoot, 'app'));
    walk(path.join(srcRoot, 'components'));
    walk(path.join(srcRoot, 'hooks'));
    walk(path.join(srcRoot, 'lib'));
    walk(path.join(srcRoot, 'config'));

    const badFiles = files.filter((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      return (
        content.includes('@/data/mock-data') ||
        content.includes('../data/mock-data') ||
        content.includes("'@/__tests__/") ||
        content.includes('"@/__tests__/')
      );
    });

    expect(badFiles).toEqual([]);
  });

  it('does not generate fabricated wallet/tx data with Math.random in production source', () => {
    const srcRoot = path.resolve(__dirname, '../../');
    const files: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'mocks') continue;
          walk(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }

    walk(path.join(srcRoot, 'app'));
    walk(path.join(srcRoot, 'components'));
    walk(path.join(srcRoot, 'hooks'));
    walk(path.join(srcRoot, 'lib'));
    walk(path.join(srcRoot, 'config'));

    const badFiles = files.filter((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      return content.includes('Math.random()') || content.includes('Math.random');
    });

    expect(badFiles).toEqual([]);
  });
});