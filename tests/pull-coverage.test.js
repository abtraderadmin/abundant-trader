#!/usr/bin/env node
// Pull coverage: no mirrored table may be write-only.
//
// The blob can only be retired once every table can be read BACK. A table
// that is pushed but never pulled looks fine while the blob still carries
// the data, and silently becomes a one-way dump the moment it does not.
// This is the second gate on retiring the blob; blob-coverage is the first.
//
//   node tests/pull-coverage.test.js

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

// Tables the client writes to, and how each is read back.
const TABLES = {
  trades:            { pull: 'atPullTrades' },
  withdrawals:       { pull: 'atPullWithdrawals' },
  opportunities:     { pull: 'atPullOpportunities' },
  archer_signals:    { pull: 'atPullArcherSignals' },
  class_sessions:    { pull: 'atPullClassSessions' },
  alert_snapshots:   { pull: 'atPullAlertSnapshots' },
  class_analysis:    { pull: 'atPullClassAnalysis' },

  // Documented exceptions. Each must stay true, or the blob cannot retire.
  accounts: { why: 'derived locally from the settings arrays by atDeriveAccounts(); ' +
                   'the table is an output, so pulling it would fight the derivation' },
  holdings: { why: 'a broker snapshot replaced wholesale on each import; reconstructing ' +
                   'the nested stockHoldings object from rows is a separate slice' },
  holding_snapshots: { why: 'same as holdings' },
  transactions: { why: 'the blob shape is transactionHistory[acct].days[] AGGREGATES, ' +
                        'derived from the rows. Rebuilding means re-running the aggregation, ' +
                        'which risks diverging from what the importer produced' },
  user_settings: { why: 'a single settings row, not a row collection; arrives via the blob' },
  user_secrets:  { why: 'write-only by design — the key must never come back to a client' },
  market_data:   { why: 'edge-function cache, server-side only' },
  risk_plans:    { why: 'scratchpad, nothing is saved' },
  app_state:     { why: 'the blob itself. It has its own reconcile (atReconcileBlob) and ' +
                        'is the thing all of this is working towards retiring' },
};

// Which tables does the client actually write to?
const pushed = new Set();
for (const m of html.matchAll(/atPushRows\(\s*'([a-z_]+)'/g)) pushed.add(m[1]);
for (const m of html.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)\s*\.upsert/g)) pushed.add(m[1]);

console.log('\nclient writes to ' + pushed.size + ' tables');
if (pushed.size >= 8) pass([...pushed].sort().join(', '));
else fail('only found ' + pushed.size + ' — the detector may be wrong');

console.log('\nevery written table is readable back, or has a reason');
for (const tbl of [...pushed].sort()) {
  const cfg = TABLES[tbl];
  if (!cfg) {
    fail(tbl + ' is written but unknown to this test — add a pull, or document why it is write-only');
    continue;
  }
  if (cfg.why) { pass(tbl + ' — no pull: ' + cfg.why); continue; }
  if (!new RegExp('function ' + cfg.pull + '\\(').test(html))
    fail(tbl + ' maps to ' + cfg.pull + '(), which does not exist');
  else pass(tbl + ' → ' + cfg.pull + '()');
}

console.log('\nevery pull runs on reconcile');
const wrap = (html.match(/async function atReconcile\(\)\{[\s\S]*?\n\}/) || [])[0];
if (!wrap) fail('atReconcile not found');
else {
  for (const [tbl, cfg] of Object.entries(TABLES)) {
    if (cfg.why) continue;
    if (wrap.includes(cfg.pull)) pass(cfg.pull + ' is wired');
    else fail(cfg.pull + ' exists but never runs');
  }
  if (/catch\s*\(e\)\s*\{\s*console\.warn/.test(wrap)) pass('one pull failing does not stop the others');
  else fail('pulls are not individually guarded');
}

console.log('\nthe high-water mark advances over every returned row');
// archer_signals is pulled twice, once per kind. If the mark only covered the
// filtered subset, the other kind's rows would be re-fetched forever.
const eng = (html.match(/async function atPullArray\([\s\S]*?\n\}/) || [])[0];
if (!eng) fail('atPullArray not found');
else {
  const iFilter = eng.indexOf('rowFilter');
  const iMark = eng.indexOf('res.data||[]).forEach');
  if (iMark > -1) pass('mark is taken from the full result set, not the filtered rows');
  else fail('mark appears to be taken from filtered rows — archer would re-fetch forever');
  if (/sig\[id\]=atHash/.test(eng)) pass('adopted rows are marked clean (no push-back loop)');
  else fail('adopted rows are not marked clean — they would push straight back');
  if (/atHash\(JSON\.stringify\(local\)\)!==sig\[id\]/.test(eng)) pass('unsent local edits win');
  else fail('local dirty check missing — a local edit could be overwritten');
}

console.log('\narcher kinds use separate marks');
{
  const fn = (html.match(/async function atPullArcherSignals\([\s\S]*?\n\}\n/) || [])[0] || '';
  const marks = [...fn.matchAll(/pullKey:'([a-z_]+)'/g)].map(m => m[1]);
  if (new Set(marks).size === 2) pass('watch and reject track separately: ' + marks.join(', '));
  else fail('both kinds share a high-water mark, so one would starve the other: ' + marks.join(', '));
}

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
