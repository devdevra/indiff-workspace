/** Copy only the independent UI and libraries. Does not install, launch, or serve anything. */
import { mkdir, readdir, readFile, writeFile, lstat, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../..');
const web = path.join(here, 'web');
const libraries = (await readdir(path.join(source, 'lib'))).filter(name => /^[a-z0-9._-]+\.js$/.test(name)).sort().map(name => `lib/${name}`);
const names = ['index.html', 'styles.css', 'app.js', ...libraries];
const entries = [];
let total = 0;
// Read everything successfully before replacing a previously prepared asset set.
for (const name of names) {
  const file = path.join(source, ...name.split('/'));
  if (!(await lstat(file)).isFile()) throw Error(`Regular independent source required: ${name}`);
  const bytes = await readFile(file);
  if (bytes.length > 2 * 1024 * 1024 || (total += bytes.length) > 3 * 1024 * 1024) throw Error('Prepared UI exceeds source budget.');
  entries.push({ name, bytes, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await rm(web, { recursive: true, force: true });
await mkdir(path.join(web, 'lib'), { recursive: true });
for (const entry of entries) await writeFile(path.join(web, ...entry.name.split('/')), entry.bytes);
await writeFile(path.join(here, 'web-manifest.json'), JSON.stringify(entries.map(({ name, bytes, sha256 }) => ({ name, bytes: bytes.length, sha256 })), null, 2) + '\n');
console.log(`Prepared ${entries.length} independent Windows web assets (${total} bytes). No app launched.`);
