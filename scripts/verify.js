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
// filesystem plumbing below is specific to this Node CLI. Plan 02-01 adds the same
// pattern for `Sim.runOrderingCheck()` (ORDER-01/ORDER-02).

const fs = require('fs');
const path = require('path');

const Sim = require('../sim.js');

// Resolve relative to this file, not process.cwd(), so `node scripts/verify.js` and
// `cd scripts && node verify.js` behave identically.
const BASELINE_PATH = path.join(__dirname, 'baseline.json');
const KNOWN_MISMATCH_PATH = path.join(__dirname, 'known-mismatch.json');
const ORDER_BASELINE_PATH = path.join(__dirname, 'order-baseline.json');
const ORDER_PREFIX_PATH = path.join(__dirname, 'order-prefix.json');

// No argv-parsing library: zero-dependency project, no package.json, and a couple of
// boolean flags don't justify one.
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const CAPTURE_PREFIX_ORDER_INDEX = process.argv.indexOf('--capture-prefix-order');
const CAPTURE_PREFIX_ORDER = CAPTURE_PREFIX_ORDER_INDEX !== -1;

// Golden-master diff checks can never be silenced by an acknowledgement — doing so
// would neuter the entire baseline gate this script exists to enforce. Every other
// check name is a qualitative assertion and may be acknowledged. Plan 02-01 adds
// order-matches-baseline (ORDER-02) to this set alongside Phase 1's
// snapshot-matches-baseline — both are rejected by name at load time and both are
// excluded from the --update-baseline refusal gate for the same reason: including a
// never-acknowledgeable baseline-diff check in the refusal set would make the re-bless
// workflow permanently unreachable the moment behavior legitimately changes.
const NON_ACKNOWLEDGEABLE_CHECK_NAMES = new Set(['snapshot-matches-baseline', 'order-matches-baseline']);

function loadJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Loads scripts/known-mismatch.json (if present) and applies the load-time rules: no
// non-acknowledgeable check name may be acknowledged (rejected by name, before
// anything else runs); an unapproved file is reported and then treated as empty,
// changing nothing about the outcome.
function loadKnownMismatch() {
  const raw = loadJsonIfPresent(KNOWN_MISMATCH_PATH);
  if (!raw) return { acknowledged: [], approved: false, raw: undefined };

  const acknowledged = Array.isArray(raw.acknowledged) ? raw.acknowledged : [];

  const badNames = acknowledged.filter((name) => NON_ACKNOWLEDGEABLE_CHECK_NAMES.has(name));
  if (badNames.length > 0) {
    console.error(
      `ERROR: scripts/known-mismatch.json acknowledges "${badNames.join(', ')}" — a ` +
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

// Prints one PASS/FAIL/KNOWN-MISMATCH line per check (identical formatting and
// acknowledgement rules for every caller), followed by any STALE-ACK lines for that
// same batch of checks. Appends any newly-failing, unacknowledged check names onto the
// shared `unacknowledgedFailures` accumulator so both the regression checks and the
// ordering checks gate the same exit code through one code path.
function printCheckResults(checks, knownMismatch, lines, unacknowledgedFailures) {
  const staleAcks = [];
  checks.forEach((check) => {
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
}

function main() {
  const knownMismatch = loadKnownMismatch();

  const baseline = loadJsonIfPresent(BASELINE_PATH);
  const baselineMissing = !baseline;
  const result = Sim.runRegressionCheck(baseline ? { baseline } : {});

  const orderBaseline = loadJsonIfPresent(ORDER_BASELINE_PATH);
  const orderBaselineMissing = !orderBaseline;
  const orderPrefix = loadJsonIfPresent(ORDER_PREFIX_PATH);
  const orderOpts = {};
  if (orderBaseline) orderOpts.baseline = orderBaseline;
  if (orderPrefix) orderOpts.prefix = orderPrefix;
  const orderResult = Sim.runOrderingCheck(orderOpts);

  const lines = [];
  lines.push(`Seed: ${Sim.DEFAULT_SEED}`);

  const unacknowledgedFailures = [];

  printCheckResults(result.checks, knownMismatch, lines, unacknowledgedFailures);

  const allChecks = result.checks.concat(orderResult.checks);
  const acknowledgedFailureCount = allChecks.filter(
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

  lines.push('Witness ordering (ORDER-01/ORDER-02)');
  printCheckResults(orderResult.checks, knownMismatch, lines, unacknowledgedFailures);

  if (orderResult.diffs && orderResult.diffs.length > 0) {
    lines.push('Ordering baseline diff:');
    lines.push(Sim.formatDiff(orderResult.diffs));
  }

  // Prints on every run, including when it says "no differences", so the ORDER-02
  // before/after comparison is one command away permanently rather than an artifact of
  // git archaeology.
  if (orderResult.prefixDiffs) {
    lines.push(`Ordering fix effect (${orderResult.prefixLabel} -> current):`);
    lines.push(Sim.formatDiff(orderResult.prefixDiffs));
  }

  if (orderBaselineMissing) {
    lines.push(
      'scripts/order-baseline.json was not found. Run `node scripts/verify.js --update-baseline` ' +
      'to capture the first one.'
    );
  }

  // Plain-run exit code (D-08/D-09.3): all must hold — every failing check
  // acknowledged, both baselines present, and both diffs empty. Acknowledgement never
  // excuses a missing baseline or a non-empty diff (a non-empty diff always shows up as
  // an unacknowledged failure of the never-acknowledgeable baseline check anyway).
  // result.prefixDiffs/orderResult.prefixDiffs is evidence, not a gate — it never
  // affects the exit code.
  const diffEmpty = !result.diffs || result.diffs.length === 0;
  const orderDiffEmpty = !orderResult.diffs || orderResult.diffs.length === 0;
  const plainRunPasses = unacknowledgedFailures.length === 0
    && !baselineMissing && diffEmpty
    && !orderBaselineMissing && orderDiffEmpty;

  lines.push(
    plainRunPasses
      ? (acknowledgedFailureCount > 0
        ? `OVERALL: PASS (${acknowledgedFailureCount} acknowledged mismatch(es))`
        : 'OVERALL: PASS')
      : 'OVERALL: FAIL'
  );

  lines.forEach((line) => console.log(line));

  // --capture-prefix-order (ORDER-02's frozen "before" side): writes
  // scripts/order-prefix.json and exits immediately. Must run before the
  // UPDATE_BASELINE-gated process.exit below — the very first capture runs with
  // UPDATE_BASELINE false and with no scripts/order-baseline.json on disk yet, so
  // plainRunPasses is false and the process would exit 1 before writing anything if
  // this branch were placed after that gate. Exiting 0 while the printed summary above
  // says OVERALL: FAIL is expected on that first run, for exactly the reason
  // 01-03-SUMMARY already documented for first-baseline capture: the FAIL line
  // describes the state *before* the write, and the capture is the separate,
  // subsequent action.
  if (CAPTURE_PREFIX_ORDER) {
    const capturedFor = process.argv[CAPTURE_PREFIX_ORDER_INDEX + 1] || '(unlabeled)';
    const prefixData = {
      capturedFor,
      capturedAt: new Date().toISOString(),
      snapshot: orderResult.snapshot,
    };
    fs.writeFileSync(ORDER_PREFIX_PATH, JSON.stringify(prefixData, null, 2) + '\n');
    console.log(`Captured scripts/order-prefix.json (capturedFor: "${capturedFor}").`);
    process.exit(0);
  }

  if (!UPDATE_BASELINE) {
    process.exit(plainRunPasses ? 0 : 1);
  }

  // --update-baseline (D-09.2, the golden-master re-baseline workflow): refusal is
  // scoped to the qualitative checks only, never to either non-acknowledgeable
  // baseline-diff check. A non-empty baseline diff is exactly what this flag exists to
  // let a human review and bless — scoping refusal to include those checks would make
  // the re-baseline workflow permanently unreachable the moment behavior legitimately
  // changes, since neither can ever be acknowledged either. Everything above has
  // already been printed, including both full diffs, before this decision is made.
  const blockingFailures = allChecks.filter(
    (check) => !NON_ACKNOWLEDGEABLE_CHECK_NAMES.has(check.name)
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
  fs.writeFileSync(ORDER_BASELINE_PATH, JSON.stringify(orderResult.snapshot, null, 2) + '\n');
  console.log(
    `Captured scripts/baseline.json (${acceptedDiffCount} diff entr` +
    `${acceptedDiffCount === 1 ? 'y' : 'ies'} accepted) and scripts/order-baseline.json.`
  );
  process.exit(0);
}

main();
