// One risk budget.
//
// There used to be three and they disagreed: the opportunities queue sized on
// account x percent, the stock plan on a flat max-loss cap, and the stock
// Governor inferred the account size backwards out of that cap, so it reported
// percentages against a $10,000 account that no longer existed. The same trade
// came back with three different share counts depending on which screen asked.
//
// What these tests hold to: one figure, the tighter of the two limits wins,
// the account value is never invented, and a position held back by the capital
// ceiling is never reported as one held back by risk.
//
// Every figure here is invented. This repo is public, so a real balance in a
// fixture would be a leak rather than a test.
//
//   node tests/risk-budget.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const BLOB='at_v2';

function seed(over){
  w.localStorage.setItem(BLOB,JSON.stringify({
    settings:Object.assign({stockOptionsAccountValue:40000,tradeRiskPct:2,
      maxLossPerTrade:200,capitalCeiling:1500,minRR:1.5},over||{}),
    trades:[]}));
  w.loadState();
  return w.atRiskBudget();
}

console.log('\nthe tighter limit governs');
t('a $200 cap beats 2% of a $40,000 account',()=>{
  const b=seed();
  assert.strictEqual(b.acctValue,40000);
  assert.strictEqual(b.pctBudget,800,'2% of the account');
  assert.strictEqual(b.hardCap,200);
  assert.strictEqual(b.budget,200,'capital preservation obeys the tighter limit');
  assert.strictEqual(b.binding,'cap');
});
t('raise the cap past the percentage and the percentage takes over',()=>{
  const b=seed({maxLossPerTrade:5000});
  assert.strictEqual(b.budget,800);
  assert.strictEqual(b.binding,'pct');
});
t('neither limit is ever averaged with the other',()=>{
  const b=seed({maxLossPerTrade:600,tradeRiskPct:1});
  // 1% of 40,000 = 400, against a 600 cap.
  assert.strictEqual(b.budget,400);
  assert.notStrictEqual(b.budget,500,'the midpoint would be a limit nobody set');
});

console.log('\nthe account value is never invented');
t('with no account value set, only the cap applies',()=>{
  const b=seed({stockOptionsAccountValue:0});
  assert.strictEqual(b.acctValueKnown,false);
  assert.strictEqual(b.pctBudget,0);
  assert.strictEqual(b.budget,200,'the cap still holds');
  assert.match(w.atRiskBudgetNote(),/Set your Stock/,'it asks rather than assuming');
});
t('the Governor label names the real account, not maxLoss divided by 2%',()=>{
  seed();
  // The old inference was 200 / 0.02 = 10,000, which put "% Risk of $10K" on
  // a panel belonging to an account of nearly sixty thousand.
  const note=w.atRiskBudgetNote();
  assert.match(note,/\$40,000/);
  assert(!/\$10,?000/.test(note),'the $10,000 ghost is gone: '+note);
});

console.log('\nevery screen asks the same question');
t('the opportunities queue uses the unified budget',()=>{
  seed();
  assert.strictEqual(w.oreRiskBudget(),200,
    'it used to return account x pct and size far larger than the stock plan');
});
t('one trade, one share count',()=>{
  seed();
  // ACCO: entry 5.67, stop 4.97 — $0.70 of risk a share.
  const byRisk=Math.floor(w.oreRiskBudget()/0.70);
  assert.strictEqual(byRisk,285);
  // And the capital ceiling cuts it further, which is a different constraint.
  const byCapital=Math.floor(w.atRiskBudget().ceiling/5.67);
  assert.strictEqual(byCapital,264);
  assert(byCapital<byRisk,'ACCO is capital-capped, not risk-capped');
});

console.log('\nthe note says which setting is doing the limiting');
t('it names the cap when the cap binds, and shows the real percentage',()=>{
  seed();
  const note=w.atRiskBudgetNote();
  assert.match(note,/\$200\.00 of risk per trade/);
  assert.match(note,/max-loss cap is tighter/);
  assert.match(note,/0\.50% of the account/,'0.50%, not the 2% that was set: '+note);
});
t('it names the percentage when the percentage binds',()=>{
  seed({maxLossPerTrade:5000});
  assert.match(w.atRiskBudgetNote(),/percentage governs/);
});
t('it previews unsaved figures rather than describing the saved ones',()=>{
  seed();
  // What settings shows while someone is typing a new cap, before saving.
  const note=w.atRiskBudgetNote({hardCap:'1500'});
  assert.match(note,/\$800\.00 of risk per trade/,
    'a 1,500 cap is looser than 2% of 40,000, so the percentage takes over: '+note);
});

console.log('\nthe capital ceiling is a separate constraint');
t('it limits size, not risk, and is reported on its own',()=>{
  const b=seed();
  assert.strictEqual(b.ceiling,1500);
  assert(!/1,?500/.test(w.atRiskBudgetNote()),
    'the ceiling must not appear in the risk sentence — different constraint, different fix');
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
