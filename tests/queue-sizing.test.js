// The import queue has to obey the same rules as everything else.
//
// It sized on risk alone and ignored the capital ceiling, so the same idea
// came back differently depending on which screen asked: 285 shares and
// $1,615.95 of capital from the queue, against a $1,500 limit the setups card
// enforced and Settings says is in force. One engine obeying a rule and
// another ignoring it is worse than either answer alone.
//
// And because sizedBy was never 'capital' there, the capital-capped options
// check could never appear on the screen where ideas actually arrive.
//
// All figures invented. This repo is public.
//
//   node tests/queue-sizing.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

function seed(over){
  w.localStorage.setItem('at_v2',JSON.stringify({
    settings:Object.assign({stockOptionsAccountValue:40000,tradeRiskPct:2,
      maxLossPerTrade:200,capitalCeiling:1500,minRR:1.5},over||{}),
    trades:[],discoveries:[],importQueue:[]}));
  w.loadState();
}
const idea=(o)=>Object.assign({ticker:'T',direction:'LONG',entry:5.67,stop:4.97,
  target1:7.33,earnings:''},o||{});

console.log('\nthe capital ceiling applies here too');
t('a position that would exceed the ceiling is cut to it',()=>{
  seed();
  const m=w.oreQueueMath(idea());
  assert.strictEqual(m.byRisk,285,'$200 of risk at $0.70 a share');
  assert.strictEqual(m.byCap,264,'$1,500 at $5.67 a share');
  assert.strictEqual(m.shares,264,'the tighter limit wins');
  assert.strictEqual(+m.capital.toFixed(2),1496.88,'under the ceiling, not 1,615.95');
  assert.strictEqual(m.sizedBy,'capital');
});
t('a position inside the ceiling is still sized on risk',()=>{
  seed();
  const m=w.oreQueueMath(idea({entry:3.33,stop:2.43,target1:5.23}));
  assert.strictEqual(m.shares,222);
  assert.strictEqual(m.sizedBy,'risk');
  assert(m.capital<1500);
});
t('risk comes in under budget when capital is the binding limit',()=>{
  seed();
  const m=w.oreQueueMath(idea());
  assert.strictEqual(+m.totalRisk.toFixed(2),184.80,'not the full $200 — and that is the point');
});
t('raising the ceiling lets risk bind again',()=>{
  seed({capitalCeiling:5000});
  const m=w.oreQueueMath(idea());
  assert.strictEqual(m.shares,285);
  assert.strictEqual(m.sizedBy,'risk');
});
t('a manual share count is labelled as the override it is',()=>{
  seed();
  assert.strictEqual(w.oreQueueMath(idea({sharesOverride:50})).sizedBy,'manual');
});
t('an unsizable stop still computes nothing',()=>{
  seed();
  const m=w.oreQueueMath(idea({entry:13.93,stop:14.00,target1:14.77}));
  assert.strictEqual(m.valid,false);
  assert.strictEqual(m.shares,null);
  assert.strictEqual(m.byCap,null,'no sizing from a negative risk, by any route');
});
t('and being capital-capped now reaches the options check',()=>{
  seed();
  const m=w.oreQueueMath(idea());
  const alt=w.atOptionsAlternative(m);
  assert.ok(alt,'this returned null from the queue before, whatever the size');
  assert.strictEqual(alt.want,285);
  assert.strictEqual(alt.have,264);
  assert.strictEqual(alt.contracts,3);
});

console.log('\nearnings become a number, not a caption');
const days=(s,today)=>w.oreEarningsDays(s,today);
t('the report’s date format is read',()=>{
  assert.strictEqual(days('December 01, 2026 (AMC)','2026-11-23'),8);
  assert.strictEqual(days('February 25, 2027 (BMO)','2026-11-23'),94);
});
t('a date already past reads as negative and is not flagged',()=>{
  assert.strictEqual(days('November 04, 2026','2026-11-23'),-19);
  assert.strictEqual(w.oreEarningsFlag({earnings:'November 04, 2026'},'2026-11-23'),'');
});
t('inside ten days is called out as a gap risk',()=>{
  const f=w.oreEarningsFlag({earnings:'December 01, 2026 (AMC)'},'2026-11-23');
  assert.match(f,/Earnings in <strong>8 days<\/strong>/);
  assert.match(f,/does not ask your stop/,'a stop is no defence against a gap');
});
t('a date far out is left alone',()=>{
  assert.strictEqual(w.oreEarningsFlag({earnings:'February 25, 2027 (BMO)'},'2026-11-23'),'');
});
t('N/A and nonsense are silent, never guessed',()=>{
  assert.strictEqual(days('N/A'),null);
  assert.strictEqual(days(''),null);
  assert.strictEqual(days('Smarch 40, 2026'),null);
  assert.strictEqual(w.oreEarningsFlag({earnings:'N/A'}),'');
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
