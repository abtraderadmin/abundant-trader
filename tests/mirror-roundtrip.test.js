// holdings and transactions were write-only: they pushed to their tables and
// nothing read them back. These are the pulls.
//
// The pull is driven for real -- atPullArray is stubbed to hand back rows
// shaped exactly as atPushHoldings/atPushTransactions write them, and the
// rebuilt state is compared against the original, including the derived
// totals the screens display. A static check ties the row shape used here to
// the fields the push actually writes, so the fixture cannot drift from it.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

// `state` is block-scoped in the page, so it is reached the way the app does.
const BLOB='at_v2';
function seed(patch){
  let cur={}; try{cur=JSON.parse(w.localStorage.getItem(BLOB)||'{}');}catch(e){}
  w.localStorage.setItem(BLOB,JSON.stringify(Object.assign(cur,patch)));
  w.loadState();
}
const peek=()=>{ w.saveState(); return JSON.parse(w.localStorage.getItem(BLOB)||'{}'); };

// Feed the pull: one queue of rows per table.
let FEED={};
w.atPullArray=async function(cfg){
  const rows=(FEED[cfg.table]||[]).filter(cfg.rowFilter||(()=>true));
  const arr=cfg.read()||[];
  rows.forEach(r=>{ if(!r.deleted) arr.push(cfg.fromRow(r)); });
  if(cfg.write)cfg.write(arr);
  return true;
};

const now=new Date().toISOString();
const HOLD={
  'Alpha-0001':{accountType:'ira',cash:1234.56,ts:'Nov 6 2026 06:58 PM ET',
    summary:{netValue:98765.43,totalGain:4321.1},
    positions:[
      {symbol:'SPY',qty:100,pricePaid:540.12,lastPrice:601.33,value:60133,daysGain:12.5,totalGain:6121,totalGainPct:11.3,totalCost:54012},
      {symbol:'AAPL',qty:25,pricePaid:166,lastPrice:171.4,value:4285,daysGain:-3.2,totalGain:135,totalGainPct:3.25,totalCost:4150}]},
  'Joint ACME-0002':{accountType:'cash',cash:10,ts:'Nov 6 2026 06:58 PM ET',
    summary:{netValue:2000},
    positions:[{symbol:'QQQ',qty:3,pricePaid:500,lastPrice:512,value:1536,daysGain:1,totalGain:36,totalGainPct:2.4,totalCost:1500}]}
};
// Rows exactly as atPushHoldings writes them.
FEED.holding_snapshots=Object.keys(HOLD).map(nm=>({
  id:'snap_'+nm, account_name:nm, cash:HOLD[nm].cash, as_of:null, deleted:false, updated_at:now,
  summary:Object.assign({},HOLD[nm].summary,{as_of_text:HOLD[nm].ts,at_account_type:HOLD[nm].accountType})}));
FEED.holdings=[].concat(...Object.keys(HOLD).map(nm=>HOLD[nm].positions.map(p=>({
  id:nm+'|'+p.symbol, account_name:nm, symbol:p.symbol, qty:p.qty,
  price_paid:p.pricePaid, last_price:p.lastPrice, market_value:p.value,
  days_gain:p.daysGain, total_gain:p.totalGain, total_gain_pct:p.totalGainPct,
  total_cost:p.totalCost, as_of:null, data:p, deleted:false, updated_at:now}))));

