import { spawnSync } from 'node:child_process';

const ITERATIONS = 100;
const THRESHOLDS = {
  lifecycle: 0.95,
  participant: 0.99,
  moderator: 0.99,
};

function runReliabilityTest(grep) {
  const result = spawnSync(
    'yarn',
    [
      'playwright',
      'test',
      'e2e/http-only-session-recovery.spec.ts',
      '--grep',
      grep,
      '--repeat-each',
      String(ITERATIONS),
      '--workers',
      '1',
      '--retries',
      '0',
      '--reporter',
      'json',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '1',
        HTTP_ACTION_RATE_LIMIT: '10000',
        HTTP_EVENTS_RATE_LIMIT: '10000',
      },
    },
  );

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const jsonStart = output.indexOf('{');
  if (jsonStart < 0) {
    throw new Error(`Playwright did not return JSON for ${grep}.\n${output.slice(-4000)}`);
  }

  let report;
  try {
    report = JSON.parse(output.slice(jsonStart));
  } catch (error) {
    throw new Error(`Could not parse Playwright JSON for ${grep}: ${error.message}\n${output.slice(-4000)}`);
  }

  const results = [];
  const collectResults = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const run of test.results ?? []) {
          results.push(run.status === 'passed');
        }
      }
    }
    for (const childSuite of suite.suites ?? []) {
      collectResults(childSuite);
    }
  };

  for (const suite of report.suites ?? []) {
    collectResults(suite);
  }

  return {
    passed: results.filter(Boolean).length,
    total: results.length,
    processFailed: result.status !== 0,
  };
}

function percentage(passed, total) {
  return total === 0 ? 0 : passed / total;
}

const checks = [
  ['lifecycle', 'lifecycle.*@reliability|@reliability.*lifecycle', THRESHOLDS.lifecycle],
  ['participant', 'participant.*@reliability|@reliability.*participant', THRESHOLDS.participant],
  ['moderator', 'moderator.*@reliability|@reliability.*moderator', THRESHOLDS.moderator],
];

const summary = [];
let failed = false;

for (const [name, grep, threshold] of checks) {
  try {
    const result = runReliabilityTest(grep);
    const rate = percentage(result.passed, result.total);
    const passed = !result.processFailed && result.total >= ITERATIONS && rate >= threshold;
    failed ||= !passed;
    summary.push({ name, passedCount: result.passed, total: result.total, rate, threshold, passed });
  } catch (error) {
    failed = true;
    summary.push({ name, passedCount: 0, total: 0, rate: 0, threshold, passed: false, error: error.message });
  }
}

console.log(`E2E reliability (${ITERATIONS} isolated iterations per check)`);
for (const result of summary) {
  const rate = `${(result.rate * 100).toFixed(2)}%`;
  const status = result.passed ? 'PASS' : 'FAIL';
  console.log(
    `${status} ${result.name}: ${result.passedCount}/${result.total} (${rate}), threshold ${(result.threshold * 100).toFixed(2)}%`,
  );
  if (result.name === 'participant') {
    console.log(`  duplicate identities: ${result.total - result.passedCount}`);
  }
  if (result.name === 'moderator') {
    console.log(`  privilege-transfer failures: ${result.total - result.passedCount}`);
  }
  console.log(`  failed iterations: ${result.total - result.passedCount}`);
  if (result.error) {
    console.error(`  ${result.error}`);
  }
}

if (failed) {
  console.error('Reliability thresholds were not met. Inspect Playwright artifacts for failed iterations.');
  process.exitCode = 1;
}
