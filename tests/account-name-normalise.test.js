#!/usr/bin/env node
// Account name normalisation.
//
// Built from the real name set in the live blob. Holdings arrived from the
// broker as "Yaz -3036" while trades carried "Yaz-3036", so one account
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
const names = ['atCanonAcctName','atNormalizeAccountNames','atNormalizeAccountNamesOnce',
               'atMigrateAccountName','atNameKeyedMaps'];
const src = names.map(grab);
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
      ...trade('Joint JTWROS-7264', 16),
      ...trade('Yaz-3036', 9),
      ...trade('ET-Jim', 8),
    ],
    withdrawals: [],
    stockHoldings: {
      'Yaz -3036':          { acctName: 'Yaz -3036',          positions: [{ symbol: 'SHOP' }] },
      'Jim -2310':          { acctName: 'Jim -2310',          positions: [{ symbol: 'AAPL' }] },
      'Joint JTWROS -7264': { acctName: 'Joint JTWROS -7264', positions: [{ symbol: 'MSFT' }] },
    },
    portfolioOpen: {}, transactionHistory: {},
    settings: {
      cashAccounts:  ['Yaz-3036', 'ET-Jim', 'Joint JTWROS-7264'],
      evalAccounts:  ['Apex-4687-102'],
      paAccounts:    ['PA -APEX-4687-12', 'PA -APEX-4687-13'],
      paperAccounts: ['ET-PT', 'TOS-PT'],
      apexAccounts:  { 'PA -APEX-4687-12': { size: 50000, dd: 2500 },
                       'PA -APEX-4687-13': { size: 50000, dd: 2500 } },
      accountGoals:  { 'PA -APEX-4687-12': 4000, 'PA -APEX-4687-13': 4000, 'Apex-4687-102': 1000 },
      accountPriorPL:{ 'PA -APEX-4687-12': 1200, 'PA -APEX-4687-13': 1100 },
      accountDayGoals:{ 'PA -APEX-4687-12': 250, 'PA -APEX-4687-13': 250,
                        'Yaz-3036': 250, 'ET-Jim': 250, 'Joint JTWROS-7264': 250,
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
  ['Yaz -3036',          'Yaz-3036'],
  ['Joint JTWROS -7264', 'Joint JTWROS-7264'],
  ['PA -APEX-4687-12',   'PA-APEX-4687-12'],
  ['Jim -2310',          'Jim-2310'],
  ['ET-Jim',             'ET-Jim'],
  ['Apex-4687-102',      'Apex-4687-102'],
  ['TOS-PT',             'TOS-PT'],
  ['  Yaz - 3036  ',     'Yaz-3036'],
].forEach(([i, o]) => {
  const got = canon(i);
  if (got === o) pass(JSON.stringify(i) + ' → ' + JSON.stringify(o));
  else fail(JSON.stringify(i) + ' → ' + JSON.stringify(got) + ', expected ' + JSON.stringify(o));
});
if (canon('Joint JTWROS-7264') === 'Joint JTWROS-7264')
  pass('an internal space not touching a hyphen is preserved');
else fail('internal space was eaten');

// ── the plan ───────────────────────────────────────────────────────────────
console.log('\ndry run');
let { out: plan } = run(liveState(), { dryRun: true });
const pairs = plan.map(p => p.from + ' → ' + p.to).sort();
const expected = [
  'Jim -2310 → Jim-2310',
  'Joint JTWROS -7264 → Joint JTWROS-7264',
  'PA -APEX-4687-12 → PA-APEX-4687-12',
  'PA -APEX-4687-13 → PA-APEX-4687-13',
  'Yaz -3036 → Yaz-3036',
].sort();
if (JSON.stringify(pairs) === JSON.stringify(expected)) pass('plan is exactly the 5 spaced names');
else fail('plan wrong:\n    got      ' + pairs.join('\n             ') + '\n    expected ' + expected.join('\n             '));
if (!plan.some(p => ['ET-Jim','Apex-4687-102','TOS-PT','ET-PT','Yaz-3036'].includes(p.from)))
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
if (acctCount('Yaz-3036') === 9 && acctCount('ET-Jim') === 8 && acctCount('Joint JTWROS-7264') === 16)
  pass('untouched accounts keep their exact trade counts');
else fail('an untouched account changed count');
if (st.trades.length === 273) pass('273 trades in, 273 out — nothing lost or duplicated');
else fail('trade count changed to ' + st.trades.length);

console.log('\nholdings join the right account');
const hk = Object.keys(st.stockHoldings).sort();
if (JSON.stringify(hk) === JSON.stringify(['Jim-2310','Joint JTWROS-7264','Yaz-3036']))
  pass('holdings keys canonicalised: ' + hk.join(', '));
else fail('holdings keys: ' + hk.join(', '));
if (st.stockHoldings['Yaz-3036'] && st.stockHoldings['Yaz-3036'].positions[0].symbol === 'SHOP')
  pass('position data moved with the key');
else fail('holdings payload lost');
if (st.stockHoldings['Yaz-3036'] && !st.stockHoldings['Yaz -3036'])
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
    st.settings.accountDayGoals['Yaz-3036'] === 250 &&
    Object.keys(st.settings.accountDayGoals).length === 6)
  pass('day goals followed with no key lost or merged away');
else fail('day goals: ' + JSON.stringify(st.settings.accountDayGoals));
if (JSON.stringify(st.settings.cashAccounts) === JSON.stringify(['Yaz-3036','ET-Jim','Joint JTWROS-7264']))
  pass('cashAccounts untouched');
else fail('cashAccounts changed: ' + JSON.stringify(st.settings.cashAccounts));

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
if (s3.settings._acctNamesNormalized === true && after1 === 152)
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

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
