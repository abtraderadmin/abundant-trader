#!/usr/bin/env node
// Ledger mirrors: withdrawals · holdings · holding_snapshots · transactions.
//
// These are a MIRROR. The blob stays authoritative, so a mirror failure must
// never break a save, and re-importing the same broker export must not create
// duplicate rows.
//
//   node tests/ledger-mirrors.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

const grab = n => (html.match(new RegExp('(?:async )?function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0];
const names = ['atHash','atSigGet','atSigSet','atPushRows','atAcctId','atNum','atDate','atTs',
               'atPushWithdrawals','atPushHoldings','atPushTransactions'];
const src = names.map(grab);
const missing = names.filter((n,i) => !src[i]);
if (missing.length) { console.error('could not extract: ' + missing.join(', ')); process.exit(1); }

function harness(state, store) {
  const sent = {};
  const sandbox = {
    state,
    atUser: { id: 'u1' },
    console: { log(){}, warn(){} },
    localStorage: {
      _d: store || {},
      getItem(k){ return this._d[k] || null; },
      setItem(k,v){ this._d[k] = v; },
    },
    atAccountIdByName: nm => ({ 'Yaz-3036': 'acct-1', 'Joint JTWROS-7264': 'acct-2' }[nm] || null),
    atSbReady: () => ({
      from(table) {
        return { upsert(rows) { (sent[table] = sent[table] || []).push(...rows); return Promise.resolve({ error: null }); } };
      },
    }),
    sent,
  };
  vm.createContext(sandbox);
  vm.runInContext(src.join('\n'), sandbox);
  return sandbox;
}

(async () => {

console.log('\nwithdrawals');
let s = harness({
  withdrawals: [
    { id: 'w1', date: '2026-11-10', account: 'Yaz-3036', amount: 500, note: 'payout' },
    { id: 'w2', date: '2026-11-12', account: 'Unknown Acct', amount: 250, note: '' },
  ],
});
await vm.runInContext('atPushWithdrawals()', s);
let rows = s.sent.withdrawals || [];
if (rows.length === 2) pass('both withdrawals sent');
else fail('expected 2, got ' + rows.length);
const w1 = rows.find(r => r.id === 'w1');
if (w1 && w1.account_id === 'acct-1' && w1.account_name === 'Yaz-3036') pass('account resolved to its id');
else fail('account_id wrong: ' + JSON.stringify(w1));
if (w1 && w1.amount === 500 && w1.wd_date === '2026-11-10') pass('amount and date carried');
else fail('fields wrong: ' + JSON.stringify(w1));
const w2 = rows.find(r => r.id === 'w2');
if (w2 && w2.account_id === null && w2.account_name === 'Unknown Acct')
  pass('an unmatched account keeps its name with a null id rather than dropping');
else fail('unmatched account handling: ' + JSON.stringify(w2));

console.log('\nchange detection');
const store = {};
s = harness({ withdrawals: [{ id: 'w1', date: '2026-11-10', account: 'Yaz-3036', amount: 500 }] }, store);
await vm.runInContext('atPushWithdrawals()', s);
const first = (s.sent.withdrawals || []).length;
s = harness({ withdrawals: [{ id: 'w1', date: '2026-11-10', account: 'Yaz-3036', amount: 500 }] }, store);
await vm.runInContext('atPushWithdrawals()', s);
const second = (s.sent.withdrawals || []).length;
if (first === 1 && second === 0) pass('unchanged rows are not resent');
else fail('expected 1 then 0, got ' + first + ' then ' + second);

s = harness({ withdrawals: [{ id: 'w1', date: '2026-11-10', account: 'Yaz-3036', amount: 600 }] }, store);
await vm.runInContext('atPushWithdrawals()', s);
if ((s.sent.withdrawals || []).length === 1) pass('an edited row is resent');
else fail('edit not detected');

console.log('\ntombstones carry NOT NULL columns');
// PostgREST unions the column set across a batch and sends NULL for any key a
// row omits. A tombstone that leaves out a NOT NULL jsonb column fails the
// whole batch with 23502 — which is what happened the moment an account
// rename changed every holdings id at once.
{
  const hStore = {};
  let h = harness({
    stockHoldings: { 'Yaz -3036': { ts: 'Nov 6 2026 06:58 PM ET', cash: 1, summary: { a: 1 },
                                    positions: [{ symbol: 'SHOP', qty: 1, value: 2 }] } },
  }, hStore);
  await vm.runInContext('atPushHoldings()', h);
  // rename: same data, new account key -> old ids must tombstone
  h = harness({
    stockHoldings: { 'Yaz-3036': { ts: 'Nov 6 2026 06:58 PM ET', cash: 1, summary: { a: 1 },
                                   positions: [{ symbol: 'SHOP', qty: 1, value: 2 }] } },
  }, hStore);
  await vm.runInContext('atPushHoldings()', h);
  const tomb = (h.sent.holdings || []).filter(r => r.deleted === true);
  if (tomb.length === 1 && tomb[0].id === 'Yaz -3036|SHOP')
    pass('the renamed-away holding is tombstoned');
  else fail('expected one tombstone for the old id, got ' + JSON.stringify(tomb.map(r => r.id)));
  if (tomb[0] && tomb[0].data !== undefined && tomb[0].data !== null)
    pass('tombstone carries data:{} so the NOT NULL column is not sent as null');
  else fail('tombstone omits data — the batch would fail with 23502');
  const snapTomb = (h.sent.holding_snapshots || []).filter(r => r.deleted === true);
  if (snapTomb[0] && snapTomb[0].summary !== undefined && snapTomb[0].summary !== null)
    pass('snapshot tombstone carries summary:{}');
  else fail('snapshot tombstone omits summary');
}

console.log('\ntombstones');
s = harness({ withdrawals: [] }, store);
await vm.runInContext('atPushWithdrawals()', s);
const gone = (s.sent.withdrawals || [])[0];
if (gone && gone.id === 'w1' && gone.deleted === true)
  pass('a deleted withdrawal becomes a tombstone, not a disappearance');
else fail('no tombstone: ' + JSON.stringify(gone));

console.log('\nholdings (real E-Trade export shape)');
// Taken verbatim from the live blob. ts is a DISPLAY STRING, not a timestamp,
// and the value column is `value` not `marketValue`. Both of these broke the
// first version of this mirror: new Date(ts).toISOString() threw RangeError,
// the push path's empty catch swallowed it, and all 39 positions across 3
// accounts silently failed to sync for two days.
s = harness({
  stockHoldings: {
    'Yaz-3036': {
      acctName: 'Yaz-3036',
      ts: 'Nov 6 2026 06:58 PM ET',
      cash: 1200.5,
      summary: { netValue: 50000 },
      positions: [
        { symbol:'SHOP', qty:30, value:4467.3, change:5.16, ytdGain:-361.8, daysGain:154.8,
          changePct:3.59, lastPrice:148.91, pricePaid:98.1307, totalCost:2943.92,
          totalGain:1523.38, ytdGainPct:-7.49, costPerShare:98.1307, totalGainPct:51.7467 },
        { symbol:'MSFT', qty:5, value:2100, lastPrice:420, pricePaid:400, totalCost:2000 },
      ],
    },
  },
});
// A throw inside the mirror must be reported as a failure, not crash the
// suite and skip everything after it.
try { await vm.runInContext('atPushHoldings()', s); }
catch (e) { fail('atPushHoldings threw on the real export shape: ' + e.message); }
if ((s.sent.holdings || []).length === 2) pass('one row per position');
else fail('expected 2 positions, got ' + (s.sent.holdings || []).length);
const shop = (s.sent.holdings || []).find(r => r.symbol === 'SHOP');
if (shop && shop.id === 'Yaz-3036|SHOP' && shop.account_id === 'acct-1')
  pass('holding id is account|symbol, so a re-import overwrites in place');
else fail('holding id wrong: ' + JSON.stringify(shop && shop.id));
if (shop && shop.qty === 30 && shop.market_value === 4467.3)
  pass('market_value reads the export\'s `value` field');
else fail('market_value wrong (expected 4467.3): ' + JSON.stringify(shop && shop.market_value));
if (shop && shop.price_paid === 98.1307 && shop.total_gain === 1523.38 && shop.total_cost === 2943.92)
  pass('cost basis and gains carried');
else fail('position fields wrong: ' + JSON.stringify(shop));
// The timezone word is dropped, so this is read in the local zone and is
// approximate. It is used for ordering; summary.as_of_text below is the record.
if (shop && /^2026-11-06T/.test(shop.as_of))
  pass('broker display string parses to a usable date (' + shop.as_of + ')');
else fail('as_of should parse to Nov 6 2026, got ' + (shop && shop.as_of));
const snap = (s.sent.holding_snapshots || [])[0];
if (snap && snap.cash === 1200.5 && snap.summary.netValue === 50000)
  pass('account cash and summary go to holding_snapshots');
else fail('snapshot wrong: ' + JSON.stringify(snap));
if (snap && snap.summary.as_of_text === 'Nov 6 2026 06:58 PM ET')
  pass('the broker\'s own wording is kept rather than discarded');
else fail('as_of_text missing: ' + JSON.stringify(snap && snap.summary));

console.log('\ntimestamps never throw');
const tsCases = [
  ['Nov 6 2026 06:58 PM ET', 'display string with a timezone word'],
  ['', 'empty string'], [null, 'null'], [undefined, 'undefined'],
  ['not a date at all', 'nonsense'], [NaN, 'NaN'], [0, 'zero'],
  [1763000000000, 'epoch millis'], ['2026-11-06T18:58:00Z', 'ISO'],
];
for (const [val, label] of tsCases) {
  try {
    const out = vm.runInContext('atTs(' + JSON.stringify(val === undefined ? null : val) + ')', s);
    pass(label + ' → ' + (out === null ? 'null' : out));
  } catch (e) { fail(label + ' threw: ' + e.message); }
}

console.log('\ntransactions');
const txnState = () => ({
  transactionHistory: {
    'Yaz-3036': {
      days: [{
        date: '2026-11-10',
        trades: [
          { date: '2026-11-10', actType: 'Bought', desc: 'SPY CALL', sym: 'SPY  261110C00600000',
            underlying: 'SPY', optType: 'C', strike: 600, expiry: '2026-11-10',
            qty: 1, price: 2.5, amount: -250, comm: 0.65 },
          { date: '2026-11-10', actType: 'Sold', desc: 'SPY CALL', sym: 'SPY  261110C00600000',
            underlying: 'SPY', optType: 'C', strike: 600, expiry: '2026-11-10',
            qty: -1, price: 3.1, amount: 310, comm: 0.65 },
        ],
      }],
    },
  },
});
const txnStore = {};
s = harness(txnState(), txnStore);
await vm.runInContext('atPushTransactions()', s);
rows = s.sent.transactions || [];
if (rows.length === 2) pass('nested day rows flattened to transaction rows');
else fail('expected 2, got ' + rows.length);
if (rows[0] && rows[0].underlying === 'SPY' && rows[0].commission === 0.65 && rows[0].amount === -250)
  pass('transaction fields carried');
else fail('txn fields wrong: ' + JSON.stringify(rows[0]));
if (rows[0] && rows[1] && rows[0].id !== rows[1].id)
  pass('two similar rows on the same day get distinct ids');
else fail('id collision between rows on the same day');

// The thing that actually matters: re-importing the same export.
s = harness(txnState(), txnStore);
await vm.runInContext('atPushTransactions()', s);
if ((s.sent.transactions || []).length === 0)
  pass('re-importing the same export sends nothing — no duplicates');
else fail('re-import produced ' + (s.sent.transactions || []).length + ' rows');

console.log('\nsafety');
const bare = harness({});
let threw = false;
try { await vm.runInContext('atPushWithdrawals()', bare); await vm.runInContext('atPushHoldings()', bare); await vm.runInContext('atPushTransactions()', bare); }
catch (e) { threw = true; fail('threw on empty state: ' + e.message); }
if (!threw) pass('empty state does not throw');

// The mirrors must be driven from the push path, must not be able to break a
// save, and must not fail silently — an empty catch hid a RangeError here for
// two days while every holdings row failed to sync.
// Fixed window from the anchor: a non-greedy terminator stops at the inner
// r.catch(...) and misses the outer sync catch entirely.
const wAt = html.indexOf("[['accounts',atPushAccounts");
const wiring = wAt === -1 ? null : html.slice(wAt, wAt + 1200);
if (!wiring) fail('mirrors are not wired into the push path');
else {
  for (const n of ['atPushWithdrawals','atPushHoldings','atPushTransactions'])
    if (wiring.includes(n)) pass(n + ' is driven from the push path');
    else fail(n + ' is not in the push path');
  // Since the blob was retired the mirrors ARE the save, so a failure has to
  // be awaited and surfaced, not merely logged. One catch now covers a sync
  // throw and a rejected promise alike, because each call is wrapped in
  // Promise.resolve().then(...).
  if (/Promise\.resolve\(\)[\s\S]{0,80}?\.catch\(function\(e\)\{/.test(wiring))
    pass('a throw and a rejection are both caught');
  else fail('mirror failures are not caught');
  if (/failed\.push\(pair\[0\]\)/.test(wiring) && /console\.warn\('\[AT\] '\+pair\[0\]/.test(wiring))
    pass('the failing mirror is named, and recorded for the caller');
  else fail('a failure is not recorded or not named');
  if (/await Promise\.all\(mirrors\.map/.test(wiring))
    pass('every mirror is awaited, so a failure cannot be missed');
  else fail('mirrors are fire-and-forget — a failure would go unnoticed');
  if (/catch/.test(wiring))
    pass('still guarded, so a mirror failure cannot break a save');
  else fail('unguarded — a mirror failure could break a save');
}

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
})();
