// Platform day lockouts.
//
// The profit and loss limits live on the trading platform, not here. The app's
// job is to say where the session stands against them BEFORE the platform
// stops the day, so these tests care about two things: the warning fires early
// enough to act on, and nothing about a lockout is ever rendered as a rule
// breach. Stopping at either limit is the plan working.
//
//   node tests/day-lockouts.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const BLOB='at_v2';
// The session in progress, from the page. Seeded trades carry a time inside it
// so they bucket onto the same day the engine calls live.
const TODAY=w.atLiveSessionDate();
let n=0;
const tr=(pl,date)=>({id:'t'+(++n),module:'futures',account:'EV-A',accountType:'eval',
  date:date||TODAY,entryTime:'09:30',symbol:'MES',direction:'LONG',qty:5,
  netPL:pl,grossPL:pl,status:'CLOSED',exitPrice:1});

function seed(trades,locks){
  w.localStorage.setItem(BLOB,JSON.stringify({
    settings:Object.assign({
      evalAccounts:['EV-A','','','','','','','','',''],
      paAccounts:['','','','',''],
      accountGoals:{'EV-A':3000},
      apexAccounts:{'EV-A':{size:50000,dd:2500,maxContracts:10,firm:'Black Vault'}}},locks||{}),
    trades:trades}));
  w.loadState();
  return w.evalEval('EV-A');
}
const LOCKS={futLockProfit:250,futLockLoss:150};
const lockRow=e=>w.evalRuleRows(e).filter(r=>r.rule==='Platform lockouts')[0];

console.log('\nnothing set');
t('no limits means no state and no row',()=>{
  const e=seed([tr(100)]);
  assert.strictEqual(e.lock,null);
  assert.strictEqual(lockRow(e),undefined,'a row for limits that do not exist is noise');
  assert.strictEqual(w.atDayLockPill(e.lock),'','and no pill');
});
t('one limit alone is enough to report',()=>{
  const e=seed([tr(100)],{futLockLoss:150});
  assert.ok(e.lock,'a loss limit on its own still gets watched');
  assert.strictEqual(e.lock.profit,0);
  assert.strictEqual(e.lock.loss,150);
});

console.log('\napproaching the profit lockout');
t('$190 of $250 is just progress',()=>{
  const e=seed([tr(190)],LOCKS);
  assert.strictEqual(e.todayPL,190);
  assert.strictEqual(e.lock.near,null);
  assert.strictEqual(e.lock.hit,null);
  assert.strictEqual(w.atDayLockPill(e.lock),'','nothing worth a pill yet');
});
t('$210 of $250 warns — 84% is inside the 80% line',()=>{
  const e=seed([tr(210)],LOCKS);
  assert.strictEqual(e.lock.near,'profit');
  assert.match(w.atDayLockText(e.lock),/\$40\.00 from the \$250 profit lockout/);
  assert.match(w.atDayLockPill(e.lock),/\$40\.00 from profit lockout/);
});
t('$250 is the lockout, and it reads as banked not broken',()=>{
  const e=seed([tr(250)],LOCKS);
  assert.strictEqual(e.lock.hit,'profit');
  assert.match(w.atDayLockText(e.lock),/banked/);
  assert.strictEqual(lockRow(e).ok,true,'hitting the profit target is not a warning');
  assert.strictEqual(lockRow(e).warn,false);
});

console.log('\napproaching the loss lockout');
t('the losing side warns earlier — $105 of $150 is 70%',()=>{
  const e=seed([tr(-105)],LOCKS);
  assert.strictEqual(e.lock.near,'loss');
  assert.match(w.atDayLockText(e.lock),/\$45\.00 from the \$150 loss lockout/);
  assert.strictEqual(lockRow(e).ok,false);
  assert.strictEqual(lockRow(e).warn,true,'a NOTE, never a FAIL');
});
t('the same 70% of the profit side would still be silent',()=>{
  // $175 is 70% of $250 and says nothing; $105 is 70% of $150 and warns. The
  // asymmetry is the point: by 80% of a loss the decision is already made.
  const e=seed([tr(175)],LOCKS);
  assert.strictEqual(e.lock.near,null);
});
t('$150 down is the lockout',()=>{
  const e=seed([tr(-150)],LOCKS);
  assert.strictEqual(e.lock.hit,'loss');
  assert.match(w.atDayLockText(e.lock),/the platform is done for the day/);
  assert.match(w.atDayLockPill(e.lock),/loss lockout hit/);
  assert.strictEqual(lockRow(e).warn,true);
});
t('and no lockout is ever a FAIL',()=>{
  [-200,-150,-105,0,210,250,400].forEach(function(pl){
    const r=lockRow(seed([tr(pl)],LOCKS));
    assert.ok(r.ok||r.warn,'$'+pl+' rendered as a breach');
  });
});

