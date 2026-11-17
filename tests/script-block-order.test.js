#!/usr/bin/env node
// Cross-<script>-block call ordering.
//
// index.html has five inline <script> blocks. A function declaration hoists
// only inside its own block, so calling a function defined in a LATER block
// throws ReferenceError at load. Both times this has happened the call sat
// inside a try/catch, so it degraded to a console warning and the feature
// simply never ran — the account-name normaliser did nothing on refresh for
// exactly this reason.
//
// This checks the calls that run at load time, which are the ones that cannot
// recover. Calls inside event handlers are fine: by the time a user clicks,
// every block has executed.
//
//   node tests/script-block-order.test.js

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

// ── map the blocks ─────────────────────────────────────────────────────────
const blocks = [];
let i = 0;
while (true) {
  const open = html.indexOf('<script', i);
  if (open === -1) break;
  const gt = html.indexOf('>', open);
  const close = html.indexOf('</script', gt);
  if (gt === -1 || close === -1) break;
  if (!/\bsrc\s*=/.test(html.slice(open + 7, gt))) {
    blocks.push({ start: gt + 1, end: close, body: html.slice(gt + 1, close),
                  line: html.slice(0, open).split('\n').length });
  }
  i = close + 8;
}
console.log('\nblocks');
if (blocks.length >= 2) pass(blocks.length + ' inline blocks, first at line ' + blocks[0].line);
else fail('expected several inline blocks, found ' + blocks.length);

// Which block declares each top-level function.
const declaredIn = new Map();
blocks.forEach((b, bi) => {
  for (const m of b.body.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm))
    if (!declaredIn.has(m[1])) declaredIn.set(m[1], bi);
  // var-assigned IIFEs and consts count too, but they are NOT hoisted as
  // values, so a same-block call before the line still fails. Tracked
  // separately only for the cross-block check.
  for (const m of b.body.matchAll(/^\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|\(|async)/gm))
    if (!declaredIn.has(m[1])) declaredIn.set(m[1], bi);
});
pass(declaredIn.size + ' top-level functions mapped to their block');

// ── load-time calls ────────────────────────────────────────────────────────
// A call is load-time if it is not inside a function body. Approximate that by
// tracking brace depth through the block: depth 0 means top level.
console.log('\nload-time calls resolve to this block or an earlier one');
let checked = 0;
blocks.forEach((b, bi) => {
  let depth = 0;
  const lines = b.body.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const code = line.replace(/\/\/.*$/, '');
    // An IIFE at top level executes immediately, so treat its body as
    // load-time by not counting its braces.
    const isIIFE = /^\s*\(function\s*\(\s*\)\s*\{/.test(code) || /^\s*\}\)\(\);?\s*$/.test(code);
    if (depth === 0 || isIIFE) {
      for (const m of code.matchAll(/\b([A-Za-z_$][\w$]{2,})\s*\(/g)) {
        const name = m[1];
        if (!declaredIn.has(name)) continue;           // not ours
        if (/\b(function|if|for|while|switch|catch|return|typeof|new)\b/.test(name)) continue;
        checked++;
        const dBlock = declaredIn.get(name);
        if (dBlock > bi)
          fail(name + '() is called at load in block ' + (bi + 1) +
               ' but declared in block ' + (dBlock + 1) +
               ' — hoisting does not cross blocks, so this throws ReferenceError' +
               ' (index.html line ' + (b.line + li) + ')');
      }
    }
    if (!isIIFE) {
      for (const ch of code) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      if (depth < 0) depth = 0;
    }
  }
});
if (checked) pass(checked + ' load-time call sites checked, none reach forward into a later block');
else fail('no load-time calls found — the detector is not working');

// ── the specific regression ────────────────────────────────────────────────
console.log('\nthe normaliser actually runs');
const normDecl = declaredIn.get('atNormalizeAccountNamesOnce');
if (normDecl === undefined) fail('atNormalizeAccountNamesOnce is not declared anywhere');
else {
  const callers = blocks
    .map((b, bi) => ({ bi, hit: b.body.includes('atNormalizeAccountNamesOnce()') }))
    .filter(x => x.hit);
  if (!callers.length) fail('nothing calls atNormalizeAccountNamesOnce()');
  else if (callers.every(c => c.bi >= normDecl))
    pass('called from block ' + callers.map(c => c.bi + 1).join(', ') +
         ', declared in block ' + (normDecl + 1));
  else fail('called from a block before its declaration');
}
// It must run before accounts are derived, or they derive from the old names.
const bootFn = (html.match(/function boot\(\)\{[\s\S]*?\n  \}/) || [])[0];
if (!bootFn) fail('boot() not found');
else {
  const n = bootFn.indexOf('atNormalizeAccountNamesOnce()');
  const d = bootFn.indexOf('atDeriveAccounts()');
  if (n > -1 && d > -1 && n < d) pass('normalises before deriving accounts');
  else fail('ordering wrong in boot(): normalise at ' + n + ', derive at ' + d);
}

console.log(failures ? '\n' + failures + ' failure(s)\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
