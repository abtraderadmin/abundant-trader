#!/usr/bin/env node
// Per-ticker levels: ATR, fibs and pivots.
//
// state.ore holds ONE ticker, so these vanished the moment the next ticker
// was analysed. Two separate needs:
//   - a trade must keep the levels AS THEY WERE when it was planned
//     (not re-derivable once price moves)
//   - ATR must be reachable later, for options planning, without re-running
//     an analysis
//
//   node tests/levels-snapshot.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

const grab = n => (html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0];
const names = ['atLevelsFor','atCaptureLevels','atLevelsSnapshot','atAttachLevels','atAtrFor'];
const src = names.map(grab);
const missing = names.filter((n,i) => !src[i]);
if (missing.length) { console.error('could not extract: ' + missing.join(', ')); process.exit(1); }

const ore = (tk, over) => Object.assign({
  ticker: tk, price: 5.67, atr14: 0.31, analysisDate: '2026-11-17',
  e9: 5.61, e20: 5.48, e50: 5.30, e200: 5.02, emaAlignment: 'bullish_stacked',
  pdH: 5.80, pdL: 5.40, pdC: 5.60, swingH: 7.10, swingL: 4.20,
  fibs: { fib236: 6.42, fib382: 5.99, fib500: 5.65, fib618: 5.31, fib786: 4.82,
          swingH: 7.10, swingL: 4.20, extDn127: 3.42 },
  pivots: { pp: 5.60, r1: 5.80, r2: 6.00, s1: 5.40, s2: 5.20 },
  bb: { upper: 6.1, lower: 5.0 },
  bars: new Array(200).fill({ o:1,h:1,l:1,c:1 }),
  emaSeries9: new Array(200).fill(1),
}, over || {});

function ctx(state) {
  const sb = { state: state || { levels: {} }, console: { warn(){}, log(){} } };
  vm.createContext(sb);
  vm.runInContext(src.join('\n'), sb);
  return sb;
}

console.log('\ncapturing an analysis');
{
  const s = ctx({ levels: {} });
  vm.runInContext('atCaptureLevels(' + JSON.stringify(ore('ACCO')) + ')', s);
  const L = s.state.levels.ACCO;
  if (L) pass('ACCO captured');
  else fail('nothing captured');
  if (L && L.atr14 === 0.31) pass('ATR stored');
  else fail('ATR missing');
  if (L && L.fibs && L.fibs.fib618 === 5.31) pass('fib levels stored');
  else fail('fibs missing');
  if (L && L.pivots && L.pivots.pp === 5.60) pass('pivots stored');
  else fail('pivots missing');
  if (L && !L.bars && !L.emaSeries9) pass('bars and EMA series NOT stored — large and re-derivable');
  else fail('bar arrays were copied into the cache');
  // lowercase in, uppercase key out
  vm.runInContext('atCaptureLevels(' + JSON.stringify(ore('lung')) + ')', s);
  if (s.state.levels.LUNG) pass('ticker key normalised to upper case');
  else fail('ticker key not normalised');
}

console.log('\nlevels survive the next analysis');
{
  const s = ctx({ levels: {} });
  vm.runInContext('atCaptureLevels(' + JSON.stringify(ore('ACCO')) + ')', s);
  vm.runInContext('atCaptureLevels(' + JSON.stringify(ore('LUNG', { atr14: 0.12 })) + ')', s);
  if (s.state.levels.ACCO && s.state.levels.ACCO.atr14 === 0.31)
    pass("ACCO's ATR still there after analysing LUNG");
  else fail('ACCO levels lost when the next ticker was analysed');
  if (s.state.levels.LUNG.atr14 === 0.12) pass('LUNG captured alongside');
  else fail('LUNG not captured');
}

console.log('\nthe cache is bounded');
{
  const s = ctx({ levels: {} });
  for (let i = 0; i < 260; i++) {
    const d = '2026-' + String(1 + (i % 12)).padStart(2,'0') + '-' + String(1 + (i % 28)).padStart(2,'0');
    vm.runInContext('atCaptureLevels(' + JSON.stringify(ore('T' + i, { analysisDate: d })) + ')', s);
  }
  const n = Object.keys(s.state.levels).length;
  if (n <= 200) pass('pruned to ' + n + ' tickers, not 260');
  else fail('cache grew unbounded: ' + n);
}

