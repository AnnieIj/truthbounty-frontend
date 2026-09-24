// ---------------------------------------------------------------------------
// 8. V2-FE-045 — production wallet reconnection has no mock/simulator deps
// ---------------------------------------------------------------------------

describe('wallet reconnection — no mock/placeholder runtime dependencies', () => {
  const productionWalletFiles = [
    path.resolve(__dirname, '../../lib/wallet/reconnect.ts'),
    path.resolve(__dirname, '../../hooks/useWallet.ts'),
  ];

  it.each(productionWalletFiles)('%s does not import mocks or simulators', (filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).not.toMatch(/mock-wagmi|transaction-simulator|@stellar\/freighter-api/i);
    expect(content).not.toContain('Math.random');
  });

  it('reconnect policy does not read a cached address/chain from storage', () => {
    const filePath = path.resolve(__dirname, '../../lib/wallet/reconnect.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    // Only the connector id hint may be persisted — never identity material.
    expect(content).not.toMatch(/localStorage|sessionStorage/);
  });
});

// ---------------------------------------------------------------------------
// 8b. Production bundle must not import mock datasets or fabricate runtime state
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