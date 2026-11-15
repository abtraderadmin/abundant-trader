#!/usr/bin/env node
// Guards account renaming.
//
// Renaming an account has to carry every store that is keyed by the account
// NAME. Miss one and the data does not error — it orphans, and whatever reads
// it rebuilds at defaults. That is how apexAccounts came to silently reset a
// futures account's drawdown limit to $2,500.
//
// Test 1 reads index.html and fails if a name-keyed store is not in the
// registry. Test 2 runs the rename against a fake state and checks it moves.
//
//   node tests/rename-coverage.test.js

const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(SRC, 'utf8');

let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL ' + m); };
const pass = (m) => console.log('  ok   ' + m);

// ── 1. registry covers every name-keyed store ──────────────────────────────
console.log('\nregistry coverage');

const regBody = (html.match(/function atNameKeyedMaps\(\)\{[\s\S]*?\n\}/) || [])[0];
if (!regBody) {
  fail('atNameKeyedMaps() not found — did it get renamed?');
} else {
  const registered = new Set([...regBody.matchAll(/\['([A-Za-z]+)'/g)].map(m => m[1]));
  pass('registry lists ' + registered.size + ' stores');

  // Stores subscripted by something that reads like an account name.
  // Deliberately broad: a false positive costs one line in ALLOW, a false
  // negative costs silent data loss.
  const NAME_KEYS = /^(acct|account|accountName|nm|name|newNm|oldNm|a|an)$/;
  const found = new Map();
  for (const m of html.matchAll(/state\.(?:settings\.)?([A-Za-z]+)\s*\[\s*([A-Za-z_$][\w$]*)\s*\]/g)) {
    if (NAME_KEYS.test(m[2])) {
      if (!found.has(m[1])) found.set(m[1], m[2]);
    }
  }

  // Keyed by something other than an account name, verified by reading the code.
  const ALLOW = new Set([
    'trades',           // index
    'importQueue',      // index
    'classAnalysis',    // symbol
    'discoveries',      // index
    'settings',         // settings[key]
    'woChains',         // ticker
  ]);

  for (const [store, key] of found) {
    if (ALLOW.has(store)) continue;
    if (registered.has(store)) pass(store + ' (keyed by ' + key + ') is in the registry');
    else fail(store + ' is keyed by `' + key + '` but is NOT in atNameKeyedMaps() — '
              + 'a rename will orphan it. Add it, or add it to ALLOW in this test '
              + 'if the key is not an account name.');
  }
}

// ── 2. rename actually moves the data ──────────────────────────────────────
console.log('\nrename behaviour');

const need = ['atNameKeyedMaps', 'atMigrateAccountName'];
const fns = need.map(n => (html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0]);
if (fns.some(x => !x)) {
  fail('could not extract ' + need.join(' / '));
} else {
  const state = {
    settings: {
      accountGoals:     { 'PA -APEX-4687-12': 4000 },
      accountDayGoals:  {},
      accountPriorPL:   { 'PA -APEX-4687-12': 1200 },
      accountTaxDeferred: {}, accountBirthYear: {},
      accountAnnualDist: {}, accountAnnualContrib: {},
      // the $150k figures, which must survive a rename
      apexAccounts: { 'PA -APEX-4687-12': { size: 150000, dd: 5000, maxContracts: 17 } },
    },
    stockHoldings: {}, portfolioOpen: {}, transactionHistory: {},
    trades: [
      { id: 't1', account: 'PA -APEX-4687-12', netPL: 120 },
      { id: 't2', account: 'Yaz-3036',          netPL: 80  },
    ],
    withdrawals: [{ id: 'w1', account: 'PA -APEX-4687-12', amount: 500 }],
  };

  const run = new Function('state', 'console',
    fns.join('\n') + '\nreturn atMigrateAccountName("PA -APEX-4687-12","PA-12");');
  const moved = run(state, { log(){}, warn(){} });

  const cfg = state.settings.apexAccounts;
  if (cfg['PA-12'] && cfg['PA-12'].dd === 5000 && cfg['PA-12'].size === 150000)
    pass('apexAccounts carried the $150k drawdown across the rename');
  else
    fail('apexAccounts did NOT follow the rename — drawdown would reset to the $2,500 default');

  if (cfg['PA -APEX-4687-12'] === undefined) pass('old apexAccounts key removed');
  else fail('old apexAccounts key left behind — two configs for one account');

  if (state.settings.accountGoals['PA-12'] === 4000) pass('accountGoals followed');
  else fail('accountGoals did not follow');

  if (state.settings.accountPriorPL['PA-12'] === 1200) pass('accountPriorPL followed');
  else fail('accountPriorPL did not follow');

  if (state.trades[0].account === 'PA-12') pass('trade name rewritten (import dedup stays joinable)');
  else fail('trade name not rewritten — broker imports would re-add every row as new');

  if (state.trades[1].account === 'Yaz-3036') pass('other accounts untouched');
  else fail('an unrelated account was modified');

  if (state.withdrawals[0].account === 'PA-12') pass('withdrawal followed');
  else fail('withdrawal did not follow');

  if (moved > 0) pass('reported ' + moved + ' records moved');
  else fail('reported 0 moved');
}

// ── 3. every rename caller re-derives state.accounts ───────────────────────
console.log('\nderive after rename');
const callers = [...html.matchAll(/atRenameSlots\([^)]*\)[^\n]*/g)]
  .map(m => m[0]).filter(s => !s.startsWith('atRenameSlots(oldArr'));
callers.forEach((line, i) => {
  if (/atDeriveAccounts\(\)/.test(line)) pass('caller ' + (i + 1) + ' re-derives accounts');
  else fail('caller ' + (i + 1) + ' renames without atDeriveAccounts() — '
            + 'state.accounts keeps the old name: ' + line.trim().slice(0, 90));
});

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
