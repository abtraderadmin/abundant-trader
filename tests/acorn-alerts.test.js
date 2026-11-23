// The Acorn members alerts table.
//
// Structured, and better than parsing prose in every respect but one: the
// table has errors the written reports do not. All three below came out of a
// single real pull, so it is read sceptically rather than trusted.
//
// All figures invented. This repo is public.
//
//   node tests/acorn-alerts.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const J=o=>JSON.stringify({source:'acorn_alerts',alerts:[].concat(o)});
const one=o=>w.oreParseAcornAlerts(J(o))[0];

const CLEAN={symbol:'AAA',status:'Active',found:'Nov-22-2026',direction:'short',
  strategy:'Bearish Head-and-Shoulders',entry:'189.43',target1:'174.67',target2:'',
  stop:'196.03',rr1:'2.24',rr2:'n/a',insider:'',dateHit:'No date',notes:''};

console.log('\nit is recognised and read');
t('the detector names the JSON export',()=>{
  assert.strictEqual(w.oreDetectService(J(CLEAN)),'acorn_alerts');
});
t('a clean row comes through with our own R:R',()=>{
  const a=one(CLEAN);
  assert.strictEqual(a.ticker,'AAA');
  assert.strictEqual(a.direction,'SHORT');
  assert.strictEqual(a.entry,189.43);
  assert.strictEqual(a.stop,196.03);
  assert.strictEqual(a.rr,2.24);
  assert.strictEqual(a.vendorRR,2.24,'theirs is kept for comparison only');
});
t('junk that is not an alert list is ignored, not half-parsed',()=>{
  assert.strictEqual(w.oreParseAcornAlerts('not json').length,0);
  assert.strictEqual(w.oreParseAcornAlerts('{"alerts":"nope"}').length,0);
  assert.strictEqual(w.oreParseAcornAlerts(J({symbol:'NOT A TICKER',entry:'1'})).length,0);
});

console.log('\nthe levels outrank the Direction column');
t('a target below the entry is a short, whatever the column says',()=>{
  // Seen live: listed "long" with the target below entry and the stop above.
  const a=one(Object.assign({},CLEAN,{symbol:'PM',direction:'long',
    entry:'191.83',target1:'170.33',stop:'201.13'}));
  assert.strictEqual(a.direction,'SHORT','following the column would invert the trade');
  assert.strictEqual(a.dirConflict,true);
  assert.match(a.special,/lists this as long/);
  assert.strictEqual(a.rr,2.31,'and the R:R is right once the direction is');
});
t('agreement raises no flag',()=>{
  assert.strictEqual(one(CLEAN).dirConflict,false);
  assert(!/lists this as/.test(one(CLEAN).special));
});

console.log('\nprose in the entry field');
t('a dual entry is planned on the conservative level',()=>{
  // Their spelling, from the live table.
  const a=one(Object.assign({},CLEAN,{symbol:'LUNG',direction:'long',
    entry:'Aggresive: 3.07. Conservative: 3.33',target1:'5.23',stop:'2.43',rr1:'-2.15'}));
  assert.strictEqual(a.entry,3.33);
  assert.strictEqual(a.entryAggressive,3.07);
  assert.strictEqual(a.rr,2.11,'their own figure for this row was -2.15');
  assert.strictEqual(a.vendorRR,-2.15);
  assert.match(a.special,/conservative entry/);
});

console.log('\na stop past the entry sizes nothing, as everywhere else');
t('their negative R:R is not adopted',()=>{
  const a=one(Object.assign({},CLEAN,{symbol:'RWM',direction:'long',
    entry:'13.93',target1:'14.77',stop:'14.00',rr1:'-12'}));
  assert.strictEqual(a.stopValid,false);
  assert.strictEqual(a.rr,null,'nothing downstream computes from a negative risk');
  assert.strictEqual(a.risk,null);
  assert.strictEqual(a.vendorRR,-12);
});

console.log('\nthe hit date is salvaged from a broken field');
t('"Invalid date Nov-19-2026" yields the date and drops the prefix',()=>{
  const a=one(Object.assign({},CLEAN,{dateHit:'Invalid date Nov-19-2026'}));
  assert.strictEqual(a.statusDate,'Nov-19-2026');
  assert.strictEqual(a.hitTarget,true);
});
t('"No date" means no date',()=>{
  const a=one(CLEAN);
  assert.strictEqual(a.hitTarget,false);
  assert.strictEqual(a.statusDate,'');
});
t('the update history and the found date ride along',()=>{
  const a=one(Object.assign({},CLEAN,{notes:'November 20th - Another strong push.',found:'Oct-22-2026'}));
  assert.match(a.notes,/November 20th/);
  assert.strictEqual(a.foundOn,'Oct-22-2026');
});
t('everything from here is tagged to its own source',()=>{
  assert.strictEqual(one(CLEAN).source,'acorn_alerts');
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
