import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(await readFile(path.join(root, 'source/figma.json'), 'utf8'));
const components = JSON.parse(await readFile(path.join(root, 'source/components.json'), 'utf8'));
const families = JSON.parse(await readFile(path.join(root, 'source/families.json'), 'utf8'));
const geometry = JSON.parse(await readFile(path.join(root, 'source/geometry.json'), 'utf8'));
const semantic = source.collections.find((c) => c.name === 'Folio · Semantic colors');
const dimensions = source.collections.find((c) => c.name === 'Folio · Dimensions');
const vars = source.variables.filter(
  (v) => v.collectionId === semantic.id || v.collectionId === dimensions.id,
);
const name = (s) => s.replaceAll('/', '-').replaceAll(' ', '-').toLowerCase();
const cssVar = (id) => {
  const v = vars.find((x) => x.id === id);
  return v ? 'var(--' + name(v.name) + ')' : undefined;
};
const hex = (c) =>
  '#' +
  [c.r, c.g, c.b]
    .map((n) =>
      Math.round(n * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const luminance = (c) =>
  [c.r, c.g, c.b]
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const manifest = {
  fileKey: source.fileKey,
  inspectedAt: source.inspectedAt,
  canonicalCollections: [semantic.id, dimensions.id],
  colors: {},
  geometry,
  accessibility: [],
  familyCount: families.length,
  componentCount: components.length,
};
let css = '/* Generated from verified Figma data. Run pnpm tokens:sync. */\n';
for (const mode of semantic.modes) {
  const values = {};
  css +=
    (mode.name === 'Dark' ? ':root, ' : '') +
    '[data-theme="' +
    mode.name.toLowerCase() +
    '"] {\n color-scheme: ' +
    mode.name.toLowerCase() +
    ';\n';
  for (const v of vars.filter((v) => v.type === 'COLOR')) {
    values[v.name] = v.valuesByMode[mode.modeId];
    css += ' --' + name(v.name) + ': ' + hex(values[v.name]) + ';\n';
  }
  manifest.colors[mode.name.toLowerCase()] = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, hex(v)]),
  );
  // Approved D15: accessible aliases reference stronger EXISTING roles, never change palette.
  for (const [alias, intended] of [
    ['muted', 'text/muted'],
    ['accent', 'accent/primary'],
    ['positive', 'status/positive'],
    ['negative', 'status/negative'],
    ['warning', 'status/warning'],
  ]) {
    const backgrounds = [
      'surface/canvas',
      'surface/base',
      'surface/raised',
      'surface/hover',
      'surface/selected',
    ];
    const minimum = Math.min(...backgrounds.map((bg) => contrast(values[intended], values[bg])));
    const role = minimum >= 4.5 ? intended : 'text/secondary';
    css += ' --accessible-' + alias + ': var(--' + name(role) + ');\n';
    manifest.accessibility.push({
      theme: mode.name,
      alias,
      intended,
      role,
      minimumContrast: +minimum.toFixed(3),
      actualMinimumContrast: +Math.min(
        ...backgrounds.map((bg) => contrast(values[role], values[bg])),
      ).toFixed(3),
    });
  }
  css += '}\n';
}
css += ':root {\n';
for (const v of vars.filter((v) => v.type === 'FLOAT'))
  css += ' --' + name(v.name) + ': ' + Object.values(v.valuesByMode)[0] + 'px;\n';
for (const [group, fields] of Object.entries(geometry))
  if (typeof fields === 'object')
    for (const [key, val] of Object.entries(fields))
      if (typeof val === 'number')
        css +=
          ' --' + group + '-' + name(key.replace(/[A-Z]/g, (c) => '-' + c)) + ': ' + val + 'px;\n';
