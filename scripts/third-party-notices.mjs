// Keep the browser distribution's notices from the installed npm artifacts.
// npm ci verifies package-lock integrity; this script does not fetch packages.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const packages = [
  { name: 'react', files: ['LICENSE'], use: 'Browser UI runtime and JSX runtime' },
  { name: 'react-dom', files: ['LICENSE'], use: 'Browser rendering runtime' },
  { name: 'scheduler', files: ['LICENSE'], use: 'React DOM scheduling runtime' },
  { name: 'vite', files: ['LICENSE.md'], use: 'Injected modulepreload polyfill' },
  { name: 'rolldown', files: ['LICENSE', 'THIRD-PARTY-LICENSE'], use: 'Injected runtime helpers' },
];
const mode = process.argv[2];
if (!['--check', '--write'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node scripts/third-party-notices.mjs --check|--write');
  process.exit(1);
}

try {
  const lockText = await readFile('package-lock.json', 'utf8');
  const lock = JSON.parse(lockText);
  const sections = [];
  for (const { name, files, use } of packages) {
    const directory = path.join('node_modules', name);
    const installed = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    const locked = lock.packages?.[`node_modules/${name}`];
    if (!locked?.version || installed.name !== name || installed.version !== locked.version) {
      throw new Error(`${name}: installed package does not match package-lock.json. Run npm ci.`);
    }
    const notices = [];
    for (const file of files) {
      const text = await readFile(path.join(directory, file), 'utf8');
      if (!text.trim()) throw new Error(`${name}/${file}: empty license file`);
      // Preserve the complete upstream file, including its bundled notices.
      notices.push(`Source file: ${name}/${file}\n\n${text}`);
    }
    sections.push(`${name} ${installed.version}\nUse: ${use}\nPackage: https://www.npmjs.com/package/${name}/v/${installed.version}\n\n${notices.join('\n\n')}`);
  }
  const header = `KindSignal: third-party software notices\n\nThese notices apply to the respective third-party software, not to KindSignal's\noriginal code, images, audio, or other assets. The current browser bundle contains\nReact, React DOM, Scheduler, Vite's modulepreload polyfill, and Rolldown helpers.\n\nThe complete license files shipped in those npm packages are retained below.\nThe Vite and Rolldown files also include upstream bundled notices; retaining them\ndoes not mean every component named in those files is included in this browser.\nServer-only dependencies retain their own licenses in the runtime node_modules.\n\nGenerated from package-lock.json SHA-256: ${createHash('sha256').update(lockText).digest('hex')}\nRegenerate after reviewing dependency changes: npm run licenses:generate\n\n`;
  const expected = header + sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n';
  const target = 'public/THIRD_PARTY_NOTICES.txt';
  if (mode === '--write') {
    await writeFile(target, expected, 'utf8');
    console.log(`Wrote ${target} from installed package license files.`);
  } else {
    const actual = await readFile(target, 'utf8');
    if (actual !== expected) throw new Error(`${target} is stale. Review bundled dependencies, then run npm run licenses:generate.`);
    console.log('Third-party notices match the installed packages and package-lock.json.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
