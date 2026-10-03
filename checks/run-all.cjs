// Runs every check in parallel. Prints PASS/FAIL per file, a heartbeat every 30 s, exits 1 on any failure.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync(__dirname).filter(f => /^(check-.*|stability-test)\.cjs$/.test(f)).sort();
const started = Date.now(), pending = new Set(files), results = [];
const beat = setInterval(() => console.log(`... still running (${Math.round((Date.now() - started) / 1000)}s): ${[...pending].join(', ')}`), 30000);
Promise.all(files.map(f => new Promise(resolve => {
  let out = '';
  const p = spawn(process.execPath, [path.join(__dirname, f)], { cwd: path.join(__dirname, '..') });
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('close', code => {
    pending.delete(f);
    console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${f}`);
    if (code !== 0) console.log(out.split('\n').map(l => '      ' + l).join('\n'));
    results.push({ f, code }); resolve();
  });
}))).then(() => {
  clearInterval(beat);
  const bad = results.filter(r => r.code !== 0);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  process.exit(bad.length ? 1 : 0);
});
