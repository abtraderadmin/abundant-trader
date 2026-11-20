#!/usr/bin/env node
// Acorn review cards.
//
// Two jobs. First, reproduce the Risk/Reward workbook exactly — if the app's
// figures disagree with the spreadsheet the user has been sizing from, the app
// is wrong. Second, refuse to size an idea whose stop is not on the risk side
// of the entry: Acorn rewrites the stop once an idea has run, and a negative
// risk would otherwise produce a confident wrong share count.
//
//   node tests/acorn-review.test.js

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);
const near = (a, b, tol = 0.01) => a != null && Math.abs(a - b) < tol;

const grab = n => (html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0];
// atRiskBudget is the single budget oreRiskBudget now defers to, so the
// sandbox takes the real one from the page rather than standing in a figure.
const src = ['atRiskBudget', 'oreRiskBudget', 'oreQueueMath', 'oreRRVerdict'].map(grab);
if (src.some(x => !x)) { console.error('could not extract the math functions'); process.exit(1); }

function math(item, settings) {
  return new Function('state', 'item',
    src.join('\n') + '\nreturn oreQueueMath(item);'
  )({ settings: settings || { stockOptionsAccountValue: 10000, tradeRiskPct: 1 } }, item);
}
const L = (entry, stop, target, extra) =>
  Object.assign({ direction: 'LONG', entry, stop, target1: target }, extra || {});

// ── 1. the workbook's own rows ─────────────────────────────────────────────
// Shares are taken from the sheet so every other figure is checked against it.
console.log('\n2026_RiskReward.xlsx parity');
const sheet = [
  // ticker  entry   stop   target  shares  posTotal  totalRisk  consProfit  rr
  ['CSTE',    2.34,  1.66,   3.23,    300,    702,    204.00,     267.00,   1.309],
  ['JACK',   20.43, 18.47,  24.87,     40,  817.20,    78.40,     177.60,   2.265],
  ['PTLO',    6.17,  5.42,   7.67,    150,  925.50,   112.50,     225.00,   2.000],
  ['HLF',     8.92,  7.77,  11.63,    100,    892,    115.00,     271.00,   2.357],
  ['SRI',     6.00,  4.91,   8.93,    100,    600,    109.00,     293.00,   2.688],
  ['INSG',   12.03, 10.36,  15.50,    100,   1203,    167.00,     347.00,   2.078],
  ['BLKB',   79.00, 76.47,  86.13,     35,   2765,     88.55,     249.55,   2.818],
  ['AMD',   167.23,153.23, 195.33,    100,  16723,   1400.00,    2810.00,   2.007],
  ['SFIX',    4.13,  3.63,   5.73,    200,    826,    100.00,     320.00,   3.200],
  ['OPK',     1.36,  1.27,   1.63,   1000,   1360,     90.00,     270.00,   3.000],
];
for (const [tkr, entry, stop, target, shares, posTotal, totalRisk, consProfit, rr] of sheet) {
  const m = math(L(entry, stop, target, { sharesOverride: shares }));
  const bad = [];
  if (!near(m.posTotal,   posTotal,   0.02)) bad.push('position total ' + m.posTotal + ' vs ' + posTotal);
  if (!near(m.totalRisk,  totalRisk,  0.02)) bad.push('total risk ' + m.totalRisk + ' vs ' + totalRisk);
  if (!near(m.consProfit, consProfit, 0.02)) bad.push('conservative profit ' + m.consProfit + ' vs ' + consProfit);
  if (!near(m.rr,         rr,         0.005)) bad.push('R:R ' + (m.rr && m.rr.toFixed(3)) + ' vs ' + rr);
  if (bad.length) fail(tkr + ': ' + bad.join(' · '));
  else pass(tkr + ' matches the sheet (1:' + m.rr.toFixed(2) + ', risk $' + m.totalRisk.toFixed(2) + ')');
}

