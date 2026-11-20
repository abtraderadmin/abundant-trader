// Evaluation accounts are judged by their own rules. No consistency rule;
// what decides survival is the trailing threshold.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const BLOB='at_v2';
// The session now in progress, taken from the page rather than recomputed:
// a calendar date disagrees with it between the 17:00 roll and midnight,
// which made these assertions pass or fail depending on the clock.
const today=w.atLiveSessionDate();
let n=0;
const tr=(acct,date,pl,qty)=>({id:acct+date+(++n),module:'futures',account:acct,accountType:'eval',
  date,entryTime:'09:30',symbol:'MES',direction:'LONG',qty:qty||2,netPL:pl,grossPL:pl,status:'CLOSED',exitPrice:1});
function seed(trades,extra){
  w.localStorage.setItem(BLOB,JSON.stringify({
    settings:Object.assign({evalAccounts:['EV-A','EV-B','','','','','','','',''],
      paAccounts:['','','','',''],
      accountGoals:{'EV-A':3000,'EV-B':3000},
      apexAccounts:{'EV-A':{size:50000,dd:2500,maxContracts:10,firm:'Apex'},
                    'EV-B':{size:50000,dd:2500,maxContracts:10,firm:'Apex'}}},extra||{}),
    trades:trades}));
  w.loadState();
}

console.log('\nthe trailing threshold');
seed([tr('EV-A','2026-11-01',200),tr('EV-A','2026-11-02',200)]);
t('before the lock it follows the high-water mark',()=>{
  const e=w.evalEval('EV-A');
  assert.strictEqual(e.highWater,50400);
  assert.strictEqual(e.floor,47900,'50,400 − 2,500');   // not yet at the lock
  assert.strictEqual(e.locked,false);
  assert.strictEqual(e.headroom,2500);
});
seed([tr('EV-A','2026-11-01',3000)]);
t('it locks at start + $100 and stops trailing',()=>{
  const e=w.evalEval('EV-A');
  assert.strictEqual(e.highWater,53000);
  assert.strictEqual(e.locked,true,'53,000 − 2,500 = 50,500 is past the lock');
  assert.strictEqual(e.floor,50100);
  assert.strictEqual(e.headroom,2900);
});
t('the floor follows the HIGH-WATER mark, not the current balance',()=>{
  seed([tr('EV-A','2026-11-01',900),tr('EV-A','2026-11-02',-400)]);
  const e=w.evalEval('EV-A');
  assert.strictEqual(e.highWater,50900,'high-water must survive the losing day');
  assert.strictEqual(e.balance,50500);
  assert.strictEqual(e.floor,48400);
  assert.strictEqual(e.headroom,2100);
});
t('a breach shows as no headroom left',()=>{
  seed([tr('EV-A','2026-11-01',500),tr('EV-A','2026-11-02',-3100)]);
  const e=w.evalEval('EV-A');
  assert.strictEqual(e.floor,48000);
  assert(e.headroom<0,'should be under the floor, got '+e.headroom);
});

console.log('\nprogress to the target');
seed([tr('EV-A','2026-11-01',200),tr('EV-A','2026-11-02',200),tr('EV-A','2026-11-03',200)]);
t('percent and remaining are from the account goal',()=>{
  const e=w.evalEval('EV-A');
  assert.strictEqual(e.profit,600);
  assert.strictEqual(e.target,3000);
  assert.strictEqual(Math.round(e.pct),20);
  assert.strictEqual(e.toTarget,2400);
});
t('days remaining uses this account\'s own daily rate',()=>{
  const e=w.evalEval('EV-A');
  assert.strictEqual(e.avgDay,200);
  assert.strictEqual(e.daysToTarget,12);
});

console.log('\novertrading, measured against the trader\'s own baseline');
seed([tr('EV-A','2026-11-01',200),tr('EV-A','2026-11-01',200),
      tr('EV-A','2026-11-02',200),tr('EV-A','2026-11-02',200),
      tr('EV-A','2026-11-03',200),tr('EV-A','2026-11-03',200)]);
t('a winning day sets the baseline',()=>
  assert.strictEqual(w.evalEval('EV-A').baseline,2));
