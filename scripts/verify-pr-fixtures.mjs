#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const outputArgumentIndex = process.argv.indexOf('--output');
const outputPath = outputArgumentIndex >= 0 ? process.argv[outputArgumentIndex + 1] : undefined;

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
  const firstDate = new Date(firstCommitAt);
  const lastDate = new Date(lastCommitAt);
  const firstDay = Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), firstDate.getUTCDate());
  const lastDay = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate());
  return Math.floor((lastDay - firstDay) / millisecondsPerDay) + 1;
}

function normaliseTimestamp(timestamp) {
  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
    throw new Error('GitHub returned an invalid commit timestamp');
  }
  return new Date(timestamp).toISOString();
}

async function main() {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'pr-scenarios.json'), 'utf8'));
  assert(manifest.schemaVersion === 'github-hours-effort-pr-fixtures-v1', 'Unexpected PR manifest schema');
  assert(Array.isArray(manifest.weeklyCheckIns), 'PR manifest must contain weekly check-ins');
  const scenarioIds = new Set(manifest.scenarios.map(scenario => scenario.id));
  const checkInHoursByScenario = new Map();
  for (const checkIn of manifest.weeklyCheckIns) {
    const activityHours = checkIn.activities.reduce((total, activity) => {
      assert(scenarioIds.has(activity.scenarioId), `Unknown check-in scenario ${activity.scenarioId}`);
      checkInHoursByScenario.set(
        activity.scenarioId,
        (checkInHoursByScenario.get(activity.scenarioId) ?? 0) + activity.hours,
      );
      return total + activity.hours;
    }, 0);
    assert(
      activityHours + checkIn.otherWorkHours === manifest.workSchedule.weeklyHours,
      `${checkIn.identityEmail} ${checkIn.weekStart} does not reconcile to the configured week`,
    );
  }
  for (const scenario of manifest.scenarios) {
    if (scenario.externalStartEvidence) {
      assert(
        typeof scenario.externalStartEvidence.identityEmail === 'string' &&
          scenario.externalStartEvidence.identityEmail.length > 0,
        `${scenario.id} external start evidence lacks an identity`,
      );
      assert(
        typeof scenario.externalStartEvidence.sourceReference === 'string' &&
          scenario.externalStartEvidence.sourceReference.length > 0,
        `${scenario.id} external start evidence lacks a source reference`,
      );
      assert(
        Date.parse(scenario.externalStartEvidence.startedAt) <= Date.parse(scenario.expected.firstCommitAt),
        `${scenario.id} external start occurs after the first commit`,
      );
    }
    assert(
      checkInHoursByScenario.get(scenario.id) === scenario.expected.knownEffortHours,
      `${scenario.id} check-in hours do not match known effort`,
    );
  }
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
    const comparison = JSON.parse(await runGh([
      'api',
      `repos/${manifest.repository}/compare/pr-case%2F${scenario.id}%2Fbase...${scenario.baseRef.replaceAll('/', '%2F')}`,
    ]));

    const observedState = pullRequest.merged_at ? 'merged' : pullRequest.state;
    const firstCommitAt = normaliseTimestamp(commits[0]?.commit?.author?.date);
    const lastCommitAt = normaliseTimestamp(commits.at(-1)?.commit?.author?.date);
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
    assert(
      comparison.ahead_by === scenario.expected.baseAdvanceCommitCount,
      `${scenario.id} base advanced by ${comparison.ahead_by} commits instead of ${scenario.expected.baseAdvanceCommitCount}`,
    );
    assert(files.length > 0 && files.every(file => typeof file.patch === 'string'), `${scenario.id} lacks diff patches`);

    results.push({
      id: scenario.id,
      prNumber: scenario.prNumber,
      state: observedState,
      mergeMethod: scenario.expected.mergeMethod,
      baseAdvanceCommitCount: comparison.ahead_by,
      sourceCommitCount: commits.length,
      firstCommitAt,
      lastCommitAt,
      activeCalendarDays: calculateActiveCalendarDays(firstCommitAt, lastCommitAt),
      externalStartEvidence: scenario.externalStartEvidence ?? null,
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
  const report = {
    repository: manifest.repository,
    verifiedPullRequests: results.length,
    knownRdHours,
    knownNonRdHours,
    results,
  };
  const serialisedReport = `${JSON.stringify(report, null, 2)}\n`;
  if (outputArgumentIndex >= 0) {
    assert(typeof outputPath === 'string' && outputPath.length > 0, '--output requires a file path');
    const absoluteOutputPath = resolve(repositoryRoot, outputPath);
    await mkdir(dirname(absoluteOutputPath), { recursive: true });
    await writeFile(absoluteOutputPath, serialisedReport, 'utf8');
  }
  process.stdout.write(serialisedReport);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
