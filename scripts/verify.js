// scripts/verify.js — Node-only verification entry point for the regression check.
// Requires sim.js directly (../sim.js), which works with zero build step because of
// that file's dual `module.exports` guard (sim.js:1043-1044). This file never runs in
// a browser and never touches anything DOM-related — that stays presentation.js's job.
// It owns all printing and all filesystem access the regression check needs, because
// sim.js itself performs no I/O of any kind (see CONVENTIONS.md's result-object idiom;
// sim.js never throws on a failed check and never prints).
//
// D-01: this is one of the two entry points the same underlying check logic backs —
// the other is `Sim.runRegressionCheck()`, callable from the browser dev console while
// index.html is open. Both call the identical sim.js function; only the printing and
// filesystem plumbing below is specific to this Node CLI.

const fs = require('fs');
const path = require('path');

const Sim = require('../sim.js');

// Resolve relative to this file, not process.cwd(), so `node scripts/verify.js` and
// `cd scripts && node verify.js` behave identically.
const BASELINE_PATH = path.join(__dirname, 'baseline.json');
const KNOWN_MISMATCH_PATH = path.join(__dirname, 'known-mismatch.json');

// No argv-parsing library: zero-dependency project, no package.json, and a single
// boolean flag doesn't justify one.
const UPDATE_BASELINE = process.argv.includes('--update-baseline');

// The golden-master diff check can never be silenced by an acknowledgement — doing so
// would neuter the entire baseline gate this script exists to enforce. Every other
// check name is a qualitative assertion about the two-clone CompetitiveJungle case and
// may be acknowledged.
const BASELINE_CHECK_NAME = 'snapshot-matches-baseline';

function loadJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Loads scripts/known-mismatch.json (if present) and applies the load-time rules:
// the baseline check may never be acknowledged (rejected by name, before anything
// else runs); an unapproved file is reported and then treated as empty, changing
// nothing about the outcome.
function loadKnownMismatch() {
  const raw = loadJsonIfPresent(KNOWN_MISMATCH_PATH);
  if (!raw) return { acknowledged: [], approved: false, raw: undefined };

  const acknowledged = Array.isArray(raw.acknowledged) ? raw.acknowledged : [];

  if (acknowledged.indexOf(BASELINE_CHECK_NAME) !== -1) {
    console.error(
      `ERROR: scripts/known-mismatch.json acknowledges "${BASELINE_CHECK_NAME}" — the ` +
      'golden-master baseline check may never be acknowledged (acknowledging it would ' +
      'neuter the entire regression gate). Remove it from scripts/known-mismatch.json ' +
      'and re-run.'
    );
    process.exit(1);
  }

  if (raw.approved !== true) {
    console.log(
      'scripts/known-mismatch.json is present but unapproved (approved: ' +
      `${raw.approved}) — ignoring it. An unapproved acknowledgement must change ` +
      'nothing about the outcome.'
    );
    return { acknowledged: [], approved: false, raw };
  }

  return { acknowledged, approved: true, raw };
}

function main() {
  const knownMismatch = loadKnownMismatch();

  const baseline = loadJsonIfPresent(BASELINE_PATH);
  const baselineMissing = !baseline;
  const result = Sim.runRegressionCheck(baseline ? { baseline } : {});

  const lines = [];
  lines.push(`Seed: ${Sim.DEFAULT_SEED}`);

  const unacknowledgedFailures = [];
  const staleAcks = [];

  result.checks.forEach((check) => {
    const isAcknowledged = knownMismatch.acknowledged.indexOf(check.name) !== -1;
    if (check.pass) {
      lines.push(`PASS ${check.name} :: ${check.detail}`);
      if (isAcknowledged) staleAcks.push(check.name);
    } else if (isAcknowledged) {
      // Never relabeled PASS — the one thing this mechanism must not do.
      lines.push(`KNOWN-MISMATCH ${check.name} :: ${check.detail}`);
    } else {
      lines.push(`FAIL ${check.name} :: ${check.detail}`);
      unacknowledgedFailures.push(check.name);
    }
  });

  staleAcks.forEach((name) => {
    lines.push(`STALE-ACK ${name} — this check now passes; remove it from scripts/known-mismatch.json`);
  });

  const acknowledgedFailureCount = result.checks.filter(
    (c) => !c.pass && knownMismatch.acknowledged.indexOf(c.name) !== -1
  ).length;

  if (knownMismatch.approved && knownMismatch.acknowledged.length > 0) {
    const approvedAt = (knownMismatch.raw && knownMismatch.raw.approvedAt) || '(no date recorded)';
    lines.push(
      `Acknowledged mismatch in force: scripts/known-mismatch.json (approved ${approvedAt}) ` +
      '— this phase accepted this divergence knowingly.'
    );
  }

  if (result.diffs && result.diffs.length > 0) {
    lines.push('Baseline diff:');
    lines.push(Sim.formatDiff(result.diffs));
  }

  if (baselineMissing) {
    lines.push(
      'scripts/baseline.json was not found. Run `node scripts/verify.js --update-baseline` ' +
      'to capture the first one.'
    );
  }

  // Plain-run exit code (D-08/D-09.3): all three must hold — every failing check
  // acknowledged, the baseline present, and the diff empty. Acknowledgement never
  // excuses a missing baseline or a non-empty diff (a non-empty diff always shows up
  // as an unacknowledged failure of the never-acknowledgeable baseline check anyway).
  const diffEmpty = !result.diffs || result.diffs.length === 0;
  const plainRunPasses = unacknowledgedFailures.length === 0 && !baselineMissing && diffEmpty;

  lines.push(
    plainRunPasses
      ? (acknowledgedFailureCount > 0
        ? `OVERALL: PASS (${acknowledgedFailureCount} acknowledged mismatch(es))`
        : 'OVERALL: PASS')
      : 'OVERALL: FAIL'
  );

  lines.forEach((line) => console.log(line));

  if (!UPDATE_BASELINE) {
    process.exit(plainRunPasses ? 0 : 1);
  }

  // --update-baseline (D-09.2, the golden-master re-baseline workflow): refusal is
  // scoped to the qualitative checks only, never to `snapshot-matches-baseline`. A
  // non-empty baseline diff is exactly what this flag exists to let a human review and
  // bless — scoping refusal to include the baseline check itself would make the
  // re-baseline workflow permanently unreachable the moment behavior legitimately
  // changes, since that check can never be acknowledged either. Everything above has
  // already been printed, including the full diff, before this decision is made.
  const blockingFailures = result.checks.filter(
    (check) => check.name !== BASELINE_CHECK_NAME
      && !check.pass
      && knownMismatch.acknowledged.indexOf(check.name) === -1
  );

  if (blockingFailures.length > 0) {
    const names = blockingFailures.map((check) => check.name).join(', ');
    console.log(
      `REFUSED: will not capture a baseline while ${names} are failing. The only ` +
      'sanctioned path is an approved entry in scripts/known-mismatch.json, recorded ' +
      'via the Plan 02 Task 4 checkpoint (or its equivalent for a new divergence).'
    );
    process.exit(1);
  }

  const acceptedDiffCount = result.diffs ? result.diffs.length : 0;
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(result.snapshots, null, 2) + '\n');
  console.log(
    `Captured scripts/baseline.json (${acceptedDiffCount} diff entr` +
    `${acceptedDiffCount === 1 ? 'y' : 'ies'} accepted).`
  );
  process.exit(0);
}

main();
