// The alert track record.
//
// Vendor alert lists hold only CURRENTLY ACTIVE ideas; closed ones are taken
// down. September showed two alerts and both were winners, so a hit rate read
// off that list comes out near 100% and is pure artifact.
//
// The only way round it is to snapshot on every pull and watch what vanishes.
// An alert present last time, gone now, with no hit date when last seen, is a
// loser that was removed. That works only going forward — which is why the
// first snapshot is a BASELINE and is never counted as evidence.
//
// All figures invented. This repo is public.
//
//   node tests/alert-scorecard.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

const A=(ticker,strategy,rr,hit,found)=>({ticker,pattern:strategy,direction:'SHORT',
  entry:100,stop:110,target1:80,rr,statusDate:hit||'',foundOn:found||'Nov-01-2026',
  source:'acorn_alerts'});
function seed(snapshots){
  w.localStorage.setItem('at_v2',JSON.stringify({settings:{},trades:[],
    alertSnapshots:snapshots||[]}));
  w.loadState();
}
// Snapshots as they are stored, so the ledger is tested on its real input.
const snap=(date,alerts)=>({date,source:'acorn_alerts',takenAt:date+'T12:00:00Z',
  alerts:alerts.map(a=>({ticker:a.ticker,foundOn:a.foundOn,strategy:a.pattern,
    direction:a.direction,entry:a.entry,stop:a.stop,target1:a.target1,
    rr:a.rr,hitDate:a.statusDate,source:'acorn_alerts'}))});

console.log('\ntaking a snapshot');
t('a pull is stored with its alerts',()=>{
  seed([]);
  const s=w.atAlertSnapshot([A('AAA','Bear Flag',2.2)],'acorn_alerts');
  assert.strictEqual(s.alerts.length,1);
  assert.strictEqual(JSON.parse(w.localStorage.getItem('at_v2')).alertSnapshots.length,1);
});
t('two pulls on one day stay one snapshot',()=>{
  seed([]);
  w.atAlertSnapshot([A('AAA','Bear Flag',2.2)],'acorn_alerts');
  w.atAlertSnapshot([A('AAA','Bear Flag',2.2),A('BBB','Smart Surge',2.4)],'acorn_alerts');
  const list=JSON.parse(w.localStorage.getItem('at_v2')).alertSnapshots;
  assert.strictEqual(list.length,1,'reviewing twice in an evening is not two days of evidence');
  assert.strictEqual(list[0].alerts.length,2,'and the later pull wins');
});
t('an empty pull is not recorded as an empty day',()=>{
  seed([]);
  assert.strictEqual(w.atAlertSnapshot([],'acorn_alerts'),null,
    'a failed pull would otherwise read as "every alert vanished"');
});

console.log('\nwhat happened to each alert');
t('still listed and never hit is open',()=>{
  seed([snap('2026-11-23',[A('AAA','Bear Flag',2.2)]),
        snap('2026-11-30',[A('AAA','Bear Flag',2.2)])]);
  const r=w.atAlertLedger().records[0];
  assert.strictEqual(r.status,'open');
  assert.strictEqual(r.stillListed,true);
});
t('a hit date is a hit, and sticks once seen',()=>{
  seed([snap('2026-11-23',[A('AAA','Bear Flag',2.2)]),
        snap('2026-11-30',[A('AAA','Bear Flag',2.2,'Nov-27-2026')]),
        snap('2026-12-07',[])]);
  const r=w.atAlertLedger().records[0];
  assert.strictEqual(r.hitDate,'Nov-27-2026');
  assert.strictEqual(r.status,'hit','removal after a hit is still a hit');
});
t('present then gone, with no hit, is a removal',()=>{
  seed([snap('2026-11-23',[A('AAA','Bear Flag',2.2),A('BBB','Smart Surge',2.4)]),
        snap('2026-11-30',[A('AAA','Bear Flag',2.2)])]);
  const led=w.atAlertLedger();
  const bbb=led.records.find(r=>r.ticker==='BBB');
  assert.strictEqual(bbb.status,'removed','this is the loser the vendor list hides');
  assert.strictEqual(bbb.stillListed,false);
});
t('the same ticker re-alerted later is a separate record',()=>{
  seed([snap('2026-11-23',[A('AAA','Bear Flag',2.2,'','Nov-01-2026')]),
        snap('2026-11-30',[A('AAA','Bear Flag',2.2,'','Nov-28-2026')])]);
  assert.strictEqual(w.atAlertLedger().records.length,2,
    'found date distinguishes a fresh alert from the old one');
});

