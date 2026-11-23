#!/usr/bin/env node
// Account name normalisation.
//
// Built from the real name set in the live blob. Holdings arrived from the
// broker as "Alpha -0001" while trades carried "Alpha-0001", so one account
// existed as two and never joined. Canonical form has no whitespace touching
// a hyphen.
//
// This rewrites hundreds of trade records, so the risks are: moving data onto
// a name that already holds data, renaming something that should not change,
// and running twice.
//
//   node tests/account-name-normalise.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

const grab = n => (html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0];
const names = ['atCanonAcctName','atAcctNameTarget','atNormalizeAccountNames',
               'atNormalizeAccountNamesOnce','atMigrateAccountName','atNameKeyedMaps'];
const src = names.map(grab);
// the alias table is the user's data now, read from settings
const aliasDecl = (html.match(/function atAcctAliases\(\)[\s\S]*?\n\}/) || [])[0];
if (!aliasDecl) { console.error('atAcctAliases not found'); process.exit(1); }
src.unshift(aliasDecl);
const missing = names.filter((n,i) => !src[i]);
if (missing.length) { console.error('could not extract: ' + missing.join(', ')); process.exit(1); }

// The live blob, in miniature: same names, same placement, same counts.
function liveState() {
  const trade = (acct, n) => Array.from({ length: n }, (_, i) =>
    ({ id: acct + '-' + i, account: acct, module: 'futures', netPL: 10 }));
  return {
    trades: [
      ...trade('PA -APEX-4687-12', 152),
      ...trade('PA -APEX-4687-13', 88),
      ...trade('Joint ACME-0002', 16),
      ...trade('Alpha-0001', 9),
      ...trade('ET-Beta', 8),
    ],
    withdrawals: [],
    stockHoldings: {
      'Alpha -0001':          { acctName: 'Alpha -0001',          positions: [{ symbol: 'SHOP' }] },
      'Beta -0003':          { acctName: 'Beta -0003',          positions: [{ symbol: 'AAPL' }] },
      'Joint ACME -0002': { acctName: 'Joint ACME -0002', positions: [{ symbol: 'MSFT' }] },
    },
    portfolioOpen: {}, transactionHistory: {},
    settings: {
      cashAccounts:  ['Alpha-0001', 'ET-Beta', 'Joint ACME-0002'],
      evalAccounts:  ['Apex-4687-102'],
      paAccounts:    ['PA -APEX-4687-12', 'PA -APEX-4687-13'],
      paperAccounts: ['ET-PT', 'TOS-PT'],
      // A deliberate merge. It is the user's data, so it comes from
      // their settings, not from a table baked into the source.
      accountAliases: { 'ET-Beta': 'Beta-0003' },
      apexAccounts:  { 'PA -APEX-4687-12': { size: 50000, dd: 2500 },
                       'PA -APEX-4687-13': { size: 50000, dd: 2500 } },
      accountGoals:  { 'PA -APEX-4687-12': 4000, 'PA -APEX-4687-13': 4000, 'Apex-4687-102': 1000 },
      accountPriorPL:{ 'PA -APEX-4687-12': 1200, 'PA -APEX-4687-13': 1100 },
      accountDayGoals:{ 'PA -APEX-4687-12': 250, 'PA -APEX-4687-13': 250,
                        'Alpha-0001': 250, 'ET-Beta': 250, 'Joint ACME-0002': 250,
                        'Apex-4687-102': 250 },
      accountTaxDeferred: {}, accountBirthYear: {},
      accountAnnualDist: {}, accountAnnualContrib: {},
    },
  };
}
function run(state, opts) {
  const sandbox = { state, console: { log(){}, warn(){} },
                    saveState(){ sandbox._saves = (sandbox._saves||0)+1; },
                    atDeriveAccounts(){}, toast(){}, _saves: 0 };
  vm.createContext(sandbox);
  vm.runInContext(src.join('\n'), sandbox);
  const out = vm.runInContext('atNormalizeAccountNames(' + JSON.stringify(opts || {}) + ')', sandbox);
  return { state, out, sandbox };
}

// ── canonical form ─────────────────────────────────────────────────────────
console.log('\ncanonical form');
const canon = s => new Function(grab('atCanonAcctName') + '\nreturn atCanonAcctName(' + JSON.stringify(s) + ');')();
[
  ['Alpha -0001',          'Alpha-0001'],
  ['Joint ACME -0002', 'Joint ACME-0002'],
  ['PA -APEX-4687-12',   'PA-APEX-4687-12'],
  ['Beta -0003',          'Beta-0003'],
  ['ET-Beta',             'ET-Beta'],
  ['Apex-4687-102',      'Apex-4687-102'],
  ['TOS-PT',             'TOS-PT'],
  ['  Alpha - 0001  ',     'Alpha-0001'],
].forEach(([i, o]) => {
  const got = canon(i);
  if (got === o) pass(JSON.stringify(i) + ' → ' + JSON.stringify(o));
  else fail(JSON.stringify(i) + ' → ' + JSON.stringify(got) + ', expected ' + JSON.stringify(o));
});
if (canon('Joint ACME-0002') === 'Joint ACME-0002')
  pass('an internal space not touching a hyphen is preserved');
