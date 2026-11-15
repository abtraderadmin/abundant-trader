#!/usr/bin/env node
// Parse every inline <script> in index.html.
//
// This exists because the ad-hoc check it replaces was written inline inside a
// bash double-quoted string, where the shell ate the regex escapes. It found 3
// script blocks instead of 5, reported "0 failures" on a file whose third block
// would not parse, and a literal `${D}` from a botched patch reached production.
// Everything after it on the page died. The app rendered and did nothing.
//
// Keep this in a FILE. Never re-inline it into a shell command.
//
//   node tests/syntax.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(SRC, 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

// Walk the tags rather than regex over the whole file, so a "</script>" inside
// a JS string can't silently split a block and hide the rest from the check.
const blocks = [];
let idx = 0;
while (true) {
  const open = html.indexOf('<script', idx);
  if (open === -1) break;
  const gt = html.indexOf('>', open);
  if (gt === -1) break;
  const attrs = html.slice(open + 7, gt);
  const close = html.indexOf('</script', gt);
  if (close === -1) { fail('unclosed <script> at offset ' + open); break; }
  blocks.push({
    attrs,
    body: html.slice(gt + 1, close),
    line: html.slice(0, open).split('\n').length,
    external: /\bsrc\s*=/.test(attrs),
  });
  idx = close + 8;
}

console.log('\nscript blocks');
if (!blocks.length) fail('no <script> blocks found — the parser is broken, not the file');
else pass('found ' + blocks.length + ' block(s)');

const inline = blocks.filter(b => !b.external);
console.log('\nparse (' + inline.length + ' inline)');

for (const b of inline) {
  const label = 'block at line ' + b.line + ' (' + b.body.split('\n').length + ' lines)';
  try {
    // Script, not Function: compiles at top level, the same way the browser does.
    new vm.Script(b.body, { filename: 'index.html:' + b.line });
    pass(label);
  } catch (e) {
    // Translate the in-block line number to a real file line.
    const m = /index\.html:(\d+)/.exec(e.stack || '');
    const where = m ? ' → index.html line ' + (b.line + Number(m[1]) - 1) : '';
    fail(label + ': ' + e.message + where);
    const rel = m ? Number(m[1]) : null;
    if (rel) {
      const lines = b.body.split('\n');
      for (let i = Math.max(0, rel - 2); i < Math.min(lines.length, rel + 1); i++) {
        console.error('         ' + (b.line + i) + ' | ' + lines[i].trim().slice(0, 120));
      }
    }
  }
}

// Placeholders from patch scripts that never got substituted. Each of these has
// shipped at least once.
console.log('\nunsubstituted placeholders');
// Narrow on purpose. Real template literals like `${W}` / `${LP}` are
// everywhere and legitimate; a broad uppercase rule just cries wolf. These two
// are patch-script artifacts that cannot appear in hand-written code. The parse
// check above is the real net — an unsubstituted ${D} outside a template string
// is a syntax error and fails there first.
const leaks = [
  [/\$\{D\}/g, '${D}'],
  [/__PLACEHOLDER__/g, '__PLACEHOLDER__'],
];
let found = 0;
for (const [re, name] of leaks) {
  for (const b of inline) {
    const hits = b.body.match(re);
    if (hits) { found++; fail(name + ' × ' + hits.length + ' in the block at line ' + b.line); }
  }
}
if (!found) pass('none');

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
