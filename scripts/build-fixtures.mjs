#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDirectory = resolve(repositoryRoot, 'fixture');
const expectedRepositoryName = 'github-hours-effort-text-fixtures';
const syntheticAuthor = {
  name: 'Fixture Developer',
  email: 'fixture-developer@example.test',
};
const force = process.argv.includes('--force');
let commitSequence = 0;

async function runGit(argumentsList, options = {}) {
  const environment = {
    ...process.env,
    ...options.environment,
  };
  const result = await execFileAsync('git', argumentsList, {
    cwd: repositoryRoot,
    env: environment,
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout.trim();
}

async function runGitAllowFailure(argumentsList, options = {}) {
  try {
    return {
      succeeded: true,
      output: await runGit(argumentsList, options),
    };
  } catch (error) {
    return {
      succeeded: false,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim(),
    };
  }
}

function commitEnvironment() {
  const timestamp = new Date(Date.UTC(2026, 0, 5, 9 + commitSequence, 0, 0)).toISOString();
  commitSequence += 1;
  return {
    GIT_AUTHOR_NAME: syntheticAuthor.name,
    GIT_AUTHOR_EMAIL: syntheticAuthor.email,
    GIT_AUTHOR_DATE: timestamp,
    GIT_COMMITTER_NAME: syntheticAuthor.name,
    GIT_COMMITTER_EMAIL: syntheticAuthor.email,
    GIT_COMMITTER_DATE: timestamp,
  };
}

async function commit(message) {
  await runGit(['add', '--all']);
  await runGit(['commit', '--no-gpg-sign', '-m', message], {
    environment: commitEnvironment(),
  });
  return runGit(['rev-parse', 'HEAD']);
}

async function tag(name) {
  await runGit(['tag', name]);
}

async function writeFixture(relativePath, content) {
  const filePath = resolve(fixtureDirectory, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

async function clearFixtureDirectory() {
  await rm(fixtureDirectory, { recursive: true, force: true });
}

async function startBranch(name, startPoint = 'main') {
  await runGit(['switch', '--force-create', name, startPoint]);
  await clearFixtureDirectory();
}

async function deleteExistingFixtureRefs() {
  const branches = (await runGit(['for-each-ref', '--format=%(refname:short)', 'refs/heads/fixture/']))
    .split('\n')
    .filter(Boolean);
  const tags = (await runGit(['for-each-ref', '--format=%(refname:short)', 'refs/tags/case/']))
    .split('\n')
    .filter(Boolean);
  if (branches.length === 0 && tags.length === 0) return;
  if (!force) {
    throw new Error('Fixture refs already exist. Use --force only for an intentional fixture rebuild.');
  }
  await runGit(['switch', 'main']);
  for (const branch of branches) await runGit(['branch', '--delete', '--force', branch]);
  if (tags.length > 0) await runGit(['tag', '--delete', ...tags]);
}

async function buildPureFileMove() {
  await startBranch('fixture/pure-file-move');
  await writeFixture('src/original.ts', 'export function stable(value: number): number {\n  return value + 1;\n}\n');
  await commit('fixture: add pure file move baseline');
  await tag('case/pure-file-move/base');
  await mkdir(resolve(fixtureDirectory, 'src/moved'), { recursive: true });
  await rename(
    resolve(fixtureDirectory, 'src/original.ts'),
    resolve(fixtureDirectory, 'src/moved/original.ts'),
  );
  await commit('fixture: move file without changing content');
  await tag('case/pure-file-move/result');
}

async function buildPureFunctionMove() {
  await startBranch('fixture/pure-function-move');
  const movedFunction = 'export function moved(value: number): number {\n  return value + 1;\n}\n';
  await writeFixture('src/old.ts', `${movedFunction}\nexport const oldMarker = 1;\n`);
  await writeFixture('src/new.ts', 'export const newMarker = 1;\n');
  await commit('fixture: add pure function move baseline');
  await tag('case/pure-function-move/base');
  await writeFixture('src/old.ts', 'export const oldMarker = 1;\n');
  await writeFixture('src/new.ts', `export const newMarker = 1;\n\n${movedFunction}`);
  await commit('fixture: move function without changing content');
  await tag('case/pure-function-move/result');
}

async function buildMovePlusEdit() {
  await startBranch('fixture/move-plus-edit');
  await writeFixture(
    'src/old.ts',
    'export function movedAndEdited(value: number): number {\n  return value + 1;\n}\n\nexport const oldMarker = 1;\n',
  );
  await writeFixture('src/new.ts', 'export const newMarker = 1;\n');
  await commit('fixture: add move plus edit baseline');
  await tag('case/move-plus-edit/base');
  await writeFixture('src/old.ts', 'export const oldMarker = 1;\n');
  await writeFixture(
    'src/new.ts',
    'export const newMarker = 1;\n\nexport function movedAndEdited(value: number): number {\n  return value * 2;\n}\n',
  );
  await commit('fixture: move and edit function');
  await tag('case/move-plus-edit/result');
}

async function buildRootCommit() {
  await runGit(['switch', '--orphan', 'fixture/root-commit']);
  const trackedFiles = (await runGit(['ls-files'])).split('\n').filter(Boolean);
  for (const trackedFile of trackedFiles) {
    await rm(resolve(repositoryRoot, trackedFile), { recursive: true, force: true });
  }
  await clearFixtureDirectory();
  await writeFixture('src/root.ts', 'export function rootValue(): number {\n  return 1;\n}\n');
  await commit('fixture: create source in root commit');
  await tag('case/root-commit/result');
}

async function buildMergeResolution() {
  await startBranch('fixture/merge-resolution-base');
  await writeFixture(
    'src/merge.ts',
    'export const alpha = 1;\n\n\n\n\n\n\nexport const beta = 1;\nexport const resolution = "automatic";\n',
  );
  await commit('fixture: add merge resolution baseline');
  await tag('case/merge-resolution/base');

  await runGit(['switch', '--force-create', 'fixture/merge-resolution-left']);
  await writeFixture(
    'src/merge.ts',
    'export const alpha = 2;\n\n\n\n\n\n\nexport const beta = 1;\nexport const resolution = "automatic";\n',
  );
  await commit('fixture: change left side');
  await tag('case/merge-resolution/left-parent');

  await runGit(['switch', '--force-create', 'fixture/merge-resolution-right', 'case/merge-resolution/base']);
  await writeFixture(
    'src/merge.ts',
    'export const alpha = 1;\n\n\n\n\n\n\nexport const beta = 2;\nexport const resolution = "automatic";\n',
  );
  await commit('fixture: change right side');
  await tag('case/merge-resolution/right-parent');

  await runGit(['switch', 'fixture/merge-resolution-left']);
  await runGit(['merge', '--no-ff', '--no-commit', 'fixture/merge-resolution-right']);
  await writeFixture(
    'src/merge.ts',
    'export const alpha = 2;\n\n\n\n\n\n\nexport const beta = 2;\nexport const resolution = "manual";\n',
  );
  await commit('fixture: add manual merge resolution edit');
  await tag('case/merge-resolution/result');
  await runGit(['branch', '--force', 'fixture/merge-resolution', 'HEAD']);
}

async function buildUnavailableMergeBaseline() {
  await startBranch('fixture/unavailable-merge-baseline-base');
  await writeFixture('src/conflict.ts', 'export const selected = "base";\n');
  await commit('fixture: add conflict merge baseline');
  await tag('case/unavailable-merge-baseline/base');

  await runGit(['switch', '--force-create', 'fixture/unavailable-merge-baseline-left']);
  await writeFixture('src/conflict.ts', 'export const selected = "left";\n');
  await commit('fixture: create left conflict');
  await tag('case/unavailable-merge-baseline/left-parent');

  await runGit([
    'switch',
    '--force-create',
    'fixture/unavailable-merge-baseline-right',
    'case/unavailable-merge-baseline/base',
  ]);
  await writeFixture('src/conflict.ts', 'export const selected = "right";\n');
  await commit('fixture: create right conflict');
  await tag('case/unavailable-merge-baseline/right-parent');

  await runGit(['switch', 'fixture/unavailable-merge-baseline-left']);
  const merge = await runGitAllowFailure([
    'merge',
    '--no-ff',
    '--no-commit',
    'fixture/unavailable-merge-baseline-right',
  ]);
  if (merge.succeeded || !merge.output.includes('CONFLICT')) {
    throw new Error('Expected the unavailable merge baseline fixture to conflict');
  }
  await writeFixture('src/conflict.ts', 'export const selected = "manual-resolution";\n');
  await commit('fixture: resolve conflicting merge manually');
  await tag('case/unavailable-merge-baseline/result');
  await runGit(['branch', '--force', 'fixture/unavailable-merge-baseline', 'HEAD']);
}

async function buildRewrittenEquivalent() {
  await startBranch('fixture/rewritten-equivalent-base');
  await writeFixture('src/rewrite.ts', 'export const rewritten = 0;\n');
  await commit('fixture: add rewritten equivalent baseline');
  await tag('case/rewritten-equivalent/base');

  await runGit(['switch', '--force-create', 'fixture/rewritten-equivalent-original']);
  await writeFixture('src/rewrite.ts', 'export const rewritten = 1;\n');
  await commit('fixture: create original logical change');
  await tag('case/rewritten-equivalent/original');

  await runGit([
    'switch',
    '--force-create',
    'fixture/rewritten-equivalent',
    'case/rewritten-equivalent/base',
  ]);
  await writeFixture('src/rewrite.ts', 'export const rewritten = 1;\n');
  await commit('fixture: create confirmed rewritten representation');
  await tag('case/rewritten-equivalent/selected');
}

async function buildSquashPreserved() {
  await startBranch('fixture/squash-preserved-base');
  await writeFixture('src/squash.ts', 'export const stage = 0;\n');
  await commit('fixture: add squash baseline');
  await tag('case/squash-preserved/base');

  await runGit(['switch', '--force-create', 'fixture/squash-preserved-source']);
  await writeFixture('src/squash.ts', 'export const stage = 1;\n');
  await commit('fixture: create first source commit');
  await tag('case/squash-preserved/source-1');
  await writeFixture('src/squash.ts', 'export const stage = 2;\n');
  await commit('fixture: create second source commit');
  await tag('case/squash-preserved/source-tip');

  await runGit(['switch', '--force-create', 'fixture/squash-preserved', 'case/squash-preserved/base']);
  await writeFixture('src/squash.ts', 'export const stage = 2;\n');
  await commit('fixture: create squash representation');
  await tag('case/squash-preserved/squash-result');
}

async function buildRebaseEquivalent() {
  await startBranch('fixture/rebase-equivalent-base');
  await writeFixture('src/rebase.ts', 'export const feature = 0;\n');
  await writeFixture('src/upstream.ts', 'export const upstream = 0;\n');
  await commit('fixture: add rebase baseline');
  await tag('case/rebase-equivalent/base');

  await runGit(['switch', '--force-create', 'fixture/rebase-equivalent-original']);
  await writeFixture('src/rebase.ts', 'export const feature = 1;\n');
  await commit('fixture: create original topic commit');
  await tag('case/rebase-equivalent/original');

  await runGit(['switch', '--force-create', 'fixture/rebase-equivalent-upstream', 'case/rebase-equivalent/base']);
  await writeFixture('src/upstream.ts', 'export const upstream = 1;\n');
  await commit('fixture: create upstream commit');
  await tag('case/rebase-equivalent/upstream');

  await runGit(['switch', '--force-create', 'fixture/rebase-equivalent', 'case/rebase-equivalent/original']);
  await runGit(
    ['rebase', '--onto', 'case/rebase-equivalent/upstream', 'case/rebase-equivalent/base'],
    { environment: commitEnvironment() },
  );
  await tag('case/rebase-equivalent/rebased');
}

async function buildAmbiguousUnitMatch() {
  await startBranch('fixture/ambiguous-unit-match');
  await writeFixture(
    'src/ambiguous.ts',
    'export function oldOne(value: number): number { return value + 1; }\nexport function oldTwo(value: number): number { return value + 1; }\n',
  );
  await commit('fixture: add ambiguous match baseline');
  await tag('case/ambiguous-unit-match/base');
  await writeFixture(
    'src/ambiguous.ts',
    'export function newOne(value: number): number { return value + 1; }\nexport function newTwo(value: number): number { return value + 1; }\n',
  );
  await commit('fixture: create ambiguous function matches');
  await tag('case/ambiguous-unit-match/result');
}

async function buildUnsupportedIncludedSource() {
  await startBranch('fixture/unsupported-included-source');
  await writeFixture('src/invalid.ts', 'export function valid(): number {\n  return 1;\n}\n');
  await commit('fixture: add parseable source baseline');
  await tag('case/unsupported-included-source/base');
  await writeFixture('src/invalid.ts', 'export function invalid(: number {\n  return 2;\n}\n');
  await commit('fixture: introduce invalid included source');
  await tag('case/unsupported-included-source/result');
}

async function buildNoLexicalEdit() {
  await startBranch('fixture/no-lexical-edit');
  await writeFixture('src/comment.ts', '// Before comment\nexport const unchanged = 1;\n');
  await commit('fixture: add no lexical edit baseline');
  await tag('case/no-lexical-edit/base');
  await writeFixture('src/comment.ts', '// After comment with different spacing\n\nexport const unchanged = 1;\n');
  await commit('fixture: change comments and whitespace only');
  await tag('case/no-lexical-edit/result');
}

async function buildSmallSourceChange() {
  await startBranch('fixture/small-source-change');
  await writeFixture('src/small.ts', 'export const small = 1;\n');
  await commit('fixture: add small source change baseline');
  await tag('case/small-source-change/base');
  await writeFixture('src/small.ts', 'export const small = 2;\n');
  await commit('fixture: make one line lexical change');
  await tag('case/small-source-change/result');
}

async function buildIncompleteDeveloperWeek() {
  await startBranch('fixture/incomplete-developer-week');
  await writeFixture('src/week.ts', 'export const weekly = 1;\n');
  await commit('fixture: add incomplete week baseline');
  await tag('case/incomplete-developer-week/base');
  await writeFixture('src/week.ts', 'export const weekly = 2;\n');
  await commit('fixture: make change in incomplete week');
  await tag('case/incomplete-developer-week/result');
}

async function main() {
  const topLevel = await runGit(['rev-parse', '--show-toplevel']);
  if (resolve(topLevel) !== repositoryRoot || !repositoryRoot.endsWith(expectedRepositoryName)) {
    throw new Error(`Refusing to build fixtures outside ${expectedRepositoryName}`);
  }
  const status = await runGit(['status', '--porcelain']);
  if (status) throw new Error('Fixture repository must be clean before building histories');
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'scenarios.json'), 'utf8'));
  if (manifest.schemaVersion !== 'github-hours-effort-fixtures-v1') {
    throw new Error('Unsupported scenarios.json schema version');
  }
  await deleteExistingFixtureRefs();
  await buildPureFileMove();
  await buildPureFunctionMove();
  await buildMovePlusEdit();
  await buildRootCommit();
  await buildMergeResolution();
  await buildUnavailableMergeBaseline();
  await buildRewrittenEquivalent();
  await buildSquashPreserved();
  await buildRebaseEquivalent();
  await buildAmbiguousUnitMatch();
  await buildUnsupportedIncludedSource();
  await buildNoLexicalEdit();
  await buildSmallSourceChange();
  await buildIncompleteDeveloperWeek();
  await runGit(['switch', 'main']);
  const finalStatus = await runGit(['status', '--porcelain']);
  if (finalStatus) throw new Error(`Fixture generation left main dirty:\n${finalStatus}`);
  process.stdout.write(`Generated ${manifest.scenarios.length} fixture scenarios.\n`);
}

main().catch(async error => {
  try {
    await runGit(['merge', '--abort']);
  } catch {
    // No merge was in progress.
  }
  try {
    await runGit(['rebase', '--abort']);
  } catch {
    // No rebase was in progress.
  }
  try {
    await runGit(['switch', 'main']);
  } catch {
    // Preserve the original error if recovery is unavailable.
  }
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
