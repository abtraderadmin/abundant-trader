// Closing a blown account. The rule throughout: it stops being somewhere to
// trade, it never stops being a record.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

const BLOWN='PA-APEX-4687-12', LIVE='PA-APEX-4687-13';
const BLOB='at_v2';
function seed(patch){
  let cur={}; try{cur=JSON.parse(w.localStorage.getItem(BLOB)||'{}');}catch(e){}
  cur.settings=Object.assign({},cur.settings,patch.settings);
  Object.keys(patch).forEach(k=>{if(k!=='settings')cur[k]=patch[k];});
  w.localStorage.setItem(BLOB,JSON.stringify(cur));
  w.loadState();
}
const active=()=>Array.from(w.atActiveFutAccts()).sort().join('|');
const trade=(acct,date,pl)=>({id:acct+date+pl,module:'futures',account:acct,accountType:'pa',
  date,symbol:'MES',direction:'LONG',qty:2,netPL:pl,grossPL:pl,status:'CLOSED',exitPrice:1});

seed({settings:{paAccounts:[LIVE,BLOWN,'','',''],evalAccounts:[],
       apexAccounts:{[LIVE]:{size:50000,dd:2500,firm:'Apex'},[BLOWN]:{size:50000,dd:2500,firm:'Apex'}}},
      trades:[trade(LIVE,'2026-11-10',216),trade(LIVE,'2026-11-11',200),
              trade(BLOWN,'2026-11-10',214),trade(BLOWN,'2026-11-12',-3242)]});

console.log('\nby default every account is active');
t('status reads active',()=>{
  assert.strictEqual(w.atAcctStatus(BLOWN),'active');
  assert.strictEqual(w.atAcctClosed(BLOWN),false);
});
t('both are offered for a new trade',()=>
  assert.strictEqual(active(),[BLOWN,LIVE].sort().join('|')));

console.log('\nclosing it');
w.apexSetStatus(BLOWN,'blown');
t('the status sticks and is dated',()=>{
  assert.strictEqual(w.atAcctStatus(BLOWN),'blown');
  assert(w.atAcctClosed(BLOWN));
  const c=JSON.parse(w.localStorage.getItem(BLOB)).settings.apexAccounts[BLOWN];
  assert(/^\d{4}-\d{2}-\d{2}$/.test(c.closedOn||''),'no closed date: '+c.closedOn);
});
t('it is no longer somewhere to put a new trade',()=>
  assert.strictEqual(active(),LIVE));
t('the live account is untouched',()=>{
  assert.strictEqual(w.atAcctStatus(LIVE),'active');
  assert.strictEqual(w.atAcctClosed(LIVE),false);
});

console.log('\nnothing is deleted');
t('its trades are all still there',()=>{
  const ts=JSON.parse(w.localStorage.getItem(BLOB)).trades
             .filter(x=>x.account===BLOWN);
  assert.strictEqual(ts.length,2,'trades lost');
  assert.strictEqual(ts.reduce((s,x)=>s+x.netPL,0),-3028);
});
t('the account name is never rewritten on a trade',()=>
  JSON.parse(w.localStorage.getItem(BLOB)).trades
    .forEach(x=>assert(x.account===BLOWN||x.account===LIVE,'account renamed: '+x.account)));
t('its final figures still evaluate',()=>{
  const e=w.apexEval(BLOWN);
  assert.strictEqual(e.trades,2);
  assert.strictEqual(Math.round(e.profit),-3028);
});
t('a note can be kept with it',()=>{
  w.apexSetClosedNote(BLOWN,'one 3242 day, lockout was off');
  assert.strictEqual(
    JSON.parse(w.localStorage.getItem(BLOB)).settings.apexAccounts[BLOWN].closedNote,
    'one 3242 day, lockout was off');
});

console.log('\nthe panel separates the two');
t('closed accounts render in their own section',()=>{
  w.apexRender();
  const html=(w.document.getElementById('apex-panel')||{}).innerHTML||'';
  assert(html.includes('Closed accounts'),'no closed section');
  assert(html.includes(BLOWN),'the closed account is not listed');
  assert(html.includes('final'),'no final figure shown');
});
t('the section is collapsed by default and says how many',()=>{
  const html=(w.document.getElementById('apex-panel')||{}).innerHTML||'';
  assert(/show ▾/.test(html),'not collapsed on first render');
  assert(/apexToggleShut\(\)/.test(html),'no way to open it');
  // the header carries the count and the combined final figure
  const hdr=(html.match(/Closed accounts[\s\S]{0,420}?show ▾/)||[''])[0];
  assert(/>1</.test(hdr),'count missing from the header');
  assert(/-3,?028/.test(hdr.replace(/<[^>]+>/g,' ')),'combined final P/L missing: '+
    hdr.replace(/<[^>]+>/g,' ').slice(0,160));
});
t('clicking opens it, and the choice sticks',()=>{
  w.apexToggleShut();
  let html=(w.document.getElementById('apex-panel')||{}).innerHTML||'';
  assert(/hide ▴/.test(html),'did not open');
  assert.strictEqual(
    JSON.parse(w.localStorage.getItem(BLOB)).settings.apexShutOpen,true,'not remembered');
  w.apexToggleShut();
  html=(w.document.getElementById('apex-panel')||{}).innerHTML||'';
  assert(/show ▾/.test(html),'did not close again');
});
t('a closed account cannot register as a live breach',()=>{
  const html=(w.document.getElementById('apex-panel')||{}).innerHTML||'';
  const badge=(html.match(/gov-badge[\s\S]{0,160}?<\/span>/)||[''])[0];
  assert(!/breach/.test(badge)||!badge.includes(BLOWN),'closed account counted in the badge');
});

console.log('\nreopening works');
w.apexSetStatus(BLOWN,'active');
t('status clears and it returns to the live list',()=>{
  assert.strictEqual(w.atAcctStatus(BLOWN),'active');
  assert.strictEqual(active(),[BLOWN,LIVE].sort().join('|'));
});
t('the note survives a reopen, so the history is not lost',()=>
  assert.strictEqual(
    JSON.parse(w.localStorage.getItem(BLOB)).settings.apexAccounts[BLOWN].closedNote,
    'one 3242 day, lockout was off'));

console.log('\nwhere closed accounts must still appear');
t('Performance filters are not filtered by status',()=>{
  const perf=src.slice(src.indexOf('if(!state.perfFilter.nature)'),
                       src.indexOf('if(!state.perfFilter.nature)')+420);
  assert(!/atAcctClosed/.test(perf),'Performance hides closed accounts');
});
t('import pickers keep them, labelled',()=>{
  assert(/const lbl=n=>n\+\(atAcctClosed\(n\)\?' \(closed\)':''\)/.test(src),'no label helper');
  assert(/\$\{lbl\(n\)\}/.test(src),'label never used');
});
t('order matching still reaches them',()=>{
  const fn=src.slice(src.indexOf('function paOrdMatchAcct'),
                     src.indexOf('function paOrdMatchAcct')+420);
  assert(!/atAcctClosed/.test(fn),'a late broker export could not be matched');
});

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
dom.window.close(); process.exit(fail?1:0);
