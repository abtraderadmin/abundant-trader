// Hold for review, then enter.
//
// Both buttons were already on the import card — Watchlist and Buy — but the
// first led nowhere. The import path wrote entry/stop/target flat while the
// watchlist's Trade button only looked at stockScenario, so an idea held for
// review could be looked at and never acted on. And the row carried the
// levels without a price, which makes a watchlist a list of numbers that
// cannot tell you when something is near.
//
// All figures invented. This repo is public.
//
//   node tests/hold-for-review.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

const IDEA={ticker:'GFL',direction:'SHORT',entry:40.47,stop:43.77,target1:33.53,
  pattern:'Bearish Smart Surge',headerNote:'',triggered:false,hitTarget:false,
  statusDate:'',entryAggressive:null,entryConservative:null,stopValid:true,
  livePrice:40.84,livePriceDay:'2026-11-20',
  gap:{armed:true,crossed:false,price:40.84,entry:40.47,distance:0.37,pct:0.91},
  status:'queued',queueId:'q1'};

function seed(extra){
  w.localStorage.setItem('at_v2',JSON.stringify({
    settings:{stockOptionsAccountValue:40000,tradeRiskPct:2,maxLossPerTrade:200,
      capitalCeiling:1500,minRR:1.5},
    trades:[],discoveries:[],importQueue:[Object.assign({},IDEA,extra||{})]}));
  w.loadState();
}
const held=()=>JSON.parse(w.localStorage.getItem('at_v2')).discoveries[0];

console.log('\nholding it for review');
t('Watchlist moves it out of the queue and into discoveries',()=>{
  seed();
  w.oreQueueDecision(0,'watch');
  const d=held();
  assert.strictEqual(d.ticker,'GFL');
  assert.strictEqual(d.status,'watch');
  assert.strictEqual(JSON.parse(w.localStorage.getItem('at_v2')).importQueue.length,0);
});
t('the plan survives in the shape the Trade button reads',()=>{
  seed();
  w.oreQueueDecision(0,'watch');
  const d=held();
  assert.ok(d.stockScenario,'without this the held idea is a dead end');
  assert.strictEqual(d.stockScenario.entry,40.47);
  assert.strictEqual(d.stockScenario.stop,43.77);
  assert.strictEqual(d.stockScenario.direction,'SHORT');
  assert.ok(d.stockScenario.shares>0);
});
t('price means the market, not the entry level',()=>{
  seed();
  w.oreQueueDecision(0,'watch');
  assert.strictEqual(held().price,40.84,'it used to store the entry under this name');
  assert.strictEqual(held().entry,40.47);
});
t('and the report’s own view of it is kept',()=>{
  seed({triggered:true,statusDate:'November 18, 2026',entryAggressive:3.07});
  w.oreQueueDecision(0,'watch');
  const d=held();
  assert.strictEqual(d.triggered,true);
  assert.strictEqual(d.statusDate,'November 18, 2026');
  assert.strictEqual(d.entryAggressive,3.07);
});

console.log('\nthen entering it');
t('a held idea offers the Trade button',()=>{
  seed();
  w.oreQueueDecision(0,'watch');
  w.renderDiscoveries();
  const html=w.document.getElementById('ore-wl-body').innerHTML;
  assert.match(html,/oreDiscoveryToStock/,'this is what was missing');
  assert.match(html,/GFL/);
});
// oreDiscoveryToStock switches screen first and fills on the next tick, so
// this one has to wait for it.
const ta=[];
ta.push(['and it fills the stock form from the flat shape too',async()=>{
  seed();
  w.oreQueueDecision(0,'watch');
  // Strip the analyzer shape so only the flat fields remain — this is the
  // record the import used to write, and the one that could not be traded.
  const blob=JSON.parse(w.localStorage.getItem('at_v2'));
  delete blob.discoveries[0].stockScenario;
  w.localStorage.setItem('at_v2',JSON.stringify(blob));
  w.loadState();
  w.oreDiscoveryToStock(blob.discoveries[0].id);
  await new Promise(r=>setTimeout(r,120));
  assert.strictEqual(w.document.getElementById('s-ticker').value,'GFL');
  assert.strictEqual(parseFloat(w.document.getElementById('s-entry').value),40.47);
  assert.strictEqual(parseFloat(w.document.getElementById('s-stop').value),43.77);
}]);

console.log('\nstaying current while it is held');
t('the row says how far price is from the entry',()=>{
  const line=w.oreWatchGapLine({ticker:'GFL',direction:'SHORT',entry:40.47,
    livePrice:40.84,livePriceAt:'2026-11-20'});
  assert.match(line,/0\.37 \(0\.9%\) from 40\.47/);
  assert.match(line,/as of 2026-11-20/,'a price with no age is a trap');
});
t('crossing the entry while held is called out',()=>{
  const line=w.oreWatchGapLine({ticker:'GFL',direction:'SHORT',entry:40.47,livePrice:39.00});
  assert.match(line,/past the 40\.47 trigger/);
});
t('no price yet says so instead of showing nothing',()=>{
  const line=w.oreWatchGapLine({ticker:'GFL',direction:'SHORT',entry:40.47});
  assert.match(line,/no price yet/);
  assert.match(line,/Refresh prices/);
});
t('an entry-less note stays quiet',()=>{
  assert.strictEqual(w.oreWatchGapLine({ticker:'X'}),'');
  assert.strictEqual(w.oreWatchGapLine(null),'');
});
t('the refresh control is on the watchlist',()=>{
  assert.match(src,/id="ore-wl-refresh"[\s\S]{0,200}oreWatchlistPrices\(\)/);
});

(async()=>{
  for(const [m,fn] of ta){
    try{ await fn(); console.log('  ok   '+m); }
    catch(e){ fail++; console.log('  FAIL '+m+'\n       '+e.message); }
  }
  console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
  process.exit(fail?1:0);
})();
