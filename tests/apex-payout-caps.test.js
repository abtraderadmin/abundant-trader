#!/usr/bin/env node
// Apex EOD Performance Account payout caps.
//
// The cap applies regardless of how much profit the account has made, so it is
// a floor on the answer, not a note beside it. Six payouts, then the PA closes.
//
// $50,000 schedule: 1,500 / 1,500 / 2,000 / 2,500 / 2,500 / 3,000
//
//   node tests/apex-payout-caps.test.js

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

const grab = n => (html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0];
const consts = ['APEX_PAYOUT_CAPS', 'APEX_MAX_PAYOUTS']
  .map(n => (html.match(new RegExp('const ' + n + '\\s*=[\\s\\S]*?;')) || [])[0]);
const src = ['apexCfg', 'apexEval'].map(grab);
if (src.some(x => !x) || consts.some(x => !x)) {
  console.error('could not extract the functions or the cap table'); process.exit(1);
}

// $50k tier: size 50000, drawdown 2500 -> safety net 52,600.
const SAFETY = 52600;
function evalWith({ profit, withdrawals = [], days = 10, size = 50000, dd = 2500 }) {
  const perDay = profit / days;
  const trades = Array.from({ length: days }, (_, i) => ({
    module: 'futures', account: 'PA-12',
    date: '2026-10-' + String(i + 1).padStart(2, '0'),
    netPL: perDay, qty: 2, direction: 'LONG', stop: 100,
  }));
  const state = {
    trades, withdrawals,
    settings: {
      accountPriorPL: {},
      apexAccounts: { 'PA-12': { size, dd, maxContracts: 10, firm: 'Apex', bracketed: true, oneDir: true } },
    },
  };
  return new Function('state', 'fmt',
    consts.join('\n') + '\n' + src.join('\n') + '\nreturn apexEval("PA-12");'
  )(state, (v, d) => Number(v).toFixed(d));
}
const payout = (n, amt) => Array.from({ length: n }, (_, i) => ({ account: 'PA-12', amount: amt }));

console.log('\n$50,000 cap schedule');

// $6,000 profit -> balance 56,000, net 52,600, so 3,400 above it.
// Payout #1 is capped at 1,500.
let e = evalWith({ profit: 6000 });
if (e.aboveNet === 3400) pass('3,400 above the safety net');
else fail('expected aboveNet 3400, got ' + e.aboveNet);
if (e.payoutNo === 1 && e.payoutCap === 1500) pass('payout #1, cap 1,500');
else fail('expected #1 cap 1500, got #' + e.payoutNo + ' cap ' + e.payoutCap);
if (e.canWithdraw === 1500) pass('withdrawable 1,500 — the cap, not the 3,400 available');
else fail('expected 1500, got ' + e.canWithdraw);
if (e.cappedByApex) pass('flagged as capped');
else fail('should be flagged as capped');

// Walk the whole schedule.
const schedule = [1500, 1500, 2000, 2500, 2500, 3000];
schedule.forEach((cap, i) => {
  const e = evalWith({ profit: 40000, withdrawals: payout(i, 100) });
  if (e.payoutCap === cap && e.canWithdraw === cap)
    pass('payout #' + (i + 1) + ' capped at ' + cap.toLocaleString());
  else fail('payout #' + (i + 1) + ': expected ' + cap + ', got cap ' + e.payoutCap + ' / ' + e.canWithdraw);
});

console.log('\npast the sixth payout the account carries on');
// Taking payouts does not end an account. The published schedule simply runs
// out: the seventh has no listed cap, which is a prompt to confirm it, not a
// reason to block the withdrawal. The old behaviour zeroed it permanently.
e = evalWith({ profit: 40000, withdrawals: payout(6, 100) });
if (e.pastSchedule) pass('six taken — flagged as past the published schedule');
else fail('expected pastSchedule after 6');
if (!('accountClosed' in e)) pass('no accountClosed flag remains');
else fail('accountClosed is still being set: ' + e.accountClosed);
if (e.canWithdraw > 0) pass('still withdrawable — ' + e.canWithdraw);
else fail('a seventh payout was blocked, got ' + e.canWithdraw);
if (e.payoutCap === null) pass('no cap is invented for payout seven');
else fail('a cap was guessed past the schedule: ' + e.payoutCap);
if (!e.cappedByApex) pass('not reported as capped when there is no published cap');
else fail('claims a cap it does not have');
if (/past the published schedule/.test(e.blockers.join(' '))) pass('says to confirm the cap with the firm');
else fail('no prompt to confirm, got: ' + e.blockers.join(' · '));
if (!/closed|new evaluation/.test(e.blockers.join(' '))) pass('never calls the account closed');
else fail('still says the account is closed: ' + e.blockers.join(' · '));

console.log('\nthe cap does not override the other gates');

// Above the net but under the 500 minimum — cap is irrelevant.
e = evalWith({ profit: 2800 });
if (e.canWithdraw === 0 && /minimum/.test(e.blockers.join(' ')))
  pass('200 above the net still blocked by the 500 minimum');
else fail('expected minimum blocker, got: ' + e.blockers.join(' · '));

// Plenty above the net, not enough days.
e = evalWith({ profit: 6000, days: 5 });
if (e.canWithdraw === 0 && /3 more qualifying/.test(e.blockers.join(' ')))
  pass('5 days still blocks regardless of the cap');
else fail('expected days blocker, got: ' + e.blockers.join(' · '));

// Below the net.
e = evalWith({ profit: 1000 });
if (e.canWithdraw === 0 && /below the safety net/.test(e.blockers.join(' ')))
  pass('below the net reports the shortfall');
else fail('expected below-net blocker, got: ' + e.blockers.join(' · '));

console.log('\nless above the net than the cap allows');
// 1,000 above the net on payout #3 (cap 2,000) -> you can take the 1,000.
e = evalWith({ profit: 3600, withdrawals: payout(2, 100) });
if (e.aboveNet === 800 && e.canWithdraw === 800)
  pass('800 above the net on a 2,000 cap — the net binds, not the cap');
else fail('expected 800/800, got ' + e.aboveNet + '/' + e.canWithdraw);
if (!e.cappedByApex) pass('not flagged as capped when the net is the binding limit');
else fail('should not be flagged as capped here');

console.log('\nunknown account size');
e = evalWith({ profit: 20000, size: 75000, dd: 3000 });
if (e.canWithdraw === 0 && /no published payout caps/.test(e.blockers.join(' ')))
  pass('a 75,000 account reports no loaded caps instead of guessing a tier');
else fail('expected unknown-size blocker, got: ' + e.blockers.join(' · '));

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
