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
const names = ['atHash','atSigGet','atSigSet','atPushRows','atAcctId','atNum','atDate',
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

console.log('\ntombstones');
s = harness({ withdrawals: [] }, store);
await vm.runInContext('atPushWithdrawals()', s);
const gone = (s.sent.withdrawals || [])[0];
if (gone && gone.id === 'w1' && gone.deleted === true)
  pass('a deleted withdrawal becomes a tombstone, not a disappearance');
else fail('no tombstone: ' + JSON.stringify(gone));

console.log('\nholdings');
s = harness({
  stockHoldings: {
    'Yaz-3036': {
      ts: 1763000000000, cash: 1200.5,
      summary: { netValue: 50000 },
      positions: [
        { symbol: 'AAPL', qty: 10, pricePaid: 180, lastPrice: 200, marketValue: 2000, totalCost: 1800 },
        { symbol: 'MSFT', qty: 5,  pricePaid: 400, lastPrice: 420, marketValue: 2100, totalCost: 2000 },
      ],
    },
  },
});
await vm.runInContext('atPushHoldings()', s);
if ((s.sent.holdings || []).length === 2) pass('one row per position');
else fail('expected 2 positions, got ' + (s.sent.holdings || []).length);
const aapl = (s.sent.holdings || []).find(r => r.symbol === 'AAPL');
if (aapl && aapl.id === 'Yaz-3036|AAPL' && aapl.account_id === 'acct-1')
  pass('holding id is account|symbol, so a re-import overwrites in place');
else fail('holding id wrong: ' + JSON.stringify(aapl && aapl.id));
if (aapl && aapl.qty === 10 && aapl.market_value === 2000) pass('position figures carried');
else fail('position fields wrong');
const snap = (s.sent.holding_snapshots || [])[0];
if (snap && snap.cash === 1200.5 && snap.summary.netValue === 50000)
  pass('account cash and summary go to holding_snapshots');
else fail('snapshot wrong: ' + JSON.stringify(snap));

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

if (/try\{if\(typeof atPushWithdrawals==='function'\)atPushWithdrawals\(\);\}catch\(e\)\{\}/.test(html))
  pass('wired into the push path inside try/catch — a mirror failure cannot break a save');
else fail('not wired, or not guarded');

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
})();
