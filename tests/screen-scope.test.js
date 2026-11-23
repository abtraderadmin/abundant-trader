// The goals ribbon and stat tiles were shared between the Futures and Stock
// screens, so each carried the other's accounts. Each screen now shows its
// own side of the business only -- and cash accounts, which never had a
// per-account card at all, now get one.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
let n=0;
const tr=(acct,mod,pl)=>({id:acct+mod+(++n),module:mod,account:acct,date:'2026-11-10',
  symbol:'X',direction:'LONG',qty:1,netPL:pl,grossPL:pl,status:'CLOSED',exitPrice:1});
w.localStorage.setItem('at_v2',JSON.stringify({
  settings:{evalAccounts:['EV-A','','','','','','','','',''],
            paAccounts:['PA-A','','','',''],
            cashAccounts:['Beta-0003','Alpha-0001',''],
            paperAccounts:['','','','',''],
            accountGoals:{'EV-A':3000,'PA-A':5200,'Beta-0003':2000,'Alpha-0001':4000},
            apexAccounts:{}},
  trades:[tr('EV-A','futures',288), tr('PA-A','futures',-67),
          tr('Beta-0003','stock',400), tr('Alpha-0001','stock',-120),
          tr('Alpha-0001','spy_day',55)]}));
w.loadState();
w.renderGoals('goalsRibbon','statsRow');
w.renderGoals('goalsRibbon2','statsRow2');
const txt=id=>{const e=w.document.getElementById(id);
  return e?(e.textContent||'').replace(/\s+/g,' ').trim():'';};

console.log('\nthe futures screen shows futures only');
t('futures accounts are there',()=>{
  const r=txt('goalsRibbon');
  assert(/EV-A/.test(r),'eval card missing'); assert(/PA-A/.test(r),'PA card missing');
});
t('no cash accounts on it',()=>{
  const r=txt('goalsRibbon');
  assert(!/Beta-0003/.test(r)&&!/Alpha-0001/.test(r),'a cash account leaked onto Futures');
});
t('no Stock or SPY rings on it',()=>{
  const r=txt('goalsRibbon');
  assert(!/\bStock\b/.test(r),'Stock ring on the futures screen');
  assert(!/SPY/.test(r),'SPY ring on the futures screen');
});

console.log('\nthe stock screen shows the cash side only');
t('no futures accounts on it',()=>{
  const r=txt('goalsRibbon2');
  assert(!/EV-A/.test(r),'eval card on the Stock page');
  assert(!/PA-A/.test(r),'PA card on the Stock page');
  assert(!/Evaluations \(sim\)/.test(r),'Evaluations ring on the Stock page');
  assert(!/Futures/.test(r),'Futures ring on the Stock page');
});
t('cash accounts finally get their own cards',()=>{
  const r=txt('goalsRibbon2');
  assert(/Beta-0003/.test(r),'Beta-0003 has no card');
  assert(/Alpha-0001/.test(r),'Alpha-0001 has no card');
});
t('eval accounts no longer sit under Paper & Sim there',()=>
  assert(!/EV-A/.test(txt('statsRow2')),'eval tile on the Stock stats'));

console.log('\neach screen totals only what it shows');
t('futures headline is the futures figure',()=>{
  const s=txt('statsRow');
  assert(/Futures Net P\/L/.test(s),'headline not renamed');
  // PA -67 only; the eval is simulated and excluded
  assert(/-\$?67/.test(s),'futures headline is not -67: '+s.slice(0,140));
});
t('stock headline is the cash figure',()=>{
  const s=txt('statsRow2');
  assert(/Stock \/ Options \/ SPY/.test(s),'headline not renamed');
  // 400 - 120 + 55 = 335
  assert(/\$?335/.test(s),'stock headline is not 335: '+s.slice(0,140));
});
t('the two headlines are no longer the same number',()=>
  assert.notStrictEqual(txt('statsRow'),txt('statsRow2')));
t('trade counts are per screen, not the whole book',()=>{
  assert(!/\b5\b/.test(txt('statsRow').match(/Trades [^A-Za-z]*/)||''),'futures shows all 5 trades');
});

console.log('\na closed account still drops out, on either screen');
(function(){
  const b=JSON.parse(w.localStorage.getItem('at_v2'));
  b.settings.apexAccounts={'PA-A':{status:'blown'}};
  b.settings.cashAccounts=['Beta-0003','Alpha-0001',''];
  w.localStorage.setItem('at_v2',JSON.stringify(b)); w.loadState();
})();
w.renderGoals('goalsRibbon','statsRow');
t('closed PA leaves the futures ribbon',()=>
  assert(!/PA-A/.test(txt('goalsRibbon')),'closed PA still carded'));

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
dom.window.close(); process.exit(fail?1:0);
