// The blob is retired: app_state is read on load and never written again.
// These assert the three things that make that safe.
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

console.log('\nthe switch exists and is off');
t('AT_BLOB_WRITES is declared false',()=>
  assert(/const AT_BLOB_WRITES=false;/.test(src),'switch missing or on'));
t('it is a single switch — one edit puts the blob back',()=>
  assert.strictEqual((src.match(/AT_BLOB_WRITES=/g)||[]).length,1,'more than one declaration'));

console.log('\nnothing writes app_state any more');
t('every app_state upsert is behind the switch',()=>{
  const re=/from\('app_state'\)[\s\S]{0,80}?upsert/g; let m, n=0;
  while((m=re.exec(src))){
    n++;
    const before=src.slice(Math.max(0,m.index-1400),m.index);
    assert(/if\(AT_BLOB_WRITES\)\{/.test(before),'an app_state upsert at '+m.index+' is not gated');
  }
  assert(n>0,'no app_state upsert found at all — has the path been removed?');
});
t('app_state is still READ, so an unsynced device recovers',()=>
  assert(/from\('app_state'\)\.select\('state,updated_at'\)/.test(src),'the load-time read is gone'));

console.log('\nthe frozen blob can no longer roll a device back');
t('the which-side-wins dialog is skipped when the blob is retired',()=>{
  const i=src.indexOf('if(!AT_BLOB_WRITES){');
  const j=src.indexOf('const useCloud=confirm(');
  assert(i>0&&j>i,'the guard does not precede the dialog');
  assert(/atSyncChip\('☁ in sync'[\s\S]{0,40}?return;/.test(src.slice(i,j)),'the guard does not return early');
});
t('a device holding nothing still adopts it',()=>{
  assert(/if\(!localObj\)\{atApplyCloudState/.test(src),'fresh-device recovery removed');
  assert(/if\(localN===0&&cloudN>0\)/.test(src),'empty-device recovery removed');
});

console.log('\nthe mirrors are the save now, so they cannot fail quietly');
t('every mirror is awaited',()=>
  assert(/await Promise\.all\(mirrors\.map/.test(src),'mirrors are still fire-and-forget'));
t('a failure reaches the screen, not just the console',()=>{
  assert(/atSyncChip\('☁ '\+failed\.length\+' not saved','var\(--red\)'\)/.test(src),'no red chip');
  assert(/Could not save to the database: '\+failed\.join/.test(src),'no toast');
});
t('a failed save reports failure',()=>{
  const i=src.indexOf('if(failed.length){');
  assert(/return false;/.test(src.slice(i,i+520)),'returns success after a failed mirror');
});
t('all eleven mirrors still run',()=>{
  ['atPushAccounts','atPushTrades','atPushWithdrawals','atPushHoldings',
   'atPushTransactions','atPushOpportunities','atPushArcherSignals',
   'atPushClassSessions','atPushClassAnalysis','atPushSettings','atPushSecrets']
    .forEach(f=>assert(new RegExp("',"+f+"\\]").test(src),f+' dropped from the push list'));
});

console.log('\nthe keys that never had a table are documented, not forgotten');
t('all four are named in the retirement note',()=>
  ['ore','levels','importQueue','portfolioOpen'].forEach(k=>{
    const note=src.slice(src.indexOf('// ── The JSON blob is retired'),
                         src.indexOf('async function atCloudPush'));
    assert(note.includes(k),k+' is not accounted for');
  }));

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
process.exit(fail?1:0);
