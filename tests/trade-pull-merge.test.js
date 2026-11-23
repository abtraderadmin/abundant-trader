#!/usr/bin/env node
// Per-row trade pull and merge (Phase 2).
//
// This is the first code that WRITES INTO state.trades from the cloud, so a
// mistake here loses or duplicates real trades. The dangerous cases:
//   - a local edit not yet pushed being overwritten by an older remote row
//   - a pulled row looking "changed" and pushing straight back (sync loop)
//   - a tombstone removing a trade that was edited locally
//   - a round trip through the row format losing fields
//
//   node tests/trade-pull-merge.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

const grab = n => (html.match(new RegExp('(?:async )?function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0];
const names = ['atHash','atSigMap','atNum','atDate','atAcctNameTarget','atCanonAcctName',
               'atPullAt','atSetPullAt','atTradeFromRow','atTradeRow','atPullTrades'];
const src = names.map(grab);
const cols = (html.match(/var AT_TRADE_COLS=\[[\s\S]*?\];/) || [])[0];
const alias = (html.match(/var AT_ACCT_ALIASES=\{[^}]*\};/) || [])[0];
const missing = names.filter((n,i) => !src[i]);
if (missing.length || !cols) { console.error('could not extract: ' + (missing.join(', ') || 'AT_TRADE_COLS')); process.exit(1); }

function harness({ localTrades = [], remoteRows = [], sig = {}, store = {} } = {}) {
  const sandbox = {
    state: { trades: localTrades.slice(), settings: {} },
    atUser: { id: 'u1' },
    console: { log(){}, warn(){} },
    localStorage: {
      _d: Object.assign({ at_trades_sig: JSON.stringify(sig) }, store),
      getItem(k){ return this._d[k] ?? null; },
      setItem(k,v){ this._d[k] = v; },
    },
    saveState(){ sandbox._saved = (sandbox._saved||0)+1; },
    renderAll(){}, renderLog(){},
    atSbReady: () => ({
      from() {
        const q = {
          select(){ return q; }, eq(){ return q; }, order(){ return q; }, limit(){ return q; },
          gt(_c, v){ q._since = v; return q; },
          then(res){ res({ data: remoteRows.filter(r => !q._since || r.updated_at > q._since), error: null }); },
        };
        return q;
      },
    }),
    _saved: 0,
  };
  vm.createContext(sandbox);
  vm.runInContext(cols + '\n' + (alias||'') + '\n' + src.join('\n'), sandbox);
  return sandbox;
}
const row = (o) => Object.assign({
  id:'t1', user_id:'u1', account_id:null, account_name:'Alpha-0001', module:'spy_day',
  trade_date:'2026-11-10', symbol:'SPY', direction:'LONG', opt_type:null, setup:null,
  regime:null, entry:600, stop:598, t1:null, target:605, qty:1, exit_price:603,
  gross_pl:300, fees:1.3, net_pl:298.7, rr:2.5, grade:'A', status:'closed',
  journal:{emotion:'calm',thesis:'bounce',lesson:'',rulesFollowed:'yes',mistakeCategory:null},
  data:{}, deleted:false, updated_at:'2026-11-17T10:00:00Z',
}, o);
const trade = (o) => Object.assign({
  id:'t1', account:'Alpha-0001', module:'spy_day', date:'2026-11-10', symbol:'SPY', ticker:'SPY',
  direction:'LONG', entry:600, stop:598, target:605, qty:1, exitPrice:603,
  grossPL:300, feesActual:1.3, netPL:298.7, rr:2.5, grade:'A', status:'closed',
  emotion:'calm', thesis:'bounce', rulesFollowed:'yes',
}, o);

(async () => {

console.log('\nround trip through the row format');
{
  const s = harness({});
  // A realistic trade: stock trades carry `shares`, futures carry
  // `contracts`, and the qty column collapses all three. Both originals must
  // come back — listing them as columns stripped them from data{} and they
  // were silently lost on every pull.
  const orig = trade({ srcKey:'abc123', holdSec:412, importedFromCSV:true, scaleT1:null,
                       shares:9, contracts:2, exit:603, feesPlanned:0,
                       scaleT2:null, scaleRun:null, entryTime:'09:47', instrument:'SPY' });
  const r = vm.runInContext('atTradeRow(' + JSON.stringify(orig) + ',"u1")', s);
  const back = vm.runInContext('atTradeFromRow(' + JSON.stringify(r) + ')', s);
  const lost = Object.keys(orig).filter(k => orig[k] !== null && JSON.stringify(back[k]) !== JSON.stringify(orig[k]));
  if (!lost.length) pass('every field survives trade -> row -> trade');
  else fail('lost or changed: ' + lost.map(k => k + ' (' + JSON.stringify(orig[k]) + ' -> ' + JSON.stringify(back[k]) + ')').join(', '));
  if (back.srcKey === 'abc123' && back.holdSec === 412)
    pass('non-column fields survive via data{}');
  else fail('data{} fields lost');
  if (back.shares === 9 && back.contracts === 2)
    pass('shares and contracts survive alongside the collapsed qty column');
  else fail('shares/contracts lost on the round trip: shares=' + back.shares + ' contracts=' + back.contracts);
  if (back.entryTime === '09:47' && back.instrument === 'SPY')
    pass('entryTime and instrument survive (import dedup depends on them)');
  else fail('entryTime/instrument lost — import dedup would start duplicating');
  if (r.qty === 1) pass('qty column still holds the collapsed number for querying');
  else fail('qty column wrong: ' + r.qty);
}

console.log('\nnew remote trades arrive');
{
  const s = harness({ localTrades: [trade({id:'local1'})], remoteRows: [row({id:'r1'}), row({id:'r2'})] });
  await vm.runInContext('atPullTrades()', s);
  const ids = s.state.trades.map(t => t.id).sort();
  if (JSON.stringify(ids) === JSON.stringify(['local1','r1','r2']))
    pass('both remote trades added, local kept: ' + ids.join(', '));
  else fail('got ' + ids.join(', '));
  if (s._saved > 0) pass('saved after merging');
  else fail('did not save');
}

console.log('\nno sync loop');
{
  const s = harness({ remoteRows: [row({id:'r1'})] });
  await vm.runInContext('atPullTrades()', s);
  const t = s.state.trades[0];
  const sigAfter = JSON.parse(s.localStorage.getItem('at_trades_sig'));
  const h = vm.runInContext('atHash(JSON.stringify(' + JSON.stringify(t) + '))', s);
  if (sigAfter['r1'] === h) pass('pulled row is marked clean, so it will not push back');
  else fail('signature mismatch — this row would push straight back: ' + sigAfter['r1'] + ' vs ' + h);
}

console.log('\na local edit not yet pushed is not overwritten');
{
  const local = trade({ id:'t1', netPL: 999, lesson:'my note' });
  // signature records a DIFFERENT earlier version -> local is dirty
  const s = harness({
    localTrades: [local],
    sig: { t1: 'staleHash' },
    remoteRows: [row({ id:'t1', net_pl: 100, updated_at:'2026-11-17T12:00:00Z' })],
  });
  await vm.runInContext('atPullTrades()', s);
  const t = s.state.trades.find(x => x.id === 't1');
  if (t.netPL === 999 && t.lesson === 'my note') pass('unsent local edit survives a newer remote row');
  else fail('local edit was clobbered: netPL=' + t.netPL + ' lesson=' + t.lesson);
}

console.log('\na clean local row takes the remote version');
{
  const local = trade({ id:'t1', netPL: 100 });
  const s0 = harness({});
  const cleanHash = vm.runInContext('atHash(JSON.stringify(' + JSON.stringify(local) + '))', s0);
  const s = harness({
    localTrades: [local], sig: { t1: cleanHash },
    remoteRows: [row({ id:'t1', net_pl: 250, grade:'B' })],
  });
  await vm.runInContext('atPullTrades()', s);
  const t = s.state.trades.find(x => x.id === 't1');
  if (t.netPL === 250 && t.grade === 'B') pass('remote update applied to an unmodified local row');
  else fail('remote update not applied: netPL=' + t.netPL + ' grade=' + t.grade);
  if (s.state.trades.length === 1) pass('updated in place, not duplicated');
  else fail('duplicated: ' + s.state.trades.length + ' rows');
}

console.log('\ntombstones');
{
  const local = trade({ id:'t1' });
  const s0 = harness({});
  const cleanHash = vm.runInContext('atHash(JSON.stringify(' + JSON.stringify(local) + '))', s0);
  const s = harness({
    localTrades: [local, trade({id:'t2'})], sig: { t1: cleanHash },
    remoteRows: [row({ id:'t1', deleted:true })],
  });
  await vm.runInContext('atPullTrades()', s);
  const ids = s.state.trades.map(t => t.id);
  if (JSON.stringify(ids) === JSON.stringify(['t2'])) pass('a remote tombstone removes the local trade');
  else fail('expected [t2], got ' + JSON.stringify(ids));
}
{
  // A trade deleted elsewhere but edited here must NOT vanish.
  const s = harness({
    localTrades: [trade({ id:'t1', lesson:'edited here' })],
    sig: { t1: 'staleHash' },
    remoteRows: [row({ id:'t1', deleted:true })],
  });
  await vm.runInContext('atPullTrades()', s);
  if (s.state.trades.length === 1 && s.state.trades[0].lesson === 'edited here')
    pass('a tombstone does not erase an unsent local edit');
  else fail('unsent edit was deleted by a remote tombstone');
}

console.log('\nincremental pulls');
{
  const store = {};
  let s = harness({ remoteRows: [row({id:'r1', updated_at:'2026-11-17T10:00:00Z'})], store });
  await vm.runInContext('atPullTrades()', s);
  const mark = s.localStorage.getItem('at_pull_at_trades');
  if (mark === '2026-11-17T10:00:00Z') pass('high-water mark recorded: ' + mark);
  else fail('mark wrong: ' + mark);

  s = harness({
    localTrades: s.state.trades,
    sig: JSON.parse(s.localStorage.getItem('at_trades_sig')),
    remoteRows: [row({id:'r1', updated_at:'2026-11-17T10:00:00Z'}),
                 row({id:'r2', updated_at:'2026-11-17T11:00:00Z'})],
    store: { at_pull_at_trades: mark },
  });
  await vm.runInContext('atPullTrades()', s);
  if (s.state.trades.length === 2) pass('second pull fetches only what is newer and adds it');
  else fail('expected 2 trades, got ' + s.state.trades.length);
}

console.log('\nnothing to do');
{
  const s = harness({ localTrades: [trade({id:'t1'})], remoteRows: [] });
  await vm.runInContext('atPullTrades()', s);
  if (s._saved === 0) pass('an empty pull writes nothing');
  else fail('saved on an empty pull');
  if (s.state.trades.length === 1) pass('local trades untouched');
  else fail('local trades changed on an empty pull');
}

console.log('\nwiring');
// The pull must run AFTER the blob reconcile. Adopting a blob replaces state
// wholesale, so pulling first would have the merge thrown away.
{
  const wrap = (html.match(/async function atReconcile\(\)\{[\s\S]*?\n\}/) || [])[0];
  if (!wrap) fail('atReconcile wrapper not found');
  else {
    const iBlob = wrap.indexOf('atReconcileBlob()');
    const iPull = wrap.indexOf('atPullTrades');
    if (iBlob > -1 && iPull > -1 && iBlob < iPull)
      pass('blob reconcile runs before the per-row pulls');
    else fail('ordering wrong: blob at ' + iBlob + ', pull at ' + iPull);
    // Every entity pull must run, and one failing must not stop the rest.
    for (const fn of ['atPullTrades','atPullWithdrawals','atPullOpportunities',
                      'atPullArcherSignals','atPullClassSessions','atPullClassAnalysis']) {
      if (wrap.includes(fn)) pass(fn + ' runs on reconcile');
      else fail(fn + ' is never called');
    }
    if (/catch\s*\(e\)\s*\{\s*console\.warn/.test(wrap))
      pass('a pull failure is logged and does not break sign-in');
    else fail('pull failure is unguarded or silent');
  }
  if (/async function atReconcileBlob\(\)/.test(html)) pass('the original blob logic is preserved as atReconcileBlob');
  else fail('atReconcileBlob missing');
  // Everything that used to call atReconcile() should now get both halves.
  const callers = (html.match(/await atReconcile\(\)/g) || []).length;
  if (callers >= 3) pass(callers + ' call sites get blob + pull');
  else fail('expected the existing call sites to remain, found ' + callers);
}

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
})();
