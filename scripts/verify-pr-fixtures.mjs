#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const millisecondsPerDay = 24 * 60 * 60 * 1000;

async function runGh(argumentsList) {
  const result = await execFileAsync('gh', argumentsList, {
    cwd: repositoryRoot,
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout.trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function calculateActiveCalendarDays(firstCommitAt, lastCommitAt) {
  return Math.floor((Date.parse(lastCommitAt) - Date.parse(firstCommitAt)) / millisecondsPerDay) + 1;
}

async function main() {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'pr-scenarios.json'), 'utf8'));
  assert(manifest.schemaVersion === 'github-hours-effort-pr-fixtures-v1', 'Unexpected PR manifest schema');
  const results = [];

  for (const scenario of manifest.scenarios) {
    assert(Number.isInteger(scenario.prNumber), `${scenario.id} does not have a PR number`);
    const pullRequest = JSON.parse(await runGh([
      'api',
      `repos/${manifest.repository}/pulls/${scenario.prNumber}`,
    ]));
    const commits = JSON.parse(await runGh([
      'api',
      `repos/${manifest.repository}/pulls/${scenario.prNumber}/commits?per_page=100`,
    ]));
    const files = JSON.parse(await runGh([
      'api',
      `repos/${manifest.repository}/pulls/${scenario.prNumber}/files?per_page=100`,
    ]));

    const observedState = pullRequest.merged_at ? 'merged' : pullRequest.state;
    const firstCommitAt = commits[0]?.commit?.author?.date;
    const lastCommitAt = commits.at(-1)?.commit?.author?.date;
    assert(pullRequest.base.ref === scenario.baseRef, `${scenario.id} has the wrong base branch`);
    assert(pullRequest.head.ref === scenario.headRef, `${scenario.id} has the wrong head branch`);
    assert(observedState === scenario.expected.state, `${scenario.id} has unexpected state ${observedState}`);
    assert(
      commits.length === scenario.expected.sourceCommitCount,
      `${scenario.id} expected ${scenario.expected.sourceCommitCount} commits but found ${commits.length}`,
    );
    assert(firstCommitAt === scenario.expected.firstCommitAt, `${scenario.id} has the wrong first commit date`);
    assert(lastCommitAt === scenario.expected.lastCommitAt, `${scenario.id} has the wrong last commit date`);
    assert(
      calculateActiveCalendarDays(firstCommitAt, lastCommitAt) === scenario.expected.activeCalendarDays,
      `${scenario.id} has the wrong active window`,
    );
    assert(files.length > 0 && files.every(file => typeof file.patch === 'string'), `${scenario.id} lacks diff patches`);

    results.push({
      id: scenario.id,
      prNumber: scenario.prNumber,
      state: observedState,
      sourceCommitCount: commits.length,
      firstCommitAt,
      lastCommitAt,
      activeCalendarDays: calculateActiveCalendarDays(firstCommitAt, lastCommitAt),
      changedFileCount: files.length,
      hasDiffPatches: files.every(file => typeof file.patch === 'string'),
      isRdGroundTruth: scenario.classification.isRd,
      knownEffortHours: scenario.expected.knownEffortHours,
      url: pullRequest.html_url,
    });
  }

  const knownRdHours = results
    .filter(result => result.isRdGroundTruth)
    .reduce((total, result) => total + result.knownEffortHours, 0);
  const knownNonRdHours = results
    .filter(result => !result.isRdGroundTruth)
    .reduce((total, result) => total + result.knownEffortHours, 0);
  process.stdout.write(`${JSON.stringify({
    repository: manifest.repository,
    verifiedPullRequests: results.length,
    knownRdHours,
    knownNonRdHours,
    results,
  }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
