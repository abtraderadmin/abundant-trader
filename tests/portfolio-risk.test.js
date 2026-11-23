// Aggregate open risk.
//
// A per-trade cap polices one trade and says nothing about five held at once,
// which is the figure that decides whether a bad week matters. This is the
// backstop that makes a flexible per-trade limit safe.
//
// What it must never do is guess. A position with no stop has no measurable
// risk, and inventing one would turn an honest blank into a confident wrong
// total -- so those are counted and named, not estimated.
//
// All figures invented. This repo is public.
//
//   node tests/portfolio-risk.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const BLOB='at_v2';
let n=0;
const open=(entry,stop,qty,mod)=>({id:'t'+(++n),module:mod||'stock',account:'Alpha',
  date:'2026-11-10',symbol:'X'+n,direction:'LONG',entry,stop,qty,status:'OPEN'});

function seed(trades,over){
  w.localStorage.setItem(BLOB,JSON.stringify({
    settings:Object.assign({stockOptionsAccountValue:40000,tradeRiskPct:2,
      maxLossPerTrade:200,capitalCeiling:1500,maxPortfolioRiskPct:2.5},over||{}),
    trades:trades||[]}));
  w.loadState();
  return w.atPortfolioRisk();
}

console.log('\noff by default, and it says so');
t('no limit set means the gap is named rather than hidden',()=>{
  seed([],{maxPortfolioRiskPct:0});
  const note=w.atPortfolioRiskNote();
  assert.match(note,/No aggregate limit set/);
  assert.match(note,/five at once is five times/,
    'the whole point is that nothing else mentions this');
});

console.log('\nthe total');
t('it adds planned risk across open positions',()=>{
  // $1 of risk x 100, plus $2 x 50 = $200.
  const p=seed([open(50,49,100),open(30,28,50)]);
  assert.strictEqual(p.openRisk,200);
  assert.strictEqual(p.counted,2);
  assert.strictEqual(p.cap,1000,'2.5% of 40,000');
  assert.strictEqual(p.headroom,800);
  assert.strictEqual(p.pctOfAccount,0.5);
});
t('it says how many more trades fit at the per-trade budget',()=>{
  const p=seed([open(50,49,100)]);
  // 1,000 cap − 100 used = 900, at $200 a trade.
  assert.strictEqual(p.slots,4);
});
t('closed trades are history, not exposure',()=>{
  const c=open(50,49,100); c.status='CLOSED';
  assert.strictEqual(seed([c]).openRisk,0);
});
t('futures are left out — they have their own drawdown rules',()=>{
  assert.strictEqual(seed([open(5000,4990,2,'futures')]).openRisk,0);
});

console.log('\nit never invents a stop');
t('a position with no stop is counted and named, not estimated',()=>{
  const p=seed([open(50,49,100),open(30,null,50),open(20,0,10)]);
  assert.strictEqual(p.openRisk,100,'only the one with a real stop');
  assert.strictEqual(p.counted,1);
  assert.strictEqual(p.unmeasured,2);
  assert.match(w.atPortfolioRiskNote(),/2 open positions have no stop recorded/);
});
t('a stop equal to entry measures nothing, so it is unmeasured too',()=>{
  const p=seed([open(50,50,100)]);
  assert.strictEqual(p.openRisk,0);
  assert.strictEqual(p.unmeasured,1);
});

console.log('\nover the line');
t('being over is stated as an amount, not a colour',()=>{
  const p=seed([open(50,40,200)]);   // $10 x 200 = $2,000 against a $1,000 cap
  assert.strictEqual(p.openRisk,2000);
  assert.strictEqual(p.over,true);
  assert.strictEqual(p.slots,0,'no room for another');
  assert.match(w.atPortfolioRiskNote(),/over by \$1,000\.00/);
});
t('the cap follows the account, so it cannot go stale',()=>{
  assert.strictEqual(seed([],{stockOptionsAccountValue:80000}).cap,2000);
  assert.strictEqual(seed([],{stockOptionsAccountValue:20000}).cap,500);
});
t('with no account value it asks instead of assuming one',()=>{
  seed([],{stockOptionsAccountValue:0});
  assert.match(w.atPortfolioRiskNote(),/Set your account value/);
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