t('a normal day today is not flagged',()=>{
  const b=JSON.parse(w.localStorage.getItem(BLOB));
  b.trades.push(tr('EV-A',today,100),tr('EV-A',today,100));
  w.localStorage.setItem(BLOB,JSON.stringify(b)); w.loadState();
  const e=w.evalEval('EV-A');
  assert.strictEqual(e.todayN,2);
  assert.strictEqual(e.overtrading,false);
});
t('many times the baseline is flagged while the day is still live',()=>{
  const b=JSON.parse(w.localStorage.getItem(BLOB));
  for(let i=0;i<12;i++)b.trades.push(tr('EV-A',today,-20));
  w.localStorage.setItem(BLOB,JSON.stringify(b)); w.loadState();
  const e=w.evalEval('EV-A');
  assert.strictEqual(e.todayN,14);
  assert.strictEqual(e.overtrading,true,'14 against a baseline of 2 should flag');
});

console.log('\nthe rules shown');
seed([tr('EV-A','2026-11-01',200)]);
t('no consistency rule is applied to an eval',()=>{
  const rules=w.evalRuleRows(w.evalEval('EV-A')).map(r=>r.rule).join('|');
  assert(!/onsistency/.test(rules),'a consistency rule leaked into the eval panel');
});
t('the threshold, the target and the contract cap are all judged',()=>{
  const rules=w.evalRuleRows(w.evalEval('EV-A')).map(r=>r.rule);
  ['Trailing threshold','Profit target','Contract limit','Trading days']
    .forEach(r=>assert(rules.includes(r),'missing rule: '+r));
});
t('the contract cap compares the largest position taken',()=>{
  seed([tr('EV-A','2026-11-01',200,14)]);
  const e=w.evalEval('EV-A');
  assert.strictEqual(e.maxQty,14);
  const row=w.evalRuleRows(e).filter(r=>r.rule==='Contract limit')[0];
  assert.strictEqual(row.ok,false,'14 of 10 should fail');
});

console.log('\nthe panel');
seed([tr('EV-A','2026-11-01',288),tr('EV-B','2026-11-01',288)]);
w.evalRender();
const html=()=>(w.document.getElementById('eval-panel')||{}).innerHTML||'';
t('it renders separately from the Apex panel',()=>{
  assert(w.document.getElementById('eval-panel'),'no eval panel');
  assert(/Evaluation Rule Compliance/.test(html()));
  assert(w.document.getElementById('apex-panel')!==w.document.getElementById('eval-panel'));
});
t('it says the money is not real',()=>
  assert(/none of this counts as real money/.test(html()),'simulated money is not called out'));
t('headroom is on the collapsed row, not buried',()=>
  assert(/to the floor/.test(html()),'headroom not on the header'));
t('both accounts are listed with a status control',()=>{
  assert(/EV-A/.test(html())&&/EV-B/.test(html()));
  assert(/apexSetStatus/.test(html()),'no status control on an eval card');
});

console.log('\nclosed evaluations roll up');
seed([tr('EV-A','2026-11-01',288),tr('EV-B','2026-11-01',-2800)],
     {apexAccounts:{'EV-A':{size:50000,dd:2500,maxContracts:10,firm:'Apex'},
                    'EV-B':{size:50000,dd:2500,maxContracts:10,firm:'Apex',
                            status:'blown',closedOn:'2026-11-19'}}});
w.evalRender();
t('a closed eval leaves the active list',()=>{
  const h=html();
  const head=h.slice(0,h.indexOf('Closed evaluations'));
  assert(!/EV-B/.test(head),'closed eval still in the active list');
});
t('and appears behind a collapsed header with its final figure',()=>{
  const h=html();
  assert(/Closed evaluations/.test(h),'no closed section');
  assert(/show ▾/.test(h),'not collapsed by default');
  assert(/evalToggleShut\(\)/.test(h),'no way to open it');
  assert(/-2,?800/.test(h.replace(/<[^>]+>/g,' ')),'final figure missing');
});
t('opening it is remembered',()=>{
  w.evalToggleShut();
  assert(/hide ▴/.test(html()),'did not open');
  assert.strictEqual(JSON.parse(w.localStorage.getItem(BLOB)).settings.evalShutOpen,true);
});

console.log('\nwired in');
t('evalRender runs with the other panels',()=>
  assert(/_q\('evalRender',evalRender\)/.test(src),'not hooked into renderAll'));

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
dom.window.close(); process.exit(fail?1:0);
