import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.resolve('scripts/third-party-notices.mjs');
const notices = 'public/THIRD_PARTY_NOTICES.txt';
const packages = ['react', 'react-dom', 'scheduler', 'vite', 'rolldown'];
const run = (mode: string, cwd = process.cwd()) => spawnSync(process.execPath, [script, mode], { cwd, encoding: 'utf8' });

test('checked-in browser notices match exact installed license files and locked versions', () => {
  const result = run('--check');
  assert.equal(result.status, 0, result.stderr);
  const text = readFileSync(notices, 'utf8');
  for (const name of packages) {
    const packageInfo = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
    assert.ok(text.includes(`${name} ${packageInfo.version}`), name);
    const files = name === 'vite' ? ['LICENSE.md'] : name === 'rolldown' ? ['LICENSE', 'THIRD-PARTY-LICENSE'] : ['LICENSE'];
    for (const file of files) assert.ok(text.includes(readFileSync(`node_modules/${name}/${file}`, 'utf8')), `${name}/${file}`);
  }
});

test('notice check rejects missing, edited, stale-license and mismatched-version files without rewriting', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kindsignal-notices-'));
  try {
    mkdirSync(path.join(root, 'public'));
    cpSync('package-lock.json', path.join(root, 'package-lock.json'));
    for (const name of packages) {
      const destination = path.join(root, 'node_modules', name);
      mkdirSync(destination, { recursive: true });
      for (const file of ['package.json', ...(name === 'vite' ? ['LICENSE.md'] : name === 'rolldown' ? ['LICENSE', 'THIRD-PARTY-LICENSE'] : ['LICENSE'])]) {
        cpSync(`node_modules/${name}/${file}`, path.join(destination, file));
      }
    }
    assert.notEqual(run('--check', root).status, 0, 'missing notice must fail');
    assert.equal(run('--write', root).status, 0);
    assert.equal(run('--check', root).status, 0);
    const target = path.join(root, notices);
    const original = readFileSync(target, 'utf8');
    writeFileSync(target, original + 'unexpected edit');
    assert.notEqual(run('--check', root).status, 0);
    assert.equal(readFileSync(target, 'utf8'), original + 'unexpected edit', 'check must not rewrite');
    writeFileSync(target, original);
    const license = path.join(root, 'node_modules/react/LICENSE');
    writeFileSync(license, readFileSync(license, 'utf8') + '\nAdditional upstream notice');
    assert.notEqual(run('--check', root).status, 0, 'changed upstream notice must fail');
    cpSync('node_modules/react/LICENSE', license);
    const manifest = path.join(root, 'node_modules/react/package.json');
    const info = JSON.parse(readFileSync(manifest, 'utf8'));
    writeFileSync(manifest, JSON.stringify({ ...info, version: '0.0.0' }));
    assert.notEqual(run('--check', root).status, 0, 'installed version mismatch must fail');
    cpSync('node_modules/react/package.json', manifest);
    writeFileSync(path.join(root, 'package-lock.json'), readFileSync('package-lock.json', 'utf8') + '\n');
    assert.notEqual(run('--check', root).status, 0, 'any lockfile change requires notice review');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('license link preserves the current app tab and has an accessible new-tab label', () => {
  const source = readFileSync('src/App.tsx', 'utf8');
  assert.match(source, /href="\/THIRD_PARTY_NOTICES\.txt" target="_blank" rel="noopener noreferrer" aria-label="OSSライセンス（新しいタブで開きます）"/);
});
