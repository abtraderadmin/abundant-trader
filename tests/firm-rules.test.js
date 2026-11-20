// Session days and per-firm rules, checked against the Black Vault dashboards
// and the real order export they came from.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

console.log('\nsessions roll in the evening');
t('a morning fill keeps its date',()=>
  assert.strictEqual(w.atSessionDate('2026-11-19','10:48:30'),'2026-11-19'));
t('an 18:48 fill belongs to the next trading day',()=>
  assert.strictEqual(w.atSessionDate('2026-11-19','18:48:11'),'2026-11-20'));
t('17:00 is the boundary',()=>{
  assert.strictEqual(w.atSessionDate('2026-11-19','16:59:59'),'2026-11-19');
  assert.strictEqual(w.atSessionDate('2026-11-19','17:00:00'),'2026-11-20');
});
t('it rolls across a month end',()=>
  assert.strictEqual(w.atSessionDate('2026-11-30','18:10:00'),'2026-12-01'));
t('stocks do not roll — only futures have an evening session',()=>{
  assert.strictEqual(w.atTradeDay({module:'stock',date:'2026-11-19',entryTime:'18:48:11'}),'2026-11-19');
  assert.strictEqual(w.atTradeDay({module:'futures',date:'2026-11-19',entryTime:'18:48:11'}),'2026-11-20');
});
t('a missing time is left alone rather than guessed',()=>
  assert.strictEqual(w.atTradeDay({module:'futures',date:'2026-11-19'}),'2026-11-19'));

console.log('\nfirm rules');
t('Black Vault differs from Apex where it should',()=>{
  const a=w.atFirmRules('Apex'), b=w.atFirmRules('Black Vault');
  assert.strictEqual(a.maxLoss,2500);        assert.strictEqual(b.maxLoss,2000);
  assert.strictEqual(a.lockMode,'cap');      assert.strictEqual(b.lockMode,'trail');
  assert.strictEqual(a.lockAtStartPlus,100);
  assert.strictEqual(a.payouts,6);           assert.strictEqual(b.payouts,5);
  assert.strictEqual(a.minDays,8);           assert.strictEqual(b.minDays,2);
  assert.strictEqual(a.maxContracts,10);     assert.strictEqual(b.maxContracts,5);
  assert.strictEqual(a.evalConsistency,null);assert.strictEqual(b.evalConsistency,0.50);
});
t('an unknown firm falls back to Apex rather than to nothing',()=>
  assert.strictEqual(w.atFirmRules('Nope').maxLoss,2500));

console.log('\nthe real Black Vault account, from its own export');
// 67 fills, all showing Nov 19 on the export. The provider splits them:
// day session $3,006.28, evening $278.48, total $3,284.76.
const BLOB='at_v2';
let n=0;
const fill=(date,time,pl,hold)=>({id:'t'+(++n),module:'futures',account:'BVFE1E00IWNI',
  date,entryTime:time,symbol:'ES',direction:'LONG',qty:2,netPL:pl,grossPL:pl,
  holdSec:hold==null?30:hold,status:'CLOSED',exitPrice:1});
// Anchored to the app's own clock: the second session must be the live one
// whenever this runs, which is what the settled-close rule turns on.
const LIVE=w.atLiveSessionDate();
const PREV=(()=>{const d=new Date(LIVE+'T12:00:00');d.setDate(d.getDate()-1);
  return d.toISOString().slice(0,10);})();
w.localStorage.setItem(BLOB,JSON.stringify({
  settings:{evalAccounts:['BVFE1E00IWNI','','','','','','','','',''],paAccounts:['','','','',''],
    accountGoals:{'BVFE1E00IWNI':3000},
    apexAccounts:{'BVFE1E00IWNI':{size:50000,firm:'Black Vault'}}},
  trades:[fill(PREV,'10:50:00',3006.28,30),
          fill(LIVE,'10:30:00',278.48,30)]}));
w.loadState();
const e=()=>w.evalEval('BVFE1E00IWNI');

t('the evening fill is a separate trading day',()=>
  assert.strictEqual(e().days,2,'the two sessions merged into one day'));
t('net profit matches the dashboard',()=>
  assert.strictEqual(e().profit,3284.76));
t('best day is the day session, not the combined total',()=>
  assert.strictEqual(e().bestDay,3006.28));
t('consistency matches the dashboard to the decimal',()=>
  assert.strictEqual(e().consistency,91.52));
t('the profit goal is met',()=>
  assert(e().profit>=e().target,'goal should be met'));
t('and the account is still blocked by the consistency rule',()=>{
  const g=e();
  const row=w.evalRuleRows(g).filter(r=>/consistency/i.test(r.rule))[0];
  assert(row,'no consistency rule shown');
  assert.strictEqual(row.ok,false,'a 91.5% best day must not pass a 50% rule');
  assert(/more/.test(row.detail),'does not say how much more is needed');
});
t('it says how much more profit is needed',()=>{
  const g=e();
  assert.strictEqual(g.needTotal,6012.56);   // 3006.28 / 0.50
  assert.strictEqual(g.needMore,2727.80);
});
t('the floor uses Black Vault\'s $2,000, not Apex\'s $2,500',()=>
  assert.strictEqual(e().dd,2000));
