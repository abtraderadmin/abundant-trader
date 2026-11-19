// Calculation Registry 4.1-4.4 — the Access database options logic.
// Guards the three places the app used to deviate from the registry.
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
let fail=0;
const ok=(m)=>console.log('  ok   '+m);
const bad=(m,e)=>{fail++;console.log('  FAIL '+m+'\n       '+e);};
const t=(m,fn)=>{try{fn();ok(m);}catch(e){bad(m,e.message);}};

console.log('\nPoints is half the move (Access expression)');
t('the Put branch is not gated on a $20 stock price',()=>{
  // Access reads: IIf([StockType]="Put" And [Stock Price]>20, ...). That gate
  // sends every sub-$20 or blank-priced put through the Call form backwards.
  // Strike Price has no such gate, so the two disagreed. Not reproduced.
  assert(!/priceNow *> *20|stockPrice *> *20/.test(src),'the $20 gate was copied in');
});
t('the full-move form is gone',()=>{
  assert(!/Math\.abs\(priceTgt - priceNow\)\s*:\s*\(avgMove/.test(src),
    'the old un-halved Points calc is still present');
});
t('direction-aware and halved',()=>{
  assert(/\(isPut \? \(priceNow - priceTgt\) : \(priceTgt - priceNow\)\)\s*\/ 2/.test(src),
    'signed, halved Points not found');
});
t('a target on the wrong side is flagged, not silently absolute',()=>{
  assert(/check direction/.test(src),'no direction warning');
});

console.log('\nplanning strike is the halfway strike (registry 4.2)');
t('strike = Stock Price +/- Points',()=>{
  assert(/isPut \? stockPrice - pts : stockPrice \+ pts/.test(src),'strike formula not found');
});
t('Stock Price is its own field, falling back to the level',()=>{
  assert(/id="o-stock-price"/.test(src),'no Stock Price input');
  assert(/gv\('o-stock-price'\) \|\| priceNow/.test(src),'no fallback to Where You Are');
});
t('it never overwrites the strike fields',()=>{
  const m=src.match(/const strikeCalc[\s\S]{0,900}?oc-strike-calc[\s\S]{0,700}?\n  \}/);
  assert(m,'planning-strike block not found');
  assert(!/o-strike'\)\.value\s*=/.test(m[0]),'planning strike writes into an input');
});

console.log('\nTotal Avg Move -- the Access expression (4.3)');
// Access: IIf([Strike Price]<20, [Avg Moving Day]+5, ([Avg Moving Day]/2)+5)
t('the strike-under-20 branch is implemented',()=>{
  assert(/lowStrike = strikeCalc > 0 && strikeCalc < 20/.test(src),'no strike test');
  assert(/\(lowStrike \? avgDay : avgDay\/2\) \+ 5/.test(src),'TotalAvgMove formula not found');
});
t('a blank strike takes the false branch, as Null does in Access',()=>{
  assert(/strikeCalc > 0/.test(src),'a blank strike would wrongly count as under $20');
});
const tam=(d,strike)=>(strike>0&&strike<20?d:d/2)+5;
// Every row of the Access Type table, strike included. All eight reproduce.
[[1,null,5.5],[2,172,6],[5,24.5,7.5],[6,321.5,8],[16,null,13],[22,40.5,16],
 [28,102,19],[30,15.5,35],[0,0,5],[4,169,7]].forEach(([d,st,want])=>
  t('AvgMovingDay '+d+(st?(' @ strike $'+st):' @ blank strike')+' -> '+want,()=>
    assert.strictEqual(tam(d,st),want)));
t('the 30 -> 35 row is explained by the strike, not special-cased',()=>{
  assert.strictEqual(tam(30,15.5),35);
  assert(!/=== ?30|avgDay ?== ?30/.test(src),'a special case for 30 was hard-coded');
});

console.log('\nContract in Weeks (registry 4.4)');
t('weeks = TotalAvgMove / 5',()=>{
  assert(/tam\s*\/\s*5/.test(src),'ContractInWeeks formula not found');
});
[[5.5,1.1],[13,2.6],[19,3.8],[35,7]].forEach(([v,w])=>
  t('TotalAvgMove '+v+' -> '+w+' weeks',()=>
    assert.strictEqual(parseFloat((v/5).toFixed(2)),w)));

console.log('\nAvg Moving Day is entered by hand');
// Access type: Long Integer, DisplayControl Text Box -- NOT a calculated column.
t('nothing derives it',()=>{
  assert(!/pts\/atrVal|oPts\/atr/.test(src),'a derivation crept back in');
  assert(!/atTouched/.test(src),'override plumbing left behind');
});
t('the EMA period no longer lands in it',()=>{
  assert(!/set\('o-avg-day',emaRef\)/.test(src),'ORE still writes the EMA period in');
  assert(!/Avg Moving Day \(EMA ref\)/.test(src),'old label still present');
});
t('ORE leaves it blank rather than guessing',()=>{
  assert(/set\('o-avg-day',''\)/.test(src),'ORE does not clear the field');
});
t('it takes whole numbers, as the Long Integer column does',()=>{
  assert(/id="o-avg-day" type="number" step="1"/.test(src),'step is not 1');
});

console.log('\nSPY Day keeps its own rules');
t('no o-/oc- field reaches the spy_day module',()=>{
  const spy=src.split(/module:'spy_day'/).slice(1).map(x=>x.slice(0,1500)).join('');
  assert(!/'o-avg-day'|oc-tam|oc-strike-calc|strikeCalc|totalAvgMoveDays/.test(spy),
    'an options formula leaked into a spy_day record');
});
t('recalcO is not wired to any spy control',()=>{
  assert(!/id="spy[^"]*"[^>]*recalcO/.test(src),'a SPY input calls recalcO');
});

console.log('\nthe derived values are persisted');
['strikePriceCalc','totalAvgMoveDays','contractInWeeksCalc'].forEach(k=>
  t(k+' is saved',()=>assert(new RegExp(k+':').test(src),k+' not in the save block')));
t('the fields the trader typed are untouched',()=>{
  assert(/avgMovingDay:gv\('o-avg-day'\)/.test(src));
  assert(/totalAvgMove:gv\('o-avg-move'\)/.test(src));
});

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
process.exit(fail?1:0);
