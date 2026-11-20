#!/usr/bin/env node
// Daily target on futures accounts.
//
// The target reports progress. It must never read as a breach when a day comes
// in under it — a $210 day on a $250 target is a green day that fell short, and
// framing it as a miss is what turns "I'm done" into one more trade.
//
//   node tests/futures-day-goal.test.js

const PAGE_SRC_FOR_HELPERS = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
const HELPERS = new Function(
  PAGE_SRC_FOR_HELPERS.slice(PAGE_SRC_FOR_HELPERS.indexOf('const AT_SESSION_ROLL_HOUR='),
                             PAGE_SRC_FOR_HELPERS.indexOf('// \u2500\u2500 Firm rules'))
  + '\nreturn {atSessionDate, atTradeDay};')();
const SESSION_DATE = HELPERS.atSessionDate, TRADE_DAY = HELPERS.atTradeDay;
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

const grab = n => (html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0];
const src = ['apexCfg', 'apexEval', 'apexRuleRows'].map(grab);
const consts = ['APEX_PAYOUT_CAPS', 'APEX_MAX_PAYOUTS']
  .map(n => (html.match(new RegExp('const ' + n + '\\s*=[\\s\\S]*?;')) || [])[0]);
if (src.some(x => !x) || consts.some(x => !x)) {
  console.error('could not extract the apex functions'); process.exit(1);
}

const TODAY = new Date().toISOString().slice(0, 10);

function run({ goal, todayPL = null, priorDays = 14, priorPerDay = 210 }) {
  const trades = Array.from({ length: priorDays }, (_, i) => ({
    module: 'futures', account: 'PA-12',
    date: '2026-09-' + String(i + 1).padStart(2, '0'),
    netPL: priorPerDay, qty: 2, direction: 'LONG', stop: 100,
  }));
  if (todayPL !== null) {
    trades.push({ module: 'futures', account: 'PA-12', date: TODAY,
                  netPL: todayPL, qty: 2, direction: 'LONG', stop: 100 });
  }
  const state = {
    trades, withdrawals: [],
    settings: {
      accountPriorPL: {},
      accountDayGoals: goal ? { 'PA-12': goal } : {},
      apexAccounts: { 'PA-12': { size: 50000, dd: 2500, maxContracts: 10,
                                 firm: 'Apex', bracketed: true, oneDir: true } },
    },
  };
  // apexEval buckets by SESSION day now, so the sandbox supplies the same
  // helpers the page uses — taken from the page, never reimplemented here.
  const fn = new Function('state', 'fmt', 'atSessionDate', 'atTradeDay',
    consts.join('\n') + '\n' + src.join('\n') +
    '\nvar e=apexEval("PA-12"); return {e:e, rows:apexRuleRows(e)};');
  return fn(state, (v, d) => Number(v).toFixed(d), SESSION_DATE, TRADE_DAY);
}
const goalRow = r => r.rows.find(x => x.rule === 'Daily target');

console.log('\ntarget is read from settings');
let r = run({ goal: 250, todayPL: 210 });
if (r.e.dayGoal === 250) pass('250 target picked up from accountDayGoals');
else fail('expected dayGoal 250, got ' + r.e.dayGoal);
if (r.e.todayPL === 210) pass("today's P/L is 210");
else fail('expected todayPL 210, got ' + r.e.todayPL);

console.log('\na short day is NOT a breach');
if (goalRow(r)) pass('daily target row present');
else fail('no daily target row');
if (goalRow(r) && goalRow(r).ok === true) pass('210 of 250 reports ok:true — not a failure');
else fail('CRITICAL: a short day rendered as a rule breach');
if (goalRow(r) && goalRow(r).warn === false) pass('not flagged as a warning either');
else fail('a short day should not warn');
if (/\$210\.00 today of \$250/.test(goalRow(r).detail)) pass('detail states progress plainly');
else fail('unexpected detail: ' + goalRow(r).detail);
if (/averaging \$210\.00 over 15 days/.test(goalRow(r).detail))
  pass('shows the account average alongside the target');
else fail('expected the running average, got: ' + goalRow(r).detail);

console.log('\nmeeting the target');
r = run({ goal: 250, todayPL: 260 });
if (/target met/.test(goalRow(r).detail)) pass('260 of 250 says target met');
else fail('expected "target met", got: ' + goalRow(r).detail);
if (r.e.goalPct === 1) pass('progress caps at 100%');
else fail('expected goalPct 1, got ' + r.e.goalPct);

console.log('\nno trades yet today');
r = run({ goal: 250 });
if (!r.e.tradedToday) pass('tradedToday false');
else fail('expected tradedToday false');
if (/no trades logged today/.test(goalRow(r).detail)) pass('says so rather than showing $0.00');
else fail('expected "no trades logged today", got: ' + goalRow(r).detail);
if (goalRow(r).ok === true) pass('still not a breach');
else fail('an untraded day must not read as a breach');

console.log('\nno target set');
r = run({ goal: 0, todayPL: 210 });
if (!goalRow(r)) pass('row omitted entirely when no target is set');
else fail('row should not appear without a target');

console.log('\nthe target does not touch payout logic');
const a = run({ goal: 0,   todayPL: 210 }).e;
const b = run({ goal: 250, todayPL: 210 }).e;
if (a.canWithdraw === b.canWithdraw && a.balance === b.balance && a.scalingCap === b.scalingCap)
  pass('balance, withdrawable and contract ceiling are unchanged by the target');
else fail('setting a target moved payout or sizing numbers — it must not');

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
