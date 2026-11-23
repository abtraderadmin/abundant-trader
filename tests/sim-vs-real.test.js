// Evaluation accounts are simulated. Passing one matters, but the money is
// not real and must never sit in a total beside money that is.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

const BLOB='at_v2';
const tr=(acct,mod,pl,i)=>({id:acct+mod+i,module:mod,account:acct,date:'2026-11-1'+(i%9),
  symbol:'MES',direction:'LONG',qty:1,netPL:pl,grossPL:pl,status:'CLOSED',exitPrice:1});
w.localStorage.setItem(BLOB,JSON.stringify({
  settings:{evalAccounts:['Apex-4687-107','Apex-4687-108','','','','','','','',''],
            paAccounts:['PA-APEX-4687-13','','','',''],
            cashAccounts:['Alpha-0001','',''],
            paperAccounts:['Paper-1','','','',''],
            accountGoals:{'Apex-4687-107':3000,'Apex-4687-108':3000},
            apexAccounts:{}},
  trades:[tr('Apex-4687-107','futures',288,1), tr('Apex-4687-108','futures',288,2),
          tr('PA-APEX-4687-13','futures',-67,3), tr('Alpha-0001','stock',1000,4),
          tr('Paper-1','futures',9999,5)]}));
w.loadState();

console.log('\nacctNature already knows the difference');
t('eval, paper, real and unassigned are distinct',()=>{
  assert.strictEqual(w.acctNature({account:'Apex-4687-107'}),'eval');
  assert.strictEqual(w.acctNature({account:'Paper-1'}),'paper');
  assert.strictEqual(w.acctNature({account:'PA-APEX-4687-13'}),'real');
  assert.strictEqual(w.acctNature({account:'Alpha-0001'}),'real');
});

console.log('\nsimulated money stays out of the real totals');
w.renderGoals('goalsRibbon','statsRow');
const txt=()=>(w.document.getElementById('goalsRibbon')||{}).innerHTML||'';
// Just the Evaluations ring, as plain text. Matching against the whole
// ribbon is how a target from another card gets mistaken for this one.
const evalCardText=()=>{
  const el=w.document.getElementById('goalsRibbon'); if(!el)return '';
  const hit=Array.from(el.querySelectorAll('*')).filter(n=>
    n.children.length===0 && /Evaluations \(sim\)/.test(n.textContent||''))[0];
  const card=hit&&hit.closest('div').parentNode;
  return card?(card.textContent||'').replace(/\s+/g,' ').trim():'';
};
t('the futures ring counts PA only, not the evals',()=>{
  // real futures = -67. With evals it would read +509.
  assert(/-\$67/.test(txt())||/\$-67/.test(txt()),'futures ring is not -67: '+
    (txt().match(/Futures[\s\S]{0,180}/)||[''])[0].replace(/<[^>]+>/g,' ').slice(0,120));
});
t('the eval total is computed separately from the real one',()=>{
  assert(/const closedEval=/.test(src),'no separate eval total');
  assert(/const real=closed\.filter\(t=>!isSim\(t\)\)/.test(src),'real set is not filtered');
  assert(/const totalNet=real\.reduce/.test(src),'TOTAL NET still sums everything');
});
t('paper and eval are treated alike',()=>
  assert(/n==='paper'\|\|n==='eval'/.test(src),'eval is not grouped with paper'));
t('prior P/L credited to futures is real-money only',()=>{
  const i=src.indexOf('const futAcctNames=');
  assert(!/evalAccounts/.test(src.slice(i,i+200)),'eval prior P/L inflates the futures ring');
});

console.log('\nthe evals are still shown, just not added in');
t('a combined Evaluations ring exists and is labelled simulated',()=>{
  assert(/Evaluations \(sim\)/.test(src),'no eval ring');
  assert(/Evaluations \(sim\)/.test(txt()),'eval ring not rendered');
});
t('it carries the combined eval target',()=>{
  const c=evalCardText();
  assert(/6,?000/.test(c),'two $3,000 evals should total $6,000 — card reads: '+c);
});
t('each eval still has its own card',()=>{
  assert(/Apex-4687-107/.test(txt()),'107 card missing');
  assert(/Apex-4687-108/.test(txt()),'108 card missing');
});

console.log('\na closed eval drops out of both');
// Seeded straight into the blob rather than through apexSetStatus, which
// calls renderAll and is far heavier than this invariant needs.
(function(){
  const b=JSON.parse(w.localStorage.getItem(BLOB));
  b.settings.apexAccounts={'Apex-4687-108':{status:'blown',closedOn:'2026-11-19'}};
  w.localStorage.setItem(BLOB,JSON.stringify(b));
  w.loadState();
})();
t('the status took',()=>assert.strictEqual(w.atAcctClosed('Apex-4687-108'),true));
w.renderGoals('goalsRibbon','statsRow');
t('its card is gone',()=>assert(!/Apex-4687-108/.test(txt()),'closed eval still carded'));
t('and its target no longer counts toward the eval ring',()=>{
  const c=evalCardText();
  assert(/3,?000/.test(c)&&!/6,?000/.test(c),
    'closed eval target still in the combined goal — card reads: '+c);
});

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
dom.window.close(); process.exit(fail?1:0);
