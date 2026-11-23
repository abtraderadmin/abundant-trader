// Acorn's third format: the daily "Stock Setups" note.
//
// Nothing like the other two. No "Entry Criteria -" labels, no per-idea
// blocks — the levels sit inside a numbered sentence, so direction has to be
// read from the verb. The old parser returned nothing at all and the service
// detector called it "unknown", so a whole format silently fell through to
// symbol-scraping.
//
// All figures invented. This repo is public.
//
//   node tests/acorn-setups.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

const NOTE=`Stock Setups for March 4th, 2027

Market Overview:

The index declined again on heavy volume, with negative money flow and broad
weakness. Oversold conditions suggest a possible short-term bounce.

Key Technical Takeaways:

* Index: bearish.

Stock Setups:

1. AAA (Alpha Corp): Bearish head-and-shoulders with negative money flow. Breakdown below 189.43 on above-average volume, stop at or above 196.03, target 174.67.

2. BBB (Beta Inc): Bullish base. Breakout above 50.00 on above-average volume, stop at or below 46.00, target 62.00.

3. CCC (Gamma Ltd): Aggressive bearish setup with divergence warnings. Breakdown below 182.67 on above-average volume, stop at or above 190.53, target 168.37. Higher risk of consolidation or a false breakdown.
4. DDD (Delta Co): Aggressive bearish setup. Breakdown below 163.83 on above-average volume, stop at or above 172.07, target approximately 143.57.

Previous Setup Updates:

* EEE: Setup remains valid. Entry signal has not yet triggered.
* FFF: Triggered its bearish entry signal last Wednesday. Partial profit-taking may be considered.
* GGG: Remains a bearish setup, with volatility possible ahead of earnings.
`;

console.log('\nit is recognised at all');
t('the detector names this format',()=>{
  assert.strictEqual(w.oreDetectService(NOTE),'acorn_setups','it used to return "unknown"');
});
t('the full-report parser still gets nothing from it, as it should',()=>{
  assert.strictEqual(w.oreParseAcornWealth(NOTE).length,0);
});

console.log('\ndirection comes from the verb');
const ideas=()=>w.oreParseAcornSetups(NOTE);
t('"breakdown below" is a short, "breakout above" is a long',()=>{
  const o=ideas();
  assert.strictEqual(o.length,4);
  assert.strictEqual(o[0].direction,'SHORT');
  assert.strictEqual(o[1].direction,'LONG');
});
t('levels are read out of the sentence',()=>{
  const a=ideas()[0];
  assert.strictEqual(a.ticker,'AAA');
  assert.strictEqual(a.entry,189.43);
  assert.strictEqual(a.stop,196.03);
  assert.strictEqual(a.target1,174.67);
  assert.strictEqual(a.rr,2.24,'14.76 of reward against 6.60 of risk');
});
t('a long is sized the right way round',()=>{
  const b=ideas()[1];
  assert.strictEqual(b.entry,50);
  assert.strictEqual(b.stop,46);
  assert.strictEqual(+b.risk.toFixed(2),4,'entry − stop on a long');
  assert.strictEqual(b.rr,3,'12 of reward against 4 of risk');
});
t('the company name is kept and the pattern is not swallowed by it',()=>{
  const a=ideas()[0];
  assert.strictEqual(a.company,'Alpha Corp');
  assert.match(a.pattern,/head-and-shoulders/);
  assert(!/Breakdown/i.test(a.pattern),'the pattern stops at the entry sentence');
});

console.log('\nthe author’s own hedges are carried, not dropped');
t('an aggressive setup says so',()=>{
  assert.match(ideas()[2].special,/Flagged aggressive/);
});
t('and so does a warning about a false break',()=>{
  assert.match(ideas()[2].special,/higher risk/i);
});
t('an approximate target is not presented as exact',()=>{
  const d=ideas()[3];
  assert.strictEqual(d.targetApprox,true);
  assert.match(d.special,/approximate/i);
  assert.strictEqual(d.target1,143.57,'the number is still used, just labelled');
});

console.log('\nthe update lines');
const ups=()=>w.oreParseSetupUpdates(NOTE);
t('"has not yet triggered" is not a trigger',()=>{
  const e=ups().find(u=>u.ticker==='EEE');
  assert.strictEqual(e.triggered,false,'the word "triggered" is inside the negative');
  assert.strictEqual(e.notTriggered,true);
});
t('a real trigger is caught, with its partial-profit note',()=>{
  const f=ups().find(u=>u.ticker==='FFF');
  assert.strictEqual(f.triggered,true);
  assert.strictEqual(f.partialProfit,true);
});
t('they never become queue rows, having no levels',()=>{
  const tickers=ideas().map(i=>i.ticker);
  ['EEE','FFF','GGG'].forEach(x=>
    assert(tickers.indexOf(x)<0,x+' has no entry or stop and must not be sizable'));
});
t('they update a held idea instead',()=>{
  w.localStorage.setItem('at_v2',JSON.stringify({settings:{},trades:[],
    discoveries:[{id:1,ticker:'FFF',status:'watch',source:'acorn_setups'},
                 {id:2,ticker:'FFF',status:'rejected',source:'acorn_setups'}]}));
  w.loadState();
  assert.strictEqual(w.oreApplySetupUpdates(ups()),1,'only the watched one');
  const d=JSON.parse(w.localStorage.getItem('at_v2')).discoveries;
  assert.strictEqual(d[0].triggered,true);
  assert.match(d[0].sourceNote,/Triggered its bearish entry/);
  assert.ok(d[0].sourceNoteOn);
  assert.strictEqual(d[1].triggered,undefined,'a rejected record is not maintained');
});
t('a later note never un-triggers something that did trigger',()=>{
  w.localStorage.setItem('at_v2',JSON.stringify({settings:{},trades:[],
    discoveries:[{id:1,ticker:'GGG',status:'watch',triggered:true}]}));
  w.loadState();
  w.oreApplySetupUpdates(ups());
  assert.strictEqual(JSON.parse(w.localStorage.getItem('at_v2')).discoveries[0].triggered,true);
});

console.log('\nthe market overview');
t('the bias is counted from the author’s words, not asserted',()=>{
  const ov=w.oreParseMarketOverview(NOTE);
  assert.strictEqual(ov.bias,'bearish');
  assert(ov.bearHits>ov.bullHits);
  assert.strictEqual(ov.dated,'March 4th, 2027');
  assert(!/Key Technical/.test(ov.text),'the overview stops at the next heading');
});
t('a note with no overview says nothing rather than guessing',()=>{
  assert.strictEqual(w.oreParseMarketOverview('Stock Setups:\n1. AAA (X): Breakdown below 5, stop at or above 6, target 4.'),null);
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
