#!/usr/bin/env node
// Account names arriving from broker files.
//
// Normalising what is already stored fixes history once. It does nothing for
// the NEXT E-Trade export, which spells the account its own way — that is how
// "Jim -2310" ended up beside "ET-Jim" as a separate account. Names must be
// resolved at the point they enter, and an unrecognised one must say so then,
// not weeks later.
//
//   node tests/import-account-resolution.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

const grab = n => (html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0];
const fns = ['atCanonAcctName','atAcctNameTarget','atKnownAccountNames','atResolveImportedAccount'];
const src = fns.map(grab);
const aliasDecl = (html.match(/var AT_ACCT_ALIASES=\{[^}]*\};/) || [])[0];
const missing = fns.filter((n,i) => !src[i]);
if (missing.length || !aliasDecl) {
  console.error('could not extract: ' + (missing.join(', ') || 'AT_ACCT_ALIASES')); process.exit(1);
}

function ctx() {
  const toasts = [];
  const sandbox = {
    state: {
      trades: [{ account: 'PA-APEX-4687-12' }, { account: 'Yaz-3036' }, { account: 'Jim-2310' }],
      settings: {
        cashAccounts: ['Yaz-3036','Jim-2310','Joint JTWROS-7264'],
        evalAccounts: ['Apex-4687-102'],
        paAccounts:   ['PA-APEX-4687-12','PA-APEX-4687-13'],
        paperAccounts:['ET-PT','TOS-PT'],
      },
    },
    toast: (msg, kind) => toasts.push({ msg, kind }),
    toasts,
  };
  vm.createContext(sandbox);
  vm.runInContext(aliasDecl + '\n' + src.join('\n'), sandbox);
  return sandbox;
}
const resolve = (s, raw, what) =>
  vm.runInContext('atResolveImportedAccount(' + JSON.stringify(raw) + ',' + JSON.stringify(what || '') + ')', s);

console.log('\nbroker spellings resolve to the stored account');
let s = ctx();
[
  ['Yaz -3036',          'Yaz-3036'],
  ['Joint JTWROS -7264', 'Joint JTWROS-7264'],
  ['PA -APEX-4687-12',   'PA-APEX-4687-12'],
  ['  Yaz - 3036 ',      'Yaz-3036'],
  ['ET-Jim',             'Jim-2310'],   // the alias still applies on import
  ['Jim -2310',          'Jim-2310'],
].forEach(([raw, want]) => {
  const got = resolve(s, raw, 'holdings');
  if (got === want) pass(JSON.stringify(raw) + ' → ' + want);
  else fail(JSON.stringify(raw) + ' → ' + JSON.stringify(got) + ', expected ' + want);
});

console.log('\nknown accounts import quietly');
s = ctx();
['Yaz -3036','PA -APEX-4687-12','ET-Jim','Joint JTWROS-7264'].forEach(n => resolve(s, n, 'holdings'));
if (s.toasts.length === 0) pass('no warning for accounts the app already knows');
else fail('warned on a known account: ' + JSON.stringify(s.toasts.map(t => t.msg)));

console.log('\nan unknown account is flagged at import');
s = ctx();
const got = resolve(s, 'Sarah -9981', 'holdings');
if (got === 'Sarah-9981') pass('still canonicalised to Sarah-9981');
else fail('got ' + got);
if (s.toasts.length === 1 && s.toasts[0].kind === 'warn') pass('one warning raised');
else fail('expected one warning, got ' + s.toasts.length);
if (s.toasts[0] && /new account name/.test(s.toasts[0].msg) && /holdings/.test(s.toasts[0].msg))
  pass('the warning names the account and what was being imported');
else fail('warning text: ' + (s.toasts[0] && s.toasts[0].msg));
if (s.toasts[0] && /rename it in Settings/.test(s.toasts[0].msg))
  pass('and says what to do about it');
else fail('no remedy in the warning');

console.log('\nknown-name set');
s = ctx();
const known = vm.runInContext('atKnownAccountNames()', s);
['Yaz-3036','Jim-2310','Joint JTWROS-7264','PA-APEX-4687-12','PA-APEX-4687-13','Apex-4687-102','ET-PT','TOS-PT']
  .forEach(n => { if (known[n]) pass(n + ' recognised'); else fail(n + ' missing from the known set'); });
if (!known['ET-Jim']) pass('ET-Jim is absent — it resolves to Jim-2310, not itself');
else fail('ET-Jim should not be a known name after the merge');

console.log('\nevery import entry point goes through it');
const checks = [
  [/result\.acctName=atResolveImportedAccount\(result\.acctName,'transactions'\)/, 'E-Trade transactions'],
  [/result\.acctName=atResolveImportedAccount\(result\.acctName,'holdings'\)/,     'E-Trade portfolio'],
  [/module:'spy_day',\s*\n\s*date:d\.date,account:atAcctNameTarget\(acct\)/,       'SPY day import'],
  [/date:o\.date,account:atAcctNameTarget\(acct\)/,                                'generic import'],
  [/account:atAcctNameTarget\(target\),instrument:t\.symbol/,                      'futures PA orders'],
];
for (const [re, label] of checks) {
  if (re.test(html)) pass(label + ' resolves the name');
  else fail(label + ' still stores a raw name');
}
// The portfolio import must resolve BEFORE reading the existing record, or it
// reads accountType off the wrong key.
const i1 = html.indexOf("atResolveImportedAccount(result.acctName,'holdings')");
const i2 = html.indexOf('const _existType=(state.stockHoldings[result.acctName]||{})');
if (i1 > -1 && i2 > i1) pass('resolved before the existing record is read');
else fail('accountType is read off the unresolved key');

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
