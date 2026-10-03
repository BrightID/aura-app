// Stability test for the Aura app mockup — principles 17–19.
// Usage: node stability-test.cjs [mockup.html]
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.argv[2] || require('path').join(__dirname, '..', 'index.html');
const fails = [], notes = [];
(async () => {
  const doc = fs.readFileSync(FILE,'utf8');
  const b = await chromium.launch({ headless: true });
  for (const [W,H] of [[400,900],[786,900]]) {
    const ctx = await b.newContext({ viewport:{width:W,height:H}, colorScheme:'dark' });
    await ctx.route('http://mock.test/**', r => r.fulfill({ body: doc, contentType:'text/html' }));
    const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e => errs.push(e.message));
    const open = async (persona, domain, view) => { await p.goto('http://mock.test/'); await p.evaluate(([a,b,c]) => { localStorage.setItem('auraMock_persona',a); localStorage.setItem('auraMock_domain',b); localStorage.setItem('auraMock_view',c) }, [persona,domain,view]); await p.reload(); };
    // Snapshot every control and row: position and whether single-line things wrapped.
    const snap = () => p.evaluate(() => {
      const out = {}; let i = 0;
      document.querySelectorAll('#content button, #content input, #content .row, #content h1, #content h2, #content .dot-cell, #content label').forEach(e => {
        const r = e.getBoundingClientRect(); if (!r.width) return;
        const key = (e.tagName + ':' + (e.dataset.action||'') + ':' + (e.dataset.to||e.dataset.q||e.name||'') + ':' + (i++));
        out[key] = { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height), t: (e.innerText||e.value||'').trim().slice(0,40) };
      });
      // A wrap = one text string broken across more than one line (measured per text node).
      const wraps = []; const tw = document.createTreeWalker(document.querySelector('#content'), NodeFilter.SHOW_TEXT);
      const single = 'button, .status, .chip, .row-title, .row-sub, .flow-done, .endorsement-status, .answer-status, .detail-heading, [class*="confidence"], [class*="caption"], label, h1, .nav';
      while (tw.nextNode()) { const n = tw.currentNode; const txt = n.textContent.trim(); if (txt.length < 2) continue; const host = n.parentElement.closest(single); if (!host) continue;
        const rg = document.createRange(); rg.selectNodeContents(n); const tops = new Set([...rg.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top / 4)));
        if (tops.size > 1) wraps.push(`"${txt.replace(/\s+/g,' ').slice(0,50)}" (${tops.size} lines)`); }
      return { out, wraps };
    });
    const moved = (a, c, label) => { const m = []; for (const k in a.out) { const x = a.out[k], y = c.out[k]; if (!y) continue; if (Math.abs(x.x-y.x)>1 || Math.abs(x.y-y.y)>1 || Math.abs(x.w-y.w)>1 || Math.abs(x.h-y.h)>1) m.push(`${x.t||k} moved (${x.x},${x.y},${x.w}x${x.h})→(${y.x},${y.y},${y.w}x${y.h})`); } if (m.length) fails.push(`[${W}] ${label}: ${m.length} moved — ${m.slice(0,4).join(' | ')}`); };
    const wrapCheck = (s, label) => { if (s.wraps.length) fails.push(`[${W}] ${label}: wrapped — ${s.wraps.slice(0,5).join(' | ')}`); };
    const timeToChange = async (loc) => { const before = await loc.evaluate(e => e.outerHTML); const t0 = Date.now(); await loc.click({ force: true }); let ms = null; for (let i=0;i<40;i++){ const now = await loc.evaluate(e => e.outerHTML).catch(()=>null); if (now !== before) { ms = Date.now()-t0; break } await p.waitForTimeout(10) } return ms; };

    // 1. Answer screen: Nora answers Idris.
    await open('nora','interfold','requests');
    await p.locator('#content .row, #content button').filter({ hasText: /BtPuPtG5|Idris/ }).first().click(); await p.waitForTimeout(300);
    let s0 = await snap(); wrapCheck(s0, 'answer screen at rest');
    const yes = p.getByRole('button', { name: /^yes/i }).first();
    const ms1 = await timeToChange(yes); if (ms1 === null || ms1 > 120) fails.push(`[${W}] answer: Yes took ${ms1===null?'>400':ms1}ms to show any change`); else notes.push(`[${W}] Yes feedback ${ms1}ms`);
    let s1 = await snap(); moved(s0, s1, 'after tapping Yes'); wrapCheck(s1, 'after tapping Yes');
    const conf = async () => p.evaluate(() => { const e = document.querySelector('#content [data-confidence], #content [aria-valuenow]'); return e ? (e.dataset.confidence || e.getAttribute('aria-valuenow')) : ((document.querySelector('#content').innerText.match(/[Cc]onfidence\s*(\d)/)||[])[1] || null) });
    const c1 = await conf(); await yes.click({ force:true }); await p.waitForTimeout(60); const c2 = await conf(); await yes.click({ force:true }); await p.waitForTimeout(60); const c3 = await conf();
    if (!(c1 && c2 && c3 && +c3 > +c1)) fails.push(`[${W}] answer: confidence did not rise with taps (${c1}→${c2}→${c3})`); else notes.push(`[${W}] confidence ${c1}→${c2}→${c3}`);
    let s2 = await snap(); moved(s0, s2, 'after raising confidence'); wrapCheck(s2, 'after raising confidence');
    const undo = p.getByRole('button', { name: /undo/i }).first();
    if (await undo.count()) { await undo.click({ force:true }); await p.waitForTimeout(150); const after = await conf(); const sel = await p.evaluate(() => !!document.querySelector('#content [aria-pressed="true"], #content .selected, #content .is-selected'));
      if (sel) fails.push(`[${W}] answer: Undo did not clear the answer`); else notes.push(`[${W}] undo cleared (conf now ${after})`);
      let s3 = await snap(); moved(s0, s3, 'after Undo'); } else fails.push(`[${W}] answer: no Undo control visible right after answering`);
    await yes.click({ force:true }); await p.waitForTimeout(2600); let s4 = await snap(); moved(s0, s4, 'after undo window elapsed'); wrapCheck(s4, 'after commit');
    const no2 = p.getByRole('button', { name: /^no/i }).nth(1); await no2.click({ force:true }); await p.waitForTimeout(80); let s5 = await snap(); moved(s0, s5, 'after tapping No on question 2');

    // 2. Requests: Rate in / Decline stay put.
    await open('auryn','interfold','requests'); await p.waitForTimeout(200);
    const r0 = await snap(); wrapCheck(r0, 'Auryn requests');
    const rate = p.locator('#content .request-section', { has: p.getByRole('heading', { name: 'Player asks' }) }).getByRole('button', { name: 'Yes', exact: true }).first(); if (await rate.count()) { await rate.click(); await p.waitForTimeout(150); moved(r0, await snap(), 'after Yes'); }

    // 3. Get endorsed: Ask stays put.
    await open('newcomer','interfold','home'); const prim = () => p.locator('button.primary:visible').first();
    const { flowY, expectedFlowY } = await prim().evaluate(e => ({ flowY: e.getBoundingClientRect().top, expectedFlowY: parseFloat(getComputedStyle(e).getPropertyValue('--flow-y')) })); if (!Number.isFinite(expectedFlowY) || Math.abs(flowY-expectedFlowY)>1) fails.push(`[${W}] flow button at y${flowY}, expected ${expectedFlowY}`);
    await p.fill('#identity-name','Jimbo'); await prim().click(); await prim().click();
    // Choosing a role opens its first step directly, and shared control is its own step after the node.
    if (!(await p.locator('#node-address').isVisible())) await p.getByRole('button', { name: 'Add a node →' }).click();
    await p.fill('#node-address','https://n.example'); await prim().click(); await p.getByRole('button', { name: "No, that's all" }).click(); await p.waitForTimeout(1800);
    const none = p.getByRole('button', { name: /^Just me/ }); if (await none.count()) { await none.first().click(); await p.waitForTimeout(1800); }
    await p.getByRole('button', { name: 'Get endorsed →', exact: true }).click();
    const e0 = await snap(); wrapCheck(e0, 'Get endorsed'); await p.getByRole('button', { name: 'Find a player' }).click();
    const f0 = await snap(); await p.getByRole('button', { name: /^ask$/i }).first().click(); await p.waitForTimeout(150); moved(f0, await snap(), 'after Ask');

    // Board dot cells keep one measured size, including compact overflow counts.
    for (const domain of ['interfold','uniqueness']) {
      await open('nora',domain,'board');
      const sizes = await p.locator('#content .dot-cell').evaluateAll(els => els.map(e => {
        const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)];
      }));
      if (!sizes.length || sizes.some(([w,h]) => w !== sizes[0][0] || h !== sizes[0][1]))
        fails.push(`[${W}] ${domain} Board dot cells differ: ${JSON.stringify(sizes)}`);
    }

    // 4. Board detail: name and status stay on one line; opening votes does not move the row.
    await open('auryn','interfold','board'); for (let i = 0; i < 6 && await p.getByRole('button', { name: /^Show all/ }).count(); i++) await p.getByRole('button', { name: /^Show all/ }).first().click(); await p.locator('#content [data-view="detail"][data-detail="viktor"]').first().click();
    const d0 = await snap(); wrapCheck(d0, 'board detail');
    const heading = p.locator('#content .detail-heading');
    if (!await heading.count()) fails.push(`[${W}] board detail: missing name/status heading`);
    else { const h = await heading.evaluate(e => ({h:e.getBoundingClientRect().height, name:e.querySelector('.detail-name')?.getBoundingClientRect().height})); if (Math.abs(h.h-h.name)>3) fails.push(`[${W}] board detail: heading wrapped`); }
    await p.locator('#content [data-action="toggle-votes"]').first().click(); moved(d0, await snap(), 'after opening board votes'); wrapCheck(await snap(), 'board votes open');

    // 5. Uniqueness vouch: the shared Yes/No slot and confidence readout stay fixed.
    await open('dara','uniqueness','requests'); await p.locator('#content [data-view="answer"][data-detail="nora"]').first().click();
    const v0 = await snap(); wrapCheck(v0, 'vouch screen');
    if (!await p.getByText('Is Nora a real, unique person?').count()) fails.push(`[${W}] vouch: missing single question`);
    if (await p.locator('#content input[type=radio], #content fieldset').count()) fails.push(`[${W}] vouch: old form controls remain`);
    const vy = p.getByRole('button', { name: /^yes/i }).first(); await vy.click({force:true}); await p.waitForTimeout(80);
    moved(v0, await snap(), 'after vouch Yes'); wrapCheck(await snap(), 'after vouch Yes');
    await vy.click({force:true}); await p.waitForTimeout(80); moved(v0, await snap(), 'after vouch confidence'); wrapCheck(await snap(), 'after vouch confidence');
    await p.getByRole('button', { name: /undo/i }).first().click({force:true}); moved(v0, await snap(), 'after vouch Undo');
    await p.locator('#content .lego-disclosure summary').click(); wrapCheck(await snap(), 'vouch guidance open');

    await open('lena','interfold','requests');
    for (const name of ['maya','hanne','sofia','viktor']) {
      if (await p.locator(`#content [data-view="answer"][data-detail="${name}"]`).count()) fails.push(`[${W}] Lena queue still contains answered ${name}`);
      if (!await p.locator(`#content details:has(summary:text("Answered")) [data-detail="${name}"]`).count()) fails.push(`[${W}] Lena Answered group missing ${name}`);
    }

    // 6. Every main screen: nothing wraps that shouldn't.
    for (const persona of ['idris','viktor','lena','nora']) for (const view of ['home','requests','board']) { await open(persona,'interfold',view); wrapCheck(await snap(), `${persona} ${view}`); }
    if (errs.length) fails.push(`[${W}] page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
  console.log(notes.join('\n')); console.log(fails.length ? `\nFAIL (${fails.length})\n- ` + fails.join('\n- ') : '\nPASS — nothing moved, nothing wrapped, feedback instant, Undo works');
  process.exit(fails.length ? 1 : 0);
})();
