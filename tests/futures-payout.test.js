#!/usr/bin/env node
// Futures payout governance.
//
// A payout leaves the account. If it does not leave the computed balance, the
// safety-net threshold reads as cleared when it is not — and clearing it
// DOUBLES the contract ceiling. That is an overstated balance granting size
// the account has not earned back.
//
//   node tests/futures-payout.test.js

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

const grab = n => (html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0];
const src = ['apexCfg', 'apexEval'].map(grab);
const consts = ['APEX_PAYOUT_CAPS', 'APEX_MAX_PAYOUTS']
  .map(n => (html.match(new RegExp('const ' + n + '\\s*=[\\s\\S]*?;')) || [])[0]);
if (src.some(x => !x) || consts.some(x => !x)) {
  console.error('could not extract apexCfg / apexEval / cap table'); process.exit(1);
}

// $150k tier: size 150000, drawdown 5000 -> safety net 155100.
function evalWith({ profit, withdrawals = [], days = 10, size = 150000, dd = 5000 }) {
  const perDay = profit / days;
  const trades = Array.from({ length: days }, (_, i) => ({
    module: 'futures', account: 'PA-12',
    date: '2026-10-' + String(i + 1).padStart(2, '0'),
    netPL: perDay, qty: 2, direction: 'LONG', stop: 100,
  }));
  const state = {
    trades,
    withdrawals,
    settings: {
      accountPriorPL: {},
      apexAccounts: { 'PA-12': { size, dd, maxContracts: 17, firm: 'Apex', bracketed: true, oneDir: true } },
    },
  };
  const run = new Function('state', 'fmt',
    consts.join('\n') + '\n' + src.join('\n') + '\nreturn apexEval("PA-12");');
  return run(state, (v, d) => Number(v).toFixed(d));
}

console.log('\nbalance reflects payouts');

// $10,000 earned -> balance 160,000, net is 155,100, so 4,900 sits above it.
let e = evalWith({ profit: 10000 });
if (e.balance === 160000) pass('balance 160,000 before any payout');
else fail('expected balance 160000, got ' + e.balance);
if (e.cleared) pass('safety net cleared, full 17 contracts');
else fail('expected cleared at 160,000 vs 155,100');
if (e.scalingCap === 17) pass('scalingCap 17');
else fail('expected scalingCap 17, got ' + e.scalingCap);

// Take a $4,000 payout. Balance 156,000 — still above the 155,100 net.
e = evalWith({ profit: 10000, withdrawals: [{ account: 'PA-12', amount: 4000 }] });
if (e.withdrawn === 4000) pass('withdrawal of 4,000 picked up');
else fail('expected withdrawn 4000, got ' + e.withdrawn);
if (e.balance === 156000) pass('balance drops to 156,000 after the payout');
else fail('THE BUG: expected 156000, got ' + e.balance + ' — payout not subtracted');
if (e.profit === 10000) pass('profit stays gross at 10,000 (consistency rules measure earnings)');
else fail('profit should not move, got ' + e.profit);

// Take $6,000 instead. Balance 154,000 — now BELOW the net.
e = evalWith({ profit: 10000, withdrawals: [{ account: 'PA-12', amount: 6000 }] });
if (e.balance === 154000) pass('balance 154,000 after a 6,000 payout');
else fail('expected 154000, got ' + e.balance);
if (!e.cleared) pass('safety net no longer cleared');
else fail('THE BUG: still reads cleared at 154,000 vs a 155,100 net');
if (e.scalingCap === 8) pass('contract ceiling halves to 8 — size the account has not earned back');
else fail('expected scalingCap 8, got ' + e.scalingCap);
if (e.toPayout === 1100) pass('1,100 to rebuild the net');
else fail('expected toPayout 1100, got ' + e.toPayout);

console.log('\nhow much can be withdrawn');

e = evalWith({ profit: 10000 });
if (e.aboveNet === 4900) pass('4,900 sits above the net (160,000 - 155,100)');
else fail('expected aboveNet 4900, got ' + e.aboveNet);
// Apex caps payout #1 on a 150k account at 2,500 regardless of profit.
if (e.canWithdraw === 2500) pass('capped to 2,500 by the payout schedule');
else fail('expected canWithdraw 2500, got ' + e.canWithdraw);

// Above the net but under the 500 minimum.
e = evalWith({ profit: 5300 });
if (e.aboveNet === 200 && e.canWithdraw === 0) pass('200 above the net is under the 500 minimum — blocked');
else fail('expected aboveNet 200 / canWithdraw 0, got ' + e.aboveNet + ' / ' + e.canWithdraw);
if (/minimum/.test(e.blockers.join(' '))) pass('blocker names the minimum');
else fail('blocker should name the minimum, got: ' + e.blockers.join(' · '));

// Enough money, not enough days.
e = evalWith({ profit: 10000, days: 5 });
if (e.canWithdraw === 0) pass('5 trading days blocks the payout');
else fail('expected 0 with only 5 days, got ' + e.canWithdraw);
if (/3 more qualifying days/.test(e.blockers.join(' '))) pass('blocker says 3 more qualifying days');
else fail('expected "3 more qualifying days", got: ' + e.blockers.join(' · '));

// Below the net entirely.
e = evalWith({ profit: 1000 });
if (e.canWithdraw === 0 && /below the safety net/.test(e.blockers.join(' ')))
  pass('below the net reports the shortfall, not an amount');
else fail('expected a below-net blocker, got: ' + e.blockers.join(' · '));

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
