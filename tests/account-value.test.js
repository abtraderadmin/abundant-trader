// The stock account value comes from the broker, not from a typed field.
//
// parseEtradePortfolio has been reading each account's net value and cash line
// into stockHoldings all along and nothing used them, so the figure the whole
// risk budget rests on was maintained by hand -- and drifted thousands of
// dollars inside a fortnight.
//
// The margin case is the one that matters here: a margin account's
// "available for withdrawal" is far larger than its cash because the broker
// will lend against the securities. Net value is equity and is the right
// base. Withdrawable is borrowing capacity and must never reach anything
// that sizes a position.
//
// All figures invented. This repo is public.
//
//   node tests/account-value.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const BLOB='at_v2';

// netValue = securities + cash, which is what the real exports show.
const acct=(name,net,cash,wd,type)=>[name,{acctName:name,accountType:type||'cash',
  cash:cash, ts:'Nov 6 2026 06:41 PM ET', positions:[{symbol:'X',qty:1}],
  summary:{netValue:net,availableForWithdrawal:wd||0}}];

function seed(pairs,over){
  const h={}; (pairs||[]).forEach(p=>{h[p[0]]=p[1];});
  w.localStorage.setItem(BLOB,JSON.stringify({
    settings:Object.assign({stockOptionsAccountValue:0,tradeRiskPct:2,
      maxLossPerTrade:200,capitalCeiling:1500},over||{}),
    trades:[], stockHoldings:h}));
  w.loadState();
  return w.atStockAccountValue();
}

console.log('\nthe broker’s figure, not a typed one');
t('net values across imported accounts are the account value',()=>{
  const v=seed([acct('A',29000,15000),acct('B',17000,1200),acct('C',11000,2600)]);
  assert.strictEqual(v.imported,57000);
  assert.strictEqual(v.cash,18800);
  assert.strictEqual(v.source,'imported');
  assert.strictEqual(v.value,57000);
  assert.strictEqual(v.counted,3);
});
t('and the risk budget is derived from it, not from the typed field',()=>{
  seed([acct('A',40000,10000)],{stockOptionsAccountValue:99999});
  const b=w.atRiskBudget();
  assert.strictEqual(b.acctValue,40000,'the typed 99,999 must not win');
  assert.strictEqual(b.pctBudget,800);
});
t('a stale typed value is named rather than silently ignored',()=>{
  seed([acct('A',40000,10000)],{stockOptionsAccountValue:46000});
  const note=w.atStockAccountValueNote();
  assert.match(note,/\$6,000\.00 higher/);
  assert.match(note,/being ignored/);
});

console.log('\nmargin: equity counts, borrowing capacity does not');
t('withdrawable above cash is borrowable, and it is called that',()=>{
  // The real shape of a margin account: $1,200 cash, $11,472 withdrawable.
  const v=seed([acct('Joint',17000,1200,11472)]);
  const a=v.accounts[0];
  assert.strictEqual(a.cash,1200);
  assert.strictEqual(a.withdrawable,11472);
  assert.strictEqual(a.marginAvail,10272,'the gap is the loan the broker would make');
  assert.strictEqual(a.margin,true);
  // Arrays cross a realm boundary out of jsdom, so compare contents.
  assert.strictEqual(Array.from(v.marginAccounts).join(','),'Joint');
});
t('it never inflates the account value or the cash total',()=>{
  const v=seed([acct('Joint',17000,1200,11472)]);
  assert.strictEqual(v.imported,17000,'net value is equity and is left alone');
  assert.strictEqual(v.cash,1200,'borrowing capacity is not cash');
  assert.strictEqual(w.atRiskBudget().pctBudget,340,'2% of equity, not of buying power');
});
t('the note says outright that nothing sizes from it',()=>{
  seed([acct('Joint',17000,1200,11472)]);
  const note=w.atStockAccountValueNote();
  assert.match(note,/\$10,272\.00 of that is borrowable, not cash/);
  assert.match(note,/nothing here sizes a position from it/);
});
t('a cash account shows no borrowable portion',()=>{
  const v=seed([acct('A',29000,15000,0)]);
  assert.strictEqual(v.accounts[0].margin,false);
  assert.strictEqual(v.marginAvailable,0);
  assert(!/borrowable/.test(w.atStockAccountValueNote()));
});

console.log('\nsimulated money cannot fund a risk budget');
t('paper accounts are excluded and said to be excluded',()=>{
  const v=seed([acct('Real',40000,10000),acct('Paper',500000,500000,0,'paper')]);
  assert.strictEqual(v.imported,40000);
  assert.strictEqual(v.counted,1);
  assert.match(w.atStockAccountValueNote(),/1 paper account excluded/);
});

console.log('\nthe override, and the empty case');
t('ticking the override uses the typed figure again',()=>{
  const v=seed([acct('A',40000,10000)],
    {stockOptionsAccountValue:46000,stockAcctValueManual:true});
  assert.strictEqual(v.source,'typed');
  assert.strictEqual(v.value,46000);
  assert.match(w.atStockAccountValueNote(),/untick the override/);
});
t('with nothing imported and nothing typed it asks',()=>{
  const v=seed([]);
  assert.strictEqual(v.source,'none');
  assert.strictEqual(v.value,0);
  assert.match(w.atStockAccountValueNote(),/Import an E\*TRADE portfolio CSV/);
});
t('the export’s own as-of wording is kept verbatim',()=>{
  assert.strictEqual(seed([acct('A',40000,10000)]).asOf,'Nov 6 2026 06:41 PM ET');
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
