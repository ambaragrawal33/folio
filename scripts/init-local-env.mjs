import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
let text;
try {
  text = await readFile('.env', 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  text = await readFile('.env.example', 'utf8');
}
let changed = false;
for (const name of ['JWT_ACCESS_SECRET', 'REFRESH_TOKEN_SECRET']) {
  if (!new RegExp('^' + name + '=.+$', 'm').test(text)) {
    text += '\n' + name + '=' + randomBytes(48).toString('base64url') + '\n';
    changed = true;
  }
}
if (changed) await writeFile('.env', text, { mode: 0o600 });
console.log(
  changed
    ? 'Generated missing local auth keys in ignored .env. No credentials printed.'
    : 'Local auth keys already configured; preserved existing values.',
);
