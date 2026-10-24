// Generates THIRD_PARTY_NOTICES.txt from the installed production dependencies.
// Run with: node scripts/gen-notices.mjs   (also runs automatically before `npm run dist`)
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dirs = execSync('npm ls --omit=dev --all --parseable', { encoding: 'utf8', maxBuffer: 1e8 })
  .split(/\r?\n/)
  .filter(Boolean);

const seen = new Map();
for (const dir of dirs) {
  const manifest = join(dir, 'package.json');
  if (dir === root || !existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  if (!pkg.name) continue;
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) continue;
  let license = pkg.license ?? (pkg.licenses ?? []).map((l) => l.type).join(' OR ') ?? 'UNKNOWN';
  if (typeof license === 'object') license = license.type;
  const files = readdirSync(dir).filter((f) => /^(licen[sc]e|notice|copying)(\.|$)/i.test(f));
  const texts = files.map((f) => ({ name: f, body: readFileSync(join(dir, f), 'utf8').trim() }));
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? pkg.homepage ?? '';
  seen.set(key, { license: license || 'UNKNOWN', repo, texts });
}

const bar = '='.repeat(78);
const parts = [
  'THIRD-PARTY NOTICES',
  '',
  'PetePrep includes the open-source software listed below. Each component is used under',
  'its own license, reproduced here. PetePrep itself is licensed separately (see LICENSE).',
  '',
  'PetePrep runs on Electron, which bundles Chromium and Node.js. Their licenses ship with',
  'the app in LICENSE.electron.txt and LICENSES.chromium.html next to the executable.',
  '',
];
for (const [name, info] of [...seen.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  parts.push(bar, `${name}`, `License: ${info.license}`);
  if (info.repo) parts.push(`Source: ${info.repo.replace(/^git\+/, '')}`);
  parts.push('');
  if (info.texts.length === 0) parts.push('(No license file is included in this package; see the license named above.)', '');
  for (const t of info.texts) parts.push(`--- ${t.name} ---`, t.body, '');
}
writeFileSync('THIRD_PARTY_NOTICES.txt', parts.join('\n'));
console.log(`wrote THIRD_PARTY_NOTICES.txt for ${seen.size} packages`);
const missing = [...seen.entries()].filter(([, i]) => i.texts.length === 0).map(([n]) => n);
if (missing.length) console.log('no license file found for:', missing.join(', '));