else fail('internal space was eaten');

// ── the plan ───────────────────────────────────────────────────────────────
console.log('\ndry run');
let { out: plan } = run(liveState(), { dryRun: true });
const pairs = plan.map(p => p.from + ' → ' + p.to).sort();
const expected = [
  'ET-Beta → Beta-0003',
  'Beta -0003 → Beta-0003',
  'Joint ACME -0002 → Joint ACME-0002',
  'PA -APEX-4687-12 → PA-APEX-4687-12',
  'PA -APEX-4687-13 → PA-APEX-4687-13',
  'Alpha -0001 → Alpha-0001',
].sort();
if (JSON.stringify(pairs) === JSON.stringify(expected)) pass('plan is the 5 spaced names plus the ET-Beta merge');
else fail('plan wrong:\n    got      ' + pairs.join('\n             ') + '\n    expected ' + expected.join('\n             '));
if (!plan.some(p => ['Apex-4687-102','TOS-PT','ET-PT','Alpha-0001'].includes(p.from)))
  pass('names already canonical are left alone');
else fail('a clean name was scheduled for rename');

// ── applying it ────────────────────────────────────────────────────────────
console.log('\napplied');
let { state: st } = run(liveState());

const acctCount = n => st.trades.filter(t => t.account === n).length;
if (acctCount('PA-APEX-4687-12') === 152 && acctCount('PA-APEX-4687-13') === 88)
  pass('all 240 PA trades carry the canonical name');
else fail('PA trades: ' + acctCount('PA-APEX-4687-12') + '/' + acctCount('PA-APEX-4687-13'));
if (st.trades.filter(t => /\s-/.test(t.account)).length === 0)
  pass('no trade is left with a spaced name');
else fail(st.trades.filter(t => /\s-/.test(t.account)).length + ' trades still spaced');
if (acctCount('Alpha-0001') === 9 && acctCount('Joint ACME-0002') === 16)
  pass('untouched accounts keep their exact trade counts');
else fail('an untouched account changed count');

console.log('\nET-Beta merges into Beta-0003');
if (acctCount('Beta-0003') === 8) pass("Beta's 8 SPY trades moved to Beta-0003");
else fail('expected 8 trades on Beta-0003, got ' + acctCount('Beta-0003'));
if (acctCount('ET-Beta') === 0) pass('no trade is left on ET-Beta');
else fail(acctCount('ET-Beta') + ' trades still on ET-Beta');
if (st.stockHoldings['Beta-0003'] && st.stockHoldings['Beta-0003'].positions[0].symbol === 'AAPL')
  pass('the holdings land on the same account as the trades');
else fail('holdings did not join Beta-0003');
if (st.settings.cashAccounts.includes('Beta-0003') && !st.settings.cashAccounts.includes('ET-Beta'))
  pass('cashAccounts renamed');
else fail('cashAccounts: ' + JSON.stringify(st.settings.cashAccounts));
if (st.settings.cashAccounts.length === 3) pass('no duplicate left in cashAccounts');
else fail('cashAccounts length ' + st.settings.cashAccounts.length);
if (st.settings.accountDayGoals['Beta-0003'] === 250 && !('ET-Beta' in st.settings.accountDayGoals))
  pass("Beta's day goal followed the merge");
else fail('day goal: ' + JSON.stringify(st.settings.accountDayGoals));
if (st.trades.length === 273) pass('273 trades in, 273 out — nothing lost or duplicated');
else fail('trade count changed to ' + st.trades.length);

console.log('\nholdings join the right account');
const hk = Object.keys(st.stockHoldings).sort();
if (JSON.stringify(hk) === JSON.stringify(['Alpha-0001','Beta-0003','Joint ACME-0002']))
  pass('holdings keys canonicalised: ' + hk.join(', '));
else fail('holdings keys: ' + hk.join(', '));
if (st.stockHoldings['Alpha-0001'] && st.stockHoldings['Alpha-0001'].positions[0].symbol === 'SHOP')
  pass('position data moved with the key');
else fail('holdings payload lost');
if (st.stockHoldings['Alpha-0001'] && !st.stockHoldings['Alpha -0001'])
  pass('the spaced key is gone, not duplicated');
else fail('both keys still present');

console.log('\nsettings');
if (JSON.stringify(st.settings.paAccounts) === JSON.stringify(['PA-APEX-4687-12','PA-APEX-4687-13']))
  pass('paAccounts rewritten');
