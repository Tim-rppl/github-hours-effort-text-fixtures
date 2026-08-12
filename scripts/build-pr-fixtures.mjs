#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(repositoryRoot, 'pr-fixture');
const expectedRepositoryName = 'github-hours-effort-text-fixtures';
const force = process.argv.includes('--force');

const authors = {
  'rd-single-week-open': ['Alex Researcher', 'alex.researcher@example.test'],
  'rd-multi-week-merge': ['Casey Engineer', 'casey.engineer@example.test'],
  'rd-multi-week-squash': ['Morgan Developer', 'morgan.developer@example.test'],
  'maintenance-non-rd-rebase': ['Taylor Maintainer', 'taylor.maintainer@example.test'],
};

const sourceSnapshots = {
  'rd-single-week-open': [
    `export interface ActivitySignal {
  uncertainty: number;
  novelty: number;
}
`,
    `export interface ActivitySignal {
  uncertainty: number;
  novelty: number;
}

export function classifyActivity(signal: ActivitySignal): "research" | "routine" | "review" {
  const confidence = signal.uncertainty * 0.6 + signal.novelty * 0.4;
  if (confidence >= 0.7) return "research";
  if (confidence <= 0.2) return "routine";
  return "review";
}
`,
    `export interface ActivitySignal {
  uncertainty: number;
  novelty: number;
}

export function classifyActivity(signal: ActivitySignal): "research" | "routine" | "review" {
  const boundedUncertainty = Math.min(1, Math.max(0, signal.uncertainty));
  const boundedNovelty = Math.min(1, Math.max(0, signal.novelty));
  const confidence = boundedUncertainty * 0.6 + boundedNovelty * 0.4;
  if (confidence >= 0.7) return "research";
  if (confidence <= 0.2) return "routine";
  return "review";
}
`,
  ],
  'rd-multi-week-merge': [
    `export interface EffortNode {
  id: string;
  directEffort: number;
  dependencies: string[];
}
`,
    `export interface EffortNode {
  id: string;
  directEffort: number;
  dependencies: string[];
}

export function propagateEffort(node: EffortNode, dependencyEffort: number[]): number {
  return node.directEffort + dependencyEffort.reduce((total, effort) => total + effort * 0.25, 0);
}
`,
    `export interface EffortNode {
  id: string;
  directEffort: number;
  dependencies: string[];
}

export function propagateEffort(node: EffortNode, dependencyEffort: number[], isCyclic: boolean): number {
  const propagated = dependencyEffort.reduce((total, effort) => total + effort * 0.25, 0);
  return node.directEffort + (isCyclic ? Math.min(propagated, node.directEffort) : propagated);
}
`,
    `export interface EffortNode {
  id: string;
  directEffort: number;
  dependencies: string[];
}

export function propagateEffort(
  node: EffortNode,
  dependencyEffort: number[],
  strategy: "bounded" | "decaying",
): number {
  const factor = strategy === "bounded" ? 0.25 : 0.15;
  const propagated = dependencyEffort.reduce((total, effort) => total + effort * factor, 0);
  return node.directEffort + Math.min(propagated, node.directEffort);
}
`,
    `export interface EffortNode {
  id: string;
  directEffort: number;
  dependencies: string[];
}

export function propagateEffort(
  node: EffortNode,
  dependencyEffort: number[],
  strategy: "bounded" | "decaying",
): number {
  if (node.directEffort < 0) throw new Error("Direct effort cannot be negative");
  const factor = strategy === "bounded" ? 0.25 : 0.15;
  const propagated = dependencyEffort.reduce((total, effort) => total + Math.max(0, effort) * factor, 0);
  return node.directEffort + Math.min(propagated, node.directEffort);
}
`,
  ],
  'rd-multi-week-squash': [
    `export function selectThreshold(signalDensity: number): number {
  return signalDensity >= 0.5 ? 0.7 : 0.5;
}
`,
    `export function selectThreshold(signalDensity: number, sampleSize: number): number {
  if (sampleSize < 10) return 0.6;
  return signalDensity >= 0.5 ? 0.7 : 0.5;
}
`,
    `export function selectThreshold(signalDensity: number, sampleSize: number, variance: number): number {
  if (sampleSize < 10 || variance > 0.3) return 0.6;
  if (signalDensity >= 0.75) return 0.8;
  return signalDensity >= 0.5 ? 0.7 : 0.5;
}
`,
    `export function selectThreshold(signalDensity: number, sampleSize: number, variance: number): number {
  const density = Math.min(1, Math.max(0, signalDensity));
  if (sampleSize < 10 || variance > 0.3) return 0.6;
  if (density >= 0.75) return 0.8;
  return density >= 0.5 ? 0.7 : 0.5;
}
`,
  ],
  'maintenance-non-rd-rebase': [
    `export function formatLabel(value: string): string {
  return value.trim().replace(/\\s+/g, " ");
}
`,
    `export function formatLabel(value: string | null): string {
  if (value === null) return "";
  return value.trim().replace(/\\s+/g, " ");
}
`,
    `export function formatLabel(value: string | null): string {
  if (value === null || value.trim() === "") return "";
  return value.trim().replace(/\\s+/g, " ");
}
`,
  ],
};