console.log('\nthe figures themselves');
t('a loss limit typed as -150 counts the same as 150',()=>{
  const e=seed([tr(-150)],{futLockProfit:250,futLockLoss:-150});
  assert.strictEqual(e.lock.loss,150,'a sign typo must not disable the warning');
  assert.strictEqual(e.lock.hit,'loss');
});
t('only this session counts, not the days before it',()=>{
  const e=seed([tr(-500,'2026-11-02'),tr(-500,'2026-11-03'),tr(-40)],LOCKS);
  assert.strictEqual(e.todayPL,-40,'a lockout is a daily limit');
  assert.strictEqual(e.lock.near,null);
});
t('a session with no trades says so instead of showing $0.00',()=>{
  const e=seed([tr(100,'2026-11-02')],LOCKS);
  assert.strictEqual(e.tradedToday,false);
  assert.match(w.atDayLockText(e.lock),/no trades this session/);
  assert.strictEqual(w.atDayLockPill(e.lock),'','an untraded session is not a warning');
});

console.log('\nfunded accounts, not just evals');
// The PA panel runs a different engine, so the lockouts have to be wired into
// both. The pill was added to each card header separately; this is what says
// the second one was not missed.
function seedPA(pl){
  w.localStorage.setItem(BLOB,JSON.stringify({
    settings:{evalAccounts:['','','','','','','','','',''],
      paAccounts:['PA-1','','','',''],
      accountGoals:{'PA-1':3000},accountDayGoals:{'PA-1':250},
      futLockProfit:250,futLockLoss:150,
      apexAccounts:{'PA-1':{size:50000,dd:2500,maxContracts:10,firm:'Apex',payoutMin:2600}}},
    trades:[Object.assign(tr(pl),{account:'PA-1',accountType:'pa'})]}));
  w.loadState();
  return w.apexEval('PA-1');
}
t('a funded account reports the same limits',()=>{
  const e=seedPA(-105);
  assert.strictEqual(e.todayPL,-105);
  assert.strictEqual(e.lock.near,'loss');
  const r=w.apexRuleRows(e).filter(x=>x.rule==='Platform lockouts')[0];
  assert.ok(r,'the PA engine needs the row too');
  assert.strictEqual(r.warn,true);
});
t('and shows the pill on its collapsed card',()=>{
  seedPA(-105);
  w.apexRender();
  const html=w.document.getElementById('apex-panel').innerHTML;
  assert.ok(/from loss lockout/.test(html));
});

console.log('\non the screen');
t('the pill is on the collapsed card, not buried in the detail',()=>{
  seed([tr(-105)],LOCKS);
  w.evalRender();
  const html=w.document.getElementById('eval-panel').innerHTML;
  assert.ok(/from loss lockout/.test(html),'the warning has to be visible without opening the card');
});
t('the settings fields round-trip',()=>{
  seed([tr(10)],LOCKS);
  w.renderCfg();
  const p=w.document.getElementById('cfg-fut-lock-profit');
  const l=w.document.getElementById('cfg-fut-lock-loss');
  assert.strictEqual(String(p.value),'250');
  assert.strictEqual(String(l.value),'150');
  p.value='300'; l.value='100';
  w.saveDayGoals();
  // Read back through the saved blob, which is what a reload would see.
  const saved=JSON.parse(w.localStorage.getItem(BLOB)).settings;
  assert.strictEqual(saved.futLockProfit,300);
  assert.strictEqual(saved.futLockLoss,100);
  assert.strictEqual(w.atDayLocks().profit,300,'and the engines read the new pair');
});
t('the note says what win rate the pair needs',()=>{
  const p=w.document.getElementById('cfg-fut-lock-profit');
  const l=w.document.getElementById('cfg-fut-lock-loss');
  p.value='250'; l.value='150'; w.atLockNote();
  // 150 / (250 + 150) = 37.5%
  assert.match(w.document.getElementById('cfg-fut-lock-note').innerHTML,/37\.5% win rate/);
  p.value='250'; l.value='400'; w.atLockNote();
  // 400 / 650 = 61.5% — over half the days have to be green just to stay level
  const note=w.document.getElementById('cfg-fut-lock-note').innerHTML;
  assert.match(note,/61\.5% win rate/);
  assert.match(note,/more than half your days/);
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
