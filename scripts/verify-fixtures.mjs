#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function runGit(argumentsList) {
  const result = await execFileAsync('git', argumentsList, {
    cwd: repositoryRoot,
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout.trim();
}

async function resolveRef(reference) {
  return runGit(['rev-parse', '--verify', `${reference}^{commit}`]);
}

async function getParentCount(reference) {
  const line = await runGit(['rev-list', '--parents', '--max-count=1', reference]);
  return Math.max(line.split(/\s+/).length - 1, 0);
}

async function getTree(reference) {
  return runGit(['rev-parse', `${reference}^{tree}`]);
}

async function getParent(reference) {
  return runGit(['rev-parse', `${reference}^`]);
}

async function getPatch(reference) {
  return runGit(['show', '--format=', '--no-ext-diff', '--unified=3', reference]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'scenarios.json'), 'utf8'));
  assert(manifest.schemaVersion === 'github-hours-effort-fixtures-v1', 'Unexpected manifest schema');
  assert(manifest.scenarios.length === 14, 'Expected 14 fixture scenarios');
  const ids = new Set();
  for (const scenario of manifest.scenarios) {
    assert(!ids.has(scenario.id), `Duplicate scenario id: ${scenario.id}`);
    ids.add(scenario.id);
    for (const reference of Object.values(scenario.refs)) await resolveRef(reference);
    if (scenario.expected.parentCount !== undefined) {
      const resultReference = scenario.refs.result ?? scenario.refs.selected;
      const parentCount = await getParentCount(resultReference);
      assert(
        parentCount === scenario.expected.parentCount,
        `${scenario.id} expected ${scenario.expected.parentCount} parents but found ${parentCount}`,
      );
    }
  }

  const rewritten = manifest.scenarios.find(scenario => scenario.id === 'rewritten-equivalent');
  assert(
    await getTree(rewritten.refs.original) === await getTree(rewritten.refs.selected),
    'Rewritten equivalent trees differ',
  );
  assert(
    await resolveRef(rewritten.refs.original) !== await resolveRef(rewritten.refs.selected),
    'Rewritten equivalent commits must have different SHAs',
  );

  const squash = manifest.scenarios.find(scenario => scenario.id === 'squash-preserved');
  assert(
    await getTree(squash.refs.sourceTip) === await getTree(squash.refs.selected),
    'Squash source and selected trees differ',
  );
  assert(
    await getParent(squash.refs.sourceTip) === await resolveRef(squash.refs.sourceFirst),
    'Squash source history does not preserve both source commits',
  );

  const rebase = manifest.scenarios.find(scenario => scenario.id === 'rebase-equivalent');
  assert(
    await getPatch(rebase.refs.original) === await getPatch(rebase.refs.selected),
    'Rebased commit patch differs from the original patch',
  );
  assert(
    await getParent(rebase.refs.selected) === await resolveRef(rebase.refs.upstream),
    'Rebased commit does not use the expected upstream parent',
  );

  const merge = manifest.scenarios.find(scenario => scenario.id === 'merge-resolution');
  assert(await getParentCount(merge.refs.result) === 2, 'Merge resolution fixture is not a merge commit');

  const unavailableMerge = manifest.scenarios.find(
    scenario => scenario.id === 'unavailable-merge-baseline',
  );
  assert(
    await getParentCount(unavailableMerge.refs.result) === 2,
    'Unavailable merge baseline fixture is not a merge commit',
  );

  const root = manifest.scenarios.find(scenario => scenario.id === 'root-commit');
  assert(await getParentCount(root.refs.result) === 0, 'Root fixture unexpectedly has a parent');

  const fixtureBranchRefs = (await runGit([
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/heads/fixture/',
    'refs/remotes/origin/fixture/',
  ])).split('\n').filter(Boolean);
  const fixtureBranches = new Set(
    fixtureBranchRefs.map(reference => reference.replace(/^origin\//, '')),
  );
  const caseTags = (await runGit([
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/tags/case/',
  ])).split('\n').filter(Boolean);
  assert(fixtureBranches.size >= 14, 'Expected at least one fixture branch per scenario');
  assert(caseTags.length >= 31, 'Expected the complete set of case tags');

  process.stdout.write(
    `Verified ${manifest.scenarios.length} scenarios, ${fixtureBranches.size} branches, and ${caseTags.length} tags.\n`,
  );
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