console.log('\na trade keeps the levels it was planned with');
{
  const s = ctx({ levels: {} });
  vm.runInContext('atCaptureLevels(' + JSON.stringify(ore('ACCO')) + ')', s);
  const t = vm.runInContext('atAttachLevels(' + JSON.stringify({
    id:'t1', ticker:'ACCO', symbol:'ACCO', entry:5.67, stop:4.97, target:7.33 }) + ')', s);
  if (t.levels && t.levels.atr14 === 0.31) pass('ATR snapshotted onto the trade');
  else fail('no ATR on the trade');
  if (t.levels && t.levels.fibs.fib618 === 5.31 && t.levels.pivots.s1 === 5.40)
    pass('fibs and pivots snapshotted — the reason a target was chosen is now on the record');
  else fail('fibs/pivots missing from the snapshot');
  if (t.levels && t.levels.asOf === '2026-11-17') pass('snapshot is dated');
  else fail('snapshot has no date');

  // Later analysis must not rewrite a trade already planned.
  vm.runInContext('atCaptureLevels(' + JSON.stringify(ore('ACCO', { atr14: 0.99, analysisDate: '2026-12-01' })) + ')', s);
  const again = vm.runInContext('atAttachLevels(' + JSON.stringify(t) + ')', s);
  if (again.levels.atr14 === 0.31)
    pass('an existing snapshot is never overwritten by a later analysis');
  else fail('the trade was restamped with later levels: ' + again.levels.atr14);

  // Unknown ticker: no snapshot, no crash.
  const u = vm.runInContext('atAttachLevels({id:"t2",ticker:"ZZZZ"})', s);
  if (!u.levels) pass('an unanalysed ticker gets no snapshot rather than a wrong one');
  else fail('invented a snapshot for an unknown ticker');
}

console.log('\nATR is reachable for options planning');
{
  const s = ctx({ levels: {}, ore: null });
  vm.runInContext('atCaptureLevels(' + JSON.stringify(ore('ACCO')) + ')', s);
  s.state.ore = ore('LUNG', { atr14: 0.12 });   // a different ticker on screen

  const a = vm.runInContext('atAtrFor("ACCO")', s);
  if (a && a.atr === 0.31 && a.live === false)
    pass('ATR for a ticker NOT on screen comes from the cache');
  else fail('could not reach ACCO ATR: ' + JSON.stringify(a));
  const b = vm.runInContext('atAtrFor("LUNG")', s);
  if (b && b.atr === 0.12 && b.live === true) pass('the ticker on screen reports live');
  else fail('live lookup wrong: ' + JSON.stringify(b));
  const c = vm.runInContext('atAtrFor("zzzz")', s);
  if (c === null) pass('an unknown ticker returns null, not a guess');
  else fail('returned something for an unknown ticker');
  const d = vm.runInContext('atAtrFor("acco")', s);
  if (d && d.atr === 0.31) pass('lookup is case-insensitive');
  else fail('case-sensitive lookup');
}

console.log('\nwiring');
{
  if (/atCaptureLevels\(state\.ore\)/.test(html)) pass('capture runs when an analysis completes');
  else fail('nothing captures levels');
  const creates = (html.match(/state\.trades\.(?:push|unshift)\(/g) || []).length;
  const attached = (html.match(/atAttachLevels/g) || []).length;
  if (attached >= creates) pass(creates + ' trade-creation sites, ' + attached + ' atAttachLevels references');
  else fail('only ' + attached + ' attach calls for ' + creates + ' creation sites');
  // Look for a real call, not the word: the pull carries a comment saying
  // why it deliberately does not attach.
  const pull = (html.match(/async function atPullTrades\([\s\S]*?\n\}/) || [''])[0];
  const pullCalls = pull.split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l))
    .filter(l => /atAttachLevels\s*\(/.test(l));
  if (!pullCalls.length)
    pass('the pull does NOT attach — a trade from weeks ago must not get today\'s levels');
  else fail('the pull stamps remote trades with current levels: ' + pullCalls[0].trim());
  if (/levels:state\.levels\|\|\{\}/.test(html)) pass('cache persists via saveState');
  else fail('cache is not persisted');
  if (/state\.levels=s\.levels\|\|\{\}/.test(html)) pass('cache restored on load');
  else fail('cache is not restored');
  if (/id="oc-atr"/.test(html)) pass('ATR readout present on the options form');
  else fail('no ATR readout on the options form');
}

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
