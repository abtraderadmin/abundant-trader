// Capital-capped positions, and whether options could carry what was dropped.
//
// The ceiling limits position size, not risk, so a wide-stop idea can be cut
// below what the risk budget allowed. The exposure given up might be reachable
// through options for a fraction of the capital -- but the thing that decides
// it is a quote, and a quote cannot be invented. So the check computes the one
// figure that settles it without a chain: the most you could pay per share and
// still be inside the same risk budget.
//
// All figures invented. This repo is public.
//
//   node tests/capital-capped-options.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const BLOB='at_v2';

function settings(over){
  w.localStorage.setItem(BLOB,JSON.stringify({
    settings:Object.assign({stockOptionsAccountValue:40000,tradeRiskPct:2,
      maxLossPerTrade:200,capitalCeiling:1500,minRR:1.5},over||{}),
    trades:[]}));
  w.loadState();
}
// A capital-capped long: $200 of risk buys 285 shares at $0.70 of risk each,
// but $1,500 of capital only buys 264 at $5.67.
const CAPPED={dir:'LONG',entry:5.67,stop:4.97,target:7.33,
              sizedBy:'capital',byRisk:285,byCap:264,shares:264};

console.log('\nthe setting that was being ignored');
t('the capital ceiling in Settings now actually sizes a position',()=>{
  settings({capitalCeiling:3000});
  assert.strictEqual(w.atRiskBudget().ceiling,3000,
    'three sizing sites read maxCapitalPerTrade, which nothing ever wrote');
});

console.log('\nit only speaks when capital is what bound the trade');
t('a risk-capped idea gets no options block',()=>{
  settings();
  assert.strictEqual(w.atOptionsAlternative(
    Object.assign({},CAPPED,{sizedBy:'risk'})),null);
  assert.strictEqual(w.atOptionsAlternativeHtml(
    Object.assign({},CAPPED,{sizedBy:'risk'})),'');
});
t('nor does one where the ceiling cost nothing',()=>{
  settings();
  assert.strictEqual(w.atOptionsAlternative(
    Object.assign({},CAPPED,{byRisk:200,byCap:264})),null,
    'no exposure was given up, so there is nothing to recover');
});

console.log('\nthe arithmetic');
t('it sizes contracts to the exposure RISK allowed, not what the ceiling left',()=>{
  settings();
  const a=w.atOptionsAlternative(CAPPED);
  assert.strictEqual(a.want,285);
  assert.strictEqual(a.have,264);
  assert.strictEqual(a.shortfall,21);
  assert.strictEqual(a.contracts,3,'285 shares needs 3 contracts, not 2');
  assert.strictEqual(a.controlled,300);
});
t('the affordable premium keeps the same risk budget, to the cent',()=>{
  settings();
  const a=w.atOptionsAlternative(CAPPED);
  // $200 across 300 shares.
  assert.strictEqual(a.maxPremShare,0.6667);
  assert.strictEqual(a.maxPremContract,66.67);
  assert.strictEqual(a.pctOfUnderlying,11.76,'% of the underlying is what makes it judgeable');
});
t('a bigger budget buys a bigger premium, not a bigger risk',()=>{
  settings({maxLossPerTrade:600});
  const a=w.atOptionsAlternative(CAPPED);
  assert.strictEqual(a.budget,600);
  assert.strictEqual(a.maxPremShare,2);
  assert.strictEqual(a.contracts,3,'the exposure target has not changed');
});
t('a put is named for a short, a call for a long',()=>{
  settings();
  assert.strictEqual(w.atOptionsAlternative(CAPPED).kind,'call');
  const short=w.atOptionsAlternative({dir:'SHORT',entry:40.47,stop:43.77,target:33.53,
    sizedBy:'capital',byRisk:60,byCap:37,shares:37});
  assert.strictEqual(short.kind,'put');
  assert.strictEqual(short.contracts,1);
  assert.strictEqual(short.maxPremShare,2,'$200 across 100 shares');
});
t('the strike is the halfway strike, both directions',()=>{
  settings();
  assert.strictEqual(w.atOptionsAlternative(CAPPED).strike,6.50,'5.67 → 7.33');
  const short=w.atOptionsAlternative({dir:'SHORT',entry:40.47,stop:43.77,target:33.53,
    sizedBy:'capital',byRisk:60,byCap:37,shares:37});
  assert.strictEqual(short.strike,37.00,'40.47 → 33.53');
});

console.log('\nwhat it refuses to do');
t('it states no verdict, because it has no quote',()=>{
  settings();
  const html=w.atOptionsAlternativeHtml(CAPPED);
  assert.match(html,/Check the chain/,'the chain decides, not this');
  assert(!/recommend|should buy|better trade/i.test(html),
    'a verdict without a premium would be a guess dressed as governance: '+html);
});
t('it says plainly that the loss stops being stop-sized',()=>{
  settings();
  const html=w.atOptionsAlternativeHtml(CAPPED);
  assert.match(html,/loses the whole premium/);
  assert.match(html,/capital limit for a deadline/,
    'the swap is capital for time, and the card has to say so');
});
t('it never claims the option is less risk',()=>{
  settings();
  const html=w.atOptionsAlternativeHtml(CAPPED);
  assert(!/safer|less risk|lower risk/i.test(html),html);
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
