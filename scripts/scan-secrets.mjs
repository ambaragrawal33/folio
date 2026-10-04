import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const root = process.cwd(),
  snapshot = resolve('.local/phase-2-secret-scan');
const names = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
for (const name of names) {
  const source = resolve(root, name),
    target = resolve(snapshot, name);
  if (!source.startsWith(root + '/') && !source.startsWith(root + '\\'))
    throw new Error('Source outside repository');
  if (!target.startsWith(snapshot + '/') && !target.startsWith(snapshot + '\\'))
    throw new Error('Target outside scan snapshot');
  await mkdir(dirname(target), { recursive: true });
  try {
    await copyFile(source, target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const image = 'ghcr.io/gitleaks/gitleaks:v8.30.1';
for (const [mode, path] of [
  ['dir', snapshot],
  ['git', root],
]) {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      path + ':/repo:ro',
      '-v',
      resolve('.gitleaks.toml') + ':/config.toml:ro',
      image,
      mode,
      '/repo',
      '--redact',
      '--config',
      '/config.toml',
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Trackable working files and full Git history: no leaks PASS');