t('the high-water counts settled closes only, as the provider does',()=>{
  // Sessions: 11-19 settled at 53,006.28; 11-20 is the live one. The
  // dashboard reads "highest applicable settled close" 53,006.28.
  const g=e();
  assert.strictEqual(g.balance,53284.76,'balance includes the live session');
  assert.strictEqual(g.highWater,53006.28,'live session must not raise the floor');
  assert.strictEqual(g.floor,51006.28,'matches the dashboard EOD floor exactly');
  assert.strictEqual(g.headroom,2278.48,'matches the dashboard drawdown available');
});
t('the contract cap is 5, not 10',()=>
  assert.strictEqual(e().maxContracts,5));
t('two trading days satisfies Black Vault',()=>{
  const row=w.evalRuleRows(e()).filter(r=>r.rule==='Trading days')[0];
  assert.strictEqual(row.ok,true,'2 of 2 should pass');
});

t('Black Vault\'s floor never stops trailing — Apex\'s caps',()=>{
  const g=e();
  assert.strictEqual(g.capped,false,'Black Vault must not cap the floor');
  assert.strictEqual(g.locked,false);
  assert.strictEqual(g.protectedAtStart,true,'floor is above the starting balance');
  const b=JSON.parse(w.localStorage.getItem(BLOB));
  b.settings.apexAccounts={'BVFE1E00IWNI':{size:50000,firm:'Apex'}};
  w.localStorage.setItem(BLOB,JSON.stringify(b)); w.loadState();
  const a=e();
  assert.strictEqual(a.capped,true);
  assert.strictEqual(a.locked,true,'Apex caps once the floor clears start + 100');
  assert.strictEqual(a.floor,50100);
  // Restore
  b.settings.apexAccounts={'BVFE1E00IWNI':{size:50000,firm:'Black Vault'}};
  w.localStorage.setItem(BLOB,JSON.stringify(b)); w.loadState();
});

console.log('\nshort-duration share');
t('only winning trades count, and only the fast ones in the numerator',()=>{
  const b=JSON.parse(w.localStorage.getItem(BLOB));
  b.trades=[fill(PREV,'10:00:00',100,3),    // fast win  -> numerator
            fill(PREV,'10:05:00',300,60),   // slow win
            fill(PREV,'10:10:00',-500,2)];  // fast LOSS -> excluded
  w.localStorage.setItem(BLOB,JSON.stringify(b)); w.loadState();
  const g=e();
  assert.strictEqual(g.allWins,400,'losing trades must be excluded');
  assert.strictEqual(g.shortWins,100);
  assert.strictEqual(g.shortPct,25);
});
t('under 30% is reported clear',()=>{
  const row=w.evalRuleRows(e()).filter(r=>/Hold time/.test(r.rule))[0];
  assert(row&&row.ok&&/clear/.test(row.detail),'25% should be clear: '+(row&&row.detail));
});
t('and the row answers how long the trades actually ran',()=>{
  const row=w.evalRuleRows(e()).filter(r=>/Hold time/.test(r.rule))[0];
  // The question this rule always prompts is "how long do I have to hold for",
  // and the answer is that no single trade has a minimum. Saying so in the row
  // is the difference between a rule that is understood and one that is feared.
  assert(/No minimum hold applies to any single trade/.test(row.detail),row.detail);
  assert(/holding \d+s on average/.test(row.detail),'hold times belong on the row: '+row.detail);
});
t('Apex accounts get no short-duration rule at all',()=>{
  const b=JSON.parse(w.localStorage.getItem(BLOB));
  b.settings.apexAccounts={'BVFE1E00IWNI':{size:50000,firm:'Apex'}};
  w.localStorage.setItem(BLOB,JSON.stringify(b)); w.loadState();
  const rules=w.evalRuleRows(e()).map(r=>r.rule).join('|');
  assert(!/Hold time/.test(rules),'Apex has no such rule');
  assert(!/consistency/i.test(rules),'Apex evals have no consistency rule');
});

// The rules above are only reachable if the account can actually be SET to the
// firm, and for a while it could not: Black Vault was missing from the firm
// list and the eval card had no firm control at all. Every Black Vault eval
// was silently judged on Apex's rulebook - $2,500 drawdown, capped floor, and
// no consistency rule whatsoever, which is exactly the rule being tracked.
console.log('\nthe firm can be set, which is what makes the rules reachable');
const BLOB2='at_v2';
// The real figures: 3,006.28 then 278.48, both settled.
const REALD=[
  {id:'r1',module:'futures',account:'BV-1',accountType:'eval',date:'2026-11-19',
   entryTime:'09:30',symbol:'MES',direction:'LONG',qty:5,netPL:3006.28,grossPL:3006.28,
   status:'CLOSED',exitPrice:1,holdSec:20},
  {id:'r2',module:'futures',account:'BV-1',accountType:'eval',date:'2026-11-19',
   entryTime:'18:45',symbol:'MES',direction:'LONG',qty:5,netPL:278.48,grossPL:278.48,
   status:'CLOSED',exitPrice:1,holdSec:60}];
