import { readFile } from 'node:fs/promises';
const summary = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'));
const core = Object.entries(summary).filter(([file]) =>
  /[/\\](ledger|valuation|xirr|twr|simulator|csv|grounding)([/\\.]|$)/i.test(file),
);
if (!core.length)
  console.log('Financial-core 90% gate configured; no financial core is implemented in Phase 2.');
for (const [file, metrics] of core) {
  if (metrics.lines.pct < 90) throw new Error('Financial-core line coverage below 90%: ' + file);
}
