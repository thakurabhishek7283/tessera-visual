// Makes the sibling repositories listed in deps.json available under external/ and builds them.
//   node scripts/fetch-deps.mjs            local dev: link a sibling checkout if one exists, else clone
//   node scripts/fetch-deps.mjs --ci       always clone the pinned ref
//   node scripts/fetch-deps.mjs --no-build skip install + build of the dependency
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const ci = args.has('--ci');
const build = !args.has('--no-build');
const deps = JSON.parse(readFileSync(join(root, 'deps.json'), 'utf8'));

const run = (cmd, cmdArgs, cwd = root) => execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit' });
const rows = [];

mkdirSync(join(root, 'external'), { recursive: true });

for (const [name, spec] of Object.entries(deps)) {
  const target = join(root, 'external', name);
  const sibling = resolve(root, '..', name);
  let mode = 'existing';

  if (!existsSync(target)) {
    if (!ci && existsSync(join(sibling, 'package.json'))) {
      symlinkSync(join('..', '..', name), target, 'dir');
      mode = 'symlink';
    } else {
      run('git', ['clone', '--depth', '1', '--branch', spec.ref, spec.url, target]);
      mode = 'clone';
    }
  }

  let built = false;
  if (build) {
    const lockfile = args.has('--frozen') || ci ? ['--frozen-lockfile'] : [];
    if (!existsSync(join(target, 'node_modules'))) {
      run('pnpm', ['install', ...lockfile], target);
    }
    const probe = join(target, 'packages', spec.packages[0] ?? 'core', 'dist');
    if (ci || !existsSync(probe)) run('pnpm', ['--filter', './packages/*', 'build'], target);
    built = true;
  }
  rows.push({ name, mode, ref: spec.ref, built });
}

console.table(rows);
