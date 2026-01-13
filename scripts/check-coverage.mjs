import fs from 'node:fs/promises';
import path from 'node:path';

const COVERAGE_FILE = path.resolve('coverage/buddy-poker/coverage-summary.json');

function formatPct(pct) {
  return `${Number(pct).toFixed(2)}%`;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const raw = await fs.readFile(COVERAGE_FILE, 'utf-8').catch(() => null);
if (!raw) {
  fail(`Coverage file not found: ${COVERAGE_FILE}`);
  process.exit(1);
}

/** @type {Record<string, any>} */
const summary = JSON.parse(raw);

const required = ['lines', 'statements', 'functions', 'branches'];
const MIN_COVERAGE = 95;

function checkBlock(label, block) {
  for (const metric of required) {
    const pct = block?.[metric]?.pct;
    if (pct < MIN_COVERAGE) {
      fail(`${label}: ${metric} is ${formatPct(pct)} (expected >= ${MIN_COVERAGE}%)`);
    }
  }
}

checkBlock('TOTAL', summary.total);

for (const [file, block] of Object.entries(summary)) {
  if (file === 'total') {
    continue;
  }
  checkBlock(file, block);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`Coverage check passed: >= ${MIN_COVERAGE}% lines/branches/functions/statements.`);
