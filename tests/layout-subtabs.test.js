// Sub-tabs and roll-ups.
//
// Measured before anything was moved. The Stock screen rendered 44,428
// characters and 31,618 of them — 71% — were the holdings panel, always open,
// sitting between the top of the page and the trade form people come there to
// use. Futures was 54,413 with 36,267 in two compliance panels that, because
// they insert themselves, sat ABOVE the goals ribbon.
//
// The fix is a view at a time, not an eleventh tab across the top.
//
// All figures invented. This repo is public.
//
//   node tests/layout-subtabs.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const d=w.document;
const pos=(s,q,p)=>({symbol:s,qty:q,price:p,value:q*p,totalCost:q*p*0.8,
  totalGain:q*p*0.2,totalGainPct:20,daysGain:1,changePct:0.5});
function seed(over){
  w.localStorage.setItem('at_v2',JSON.stringify({
    settings:Object.assign({cashAccounts:['C1'],
      evalAccounts:['E1','E2','','','','','','','',''],paAccounts:['PA1','','','',''],
      apexAccounts:{E1:{size:50000,dd:2000,maxContracts:5,firm:'Black Vault'}}},over||{}),
    trades:[],
    stockHoldings:{C1:{acctName:'C1',accountType:'cash',cash:1000,ts:'x',
      positions:Array.from({length:23},(_,i)=>pos('S'+i,10,100)),summary:{netValue:5000}}}}));
  w.loadState(); w.renderAll();
}
const pane=(g,n)=>d.querySelector('.subpane[data-group="'+g+'"][data-pane="'+n+'"]');
const active=g=>[...d.querySelectorAll('.subpane[data-group="'+g+'"].active')].map(p=>p.dataset.pane);

console.log('\none view at a time');
t('Stock opens on Trade, with the portfolio behind a tab',()=>{
  seed();
  assert.strictEqual(active('stock').join(','),'trade');
  assert(!pane('stock','portfolio').classList.contains('active'));
});
t('and the bulk of the screen is no longer in the way',()=>{
  seed();
  const st=d.getElementById('screen-stock');
  const shown=[...st.querySelectorAll('.subpane.active')]
    .reduce((n,p)=>n+p.innerHTML.length,0);
  const hidden=[...st.querySelectorAll('.subpane:not(.active)')]
    .reduce((n,p)=>n+p.innerHTML.length,0);
  assert(hidden>shown*2,'the holdings panel was 71% of this screen; '
    +'shown '+shown+' vs hidden '+hidden);
});
t('switching shows the other view and only the other view',()=>{
  seed();
  w.atSetSubTab('stock','portfolio');
  assert.strictEqual(active('stock').join(','),'portfolio');
  assert.ok(pane('stock','portfolio').querySelector('#stockPortfolioPanel'));
});
t('the choice is remembered, not reset on the next render',()=>{
  seed();
  w.atSetSubTab('stock','portfolio');
  w.renderAll();
  assert.strictEqual(active('stock').join(','),'portfolio');
});
t('a remembered pane that no longer exists falls back to the first',()=>{
  seed({uiSubTabs:{stock:'a-pane-that-was-removed'}});
  assert.strictEqual(active('stock').join(','),'trade','never a blank screen');
});

console.log('\nthe tab says what is behind it');
t('Portfolio carries its position count',()=>{
  seed();
  const c=d.querySelector('.subtabs[data-group="stock"] .subtab[data-tab="portfolio"] .st-count');
  assert.strictEqual(c.textContent,'· 23');
});
t('Accounts carries its live-account count, closed ones excluded',()=>{
  seed({apexAccounts:{E1:{size:50000,dd:2000,firm:'Apex'},
                      E2:{size:50000,dd:2000,firm:'Apex',status:'blown'}}});
  const c=d.querySelector('.subtabs[data-group="futures"] .subtab[data-tab="accounts"] .st-count');
  assert.strictEqual(c.textContent,'· 2','E1 and PA1; the blown E2 is not live');
});

console.log('\nfutures panels mount into their pane, not the top of the screen');
t('the compliance panels land inside Accounts',()=>{
  seed();
  const acc=pane('futures','accounts');
  assert.ok(acc.querySelector('#apex-panel'),'apex panel outside its pane would ignore the tab');
  assert.ok(acc.querySelector('#eval-panel'));
});
t('and the goals ribbon is above them again',()=>{
  seed();
  const f=d.getElementById('screen-futures');
  const kids=[...f.children];
  const ribbon=kids.findIndex(k=>k.id==='goalsRibbon');
  const panes=kids.findIndex(k=>k.classList.contains('subpane'));
  assert(ribbon<panes,'the panels used to insert themselves above it');
});

console.log('\nroll-ups');
t('a roll-up is a real disclosure element, not a div pretending',()=>{
  const html=w.atRollup('k','Title','sub','right','<p>body</p>',false);
  assert.match(html,/^<details class="rollup"/,'browser keyboard and ARIA behaviour comes free');
  assert.match(html,/<summary>/);
  assert.match(html,/<p>body<\/p>/);
});
t('closed by default still answers the obvious question',()=>{
  const html=w.atRollup('k','Holdings','23 positions','$38,143','<p>x</p>',false);
  assert(!/ open>/.test(html),'default closed');
  assert.match(html,/23 positions/,'the summary line has to work while shut');
  assert.match(html,/\$38,143/);
});
t('open state is remembered per key',()=>{
  seed({uiRollups:{mykey:true}});
  assert.match(w.atRollup('mykey','T','','','<p>x</p>',false),/<details class="rollup" open/);
  assert.strictEqual(w.atRollupOpen('never-set',false),false);
  assert.strictEqual(w.atRollupOpen('never-set',true),true);
});
t('toggling writes it back',()=>{
  seed();
  w.atRollupToggle('mykey',{open:true});
  assert.strictEqual(JSON.parse(w.localStorage.getItem('at_v2')).settings.uiRollups.mykey,true);
  w.atRollupToggle('mykey',{open:false});
  assert.strictEqual(JSON.parse(w.localStorage.getItem('at_v2')).settings.uiRollups.mykey,false);
});
t('a quote in a key cannot break out of the handler',()=>{
  assert(!/onto[g]gle="atRollupToggle\('a'b'/.test(w.atRollup("a'b",'T','','','x',false)));
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