else fail('paAccounts: ' + JSON.stringify(st.settings.paAccounts));
if (st.settings.apexAccounts['PA-APEX-4687-12'] &&
    st.settings.apexAccounts['PA-APEX-4687-12'].dd === 2500 &&
    !st.settings.apexAccounts['PA -APEX-4687-12'])
  pass('apexAccounts moved with its $2,500 drawdown intact');
else fail('apexAccounts did not follow: ' + JSON.stringify(Object.keys(st.settings.apexAccounts)));
if (st.settings.accountPriorPL['PA-APEX-4687-12'] === 1200) pass('prior P/L followed');
else fail('prior P/L lost');
if (st.settings.accountDayGoals['PA-APEX-4687-12'] === 250 &&
    st.settings.accountDayGoals['Alpha-0001'] === 250 &&
    Object.keys(st.settings.accountDayGoals).length === 6)
  pass('day goals followed, still six accounts');
else fail('day goals: ' + JSON.stringify(st.settings.accountDayGoals));
if (JSON.stringify(st.settings.cashAccounts) === JSON.stringify(['Alpha-0001','Beta-0003','Joint ACME-0002']))
  pass('cashAccounts holds the merged name in place');
else fail('cashAccounts: ' + JSON.stringify(st.settings.cashAccounts));

// ── idempotence and the once-guard ─────────────────────────────────────────
console.log('\nsafe to run again');
const second = run(st, { dryRun: true }).out;
if (second.length === 0) pass('a second pass finds nothing to do');
else fail('not idempotent: ' + JSON.stringify(second));

const s3 = liveState();
const sb = { state: s3, console: { log(){}, warn(){} }, saveState(){}, atDeriveAccounts(){}, toast(){} };
vm.createContext(sb); vm.runInContext(src.join('\n'), sb);
vm.runInContext('atNormalizeAccountNamesOnce()', sb);
const after1 = s3.trades.filter(t => t.account === 'PA-APEX-4687-12').length;
vm.runInContext('atNormalizeAccountNamesOnce()', sb);
if (s3.settings._acctNamesNormalizedV === 2 && after1 === 152)
  pass('the once-guard is set, so 273 records are not rewritten on every load');
else fail('once-guard not working');

console.log('\nno collision destroys data');
// If a canonical name already holds data in the same map, the rename must skip
// rather than overwrite.
const clash = liveState();
clash.settings.accountGoals['PA-APEX-4687-12'] = 9999;   // destination occupied
const { state: cs } = run(clash);
if (cs.settings.accountGoals['PA-APEX-4687-12'] === 9999)
  pass('an occupied destination is not overwritten');
else fail('existing data was clobbered: ' + cs.settings.accountGoals['PA-APEX-4687-12']);
if (cs.trades.filter(t => t.account === 'PA-APEX-4687-12').length === 152)
  pass('trades still migrate even when one map skips');
else fail('trades did not migrate alongside a skipped map');

console.log('\nadopting a cloud copy canonicalises it');
// The boot pass races the async cloud reconcile. Adopting a cloud copy
// replaces state AND localStorage wholesale, which reinstated spaced names
// that had already been fixed on this device. The adopt path must normalise
// whatever it just took.
const adopt = (html.match(/function atApplyCloudState\([\s\S]*?\n\}/) || [])[0];
if (!adopt) fail('atApplyCloudState not found');
else {
  const iLoad = adopt.indexOf('loadState()');
  const iNorm = adopt.indexOf('atNormalizeAccountNames(');
  const iRender = adopt.indexOf('renderAll()');
  if (iNorm === -1) fail('the adopt path does not normalise — a cloud copy can reintroduce spaced names');
  else {
    pass('adopt path normalises what it took');
    if (iLoad > -1 && iNorm > iLoad) pass('runs after loadState, so it acts on the adopted copy');
    else fail('normalises before loadState — it would act on the old state');
    if (iRender > -1 && iNorm < iRender) pass('runs before render, so nothing displays the old names');
    else fail('renders before normalising');
  }
  if (/_acctNamesNormalizedV\s*=\s*2/.test(adopt)) pass('sets the version flag on the adopted copy');
  else fail('flag not set after adopting');
  if (/saveState\(\)/.test(adopt)) pass('persists the fix so it is not lost on the next load');
  else fail('does not save after normalising');
  if (/if\s*\(\s*r\s*&&\s*r\.plan\s*&&\s*r\.plan\.length\s*\)/.test(adopt))
    pass('only writes when there was something to fix');
  else fail('writes unconditionally — every adopt would churn a save');
  if (/catch\s*\(e\)\s*\{\s*console\.warn/.test(adopt))
    pass('a failure here is logged, not swallowed');
  else fail('failures are silent');
}

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
