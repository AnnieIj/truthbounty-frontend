#!/usr/bin/env node
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export function sha256File(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { before: null, afterPath: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--before' && i + 1 < args.length) {
      result.before = args[i + 1];
      i++;
    } else if (args[i] === '--after-path' && i + 1 < args.length) {
      result.afterPath = args[i + 1];
      i++;
    }
  }
  return result;
}

async function gitDiffMode(projectRoot) {
  const gitDirExists = existsSync(new URL('../.git/', import.meta.url)) || existsSync(`${projectRoot}/.git`);
  if (!gitDirExists) {
    console.log('Lockfile integrity skipped (no .git directory; use --before/--after-path mode)');
    return 0;
  }

  let gitOnPath = true;
  try {
    await execFileAsync('git', ['--version'], { windowsHide: true });
  } catch {
    gitOnPath = false;
  }

  if (!gitOnPath) {
    console.log('Lockfile integrity skipped (git not on PATH; use --before/--after-path mode)');
    return 0;
  }

  try {
    await execFileAsync('git', ['diff', '--exit-code', 'pnpm-lock.yaml'], {
      cwd: projectRoot,
      windowsHide: true,
    });
    console.log('Lockfile integrity OK (git diff)');
    return 0;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code !== 0) {
      console.error('Unexpected pnpm-lock.yaml changes; CI install mutated the lockfile. Re-run with updated dependencies.');
      return 1;
    }
    throw error;
  }
}

function shaCompareMode(beforeSha, afterPath) {
  if (!existsSync(afterPath)) {
    console.error(`Lockfile not found at after-path: ${afterPath}`);
    return 1;
  }
  const actualSha = sha256File(afterPath);
  if (actualSha !== beforeSha) {
    console.error(`Unexpected pnpm-lock.yaml changes; SHA mismatch. Expected ${beforeSha}, got ${actualSha}`);
    return 1;
  }
  console.log('Lockfile integrity OK (sha256 match)');
  return 0;
}

async function main() {
  const projectRoot = new URL('../', import.meta.url).pathname.replace(/^\/([A-Z]:\/)/, '$1');
  const { before, afterPath } = parseArgs(process.argv);

  if (before !== null || afterPath !== null) {
    if (before === null || afterPath === null) {
      console.error('Both --before <sha> and --after-path <file> must be supplied together');
      process.exitCode = 1;
      return;
    }
    process.exitCode = shaCompareMode(before, afterPath);
    return;
  }

  try {
    process.exitCode = await gitDiffMode(projectRoot);
  } catch (error) {
    console.error(`Lockfile check error: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-lockfile.mjs')) {
  main();
}
