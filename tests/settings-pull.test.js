// Settings have to come DOWN, not just up.
//
// Eight collections pulled down on a new device and settings was not one of
// them, so a fresh sign-in took its configuration from the frozen JSON blob
// that stopped being written weeks earlier: blob-era accounts, blob-era risk
// figures, none of the newer fields — while the trades were current. The next
// edit on that device would then have pushed the stale copy back up over the
// desktop's.
//
// All figures invented. This repo is public.
//
//   node tests/settings-pull.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
// Comments describe the bug, so prose must not be mistaken for code.
const code=src.split('\n').filter(l=>!/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const W=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'}).window;
W.addEventListener('error',()=>{});

console.log('\nthe pull exists and runs');
t('there is a settings pull at all',()=>{
  assert(/async function atPullSettings\(/.test(code),'push-only was the bug');
  assert(/from\('user_settings'\)[\s\S]{0,80}\.select\(/.test(code),
    'it has to actually read the row');
});
t('it is wired into the reconcile',()=>{
  const m=code.match(/var pulls=\[([\s\S]*?)\];/);
  assert(m,'pull list not found');
  assert(/atPullSettings/.test(m[1]),'a pull nobody calls fixes nothing');
});
t('and it runs before the row pulls, which read account names from settings',()=>{
  const m=code.match(/var pulls=\[([\s\S]*?)\];/);
  assert(m[1].indexOf('atPullSettings')<m[1].indexOf('atPullTrades'),
    'trades merge against account names that have to be right first');
});
t('it runs after the blob adopt, so it overrides blob-era config',()=>{
  const m=code.match(/async function atReconcile\(\)\{([\s\S]*?)\n\}/);
  assert(m,'atReconcile not found');
  assert(m[1].indexOf('atReconcileBlob')<m[1].indexOf('pulls'),
    'the blob carries stale settings and must be overridden, not the reverse');
});

console.log('\nwhat it refuses to clobber');
t('a device with unpushed settings keeps them',()=>{
  const m=code.match(/async function atPullSettings\(\)\{([\s\S]*?)\n\}/);
  assert(/deviceClean/.test(m[1]),'the clean/dirty test is the whole safety story');
  assert(/if\(!deviceClean\)\{[\s\S]{0,400}?return false;/.test(m[1]),
    'a dirty device must bail out before assigning state.settings');
});
t('and the user is told rather than left guessing',()=>{
  const m=code.match(/async function atPullSettings\(\)\{([\s\S]*?)\n\}/);
  const bail=m[1].slice(m[1].indexOf('if(!deviceClean)'));
  assert(/toast\(/.test(bail.slice(0,400)),'silence here looks like data loss');
});

console.log('\nsecrets do not get dropped on the way');
t('local secret keys are carried across the adoption',()=>{
  const m=code.match(/async function atPullSettings\(\)\{([\s\S]*?)\n\}/);
  assert(/AT_SECRET_KEYS\.forEach/.test(m[1]),
    'atSettingsPublic strips them, so adopting the payload would wipe them');
  assert(/Object\.assign\(\{\},cloud,keep\)/.test(m[1]),
    'the kept secrets must win over the stripped payload');
});
t('the pull never reads the key out of the mirrored payload',()=>{
  const m=code.match(/async function atPullSettings\(\)\{([\s\S]*?)\n\}/);
  assert(!/cloud\.avApiKey/.test(m[1]),'the key never travels in settings');
});

console.log('\nit does not fight the push');
t('adopting records the signature so the push does not bounce it back',()=>{
  const m=code.match(/async function atPullSettings\(\)\{([\s\S]*?)\n\}/);
  assert(/setItem\('at_settings_sig',cloudHash\)/.test(m[1]),
    'without this the next push would immediately re-upload what was just pulled');
});
t('an identical copy is a no-op, not a rerender',()=>{
  const m=code.match(/async function atPullSettings\(\)\{([\s\S]*?)\n\}/);
  const eq=m[1].slice(m[1].indexOf('localHash===cloudHash'));
  assert(/return true;/.test(eq.slice(0,200)));
  assert(!/renderAll/.test(eq.slice(0,200)),'nothing changed, so nothing repaints');
});
t('accounts are rebuilt from the adopted names',()=>{
  const m=code.match(/async function atPullSettings\(\)\{([\s\S]*?)\n\}/);
  assert(/atDeriveAccounts/.test(m[1]),
    'state.accounts[] is derived from the name arrays and goes stale otherwise');
});

console.log('\nadoption must never delete an account');
// This is the one that actually bit. A phone signed in fresh, took its
// configuration from the retired blob, and pushed one eval account over the
// six that were really there. Both directions are now guarded: a copy holding
// fewer accounts is never adopted, and no device mirrors settings before it
// has pulled once.
t('a copy missing accounts this device holds is a regression, and is named',()=>{
  const local={evalAccounts:['A','B','C'],paAccounts:['P1'],apexAccounts:{A:{},B:{}}};
  const cloud={evalAccounts:['A'],paAccounts:['P1'],apexAccounts:{A:{}}};
  const drop=W.atSettingsWouldDrop(local,cloud);
  assert.strictEqual(Array.from(drop).sort().join(','),'B,C');
});
t('an equal or richer copy drops nothing',()=>{
  const local={evalAccounts:['A']};
  assert.strictEqual(W.atSettingsWouldDrop(local,{evalAccounts:['A']}).length,0);
  assert.strictEqual(W.atSettingsWouldDrop(local,{evalAccounts:['A','B']}).length,0);
});
t('a rename is not a drop as far as the other slots are concerned',()=>{
  const local={evalAccounts:['Old','Keep']};
  const cloud={evalAccounts:['New','Keep']};
  assert.strictEqual(Array.from(W.atSettingsWouldDrop(local,cloud)).join(','),'Old');
});
t('names are gathered from every account list, not just evals',()=>{
  const n=Array.from(W.atSettingsAcctNames({evalAccounts:['E'],paAccounts:['P'],
    cashAccounts:['C'],paperAccounts:['Pa'],apexAccounts:{X:{}}})).sort();
  assert.strictEqual(n.join(','),'C,E,P,Pa,X');
});
t('blanks in the fixed-length slot arrays are not accounts',()=>{
  assert.strictEqual(W.atSettingsAcctNames({evalAccounts:['A','','  ','']}).length,1);
});

console.log('\nand the push that caused it is held back');
t('settings are not mirrored before a pull has run',()=>{
  const m=code.match(/async function atPushSettings\(force\)\{([\s\S]*?)\n\}/);
  assert(m,'atPushSettings not found');
  assert(/if\(!atSettingsPulled&&!force\)/.test(m[1]),
    'a device that has not pulled cannot know its settings are its own');
  assert(m[1].indexOf('atSettingsPulled')<m[1].indexOf('upsert'),
    'the guard has to come before the write');
});
t('the refusal path pushes the richer copy back up, forcing past that guard',()=>{
  const m=code.match(/async function atPullSettings\(\)\{([\s\S]*?)\n\}/);
  const branch=m[1].slice(m[1].indexOf('if(dropped.length)'));
  assert(/atPushSettings\(true\)/.test(branch.slice(0,600)),
    'refusing without restoring leaves the bad copy in the cloud');
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