async function runGit(argumentsList, environment = {}) {
  const result = await execFileAsync('git', argumentsList, {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment },
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout.trim();
}

function commitEnvironment(author, committedAt) {
  return {
    GIT_AUTHOR_NAME: author[0],
    GIT_AUTHOR_EMAIL: author[1],
    GIT_AUTHOR_DATE: committedAt,
    GIT_COMMITTER_NAME: author[0],
    GIT_COMMITTER_EMAIL: author[1],
    GIT_COMMITTER_DATE: committedAt,
  };
}

async function commit(message, author, committedAt) {
  await runGit(['add', '--all']);
  await runGit(['commit', '--no-gpg-sign', '-m', message], commitEnvironment(author, committedAt));
}

async function writeSource(scenarioId, content) {
  const filePath = resolve(sourceRoot, scenarioId, 'subject.ts');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

async function deleteRefs(manifest) {
  const localRefs = [];
  for (const scenario of manifest.scenarios) {
    localRefs.push(scenario.baseRef, scenario.headRef);
  }
  const existingBranches = [];
  for (const reference of localRefs) {
    try {
      await runGit(['show-ref', '--verify', '--quiet', `refs/heads/${reference}`]);
      existingBranches.push(reference);
    } catch {
      // The branch has not been generated yet.
    }
  }
  const existingTags = (await runGit([
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/tags/pr-case/',
  ])).split('\n').filter(Boolean);
  if (existingBranches.length === 0 && existingTags.length === 0) return;
  if (!force) throw new Error('PR fixture refs already exist. Use --force for an intentional rebuild.');
  await runGit(['switch', 'main']);
  for (const branch of existingBranches) await runGit(['branch', '--delete', '--force', branch]);
  if (existingTags.length > 0) await runGit(['tag', '--delete', ...existingTags]);
}

async function buildScenario(scenario) {
  const author = authors[scenario.id];
  const snapshots = sourceSnapshots[scenario.id];
  if (!author || !snapshots || snapshots.length !== scenario.commits.length) {
    throw new Error(`Incomplete source definition for ${scenario.id}`);
  }

  await runGit(['switch', '--force-create', scenario.baseRef, 'main']);
  await rm(sourceRoot, { recursive: true, force: true });
  await writeSource(scenario.id, 'export const fixtureBaseline = true;\n');
  const firstCommitTime = new Date(scenario.commits[0].committedAt);
  firstCommitTime.setUTCDate(firstCommitTime.getUTCDate() - 1);
  await commit(`fixture: add ${scenario.id} baseline`, author, firstCommitTime.toISOString());
  await runGit(['tag', `pr-case/${scenario.id}/base`]);

  await runGit(['switch', '--force-create', scenario.headRef]);
  for (let index = 0; index < scenario.commits.length; index += 1) {
    const commitDefinition = scenario.commits[index];
    await writeSource(scenario.id, snapshots[index]);
    await commit(commitDefinition.message, author, commitDefinition.committedAt);
    await runGit(['tag', commitDefinition.tag]);
  }
}

async function main() {
  const topLevel = await runGit(['rev-parse', '--show-toplevel']);
  if (resolve(topLevel) !== repositoryRoot || !repositoryRoot.endsWith(expectedRepositoryName)) {
    throw new Error(`Refusing to build PR fixtures outside ${expectedRepositoryName}`);
  }
  if (await runGit(['status', '--porcelain'])) {
    throw new Error('Fixture repository must be clean before building PR histories');
  }
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'pr-scenarios.json'), 'utf8'));
  if (manifest.schemaVersion !== 'github-hours-effort-pr-fixtures-v1') {
    throw new Error('Unsupported pr-scenarios.json schema version');
  }
  await deleteRefs(manifest);
  for (const scenario of manifest.scenarios) await buildScenario(scenario);
  await runGit(['switch', 'main']);
  if (await runGit(['status', '--porcelain'])) {
    throw new Error('PR fixture generation left main dirty');
  }
  process.stdout.write(`Generated ${manifest.scenarios.length} pull-request fixture histories.\n`);
}

main().catch(async error => {
  try {
    await runGit(['switch', 'main']);
  } catch {
    // Preserve the original error if recovery is unavailable.
  }
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