console.log('\nthe baseline is never counted as a win');
t('everything in the first snapshot is marked baseline',()=>{
  seed([snap('2026-11-23',[A('AAA','Bear Flag',2.2,'Nov-20-2026')])]);
  const r=w.atAlertLedger().records[0];
  assert.strictEqual(r.baseline,true);
});
t('and is excluded from the rate rather than scored as a hit',()=>{
  // One inherited winner and nothing else: the rate must be unknown, not 100%.
  seed([snap('2026-11-23',[A('AAA','Bear Flag',2.2,'Nov-20-2026')])]);
  const sc=w.atAlertScore('pattern');
  assert.strictEqual(sc.baselineCount,1);
  assert.strictEqual(sc.rows[0].hitRate,null,'counting inherited survivors is the bias itself');
  assert.strictEqual(sc.rows[0].scored,0);
});
t('alerts first seen after tracking began are scored',()=>{
  seed([snap('2026-11-23',[A('OLD','Bear Flag',2.2)]),
        snap('2026-11-30',[A('OLD','Bear Flag',2.2),A('NEW','Bear Flag',2.2)]),
        snap('2026-12-07',[A('OLD','Bear Flag',2.2)])]);
  const row=w.atAlertScore('pattern').rows[0];
  assert.strictEqual(row.baseline,1,'OLD');
  assert.strictEqual(row.scored,1,'NEW');
  assert.strictEqual(row.removed,1);
  assert.strictEqual(row.hitRate,0,'one tracked alert, removed without hitting');
});

console.log('\ngrouping, and what the rate excludes');
t('open alerts are left out of the rate, not counted either way',()=>{
  seed([snap('2026-11-23',[]),
        snap('2026-11-30',[A('W','Bear Flag',2.2),A('L','Bear Flag',2.2),A('O','Bear Flag',2.2)]),
        snap('2026-12-07',[A('W','Bear Flag',2.2,'Dec-02-2026'),A('O','Bear Flag',2.2)])]);
  const row=w.atAlertScore('pattern').rows[0];
  assert.strictEqual(row.hit,1);
  assert.strictEqual(row.removed,1);
  assert.strictEqual(row.open,1);
  assert.strictEqual(row.settled,2);
  assert.strictEqual(row.hitRate,50,'1 of 2 settled, with the undecided one held back');
});
t('patterns are kept apart',()=>{
  seed([snap('2026-11-23',[]),
        snap('2026-11-30',[A('A','Bear Flag',2.2),A('B','Smart Surge',2.4)]),
        snap('2026-12-07',[A('A','Bear Flag',2.2,'Dec-01-2026')])]);
  const rows=w.atAlertScore('pattern').rows;
  assert.strictEqual(rows.length,2);
  assert.strictEqual(rows.find(r=>r.group==='Bear Flag').hit,1);
  assert.strictEqual(rows.find(r=>r.group==='Smart Surge').removed,1);
});
t('R:R bands answer the other half of the question',()=>{
  seed([snap('2026-11-23',[]),
        snap('2026-11-30',[A('A','x',1.8),A('B','x',2.2),A('C','x',2.9)])]);
  const groups=w.atAlertScore('rr').rows.map(r=>r.group).sort();
  assert.strictEqual(groups.join(','),'2.0 – 2.49,2.5 and up,under 2.0');
});
t('with nothing tracked it reports nothing rather than zero',()=>{
  seed([]);
  const sc=w.atAlertScore('pattern');
  assert.strictEqual(sc.snapshots,0);
  assert.strictEqual(sc.rows.length,0);
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
