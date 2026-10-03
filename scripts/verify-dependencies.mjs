import { readFile, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
const checked = new Set();
const failures = [];
let edges = 0;
async function check(directory) {
  const resolved = await realpath(directory).catch(() => null);
  if (!resolved || checked.has(resolved)) return;
  checked.add(resolved);
  const manifest = JSON.parse(await readFile(path.join(resolved, 'package.json'), 'utf8'));
  if (manifest.engines?.node && !semver.satisfies(process.versions.node, manifest.engines.node))
    failures.push(manifest.name + ' engine ' + manifest.engines.node);
  for (const [peer, range] of Object.entries(manifest.peerDependencies ?? {})) {
    let current = resolved;
    let meta = null;
    while (!meta) {
      if (path.basename(current) === '.pnpm') break;
      meta = await readFile(path.join(current, 'node_modules', peer, 'package.json'), 'utf8')
        .then(JSON.parse)
        .catch(() => null);
      // pnpm binds peers in the package's virtual node_modules. Its global hoist
      // may contain optional adapters belonging to other packages (e.g. ESLint's Ajv).
      if (path.basename(current) === '.pnpm' || path.dirname(current) === current) break;
      current = path.dirname(current);
    }
    if (!meta) {
      if (!manifest.peerDependenciesMeta?.[peer]?.optional)
        failures.push(manifest.name + ' missing ' + peer);
    } else {
      edges++;
      if (!semver.satisfies(meta.version, range, { includePrerelease: true }))
        failures.push(manifest.name + ' peer ' + peer + '@' + meta.version + ' requires ' + range);
    }
  }
}
for (const entry of await readdir('node_modules/.pnpm', { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'node_modules') continue;
  const modules = path.join('node_modules/.pnpm', entry.name, 'node_modules');
  for (const child of await readdir(modules, { withFileTypes: true }).catch(() => [])) {
    if (child.name.startsWith('@'))
      for (const scoped of await readdir(path.join(modules, child.name)).catch(() => []))
        await check(path.join(modules, child.name, scoped));
    else await check(path.join(modules, child.name));
  }
}
console.log(
  JSON.stringify(
    { node: process.version, packages: checked.size, peerEdges: edges, failures },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
