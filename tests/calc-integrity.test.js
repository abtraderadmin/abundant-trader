#!/usr/bin/env node
// Calculations must survive the round trip.
//
// The pull now WRITES into state.trades. If a rebuilt trade differs from the
// original in any way the app's maths cares about, every displayed figure
// moves — totals, win rate, profit factor, grade breakdown, account subtotals.
// Nothing would error; the numbers would just quietly be wrong.
//
// So: take a realistic book, push it to rows, pull it back, and assert the
// figures are identical.
//
//   node tests/calc-integrity.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

const grab = n => (html.match(new RegExp('(?:async )?function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0];
const names = ['atNum','atDate','atCanonAcctName','atAcctNameTarget','atTradeRow','atTradeFromRow'];
const src = names.map(grab);
const cols = (html.match(/var AT_TRADE_COLS=\[[\s\S]*?\];/) || [])[0];
const alias = (html.match(/function atAcctAliases\(\)[\s\S]*?\n\}/) || [])[0];
if (src.some(x => !x) || !cols) { console.error('extraction failed'); process.exit(1); }

const sb = { state: { settings: {} } };
vm.createContext(sb);
vm.runInContext(cols + '\n' + alias + '\n' + src.join('\n'), sb);
const roundTrip = t => vm.runInContext(
  'atTradeFromRow(atTradeRow(' + JSON.stringify(t) + ',"u1"))', sb);

// A book shaped like the real one: three modules, wins and losses, an open
// trade with no P/L, a scratch, a zero-fee trade, grades and journal fields.
const book = [
  { id:'a1', module:'spy_day', account:'Alpha-0001', date:'2026-11-05', symbol:'SPY',
    direction:'LONG', optType:'C', entry:3.10, stop:2.40, target:5.20, qty:3,
    exitPrice:11.70, grossPL:2580, feesActual:0.13, netPL:2579.87, rr:3.0,
    grade:'A+', status:'closed', emotion:'calm', rulesFollowed:'yes', thesis:'bounce' },
  { id:'a2', module:'spy_day', account:'Joint ACME-0002', date:'2026-11-06', symbol:'SPY',
    direction:'PUT', entry:2.10, stop:1.60, target:3.50, qty:63,
    exitPrice:1.79, grossPL:-1953, feesActual:13.62, netPL:-1966.62, rr:2.8,
    grade:'C', status:'closed', emotion:'frustrated', rulesFollowed:'no' },
  { id:'a3', module:'futures', account:'PA-APEX-4687-12', date:'2026-11-12', symbol:'MES',
    direction:'LONG', entry:5210.25, stop:5195, t1:5222.5, target:5235, qty:2, contracts:2,
    exitPrice:5234.75, grossPL:245, feesActual:6.60, netPL:238.40, rr:1.61,
    grade:'A', status:'closed', rulesFollowed:'yes', srcKey:'mes|1112|0947', holdSec:412 },
  { id:'a4', module:'stock', account:'Joint ACME-0002', date:'2026-11-03', symbol:'ACCO',
    direction:'LONG', entry:5.67, stop:4.97, target:7.33, qty:142, shares:142,
    exitPrice:6.10, grossPL:61.06, feesActual:0, netPL:61.06, rr:2.37,
    grade:'B', status:'closed', rulesFollowed:'yes' },
  // open: no exit, no P/L. Must stay excluded from closed-trade maths.
  { id:'a5', module:'stock', account:'Alpha-0001', date:'2026-11-17', symbol:'LUNG',
    direction:'LONG', entry:3.07, stop:2.43, target:5.23, qty:156, shares:156,
    status:'open' },
  // scratch: exactly zero. Must count as closed, not be treated as missing.
  { id:'a6', module:'spy_day', account:'Beta-0003', date:'2026-11-11', symbol:'SPY',
    direction:'CALL', entry:2.00, stop:1.70, target:2.60, qty:4,
    exitPrice:2.00, grossPL:0, feesActual:0, netPL:0, grade:'B', status:'closed' },
];

const after = book.map(roundTrip);

// The app's own rules, applied to both books.
const closed = b => b.filter(t => t.netPL != null);
const stats = b => {
  const c = closed(b);
  const wins = c.filter(t => t.netPL > 0), losses = c.filter(t => t.netPL < 0);
  const gp = wins.reduce((s,t)=>s+t.netPL,0), gl = Math.abs(losses.reduce((s,t)=>s+t.netPL,0));
  const byAcct = {}, byGrade = {}, byModule = {};
  c.forEach(t => { byAcct[t.account] = +((byAcct[t.account]||0) + t.netPL).toFixed(2); });
  c.forEach(t => { byGrade[t.grade||'—'] = (byGrade[t.grade||'—']||0) + 1; });
  c.forEach(t => { byModule[t.module] = +((byModule[t.module]||0) + t.netPL).toFixed(2); });
  return {
    total: +c.reduce((s,t)=>s+t.netPL,0).toFixed(2),
    closedCount: c.length, openCount: b.length - c.length,
    wins: wins.length, losses: losses.length,
    scratches: c.filter(t=>t.netPL===0).length,
    winPct: +(100*wins.length/c.length).toFixed(1),
    avgWin: +(gp/wins.length).toFixed(2), avgLoss: +(gl/losses.length).toFixed(2),
    profitFactor: +(gp/gl).toFixed(3),
    fees: +c.reduce((s,t)=>s+(t.feesActual||0),0).toFixed(2),
    rulesFollowed: c.filter(t=>t.rulesFollowed==='yes').length,
    byAcct, byGrade, byModule,
  };
};

const A = stats(book), B = stats(after);

console.log('\nfigures are identical after a push/pull round trip');
for (const k of Object.keys(A)) {
  const a = JSON.stringify(A[k]), b = JSON.stringify(B[k]);
  if (a === b) pass(k + ' = ' + a);
  else fail(k + ' CHANGED: ' + a + ' -> ' + b);
}

console.log('\nthe null/undefined distinction the filters rely on');
{
  const open = after.find(t => t.id === 'a5');
  if (open && open.netPL == null) pass('an open trade still has no netPL, so it stays out of closed maths');
  else fail('the open trade gained a netPL of ' + (open && open.netPL));
  const scratch = after.find(t => t.id === 'a6');
  if (scratch && scratch.netPL === 0) pass('a zero P/L scratch survives as 0, not null');
  else fail('scratch netPL became ' + (scratch && scratch.netPL) + ' — it would drop out of the totals');
}

console.log('\nfields other calculations depend on');
{
  const f = after.find(t => t.id === 'a3');
  if (f.contracts === 2) pass('futures contracts preserved');
  else fail('contracts lost: ' + f.contracts);
  if (f.srcKey === 'mes|1112|0947') pass('srcKey preserved (futures import dedup)');
  else fail('srcKey lost — re-importing would duplicate every futures trade');
  const s = after.find(t => t.id === 'a4');
  if (s.shares === 142) pass('stock shares preserved');
  else fail('shares lost: ' + s.shares);
  if (after.every(t => typeof t.netPL !== 'string' && typeof t.entry !== 'string'))
    pass('numbers come back as numbers, not strings');
  else fail('a numeric field came back as a string — arithmetic would concatenate');
  if (after.every((t,i) => t.account === book[i].account)) pass('account names unchanged');
  else fail('an account name changed, which would move subtotals');
}

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
