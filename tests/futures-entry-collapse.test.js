#!/usr/bin/env node
// Futures manual-entry form rolls up by default.
//
// Most futures trades arrive by CSV import, so the long manual form should not
// be the first thing on the screen. It must still be reachable, must remember
// the choice, and must not be hidden in a way that breaks the import path.
//
//   node tests/futures-entry-collapse.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

console.log('\nmarkup');
if (/<div class="form-body" id="fut-entry-body" hidden>/.test(html))
  pass('form body starts hidden');
else fail('form body is not hidden by default — the form will render expanded');

if (/id="fut-entry-chev"/.test(html)) pass('chevron present');
else fail('no chevron to signal it opens');

if (/class="form-hd" onclick="futEntryToggle\(\)"/.test(html)) pass('header toggles it');
else fail('header is not clickable');

// The import button must stay outside the collapsed region.
const bodyStart = html.indexOf('id="fut-entry-body"');
const importBtn = html.indexOf('openImportModal()');
if (importBtn > -1 && importBtn < bodyStart)
  pass('Import Orders CSV sits above the collapsed form, still one click');
else fail('import button is inside or after the collapsed body');

console.log('\ntoggle behaviour');
const grab = n => (html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}')) || [])[0];
const fns = ['futEntryApply', 'futEntryToggle'].map(grab);
if (fns.some(x => !x)) { fail('could not extract the toggle functions'); }
else {
  const mk = () => {
    const els = {
      'fut-entry-body': { hidden: true },
      'fut-entry-chev': { innerHTML: '' },
    };
    const sandbox = {
      state: { settings: {} },
      saveState() { sandbox._saved = (sandbox._saved || 0) + 1; },
      document: { getElementById: id => els[id] || null },
      _saved: 0,
    };
    vm.createContext(sandbox);
    vm.runInContext(fns.join('\n'), sandbox);
    return { sandbox, els };
  };

  let { sandbox, els } = mk();
  vm.runInContext('futEntryApply()', sandbox);
  if (els['fut-entry-body'].hidden === true) pass('closed when no preference is stored');
  else fail('should default closed');
  if (/▸/.test(els['fut-entry-chev'].innerHTML)) pass('chevron points right when closed');
  else fail('chevron wrong when closed: ' + els['fut-entry-chev'].innerHTML);

  vm.runInContext('futEntryToggle()', sandbox);
  if (els['fut-entry-body'].hidden === false) pass('opens on click');
  else fail('did not open');
  if (sandbox.state.settings.futuresEntryOpen === true) pass('preference recorded');
  else fail('preference not recorded');
  if (sandbox._saved === 1) pass('saved once');
  else fail('expected one save, got ' + sandbox._saved);
  if (/▾/.test(els['fut-entry-chev'].innerHTML)) pass('chevron points down when open');
  else fail('chevron wrong when open: ' + els['fut-entry-chev'].innerHTML);

  vm.runInContext('futEntryToggle()', sandbox);
  if (els['fut-entry-body'].hidden === true) pass('closes again');
  else fail('did not close');

  // Someone who opened it for a session of hand entry keeps it open on reload.
  ({ sandbox, els } = mk());
  sandbox.state.settings.futuresEntryOpen = true;
  vm.runInContext('futEntryApply()', sandbox);
  if (els['fut-entry-body'].hidden === false) pass('a stored open preference survives reload');
  else fail('stored preference ignored on load');

  // Must not throw before state exists.
  const bare = { state: undefined, document: { getElementById: () => null } };
  vm.createContext(bare);
  vm.runInContext(fns.join('\n'), bare);
  try { vm.runInContext('futEntryApply()', bare); pass('safe when the element is absent'); }
  catch (e) { fail('threw with no element: ' + e.message); }
}

console.log('\napplied on boot');
if (/try\{futEntryApply\(\);\}catch\(e\)\{\}/.test(html)) pass('called during init');
else fail('never called on boot — the stored preference would not apply');

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
