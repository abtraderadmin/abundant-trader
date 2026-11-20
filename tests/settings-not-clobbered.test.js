// Account names in Settings are committed by the Save button, not on typing.
// Anything that repaints the settings form mid-edit therefore erases what has
// been typed. That happened for real: three account names were entered, a
// status dropdown was used, and the names were gone.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const BLOB='at_v2';
const g=id=>w.document.getElementById(id);
function seed(){
  w.localStorage.setItem(BLOB,JSON.stringify({settings:{
    evalAccounts:['Apex-4687-102','Apex-4687-107','Apex-4687-108','','','','','','',''],
    paAccounts:['PA-APEX-4687-13','','','',''],
    accountGoals:{'Apex-4687-102':3000},
    apexAccounts:{'Apex-4687-102':{size:50000,firm:'Apex'}}},trades:[]}));
  w.loadState(); w.renderCfg();
}
const type=(id,v)=>{const el=g(id); el.value=v; el.dispatchEvent(new w.Event('input',{bubbles:true}));};

console.log('\ntyping then repainting');
seed();
t('the existing names are shown',()=>{
  assert.strictEqual(g('cfg-ev1').value,'Apex-4687-102');
  assert.strictEqual(g('cfg-ev4').value,'');
});
t('three new names typed into empty rows survive a repaint',()=>{
  type('cfg-ev4','BVFE1E00IWNI');
  type('cfg-ev5','BVFE1E00IWNJ');
  type('cfg-ev6','BVFE1E00IWNK');
  w.renderCfg();                       // the repaint that used to wipe them
  assert.strictEqual(g('cfg-ev4').value,'BVFE1E00IWNI');
  assert.strictEqual(g('cfg-ev5').value,'BVFE1E00IWNJ');
  assert.strictEqual(g('cfg-ev6').value,'BVFE1E00IWNK');
});
t('using a status dropdown does not wipe them — the reported bug',()=>{
  const sel=g('cfg-ev1-st');
  assert(sel,'no status control to drive');
  sel.value='blown';
  sel.dispatchEvent(new w.Event('change'));
  assert.strictEqual(g('cfg-ev4').value,'BVFE1E00IWNI','the names were erased again');
  assert.strictEqual(g('cfg-ev6').value,'BVFE1E00IWNK');
});
t('and the status still took effect',()=>
  assert.strictEqual(w.atAcctStatus('Apex-4687-102'),'blown'));
t('a PA row is protected the same way',()=>{
  type('cfg-pa2','PA-NEW-1');
  w.renderCfg();
  assert.strictEqual(g('cfg-pa2').value,'PA-NEW-1');
});
t('goal and prior boxes are protected too',()=>{
  type('cfg-ev4-goal','3000');
  w.renderCfg();
  assert.strictEqual(g('cfg-ev4-goal').value,'3000');
});

console.log('\nsaving commits and releases');
t('Save stores every typed name',()=>{
  w.savePAAccounts();
  const ev=JSON.parse(w.localStorage.getItem(BLOB)).settings.evalAccounts;
  assert.strictEqual(ev[3],'BVFE1E00IWNI');
  assert.strictEqual(ev[4],'BVFE1E00IWNJ');
  assert.strictEqual(ev[5],'BVFE1E00IWNK');
});
t('after saving, a repaint may refresh the boxes again',()=>{
  assert.strictEqual(w.document.querySelectorAll('[data-at-dirty="1"]').length,0,
    'inputs are still marked unsaved after a save');
});
t('a repaint then shows what was saved',()=>{
  w.renderCfg();
  assert.strictEqual(g('cfg-ev4').value,'BVFE1E00IWNI');
});

console.log('\nthe status control no longer repaints the whole form');
// Comments are prose, not calls: the function explains why it does NOT call
// renderAll(), and scanning the raw text reads that as the call itself.
const codeOf=(from,to)=>src.slice(src.indexOf(from),src.indexOf(to))
  .split('\n').map(l=>/^\s*(\/\/|\*)/.test(l)?'':l.replace(/\/\/.*$/,'')).join('\n');
t('apexSetStatus refreshes panels, not renderCfg',()=>{
  const fn=codeOf('function apexSetStatus','function apexSetClosedNote');
  assert(!/renderAll\(\)/.test(fn),'still calls renderAll, which repaints settings');
  assert(/atRenderAcctPanels\(\)/.test(fn),'does not refresh the account panels');
});
t('the goal cards still update when an account closes',()=>{
  const fn=codeOf('function atRenderAcctPanels','function apexSetStatus');
  assert(/renderGoals\(\)/.test(fn),'closing an account would leave its card showing');
});

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
dom.window.close(); process.exit(fail?1:0);
