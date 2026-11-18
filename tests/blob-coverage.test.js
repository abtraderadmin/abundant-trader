#!/usr/bin/env node
// Blob coverage: every durable key either has a mirror or is on the
// deliberate no-table list.
//
// This is the gate before the blob can be retired. If a key is persisted by
// saveState() and nothing mirrors it, that data exists in exactly one place
// and retiring the blob would lose it. A new key added later must be a
// conscious decision, not an oversight.
//
//   node tests/blob-coverage.test.js

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

// What saveState() actually persists.
const save = (html.match(/function saveState\(\)\{[\s\S]*?\n\}/) || [])[0];
if (!save) { console.error('saveState not found'); process.exit(1); }
const persisted = [...save.matchAll(/(\w+):state\.(\w+)/g)].map(m => m[1]);
const uniq = [...new Set(persisted)];

console.log('\nsaveState persists ' + uniq.length + ' keys');
if (uniq.length >= 10) pass(uniq.join(', '));
else fail('only found ' + uniq.length + ' — the parser may be wrong');

// Keys deliberately left in the blob, each with a reason that must hold up.
const NO_TABLE = {
  ore:           'scratchpad of fetched bars/EMAs/pivots for the ticker on screen; re-derivable, replaced each analysis',
  importQueue:   'transient staging between parsing a report and deciding on it',
  portfolioOpen: 'UI state — which panel is expanded',
  levels:        'per-ticker cache of the CURRENT ATR, fibs and pivots. Re-derivable ' +
                 'from Alpha Vantage by re-running the analysis. The part that is NOT ' +
                 're-derivable — the levels as they stood when a trade was planned — is ' +
                 'snapshotted onto the trade itself and rides in its data{}',
  accounts:      'derived locally from the settings arrays; the accounts table is written from it',
  settings:      'mirrored to user_settings / user_secrets, not a row table',
};

// Which mirror covers which key.
const MIRRORS = {
  trades:             'atPushTrades',
  withdrawals:        'atPushWithdrawals',
  stockHoldings:      'atPushHoldings',
  transactionHistory: 'atPushTransactions',
  discoveries:        'atPushOpportunities',
  archerWatchlist:    'atPushArcherSignals',
  archerRejects:      'atPushArcherSignals',
  classSessions:      'atPushClassSessions',
  classAnalysis:      'atPushClassAnalysis',
};

console.log('\nevery persisted key is covered');
for (const key of uniq) {
  if (NO_TABLE[key]) { pass(key + ' — no table: ' + NO_TABLE[key]); continue; }
  const fn = MIRRORS[key];
  if (!fn) {
    fail(key + ' is persisted but has no mirror and no documented reason — ' +
         'retiring the blob would lose it. Add a mirror, or add it to NO_TABLE here with a reason.');
    continue;
  }
  if (!new RegExp('function ' + fn + '\\(').test(html)) fail(key + ' maps to ' + fn + '(), which does not exist');
  else if (!new RegExp('state\\.' + key + '\\b').test((html.match(new RegExp('function ' + fn + '\\([\\s\\S]*?\\n\\}')) || [''])[0]))
    fail(fn + '() does not actually read state.' + key);
  else pass(key + ' → ' + fn + '()');
}

console.log('\nevery mirror runs from the push path');
const wAt = html.indexOf("[['accounts',atPushAccounts");
const wiring = wAt === -1 ? '' : html.slice(wAt, wAt + 1400);
if (!wiring) fail('push path not found');
else {
  for (const fn of [...new Set(Object.values(MIRRORS))]) {
    if (wiring.includes(fn)) pass(fn + ' is wired');
    else fail(fn + ' exists but never runs');
  }
}

console.log('\nmirrors tombstone safely');
// Tables with a NOT NULL jsonb need that column on tombstone rows too.
for (const [fn, col] of [
  ['atPushOpportunities', 'data'],
  ['atPushArcherSignals', 'data'],
  ['atPushClassSessions', 'data'],
  ['atPushClassAnalysis', 'data'],
]) {
  const body = (html.match(new RegExp('function ' + fn + '\\([\\s\\S]*?\\n\\}')) || [''])[0];
  if (new RegExp('\\{' + col + ':\\{\\}').test(body)) pass(fn + ' passes ' + col + ':{} for tombstones');
  else fail(fn + ' omits ' + col + ' on tombstones — a batch with deletions fails with 23502');
}
// class_sessions.tickers is NOT NULL too.
{
  const body = (html.match(/function atPushClassSessions\([\s\S]*?\n\}/) || [''])[0];
  if (/tickers:\[\]/.test(body)) pass('atPushClassSessions passes tickers:[] for tombstones');
  else fail('class_sessions tombstones would null a NOT NULL tickers column');
}

console.log('\narcher ids cannot collide');
{
  const body = (html.match(/function atPushArcherSignals\([\s\S]*?\n\}/) || [''])[0];
  if (/id:pair\[0\]\+':'\+String\(a\.id\)/.test(body))
    pass('watch and reject rows are namespaced by kind');
  else fail('a ticker on both the watchlist and the reject log would overwrite itself');
}

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
