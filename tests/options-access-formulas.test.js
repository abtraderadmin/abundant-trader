// Calculation Registry 4.1-4.4 — the Access database options logic.
// Guards the three places the app used to deviate from the registry.
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
let fail=0;
const ok=(m)=>console.log('  ok   '+m);
const bad=(m,e)=>{fail++;console.log('  FAIL '+m+'\n       '+e);};
const t=(m,fn)=>{try{fn();ok(m);}catch(e){bad(m,e.message);}};

console.log('\nPoints is half the move (registry 4.1)');
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
t('strike = now +/- Points',()=>{
  assert(/isPut \? priceNow - pts : priceNow \+ pts/.test(src),'strike formula not found');
});
t('it never overwrites the strike fields',()=>{
  const m=src.match(/const strikeCalc[\s\S]{0,700}?oc-strike-calc[\s\S]{0,400}?\n  \}/);
  assert(m,'planning-strike block not found');
  assert(!/o-strike'\)\.value\s*=/.test(m[0]),'planning strike writes into an input');
});

console.log('\nTotal Avg Move matches the registry examples (4.3)');
t('/2 + 5 is what ships',()=>{
  assert(/avgDay\s*\/\s*2\s*\+\s*5/.test(src),'TotalAvgMove formula not found');
});
// The registry's own eight worked examples. "+4.5" matches one of them.
const EX=[[1,5.5],[2,6],[5,7.5],[6,8],[16,13],[22,16],[28,19]];
const tam=d=>d/2+5;
t('all seven non-anomalous examples reproduce exactly',()=>{
  EX.forEach(([d,want])=>assert.strictEqual(tam(d),want,
    'AvgMovingDay '+d+' gave '+tam(d)+', registry says '+want));
});
t('the 30 -> 35 outlier is still an outlier, so it stays documented not coded',()=>{
  assert.notStrictEqual(tam(30),35);
  assert(!/=== ?30|avgDay ?== ?30/.test(src),'a special case for 30 was hard-coded');
});

console.log('\nContract in Weeks (registry 4.4)');
t('weeks = TotalAvgMove / 5',()=>{
  assert(/tam\s*\/\s*5/.test(src),'ContractInWeeks formula not found');
});
[[5.5,1.1],[13,2.6],[19,3.8],[35,7]].forEach(([v,w])=>
  t('TotalAvgMove '+v+' -> '+w+' weeks',()=>
    assert.strictEqual(parseFloat((v/5).toFixed(2)),w)));

console.log('\nAvg Moving Day is a day count, not an EMA period');
t('the field no longer takes the EMA reference',()=>{
  assert(!/set\('o-avg-day',emaRef\)/.test(src),'ORE still writes the EMA period in');
});
t('ORE fills it from Points / ATR',()=>{
  assert(/set\('o-avg-day',\(oPts&&atr\)\?parseFloat\(\(oPts\/atr\)/.test(src),
    'ORE prefill does not derive days from ATR');
});
t('the calc strip derives it from ATR too',()=>{
  assert(/\(pts && atrVal\) \? parseFloat\(\(pts\/atrVal\)/.test(src),'no ATR derivation');
});
t('a typed value wins over the autofill',()=>{
  assert(/dataset\.atTouched === '1'/.test(src),'no override flag');
  assert(/derived && !touched/.test(src),'autofill ignores the override flag');
});
t('clearing the field hands control back',()=>{
  assert(/atTouched=this\.value===''\?'0':'1'/.test(src),'empty field does not reset the flag');
});
t('the label says days',()=>{
  assert(/Avg Moving Day \(days\)/.test(src),'label not updated');
  assert(!/Avg Moving Day \(EMA ref\)/.test(src),'old label still present');
});

console.log('\nthe derived values are persisted');
['strikePriceCalc','totalAvgMoveDays','contractInWeeksCalc','atrAtPlan'].forEach(k=>
  t(k+' is saved',()=>assert(new RegExp(k+':').test(src),k+' not in the save block')));
t('the fields the trader typed are untouched',()=>{
  assert(/avgMovingDay:gv\('o-avg-day'\)/.test(src));
  assert(/totalAvgMove:gv\('o-avg-move'\)/.test(src));
});

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
process.exit(fail?1:0);