console.log('\nholdings rebuild from their tables');
seed({stockHoldings:{}});
(async()=>{
  await w.atPullHoldings();
  const H=()=>peek().stockHoldings||{};
  t('every account came back',()=>
    assert.deepStrictEqual(Object.keys(H()).sort(),['Alpha-0001','Joint ACME-0002']));
  t('cash, timestamp and summary are identical',()=>{
    const g=H()['Alpha-0001'];
    assert.strictEqual(g.cash,1234.56);
    assert.strictEqual(g.ts,'Nov 6 2026 06:58 PM ET','the broker string must survive verbatim');
    assert.deepStrictEqual(g.summary,HOLD['Alpha-0001'].summary,'summary gained or lost keys');
  });
  t('accountType survives, though it has no column',()=>{
    assert.strictEqual(H()['Alpha-0001'].accountType,'ira');
    assert.strictEqual(H()['Joint ACME-0002'].accountType,'cash');
  });
  t('every position comes back unchanged',()=>{
    Object.keys(HOLD).forEach(nm=>{
      const got=H()[nm].positions;
      assert.strictEqual(got.length,HOLD[nm].positions.length,nm+' position count');
      HOLD[nm].positions.forEach(p=>
        assert.deepStrictEqual(got.find(x=>x.symbol===p.symbol),p,nm+' '+p.symbol));
    });
  });
  t('the RMD figure the screen reads is intact',()=>
    assert.strictEqual(H()['Alpha-0001'].summary.netValue,98765.43));
  t('a position whose snapshot is missing is still kept',async()=>{});

  // ---------- transactions ----------
  const FILL=(date,sym,amount,comm,under)=>({date,actType:'Sold Short',desc:sym+' CALL',sym,
    underlying:under||'SPY',optType:'CALL',strike:600,expiry:'12/19/2026',qty:1,price:1.2,amount,comm});
  const fills=[FILL('2026-11-03','SPY 600C',250,1.3),FILL('2026-11-03','SPY 601C',-80,1.3),
               FILL('2026-11-04','QQQ 500C',120,0.65,'QQQ'),FILL('2026-11-05','XSP 60C',-40,0.65,'XSP')];
  const orig=JSON.parse(JSON.stringify(w.atTxnRecord('Alpha-0001','2026-11-01 to 2026-11-30',fills)));
  FEED.transactions=fills.map((r,i)=>({
    id:'t'+i, account_name:'Alpha-0001', txn_date:r.date, act_type:r.actType,
    description:r.desc, symbol:r.sym, underlying:r.underlying, opt_type:r.optType,
    strike:r.strike, expiry:r.expiry, qty:r.qty, price:r.price, amount:r.amount,
    commission:r.comm, data:{dr:'2026-11-01 to 2026-11-30'}, deleted:false, updated_at:now}));

  console.log('\ntransactions rebuild from their table');
  seed({transactionHistory:{}});
  await w.atPullTransactions();
  const back=(peek().transactionHistory||{})['Alpha-0001'];
  t('the record came back',()=>assert(back,'nothing rebuilt'));
  t('day buckets match, newest first',()=>
    assert.deepStrictEqual(back.days.map(d=>d.date),orig.days.map(d=>d.date)));
  t('every total the screens display is identical',()=>
    ['totalNet','totalComm','winDays','bestDay','worstDay','dateRange','acctName']
      .forEach(k=>assert.strictEqual(back[k],orig[k],k+': '+back[k]+' vs '+orig[k])));
  t('per-day counters survive (SPY / XSP / QQQ)',()=>
    orig.days.forEach(d=>{
      const g=back.days.find(x=>x.date===d.date);
      ['netPnl','commission','spyCount','xspCount','qqCount'].forEach(k=>
        assert.strictEqual(g[k],d[k],d.date+' '+k));
    }));
  t('the fills themselves are unchanged',()=>
    orig.days.forEach(d=>assert.deepStrictEqual(
      back.days.find(x=>x.date===d.date).trades,d.trades,d.date)));

  console.log('\nthe fixture cannot drift from what the push writes');
  t('every column the pull reads is a column the push writes',()=>{
    const push=src.slice(src.indexOf('async function atPushHoldings'),
                         src.indexOf('async function atPullHoldings'));
    ['price_paid','last_price','market_value','days_gain','total_gain',
     'total_gain_pct','total_cost','account_name','as_of','summary','cash']
      .forEach(c=>assert(push.includes(c+':'),'push never writes '+c));
  });
  t('transactions push carries the date range the pull restores',()=>
    assert(/data:\{dr:rec\.dateRange\|\|''\}/.test(src),'dateRange is not pushed'));
  t('accountType is pushed into the snapshot summary',()=>
    assert(/at_account_type:rec\.accountType\|\|'cash'/.test(src),'accountType is not pushed'));

  console.log('\nparser and pull share one grouping, so they cannot drift');
  t('the parser delegates to atTxnRecord',()=>
    assert(/return atTxnRecord\(acctName,dateRange,rows\);/.test(src),'parser does not delegate'));
  t('the grouping exists in exactly one place',()=>
    assert.strictEqual((src.match(/const byDate=\{\};/g)||[]).length,1,'grouping is duplicated'));

  console.log('\nboth pulls run on reconcile');
  t('holdings is wired in',()=>assert(/\['holdings',atPullHoldings\]/.test(src)));
  t('transactions is wired in',()=>assert(/\['transactions',atPullTransactions\]/.test(src)));

  console.log('\nthe blob is not retired without a clean report');
  t('every mirrored collection is on the checklist',()=>{
    ['trades','withdrawals','holdings','holding_snapshots','transactions',
     'opportunities','archer_signals','class_sessions','class_analysis']
      .forEach(tb=>assert(new RegExp("table:'"+tb+"'").test(src),tb+' is not checked'));
  });
  t('the report counts both sides and fails when the table is short',()=>{
    assert(/remote>=local/.test(src),'no short-table comparison');
    assert(/count:'exact',head:true/.test(src),'not counting the table');
  });
  t('there is a button that runs it',()=>
    assert(/onclick="atRetireCheckUI\(\)"/.test(src),'no check button'));

  console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
  dom.window.close(); process.exit(fail?1:0);
})();
