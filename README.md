# GitHub Hours Effort Test Fixtures

This repository contains small, synthetic Git histories for testing
commit-level effort analysis. It is fixture data, not an implementation of an
effort-scoring algorithm and not a sample application.

The fixtures exercise repository-history cases that are difficult to represent
with mocked commit objects, including moves, merge resolution, squash, rebase,
rewritten equivalents, ambiguous function matching, unsupported source, and
incomplete developer-week context.

## Repository contract

- `main` contains documentation, the scenario manifest, and fixture tooling.
- `fixture/*` branches contain controlled Git histories.
- `case/*` tags are the stable inputs consumed by external test runners.
- `scenarios.json` records the expected treatment of each case.
- No production or proprietary source code belongs in this repository.

External test runners should resolve tags rather than hard-coded commit SHAs.
The tags preserve source commits that would otherwise become unreachable after
squash, rebase, or rewrite operations.

## Included scenarios

| Scenario | Expected treatment |
| --- | --- |
| Pure file move | Zero effort when content and metrics are unchanged |
| Pure function move | Zero effort when canonical function content is unchanged |
| Move plus edit | Preserve continuity and score only the edit |
| Root commit | Compare with an empty tree and flag import risk |
| Merge resolution | Score only edits added during merge resolution |
| Unavailable merge baseline | Report for review without inventing a score |
| Confirmed rewritten equivalent | Select one representation |
| Squash with preserved source commits | Do not score both representations |
| Rebased equivalent | Select one logical change |
| Ambiguous unit match | Report ambiguity instead of choosing a convenient match |
| Unsupported included source | Report unsupported analysis instead of silent zero |
| No lexical edit | Produce zero lexical signal |
| Small source change | Score normally and add a review flag |
| Incomplete developer-week | Keep weekly normalisation provisional |

## Commands

Generate the fixture branches and tags once in a clean clone:

```bash
npm run build:fixtures
```

Verify the manifest and Git topology:

```bash
npm test
```

The builder refuses to replace existing fixture refs unless `--force` is
provided. Force mode is intended only for deliberate fixture-version changes.

## Using the fixtures

An effort-analysis project should:

1. Clone this repository at a pinned release or commit.
2. Read `scenarios.json`.
3. Resolve each scenario's tags locally.
4. Acquire the real commit, parent, diff, and source snapshots.
5. Run the production evidence and scoring pipeline.
6. Assert the expected status, review flags, score relation, and logical-change
   selection count.

Exact numeric assertions should be used only where the scoring specification
defines the expected value independently. History-selection cases primarily
assert zero/non-zero treatment, evidence status, and no double counting.

## Safety

All identities, dates, and source are synthetic. The fixture builder only
rewrites refs whose names begin with `fixture/` or `case/` and only when run in
this repository with the explicit `--force` option.
