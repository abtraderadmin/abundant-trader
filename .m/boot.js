const fs=require('fs'),{JSDOM}=require('jsdom');
const errs=[];
const vc=new (require('jsdom').VirtualConsole)();
vc.on('jsdomError',e=>errs.push('jsdomError: '+e.message));
vc.on('error',(...a)=>errs.push('console.error: '+a.join(' ')));
const d=new JSDOM(fs.readFileSync('index.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',virtualConsole:vc});
const w=d.window;
w.addEventListener('error',e=>errs.push('window.onerror: '+(e.message||e.error)));
w.localStorage.setItem('at_v2',JSON.stringify({
  settings:{cashAccounts:['C1'],marginAccounts:['M1'],evalAccounts:['E1','E2'],paAccounts:['PA1'],
    apexAccounts:{E1:{size:50000,dd:2000,maxContracts:5,firm:'Apex'},
                  E2:{size:50000,dd:2000,maxContracts:5,firm:'Black Vault'}},
    stockOptionsAccountValue:40000,tradeRiskPct:2,maxLossPerTrade:600,capitalCeiling:1500},
  trades:[{id:1,account:'E1',symbol:'MES',pnl:120,date:'2026-11-20'}],
  discoveries:[{ticker:'AAA',entry:10,stop:9,target:13},{ticker:'BBB'}],
  importQueue:[{ticker:'CCC'}],
  stockHoldings:{C1:{acctName:'C1',accountType:'cash',cash:1000,ts:'x',
    positions:[{symbol:'AAA',qty:10,price:100,value:1000,totalCost:800,totalGain:200,
      totalGainPct:25,daysGain:5,changePct:0.5}],summary:{netValue:2000}}}}));
w.loadState(); w.renderAll();
const screens=[...w.document.querySelectorAll('section.screen')].map(s=>s.id.replace('screen-',''));
for(const s of screens){ try{ w.showScreen(s); }catch(e){ errs.push('showScreen('+s+'): '+e.message); } }
// Flush the deferred sub-tab repaint.
setTimeout(()=>{
  const groups=[...new Set([...w.document.querySelectorAll('.subtabs')].map(b=>b.dataset.group))];
  console.log('screens visited: '+screens.length+'  ('+screens.join(', ')+')');
  console.log('sub-tab groups : '+groups.join(', '));
  for(const g of groups){
    const act=[...w.document.querySelectorAll('.subpane[data-group="'+g+'"].active')].map(p=>p.dataset.pane);
    if(act.length!==1)errs.push('group '+g+' has '+act.length+' active panes');
  }
  // Visit each screen and demand exactly one lit entry on the bar you can see,
  // and exactly one lit top tab.
  for(const sc of screens){
    w.showScreen(sc);
    const el=w.document.getElementById('screen-'+sc);
    const bar=el.querySelector('.subtabs[data-group]');
    if(bar){
      const on=bar.querySelectorAll('.subtab.active').length;
      if(on!==1)errs.push(sc+': '+on+' lit entries on its bar');
    }
    const tabs=w.document.querySelectorAll('.tab[data-screen].active');
    if(tabs.length!==1)errs.push(sc+': '+tabs.length+' lit top tabs');
  }
  console.log('top tabs       : '+w.document.querySelectorAll('.tab[data-screen]').length);
  const ru=w.document.querySelectorAll('details.rollup').length;
  console.log('roll-ups       : '+ru);
  console.log(errs.length?('\n'+errs.length+' PROBLEM(S):\n  '+errs.join('\n  ')):'\nno errors');
  process.exit(errs.length?1:0);
},50);