// ── 2. percentages ─────────────────────────────────────────────────────────
console.log('\npercentages');
let m = math(L(2.34, 1.66, 3.23, { sharesOverride: 300 }));
if (near(m.profitPct, 267 / 702, 0.0005)) pass('Profit % = conservative profit ÷ position total');
else fail('profit % wrong: ' + m.profitPct);
if (near(m.riskPct, 204 / 702, 0.0005)) pass('Risk % = total risk ÷ position total');
else fail('risk % wrong: ' + m.riskPct);
if (near(m.halfOut, 133.5, 0.01)) pass('Half Out is half the conservative profit');
else fail('half out wrong: ' + m.halfOut);

// ── 3. automatic sizing ────────────────────────────────────────────────────
console.log('\nsizing to the risk budget');
m = math(L(5.67, 4.97, 7.33));                      // ACCO, risk/share 0.70
if (m.shares === 142) pass('ACCO sized to 142 shares on a $100 budget');
else fail('expected 142 shares, got ' + m.shares);
if (m.totalRisk <= 100) pass('total risk $' + m.totalRisk.toFixed(2) + ' stays under budget');
else fail('sizing exceeded the budget: ' + m.totalRisk);

m = math(L(5.67, 4.97, 7.33), { stockOptionsAccountValue: 50000, tradeRiskPct: 2 });
if (m.shares === 1428) pass('$50k at 2% sizes to 1,428 shares');
else fail('expected 1428, got ' + m.shares);

// ── 4. the stale-stop refusal ──────────────────────────────────────────────
console.log('\nstop on the wrong side of entry');
const stale = [
  ['NWE',  'LONG',  76.83, 80.63, 83.93],
  ['BKH',  'LONG',  78.23, 81.43, 84.73],
  ['SIG',  'LONG', 106.03,112.50,125.77],
  ['RWM',  'LONG',  13.93, 14.00, 14.77],
  ['BAC',  'SHORT', 60.83, 55.57, 55.57],
];
for (const [tkr, dir, entry, stop, target] of stale) {
  const m = math({ direction: dir, entry, stop, target1: target });
  if (m.valid === false && m.shares === null && m.totalRisk === null && m.rr === null)
    pass(tkr + ' refuses to size — no shares, no risk, no R:R');
  else fail(tkr + ' produced numbers from an invalid stop: shares=' + m.shares + ' rr=' + m.rr);
}

// ── 5. R:R gate wording ────────────────────────────────────────────────────
console.log('\nR:R gate');
const verdict = rr => new Function(src.join('\n') + '\nreturn oreRRVerdict(' + rr + ');')();
if (/2\.0 preferred/.test(verdict(2.37).txt)) pass('2.37 reads as at or above the 2.0 preferred');
else fail('2.37 verdict: ' + verdict(2.37).txt);
if (/1\.5 floor and 2\.0/.test(verdict(1.7).txt)) pass('1.70 sits between the floor and preferred');
else fail('1.70 verdict: ' + verdict(1.7).txt);
if (/below your 1\.5 floor/.test(verdict(1.2).txt)) pass('1.20 is below the floor');
else fail('1.20 verdict: ' + verdict(1.2).txt);
if (/no usable/.test(verdict(null).txt)) pass('null R:R says so rather than passing');
else fail('null verdict: ' + verdict(null).txt);

// ── 6. edits recompute ─────────────────────────────────────────────────────
console.log('\nentry and share edits');
const base = math(L(5.67, 4.97, 7.33));
const moved = math(L(5.67, 4.97, 7.33, { entryOverride: 5.90 }));
if (moved.entry === 5.90 && moved.rps > base.rps && moved.rr < base.rr)
  pass('a worse entry widens the risk and lowers R:R');
else fail('entry override did not recompute: rps ' + moved.rps + ' rr ' + moved.rr);
const resized = math(L(5.67, 4.97, 7.33, { sharesOverride: 50 }));
if (resized.shares === 50 && near(resized.totalRisk, 35, 0.01) && near(resized.rr, base.rr, 0.001))
  pass('changing shares moves risk and position, leaves R:R alone');
else fail('share override wrong: risk ' + resized.totalRisk + ' rr ' + resized.rr);

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
