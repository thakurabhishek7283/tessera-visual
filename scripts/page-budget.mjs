// Page budgets: what a real page pays for Tessera, with every dependency included.
//
//   node scripts/page-budget.mjs                 measure, print the report, fail when over budget
//   node scripts/page-budget.mjs --init-missing  also add a budget (today + 3%) for new pages
//
// Each `budgets/pages/<name>.ts` is one page. It's bundled with rolldown (the bundler under tsdown
// and Vite) the way an app would bundle it for production: minified ESM, code splitting on,
// `process.env.NODE_ENV` set to "production", nothing external except the host framework (react,
// react-dom). Every chunk is compressed with gzip (level 9) and brotli
// (quality 11). The report goes to stdout as Markdown and to budgets/report.json; the limits live
// in budgets/pages.json, in bytes. Run after `pnpm build`, since pages import the built packages.
//
// Plan: tessera-studio-plan, session 0.1. Decision: docs/decisions/0006-page-budgets-and-the-shared-peer-trigger.md (tessera).
// This file is copied verbatim into the kit repositories. Change it here first.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'rolldown';
import { parseAst } from 'rolldown/parseAst';
import {
  attribute,
  checkBudgets,
  duplicates,
  formatReport,
  initialChunks,
  markStatements,
  normaliseId,
  packageOf,
  splitRegions,
} from './page-budget-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const budgetsDir = join(root, 'budgets');
const pagesDir = join(budgetsDir, 'pages');
const budgetsFile = join(budgetsDir, 'pages.json');
const reportFile = join(budgetsDir, 'report.json');
const args = new Set(process.argv.slice(2));

/** The host framework is paid for by the app, so pages never count it. */
const EXTERNAL = ['react', 'react-dom'];
const isExternal = (id) => EXTERNAL.some((name) => id === name || id.startsWith(`${name}/`));

// Nearest package.json with a name, cached per directory.
const pkgCache = new Map();
function lookup(file) {
  let dir = dirname(file);
  const visited = [];
  while (true) {
    if (pkgCache.has(dir)) break;
    visited.push(dir);
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      const json = JSON.parse(readFileSync(manifest, 'utf8'));
      if (json.name) {
        pkgCache.set(dir, { name: json.name, version: json.version, dir: normaliseId(dir) });
        break;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      pkgCache.set(dir, undefined);
      break;
    }
    dir = parent;
  }
  const found = pkgCache.get(dir);
  for (const d of visited) pkgCache.set(d, found);
  return found;
}

