import { readFile } from 'node:fs/promises';
const summary = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'));
const core = Object.entries(summary).filter(([file]) =>
  /[/\\]services[/\\]financial[/\\]|[/\\]services[/\\]transaction-preview\.ts$|[/\\]financial-format\.ts$|[/\\]providers[/\\](exact|adapters|local-fixture|discovery|calendars)\.ts$|[/\\]jobs[/\\]observations\.ts$|[/\\](ledger|valuation|xirr|twr|simulator|csv|grounding)([/\\.]|$)/i.test(
    file,
  ),
);
if (!core.length) throw new Error('Financial-core files were not measured');
for (const [file, metrics] of core) {
  console.log(
    `Financial core: ${file}: ${metrics.lines.pct}% lines (${metrics.lines.covered}/${metrics.lines.total})`,
  );
  if (metrics.lines.pct < 90) throw new Error('Financial-core line coverage below 90%: ' + file);
}
