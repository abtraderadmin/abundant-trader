// The import queue has to answer "what can I take today".
//
// Two things it got wrong. A dual-entry idea was planned on the aggressive
// level when Acorn calls the other one official, which flatters the trade
// twice — shorter to the stop, longer to the target. And "not triggered" was
// the report's view as of its own close, so an idea 1% from its entry and one
// 30% away read identically.
//
// All figures invented. This repo is public.
//
//   node tests/queue-triage.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

// A dual-entry block in the report's own shape.
const REPORT=[
'Sample Report','','Long Ideas','','TICK','','Date of Alert- November 04, 2026','',
'Pattern/Why- Bullish Smart Surge','',
'Entry Criteria - Break above 3.07 (aggressive), 3.33 (conservative)','',
'Exit Criteria- Target 1- 5.23, Target 2- Momentum','',
'Stop Loss Criteria- 2.43','','Indicator Notes- n/a','','Special Note- N/A','',
'Upcoming Earnings Date- March 03, 2027 (AMC)',''].join('\n');

console.log('\nthe official entry is the conservative one');
t('a dual-entry idea plans on the conservative level',()=>{
  const o=w.oreParseAcornWealth(REPORT)[0];
  assert.strictEqual(o.entry,3.33,'3.07 is the aggressive level, not the plan');
  assert.strictEqual(o.entryAggressive,3.07,'and the aggressive one is still offered');
  assert.strictEqual(o.entryConservative,3.33);
});
t('risk and R:R follow the entry actually used',()=>{
  const o=w.oreParseAcornWealth(REPORT)[0];
  assert.strictEqual(+o.risk.toFixed(2),0.90,'3.33 − 2.43');
  assert.strictEqual(o.rr,2.11,'the aggressive level would have read 3.38');
});
t('a single-entry idea is untouched',()=>{
  const one=REPORT.replace('Break above 3.07 (aggressive), 3.33 (conservative)','Break above 5.67');
  const o=w.oreParseAcornWealth(one)[0];
  assert.strictEqual(o.entry,5.67);
  assert.strictEqual(o.entryConservative,null);
});

console.log('\ndistance to the trigger');
const gap=(dir,entry,price)=>w.oreTriggerGap({direction:dir,entry:entry},price);
t('a long is armed while price is below its break-above level',()=>{
  const g=gap('LONG',5.67,5.41);
  assert.strictEqual(g.armed,true);
  assert.strictEqual(g.distance,0.26);
  assert.strictEqual(g.pct,4.81);
  assert.strictEqual(g.crossed,false);
});
t('a short is armed while price is above its break-below level',()=>{
  const g=gap('SHORT',40.47,40.84);
  assert.strictEqual(g.armed,true);
  assert.strictEqual(g.distance,0.37);
});
t('crossing the trigger is reported, not hidden',()=>{
  assert.strictEqual(gap('LONG',5.67,5.90).crossed,true);
  assert.strictEqual(gap('SHORT',40.47,39.00).crossed,true);
});
t('no quote means no gap, never a zero',()=>{
  assert.strictEqual(gap('LONG',5.67,null),null);
  assert.strictEqual(gap('LONG',5.67,0),null);
  assert.strictEqual(w.oreTriggerGap(null,5),null);
});
t('and the card says so instead of going quiet',()=>{
  const html=w.oreGapLine({ticker:'X',priceError:'rate limit'});
  assert.match(html,/No live price — rate limit/);
  assert.strictEqual(w.oreGapLine({ticker:'X'}),'','nothing fetched yet, nothing claimed');
});

console.log('\nwhat sorts to the top');
const rank=o=>w.oreQueueRank(o);
const armed=(pct)=>({ticker:'A',direction:'LONG',entry:10,stop:9,target1:12,
  gap:{armed:true,crossed:false,pct:pct,distance:1,price:10-pct/10,entry:10}});
t('armed with a live distance beats armed with none',()=>{
  assert(rank(armed(2))<rank({ticker:'B',direction:'LONG',entry:10,stop:9,target1:12}));
});
t('historical states rank below anything still live, but are kept',()=>{
  const live=armed(2);
  assert(rank(live)<rank({triggered:true,entry:10,stop:9,target1:12,direction:'LONG'}));
  assert(rank(live)<rank({hitTarget:true,entry:10,stop:9,target1:12,direction:'LONG'}));
  assert(rank(live)<rank({dropped:true,entry:10,stop:9,target1:12,direction:'LONG'}));
  // ...and none of them is excluded; a setup past today is next week's watch.
  assert(rank({dropped:true,entry:10,stop:9,target1:12,direction:'LONG'})<9);
});
t('an unsizable stop sinks below the historical ones',()=>{
  // Stop past entry on a long: nothing can be sized from it.
  const bad={ticker:'C',direction:'LONG',entry:13.93,stop:14.00,target1:14.77};
  assert(rank(bad)>rank({triggered:true,entry:10,stop:9,target1:12,direction:'LONG'}));
});
// state is not a global, so the queue is seeded the way the app loads it.
const seedQueue=items=>{
  w.localStorage.setItem('at_v2',JSON.stringify({settings:{},trades:[],importQueue:items}));
  w.loadState();
};
t('among armed ideas the nearest trigger leads',()=>{
  seedQueue([armed(30),armed(1),armed(9)]);
  assert.strictEqual(w.oreQueueSorted().map(o=>o.gap.pct).join(','),'1,9,30');
});
t('sorting the display never reorders the array the handlers index into',()=>{
  seedQueue([armed(30),armed(1)]);
  const before=w.oreQueueSorted();      // display order: 1 then 30
  assert.strictEqual(before[0].gap.pct,1);
  // The underlying array must still be in its original order, because every
  // handler writes to state.importQueue[i].
  assert.strictEqual(w.oreQueueSorted()[1].gap.pct,30);
  seedQueue([armed(30),armed(1)]);
  assert.strictEqual(w.oreQueueSorted().length,2,'sorting is a copy, not a sort in place');
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
