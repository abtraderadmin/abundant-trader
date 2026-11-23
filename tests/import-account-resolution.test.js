#!/usr/bin/env node
// Account names arriving from broker files.
//
// Normalising what is already stored fixes history once. It does nothing for
// the NEXT E-Trade export, which spells the account its own way — that is how
// "Beta -0003" ended up beside "ET-Beta" as a separate account. Names must be
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
const aliasDecl = grab('atAcctAliases');
const missing = fns.filter((n,i) => !src[i]);
if (missing.length || !aliasDecl) {
  console.error('could not extract: ' + (missing.join(', ') || 'atAcctAliases')); process.exit(1);
}

function ctx() {
  const toasts = [];
  const sandbox = {
    state: {
      trades: [{ account: 'PA-APEX-4687-12' }, { account: 'Alpha-0001' }, { account: 'Beta-0003' }],
      settings: {
        cashAccounts: ['Alpha-0001','Beta-0003','Joint ACME-0002'],
        evalAccounts: ['Apex-4687-102'],
        paAccounts:   ['PA-APEX-4687-12','PA-APEX-4687-13'],
        paperAccounts:['ET-PT','TOS-PT'],
        accountAliases:{ 'ET-Beta':'Beta-0003' },
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
  ['Alpha -0001',          'Alpha-0001'],
  ['Joint ACME -0002', 'Joint ACME-0002'],
  ['PA -APEX-4687-12',   'PA-APEX-4687-12'],
  ['  Alpha - 0001 ',      'Alpha-0001'],
  ['ET-Beta',             'Beta-0003'],   // the alias still applies on import
  ['Beta -0003',          'Beta-0003'],
].forEach(([raw, want]) => {
  const got = resolve(s, raw, 'holdings');
  if (got === want) pass(JSON.stringify(raw) + ' → ' + want);
  else fail(JSON.stringify(raw) + ' → ' + JSON.stringify(got) + ', expected ' + want);
});

console.log('\nknown accounts import quietly');
s = ctx();
['Alpha -0001','PA -APEX-4687-12','ET-Beta','Joint ACME-0002'].forEach(n => resolve(s, n, 'holdings'));
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
['Alpha-0001','Beta-0003','Joint ACME-0002','PA-APEX-4687-12','PA-APEX-4687-13','Apex-4687-102','ET-PT','TOS-PT']
  .forEach(n => { if (known[n]) pass(n + ' recognised'); else fail(n + ' missing from the known set'); });
if (!known['ET-Beta']) pass('ET-Beta is absent — it resolves to Beta-0003, not itself');
else fail('ET-Beta should not be a known name after the merge');

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

console.log('\nno path writes an unresolved account name');
// Every account name that reaches state.trades or a name-keyed store must go
// through atAcctNameTarget(). Checked structurally so a new importer added
// later cannot quietly skip it.
{
  // Prose in a comment can read like code: "...a Black Vault account: one
  // outsized day..." matched this and was reported as an unresolved write.
  // Comment lines are not code, so they are not scanned.
  const codeOnly = html.split('\n')
    .map(l => /^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/\/\/.*$/, ''))
    .join('\n');
  const writes = [...codeOnly.matchAll(/\baccount:\s*([^,\n]+)/g)]
    .map(m => ({ expr: m[1].trim(), line: codeOnly.slice(0, m.index).split('\n').length }))
    .filter(w =>
      // reads and comparisons, not writes into stored records
      !/^t\.account\b/.test(w.expr) &&
      !/^b\.account\b/.test(w.expr) &&
      !/^add\[0\]\.account\b/.test(w.expr) &&
      // the PA orders file's own label: intentionally raw, the user maps it to
      // a target account in the confirm step
      !/^\(o\[cName\]/.test(w.expr) &&
      !/^null$/.test(w.expr));
  const bad = writes.filter(w => !/atAcctNameTarget\(|atResolveImportedAccount\(/.test(w.expr));
  if (!bad.length) pass(writes.length + ' account writes, all resolved');
  else bad.forEach(w => fail('index.html line ' + w.line + ' writes an unresolved account: ' + w.expr.slice(0, 70)));
}

console.log('\nname-keyed stores are keyed by a resolved name');
for (const [re, label] of [
  [/state\.transactionHistory\[result\.acctName\]/, 'transactionHistory'],
  [/state\.stockHoldings\[result\.acctName\]/,      'stockHoldings'],
  [/state\.portfolioOpen\[result\.acctName\]/,      'portfolioOpen'],
]) {
  if (re.test(html)) pass(label + ' keyed by the resolved result.acctName');
  else fail(label + ' key changed shape — re-check it resolves');
}

console.log('\nrestore cannot reintroduce old names');
// A backup taken mid-migration carries the version flag set while the names
// inside it are still spaced. Gating on the flag alone would skip it forever.
const once = (html.match(/function atNormalizeAccountNamesOnce\([\s\S]*?\n\}/) || [])[0];
if (!once) fail('atNormalizeAccountNamesOnce not found');
else {
  if (/dryRun:\s*true/.test(once)) pass('checks for actual work rather than trusting the flag');
  else fail('still gates on the flag alone — a restored half-migrated backup would never be fixed');
  const iGate = once.indexOf('_acctNamesNormalizedV>=2');
  if (iGate === -1) pass('the flag is no longer an early-return gate');
  else fail('the flag still short-circuits before the work check');
}

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
