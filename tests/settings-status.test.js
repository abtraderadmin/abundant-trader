// The status control in Settings. This is the only place an EVAL account can
// be retired -- the Apex compliance panel is PA-only -- so it has to work for
// both groups and it has to write to the right account.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const BLOB='at_v2';
const EV=['Apex-4687-102','Apex-4687-107','Apex-4687-108'];
const PA=['PA-APEX-4687-12','PA-APEX-4687-13'];
function seed(){
  const cur={settings:{evalAccounts:EV.concat(['','','','','','','']),
                       paAccounts:PA.concat(['','','']),apexAccounts:{}},trades:[]};
  w.localStorage.setItem(BLOB,JSON.stringify(cur));
  w.loadState();
  if(typeof w.loadSettingsIntoForm==='function')w.loadSettingsIntoForm();
  else if(typeof w.renderSettings==='function')w.renderSettings();
  else if(typeof w.renderAll==='function')w.renderAll();
}
const cfg=()=>JSON.parse(w.localStorage.getItem(BLOB)).settings.apexAccounts||{};
seed();

console.log('\na control appears beside every named account');
t('three eval rows have one',()=>[1,2,3].forEach(i=>
  assert(w.document.getElementById('cfg-ev'+i+'-st'),'cfg-ev'+i+'-st missing')));
t('two PA rows have one',()=>[1,2].forEach(i=>
  assert(w.document.getElementById('cfg-pa'+i+'-st'),'cfg-pa'+i+'-st missing')));
t('empty rows do not',()=>{
  const e=w.document.getElementById('cfg-ev9-st');
  assert(!e||e.style.display==='none','an unnamed row got a status control');
});
t('it offers exactly the three real states',()=>{
  const o=[...w.document.getElementById('cfg-ev1-st').options].map(x=>x.value);
  assert.strictEqual(o.join(','),'active,blown,closed');
});

console.log('\nadding it must not squeeze the name box out of the row');
t('the name input keeps a usable width and the row wraps',()=>{
  [1,2,3].forEach(i=>{
    const inp=w.document.getElementById('cfg-ev'+i);
    assert.strictEqual(inp.parentNode.style.flexWrap,'wrap','eval row '+i+' does not wrap');
    assert(parseInt(inp.style.minWidth||'0',10)>=100,'eval row '+i+' name box can collapse');
  });
});
t('the names are still there — a collapsed box is not a deleted account',()=>{
  const ev=JSON.parse(w.localStorage.getItem(BLOB)).settings.evalAccounts;
  assert.deepStrictEqual(ev.slice(0,3).join('|'),EV.join('|'));
  [1,2,3].forEach(i=>assert.strictEqual(
    w.document.getElementById('cfg-ev'+i).value,EV[i-1],'row '+i+' lost its name'));
});
t('the status control never shrinks at the name box\'s expense',()=>
  assert(/flex:0 0 auto;max-width:120px/.test(src),'the select can grow and crowd the row'));

console.log('\nit writes to the account on its own row');
// The bug this guards: a change handler closing over a function-scoped loop
// index sends every row's change to the last account.
t('changing eval row 2 closes 107, not 108',()=>{
  const sel=w.document.getElementById('cfg-ev2-st');
  sel.value='blown';
  sel.dispatchEvent(new w.Event('change'));
  assert.strictEqual(w.atAcctStatus('Apex-4687-107'),'blown','107 not closed');
  assert.strictEqual(w.atAcctStatus('Apex-4687-108'),'active','108 was closed instead');
  assert.strictEqual(w.atAcctStatus('Apex-4687-102'),'active','102 was touched');
});
t('changing PA row 1 closes -12, not -13',()=>{
  const sel=w.document.getElementById('cfg-pa1-st');
  sel.value='blown';
  sel.dispatchEvent(new w.Event('change'));
  assert.strictEqual(w.atAcctStatus('PA-APEX-4687-12'),'blown');
  assert.strictEqual(w.atAcctStatus('PA-APEX-4687-13'),'active');
});
t('an eval can be closed at all — the Apex panel never could',()=>{
  assert.strictEqual(w.atAcctClosed('Apex-4687-107'),true);
  const active=Array.from(w.atActiveFutAccts());
  assert(!active.includes('Apex-4687-107'),'closed eval still offered for new trades');
  assert(active.includes('Apex-4687-108'),'108 wrongly withdrawn');
});
t('the date is recorded',()=>
  assert(/^\d{4}-\d{2}-\d{2}$/.test((cfg()['Apex-4687-107']||{}).closedOn||''),'no closedOn'));

console.log('\nthe loop binding is per-iteration');
t('let, not var',()=>
  assert(/for\(let i=1;i<=n;i\+\+\)/.test(src),'function-scoped index would misroute every change'));

console.log('\nreopening from the same control');
t('setting it back to active clears the status',()=>{
  const sel=w.document.getElementById('cfg-ev2-st');
  sel.value='active';
  sel.dispatchEvent(new w.Event('change'));
  assert.strictEqual(w.atAcctStatus('Apex-4687-107'),'active');
  assert(Array.from(w.atActiveFutAccts()).includes('Apex-4687-107'));
});

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
dom.window.close(); process.exit(fail?1:0);