const shortName = (name) => name.replace(/^@[^/]+\//, '');

/** Lets {@link splitRegions} see which package each statement of a built kit file came from. */
const markRegions = {
  name: 'page-budget:mark-regions',
  transform(code, id) {
    if (!code.includes('//#region ')) return null;
    const marked = markStatements(
      code,
      parseAst(code, { lang: id.endsWith('.ts') ? 'ts' : 'js' }).body.map((s) => s.start),
    );
    return marked === null ? null : { code: marked, map: null };
  },
};

/**
 * Resolves every copy of the same package version to one directory. In an app, the package manager
 * installs a version once; here the linked sibling checkouts (external/*) bring their own
 * node_modules, which would otherwise count zod or lit twice. Different versions stay apart and
 * show up as duplicates.
 */
function dedupeVersions() {
  const first = new Map();
  return {
    name: 'page-budget:dedupe-versions',
    async resolveId(source, importer, options) {
      if (!importer || /^[./\0]/.test(source) || isExternal(source)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external) return resolved;
      const pkg = packageOf(resolved.id, lookup);
      if (!pkg.dir || !normaliseId(resolved.id).includes('/node_modules/')) return resolved;
      const version = pkg.version ?? lookup(join(pkg.dir, 'package.json'))?.version;
      const key = `${pkg.name}@${version}`;
      if (!first.has(key)) first.set(key, pkg.dir);
      const dir = first.get(key);
      return dir === pkg.dir
        ? resolved
        : { ...resolved, id: dir + normaliseId(resolved.id).slice(pkg.dir.length) };
    },
  };
}

async function measure(name, entry) {
  const out = await build({
    input: { [name]: entry },
    cwd: root,
    platform: 'browser',
    write: false,
    external: isExternal,
    // A production app build: bundlers replace process.env.NODE_ENV, so development-only code
    // (core's full config schema, for one) drops out the way it does for users.
    transform: { define: { 'process.env.NODE_ENV': '"production"' } },
    output: { format: 'esm', minify: true },
    logLevel: 'warn',
    plugins: [dedupeVersions(), markRegions],
    onLog(level, log, handler) {
      // A page that can't resolve an import would silently measure less than it ships.
      if (log.code === 'UNRESOLVED_IMPORT') throw new Error(`${name}: ${log.message}`);
      if (log.code === 'INEFFECTIVE_DYNAMIC_IMPORT') return;
      handler(level, log);
    },
  });
  const chunks = out.output.filter((o) => o.type === 'chunk');
  const initial = initialChunks(chunks);

  const measured = chunks.map((chunk) => {
    const parts = [];
    for (const [id, mod] of Object.entries(chunk.modules)) {
      if (mod.renderedLength === 0) continue;
      const host = packageOf(id, lookup);
      const split = mod.code
        ? splitRegions(mod.code, (region) =>
            region === null || !host.dir ? host : packageOf(resolve(host.dir, region), lookup),
          )
        : [{ owner: host, bytes: mod.renderedLength }];
      for (const { owner, bytes } of split) {
        const inlined = owner.name !== host.name;
        parts.push({
          name: owner.name,
          // Copies are told apart by where they live: inlined into a kit, or a version on disk.
          copy: inlined ? shortName(host.name) : `@${owner.version ?? 'local'}`,
          bytes,
        });
      }
    }
    return {
      fileName: chunk.fileName,
      initial: initial.has(chunk.fileName),
      gzip: gzipSync(chunk.code, { level: 9 }).length,
      brotli: brotliCompressSync(chunk.code, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length,
      parts,
    };
  });

  const sum = (list, key) => list.reduce((total, c) => total + c[key], 0);
  const first = measured.filter((c) => c.initial);
  const { packages, copies } = attribute(measured);
  return {
    name,
    initialGzip: sum(first, 'gzip'),
    initialBrotli: sum(first, 'brotli'),
    totalGzip: sum(measured, 'gzip'),
    chunks: measured.length,
    packages,
    duplicates: duplicates(copies),
  };
}

const pages = readdirSync(pagesDir)
  .filter((f) => f.endsWith('.ts'))
  .sort()
  .map((f) => ({ name: basename(f, '.ts'), entry: join(pagesDir, f) }));

const results = [];
for (const page of pages) results.push(await measure(page.name, page.entry));

const budgets = existsSync(budgetsFile) ? JSON.parse(readFileSync(budgetsFile, 'utf8')) : {};
if (args.has('--init-missing')) {
  for (const r of results) {
    if (budgets[r.name]) continue;
    const plus3 = (n) => Math.ceil((n * 1.03) / 100) * 100;
    budgets[r.name] = { initialGzip: plus3(r.initialGzip), totalGzip: plus3(r.totalGzip) };
    console.log(`Added a budget for ${r.name}.`);
  }
  writeFileSync(budgetsFile, `${JSON.stringify(budgets, null, 2)}\n`);
}

writeFileSync(reportFile, `${JSON.stringify({ external: EXTERNAL, pages: results }, null, 2)}\n`);
console.log(formatReport(results, budgets, { external: EXTERNAL }));

const problems = checkBudgets(results, budgets);
if (problems.length > 0) {
  console.error('Page budget check failed:');
  for (const p of problems) console.error(`  ✖ ${p}`);
  console.error(
    '\nLower the page cost, or raise the budget in budgets/pages.json and justify it in the pull request.',
  );
  process.exit(1);
}
console.log('All pages are within budget.');
