// The rule ledger.
//
// The compliance panels answer "where does this account stand now". They say
// nothing about the fact that it got there by breaking a rule, and they forget
// it the moment the numbers recover. The ledger is the memory, so what these
// tests care about is: it notices on its own, it keeps the record after the
// figures are clean, and it never stores a number it could recompute.
//
//   node tests/rule-ledger.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const BLOB='at_v2';
let n=0;
// Settled days, well clear of the session in progress, so the high-water and
// the consistency figures are not affected by the clock.
const tr=(date,pl,qty)=>({id:'t'+(++n),module:'futures',account:'BV-1',accountType:'eval',
  date,entryTime:'09:30',symbol:'MES',direction:'LONG',qty:qty||5,
  netPL:pl,grossPL:pl,status:'CLOSED',exitPrice:1});

function seed(trades,settings){
  w.localStorage.setItem(BLOB,JSON.stringify({
    settings:Object.assign({
      evalAccounts:['BV-1','','','','','','','','',''],
      paAccounts:['','','','',''],
      accountGoals:{'BV-1':3000},
      ruleLog:{},
      apexAccounts:{'BV-1':{size:50000,dd:2000,maxContracts:5,firm:'Black Vault'}}},settings||{}),
    trades:trades}));
  w.loadState();
  w.atRuleRender();
  return JSON.parse(w.localStorage.getItem(BLOB)).settings.ruleLog;
}
const find=r=>w.atRuleFindings().filter(f=>f.rule===r)[0];
const panel=()=>w.document.getElementById('rule-ledger-panel').innerHTML;

// The real shape of all three Black Vault accounts: goal cleared, consistency
// nowhere near. 3,006.28 of 3,284.76 net is 91.52%, so the account needs
// 6,012.56 total — 2,727.80 more.
const REAL=[tr('2026-11-19',3006.28),tr('2026-11-20',278.48)];

console.log('\nit notices without being told');
t('an unsatisfied consistency rule is logged on sight',()=>{
  const log=seed(REAL);
  const e=log['BV-1|50% consistency'];
  assert.ok(e,'nothing was recorded');
  assert.strictEqual(e.kind,'gate');
  assert.strictEqual(e.cleared,'');
  assert.ok(e.firstSeen,'the date it was first seen is the point of the record');
});
t('and the amount owed is the engine’s figure, to the cent',()=>{
  const f=find('50% consistency');
  assert.strictEqual(f.open,true);
  assert.strictEqual(f.need,6012.56);
  assert.strictEqual(f.more,2727.80);
  assert.strictEqual(f.have,3284.76);
});
t('the panel leads with what it takes to clear it',()=>{
  assert.match(panel(),/\$2,727\.80 of profit owed/);
  assert.match(panel(),/\$2,727\.80 more net profit clears it/);
  assert.match(panel(),/not satisfied yet/);
});

console.log('\nnothing is stored that could be recomputed');
t('a bigger winning day moves the bar instead of leaving it stale',()=>{
  // A $5,000 day makes the account richer and the rule harder: best day is
  // now 5,000, so it needs 10,000 net, not 6,012.56.
  seed(REAL.concat([tr('2026-11-21',5000)]));
  const f=find('50% consistency');
  assert.strictEqual(f.need,10000);
  assert.strictEqual(f.more,1715.24,'8,284.76 net against a 10,000 requirement');
});
t('and the stored entry is still the same one, not a second history',()=>{
  const log=JSON.parse(w.localStorage.getItem(BLOB)).settings.ruleLog;
  assert.strictEqual(Object.keys(log).filter(k=>/consistency/.test(k)).length,1);
});

console.log('\nit remembers after the numbers are clean');
t('trading it off marks the entry cleared, it does not delete it',()=>{
  // Even days: no single day is more than half the net, so the rule passes.
  const log=seed([tr('2026-11-19',1000),tr('2026-11-20',1000),tr('2026-11-21',1000)],
                 {ruleLog:{'BV-1|50% consistency':{acct:'BV-1',rule:'50% consistency',
                   kind:'gate',firm:'Black Vault',firstSeen:'2026-11-19',
                   atDetail:'best day was 91.5% of net',lesson:'read the rules first',cleared:''}}});
  const e=log['BV-1|50% consistency'];
  assert.ok(e,'the record must survive the recovery');
  assert.ok(e.cleared,'it should be stamped cleared');
  assert.strictEqual(e.lesson,'read the rules first','and keep the lesson');
});
t('a cleared record is kept behind a click, not shown as a live problem',()=>{
  assert.match(panel(),/Cleared/);
  assert.match(panel(),/No open rule breaches/);
});
t('if it comes back, the same entry reopens',()=>{
  const log=seed(REAL,{ruleLog:{'BV-1|50% consistency':{acct:'BV-1',rule:'50% consistency',
    kind:'gate',firm:'Black Vault',firstSeen:'2026-11-19',atDetail:'x',
    lesson:'read the rules first',cleared:'2026-11-25'}}});
  const e=log['BV-1|50% consistency'];
  assert.strictEqual(e.cleared,'');
  assert.ok(e.reopened,'coming back is worth a date of its own');
  assert.strictEqual(e.firstSeen,'2026-11-19','the original sighting is not rewritten');
});

console.log('\nbreaches that trading cannot undo');
t('blowing the maximum loss is hard, and says so',()=>{
  const log=seed([tr('2026-11-19',-2100)]);
  const e=log['BV-1|Maximum loss'];
  assert.ok(e);
  assert.strictEqual(e.kind,'hard');
  assert.strictEqual(find('Maximum loss').more,null,'there is no amount that fixes it');
  assert.match(panel(),/Trading cannot undo this one/);
});
t('over the contract cap is hard too',()=>{
  const log=seed([tr('2026-11-19',500,9)]);
  assert.strictEqual(log['BV-1|Contract limit'].kind,'hard');
  assert.match(find('Contract limit').detail,/9 contracts taken against a limit of 5/);
});
t('a closed account keeps its record — closing it is not forgetting it',()=>{
  const log=seed([tr('2026-11-19',-2100)],
    {apexAccounts:{'BV-1':{size:50000,dd:2000,maxContracts:5,firm:'Black Vault',
                           status:'blown',closedOn:'2026-11-19'}}});
  assert.ok(log['BV-1|Maximum loss'],'the reason an account closed is the whole record');
});

console.log('\nthe lesson');
t('it is saved against the entry and survives a repaint',()=>{
  seed(REAL);
  w.atRuleLessonSave('BV-1|50% consistency',{value:'did not read the consistency rule before trading'});
  w.atRuleRender();
  const log=JSON.parse(w.localStorage.getItem(BLOB)).settings.ruleLog;
  assert.strictEqual(log['BV-1|50% consistency'].lesson,
    'did not read the consistency rule before trading');
  assert.match(panel(),/did not read the consistency rule before trading/);
});

console.log('\nquiet when there is nothing to say');
t('a clean account renders no panel at all',()=>{
  seed([tr('2026-11-19',1000),tr('2026-11-20',1000)]);
  assert.strictEqual(panel(),'','an empty ledger is not worth a heading');
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