for (const style of source.textStyles) {
  const key = style.name.split('/').at(-1);
  const font = style.fontName.family;
  const weight =
    style.fontName.variationSettings?.wght ??
    (style.fontName.style.includes('Medium')
      ? 500
      : style.fontName.style.includes('Semi')
        ? 600
        : 400);
  css +=
    ' --type-' +
    key +
    '-family: "' +
    font +
    '", ' +
    (font.includes('Mono') ? 'monospace' : 'sans-serif') +
    ';\n --type-' +
    key +
    '-size: ' +
    style.fontSize +
    'px;\n --type-' +
    key +
    '-line: ' +
    style.lineHeight.value +
    'px;\n --type-' +
    key +
    '-weight: ' +
    weight +
    ';\n';
}
css += '}\n';
for (const style of source.textStyles) {
  const k = style.name.split('/').at(-1);
  css +=
    '.type-' +
    k +
    ' { font: var(--type-' +
    k +
    '-weight) var(--type-' +
    k +
    '-size)/var(--type-' +
    k +
    '-line) var(--type-' +
    k +
    '-family); }\n';
}
let componentCss = '/* Generated component geometry and state roles from Figma. */\n';
for (const c of components) {
  const [id, parent, properties, width, height, gap, pad, radius, stroke, fill, border, text] = c;
  const family = families.find((f) => f.id === parent || f.id === id)?.name ?? '';
  const props = Object.fromEntries(properties.split(', ').map((p) => p.split('=')));
  const key = id.replace(':', '-');
  const decl =
    '--variant-width: ' +
    width +
    'px; --variant-height: ' +
    height +
    'px; --variant-gap: ' +
    gap +
    'px; --variant-padding: ' +
    pad.map((n) => n + 'px').join(' ') +
    '; --variant-radius: ' +
    radius +
    'px; --variant-stroke: ' +
    (stroke ?? 0) +
    'px;';
  const textRole = cssVar(text);
  const styles =
    decl +
    (fill ? ' --variant-fill: ' + cssVar(fill) + '; background: var(--variant-fill);' : '') +
    (border
      ? ' --variant-border: ' + cssVar(border) + '; border-color: var(--variant-border);'
      : '') +
    (textRole ? ' --variant-color: ' + textRole + '; color: var(--variant-color);' : '');
  componentCss += '[data-figma="' + id + '"] { ' + styles + ' }\n';
  if (
    family.includes('Button') ||
    family.includes('Text input') ||
    family.includes('Select') ||
    family.includes('Search input') ||
    family.includes('Navigation')
  ) {
    const pseudo = {
      Hover: ':hover:not(:disabled)',
      Pressed: ':active:not(:disabled)',
      Focus: ':focus-visible',
    }[props.State];
    if (pseudo)
      componentCss +=
        '[data-family="' +
        family +
        '"][data-size="' +
        (props.Size ?? 'Default') +
        '"]' +
        pseudo +
        ' { ' +
        styles +
        ' }\n';
  }
  // The geometry custom property lets all states preserve their inspected dimensions.
  componentCss +=
    ':root { --figma-' +
    key +
    '-width: ' +
    width +
    'px; --figma-' +
    key +
    '-height: ' +
    height +
    'px; }\n';
}
const themeVars = vars
  .filter((v) => v.type === 'COLOR')
  .map((v) => ' --color-' + name(v.name) + ': var(--' + name(v.name) + ');')
  .join('\n');
const tailwind =
  '@theme inline {\n' +
  themeVars +
  '\n --font-sans: var(--type-body-family);\n --font-mono: var(--type-numeric-family);\n}\n';
const authGeometry = JSON.parse(
  await readFile(path.join(root, 'source/auth-geometry.json'), 'utf8'),
);
const authVariables =
  ':root {\n' +
  Object.entries(authGeometry.roles)
    .map(([key, value]) => '  --auth-' + key + ': ' + value + 'px;')
    .join('\n') +
  '\n}\n';
const outputs = {
  'auth.css':
    authVariables +
    (await readFile(path.join(root, 'source/auth.css.template'), 'utf8'))
      .replaceAll('__MOBILE__', String(geometry.responsive.mobile))
      .replaceAll('\r\n', '\n'),
  'tokens.css': css,
  'components.css': componentCss,
  'tailwind.css': tailwind,
  'responsive.css': (await readFile(path.join(root, 'source/responsive.css.template'), 'utf8'))
    .replaceAll('__TABLET__', String(geometry.responsive.tablet))
    .replaceAll('__MOBILE__', String(geometry.responsive.mobile))
    .replaceAll('\r\n', '\n'),
  'manifest.json': JSON.stringify(manifest, null, 2) + '\n',
};
// Exact downloaded paths are retained. Only known semantic literal fills are
// mapped to the corresponding Light mode; the original SVGs are never edited.
const assetRoot = path.resolve(root, '../../apps/web/public/figma');
const lightRoot = path.join(assetRoot, 'light');
await mkdir(lightRoot, { recursive: true });
for (const asset of [
  '2-4839-imgSwitchTrack.svg',
  '2-4840-imgSwitchTrack.svg',
  '2-4841-imgSwitchTrack.svg',
  '2-4837-imgRadioIndicator.svg',
]) {
  const raw = await readFile(path.join(assetRoot, asset), 'utf8');
  const roleByHex = {};
  for (const role of [
    'surface/canvas',
    'surface/base',
    'border/default',
    'text/secondary',
    'text/disabled',
    'accent/primary',
  ])
    roleByHex[manifest.colors.dark[role]] = manifest.colors.light[role];
  const mapped = raw.replace(/#[0-9a-f]{6}/gi, (color) => roleByHex[color.toLowerCase()] ?? color);
  const target = path.join(lightRoot, asset);
  if (process.argv.includes('--check')) {
    if ((await readFile(target, 'utf8').catch(() => null)) !== mapped)
      throw new Error('Stale Light asset: ' + asset);
  } else await writeFile(target, mapped);
}
await mkdir(path.join(root, 'generated'), { recursive: true });
for (const [filename, content] of Object.entries(outputs)) {
  const target = path.join(root, 'generated', filename);
  if (process.argv.includes('--check')) {
    if ((await readFile(target, 'utf8').catch(() => null)) !== content)
      throw new Error('Stale generated tokens: ' + filename);
  } else await writeFile(target, content);
}
console.log(
  'Figma token ' +
    (process.argv.includes('--check') ? 'check' : 'sync') +
    ': ' +
    vars.length +
    ' canonical variables, ' +
    source.textStyles.length +
    ' text styles, ' +
    components.length +
    ' states, both themes',
);