function seedFirm(firm){
  w.localStorage.setItem(BLOB2,JSON.stringify({
    settings:{evalAccounts:['BV-1','','','','','','','','',''],paAccounts:['','','','',''],
      accountGoals:{'BV-1':3000},ruleLog:{},
      apexAccounts:{'BV-1':{size:50000,dd:2500,maxContracts:10,firm:firm}}},
    trades:REALD}));
  w.loadState();
  return w.evalEval('BV-1');
}
t('Black Vault is one of the firms that can be chosen',()=>{
  const sel=w.apexFirmSelect({acct:'BV-1',cfg:{firm:'Black Vault'}});
  assert(/<option value="Black Vault" selected>/.test(sel),
    'a firm the app has rules for must be selectable: '+sel);
});
t('an eval card carries a firm control, not just a status one',()=>{
  seedFirm('Black Vault'); w.evalRender();
  const html=w.document.getElementById('eval-panel').innerHTML;
  assert(/'firm'/.test(html)||/&#39;firm&#39;/.test(html)||/>firm</.test(html),
    'without this the firm cannot be set from the card at all');
  assert(/Black Vault/.test(html));
});
t('left on Apex, the account reads $3,184.76 of room and no consistency rule',()=>{
  const e=seedFirm('Apex');
  // 53,284.76 high-water, Apex caps the floor at start + $100 = 50,100.
  assert.strictEqual(e.dd,2500);
  assert.strictEqual(e.floor,50100);
  assert.strictEqual(e.headroom,3184.76);
  assert.strictEqual(e.consistency,null,'this is the rule that went missing');
  assert.strictEqual(w.evalRuleRows(e).filter(r=>/consistency/i.test(r.rule)).length,0);
});
t('switched to Black Vault, the floor is the real $2,000 and the rule appears',()=>{
  const e=seedFirm('Black Vault');
  assert.strictEqual(e.dd,2000);
  assert.strictEqual(e.floor,51284.76,'53,284.76 − 2,000, and it keeps trailing');
  assert.strictEqual(e.locked,false,'a trailing floor does not lock');
  assert.strictEqual(e.headroom,2000);
  assert.strictEqual(e.consistency,91.52);
  assert.strictEqual(e.needTotal,6012.56);
  assert.strictEqual(e.needMore,2727.80);
  assert.strictEqual(e.maxContracts,5);
});
t('the two $2,000 figures are different things and must not be conflated',()=>{
  const e=seedFirm('Black Vault');
  // How far it can FALL, versus how much profit it still has to MAKE.
  assert.strictEqual(e.headroom,2000);
  assert.strictEqual(e.needMore,2727.80);
  assert.notStrictEqual(e.headroom,e.needMore);
});
t('changing the firm repaints the ledger, so the gate shows up at once',()=>{
  seedFirm('Apex');
  w.atRuleRender();
  assert.strictEqual(w.document.getElementById('rule-ledger-panel').innerHTML,'',
    'Apex has no consistency rule to break');
  w.apexSetCfg('BV-1','firm','Black Vault');
  const html=w.document.getElementById('rule-ledger-panel').innerHTML;
  assert(/50% consistency/.test(html),'the ledger must repaint on a firm change');
  assert(/\$2,727\.80/.test(html));
});

console.log('\naccount matching for alphanumeric ids');
(function(){
  const b=JSON.parse(w.localStorage.getItem(BLOB));
  b.settings.evalAccounts=['BVFE1E00IWNI','BVFE1E00IWNJ','BVFE1E00IWNK','','','','','','',''];
  b.settings.paAccounts=['PA-APEX-4687-13','','','',''];
  w.localStorage.setItem(BLOB,JSON.stringify(b)); w.loadState();
})();
t('three ids that share the same digits are told apart',()=>{
  // BVFE1E00IWNI / J / K all reduce to "100" on a digits-only match.
  assert.strictEqual(w.paOrdMatchAcct('BVFE1E00IWNI'),'BVFE1E00IWNI');
  assert.strictEqual(w.paOrdMatchAcct('BVFE1E00IWNJ'),'BVFE1E00IWNJ');
  assert.strictEqual(w.paOrdMatchAcct('BVFE1E00IWNK'),'BVFE1E00IWNK');
});
t('the Apex style still matches',()=>
  assert.strictEqual(w.paOrdMatchAcct('PA-APEX-4687-13'),'PA-APEX-4687-13'));
t('an unknown account matches nothing rather than the nearest',()=>
  assert.strictEqual(w.paOrdMatchAcct('ZZZZ9999'),null));

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
dom.window.close(); process.exit(fail?1:0);
