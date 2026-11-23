// Measuring what an alert actually did.
//
// The service publishes its own results. Its list showed two alerts for one
// month, both winners, everything still reading "Active" -- a record that
// grades itself and drops its losers will score near perfect forever. So the
// outcome is read off daily bars here, and the service's own wording is kept
// only to show where the two disagree.
//
// All prices invented.
//
//   node tests/alert-outcome.test.js

const fs=require('fs'),assert=require('assert'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const grab=n=>(html.match(new RegExp('function '+n+'\\([\\s\\S]*?\\n\\}'))||[])[0];
const box={};vm.createContext(box);
vm.runInContext(grab('atLevelsSane')+'\n'+grab('atAlertOutcome'),box);
const {atLevelsSane,atAlertOutcome}=box;
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const bar=(date,low,high)=>({date,low,high});
const L=o=>Object.assign({direction:'LONG', entry:10,stop:9,target1:13},o||{});
const S=o=>Object.assign({direction:'SHORT',entry:10,stop:11,target1:7},o||{});

console.log('\nlevels that could not be traded are not scored');
t('a long needs stop below entry below target',()=>{
  assert.strictEqual(atLevelsSane(L()).ok,true);
  assert.strictEqual(atLevelsSane(L({stop:10.5})).ok,false,'stop above entry');
  assert.match(atLevelsSane(L({stop:10.5})).why,/stop below entry/);
});
t('a short needs stop above entry above target',()=>{
  assert.strictEqual(atLevelsSane(S()).ok,true);
  assert.strictEqual(atLevelsSane(S({stop:9})).ok,false);
});
t('stop and target at the same price is not a trade',()=>{
  const r=atLevelsSane(S({stop:7,target1:7}));
  assert.strictEqual(r.ok,false);
  assert.match(r.why,/same price/);
});
t('missing levels or direction are refused, not guessed',()=>{
  assert.strictEqual(atLevelsSane(L({target1:null})).ok,false);
  assert.strictEqual(atLevelsSane(L({direction:''})).ok,false);
});
t('unscorable levels give a reason, not a verdict',()=>{
  const o=atAlertOutcome(L({stop:10.5}),[bar('2026-11-02',9,14)]);
  assert.strictEqual(o.state,'unscorable');
  assert.ok(o.why);
});

console.log('\noutcome from the bars');
t('never reaching entry is untriggered, not a loss',()=>{
  assert.strictEqual(atAlertOutcome(L(),[bar('2026-11-02',10.5,11)]).state,'untriggered');
});
t('a long that fills then reaches target is a hit',()=>{
  const o=atAlertOutcome(L(),[bar('2026-11-02',9.8,10.2),bar('2026-11-03',10,13.4)]);
  assert.strictEqual(o.state,'hit');
  assert.strictEqual(o.trigDate,'2026-11-02');
  assert.strictEqual(o.endDate,'2026-11-03');
});
t('a long that fills then loses the stop is stopped',()=>{
  assert.strictEqual(atAlertOutcome(L(),
    [bar('2026-11-02',9.8,10.2),bar('2026-11-03',8.5,10)]).state,'stopped');
});
t('filled and still running is open',()=>{
  const o=atAlertOutcome(L(),[bar('2026-11-02',9.8,10.2),bar('2026-11-03',9.5,11)]);
  assert.strictEqual(o.state,'open');
  assert.strictEqual(o.trigDate,'2026-11-02');
});
t('a short mirrors it',()=>{
  assert.strictEqual(atAlertOutcome(S(),
    [bar('2026-11-02',9.9,10.4),bar('2026-11-03',6.5,9)]).state,'hit');
  assert.strictEqual(atAlertOutcome(S(),
    [bar('2026-11-02',9.9,10.4),bar('2026-11-03',10,11.5)]).state,'stopped');
});
t('one bar touching both resolves to the stop, never the target',()=>{
  const o=atAlertOutcome(L(),[bar('2026-11-02',8.5,13.5)]);
  assert.strictEqual(o.state,'stopped',
    'a daily bar does not say which came first; flattering the tie is how a '
    +'scorecard becomes worthless');
});
t('a bar wholly past the entry is a gap-through, not a stop-out',()=>{
  const o=atAlertOutcome(L(),[bar('2026-11-02',8.0,8.9),bar('2026-11-03',9.9,13.5)]);
  assert.strictEqual(o.state,'gapped',
    'price never came back to 10 to be filled; blaming the setup for that '
    +'would punish it for a trade nobody could take');
});
t('but a bar that straddles the entry is a real fill',()=>{
  const o=atAlertOutcome(L(),[bar('2026-11-02',9.5,10.4),bar('2026-11-03',9.9,13.5)]);
  assert.strictEqual(o.state,'hit');
});
t('a short gaps through its entry the other way',()=>{
  assert.strictEqual(atAlertOutcome(S(),[bar('2026-11-02',11.5,12)]).state,'gapped');
});
t('no bars means no answer, not a zero',()=>{
  assert.strictEqual(atAlertOutcome(L(),[]).state,'no data');
  assert.strictEqual(atAlertOutcome(L(),null).state,'no data');
});
t('an unreadable bar is skipped rather than poisoning the run',()=>{
  const o=atAlertOutcome(L(),[{date:'x',low:null,high:undefined},
    bar('2026-11-03',9.9,13.5)]);
  assert.strictEqual(o.state,'hit');
});

console.log('\nthe scorecard refuses to score what it cannot');
(function(){
  const fs2=require('fs');
  const jsdom=require('jsdom');
  const dom=new jsdom.JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
  const w=dom.window; w.addEventListener('error',()=>{});
  const snap=(date,alerts)=>({date,source:'acorn',takenAt:date+'T17:00:00Z',alerts:alerts});
  const a=(ticker,o)=>Object.assign({ticker,source:'acorn',foundOn:'2026-11-19',
    strategy:'pullback',direction:'LONG',entry:10,stop:9,target1:13,rr:3},o||{});
  w.localStorage.setItem('at_v2',JSON.stringify({settings:{},trades:[],
    alertSnapshots:[
      snap('2026-11-19',[a('AAA'),a('BBB'),a('CCC',{stop:7,target1:7,direction:'SHORT',entry:8})]),
      snap('2026-11-23',[a('AAA')])
    ]}));
  w.loadState();
  const led=w.atAlertLedger('acorn');
  t('the diff is what the listing did, not what it claimed',()=>{
    const by={}; led.records.forEach(r=>by[r.ticker]=r);
    assert.strictEqual(by.AAA.status,'open','still listed');
    assert.strictEqual(by.BBB.status,'removed','gone from the later pull');
    assert.strictEqual(by.AAA.claimedHit,false,
      'the service claim is kept separate from the listing diff');
  });
  t('broken levels are marked, not quietly scored',()=>{
    const ccc=led.records.filter(r=>r.ticker==='CCC')[0];
    assert.strictEqual(ccc.sane,false);
    assert.match(ccc.unsaneWhy,/same price/);
  });
  const sc=w.atAlertScore('rr','acorn');
  t('and they are reported apart from the rate',()=>{
    assert.strictEqual(sc.unsane.length,1);
    assert.strictEqual(sc.unsane[0].ticker,'CCC');
    const inRows=sc.rows.reduce((n,r)=>n+r.total,0);
    assert.strictEqual(inRows,2,'CCC must not be inside any band');
  });
  t('everything from the first pull is baseline, not a free win',()=>{
    assert.strictEqual(sc.baselineCount,3,
      'what the service had already dropped before you started watching is unknowable');
    sc.rows.forEach(r=>assert.strictEqual(r.scored,0));
  });
})();

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
