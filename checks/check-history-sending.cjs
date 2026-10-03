// One "Sending" at a time, and history shows what you did.
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.argv[2] || __dirname + '/../index.html';
(async () => {
  const doc = fs.readFileSync(FILE,'utf8');
  const b = await chromium.launch({ headless: true }), fails = [];
  const ctx = await b.newContext({ viewport:{width:400,height:900}, colorScheme:'dark' });
  await ctx.route('http://mock.test/**', r => r.fulfill({ body: doc, contentType:'text/html' }));
  const p = await ctx.newPage();
  const open = async (persona, domain, view) => { await p.goto('http://mock.test/'); await p.evaluate(([a,b,c]) => { localStorage.setItem('auraMock_persona',a); localStorage.setItem('auraMock_domain',b); localStorage.setItem('auraMock_view',c) }, [persona,domain,view]); await p.reload(); };
  const visibleSending = () => p.evaluate(() => [...document.querySelectorAll('#content *')].filter(e => e.childElementCount===0 && /Sending/.test(e.textContent) && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden').map(e => e.closest('.answer-slot-wrap,.send-control,.row')?.textContent.trim().slice(0,60)));
  // 1. Player Yes (Auryn): exactly one visible "Sending" while pending.
  await open('auryn','interfold','requests');
  const rate = p.locator('#content .request-section', { has: p.getByRole('heading', { name: 'Player asks' }) }).getByRole('button', { name: 'Yes', exact: true }).first();
  if (await rate.count()) { await rate.click(); await p.waitForTimeout(150); const s = await visibleSending(); if (s.length !== 1) fails.push(`Yes shows "Sending" ${s.length}×: ${JSON.stringify(s)}`); await p.screenshot({ path: 'check-rate-in-sending.png' }); }
  else fails.push('no Yes slot for Auryn');
  // Failed operations stay in their SendSlot and retry from the same button.
  await open('auryn','uniqueness','home');
  await p.getByRole('button', { name: 'Ask to be a trainer →' }).click();
  await p.evaluate(() => { window.auraMockAdapter.ui.failNextSend = true; });
  await p.locator('#content .send-control[data-to="adam"]').click();
  await p.getByRole('button', { name: "Didn't send · Try again" }).waitFor();
  const failed = p.locator('#content .send-control.failed[data-to="adam"]');
  if (await failed.count() !== 1) fails.push('failed send did not stay in its slot');
  await failed.click(); await p.waitForTimeout(1650);
  if (await p.locator('#content .send-control.sent[data-to="adam"]').count() !== 1) fails.push('failed send did not resend');
  // 3. History: Lena answers her first queued operator, then it appears in Earlier answers.
  await open('lena','interfold','requests');
  const first = p.locator('#content [data-view="answer"]').first(); const who = await first.getAttribute('data-detail'); await first.click();
  const groups = await p.locator('#content .answer-choices').count(); for (let i=0;i<groups;i++) { await p.locator('#content .answer-choices').nth(i).locator('.answer-slot').first().click(); await p.waitForTimeout(60); }
  await p.waitForTimeout(1900);
  await p.locator('.tab[data-tab="requests"]').click(); await p.waitForTimeout(100);
  const hist = await p.evaluate(() => [...document.querySelectorAll('#content details')].map(d => ({ s: d.querySelector('summary')?.textContent.trim(), rows: [...d.querySelectorAll('[data-detail]')].map(x => x.dataset.detail) })));
  const earlier = hist.find(h => /Earlier|Answered|history/i.test(h.s||''));
  if (!earlier) fails.push('no Earlier answers group: ' + JSON.stringify(hist.map(h=>h.s)));
  else { if (!earlier.rows.includes(who)) fails.push(`${who} answered but not in "${earlier.s}"`); const n = Number((earlier.s.match(/(\d+)/)||[])[1]); if (n !== earlier.rows.length) fails.push(`count ${n} ≠ rows ${earlier.rows.length} in "${earlier.s}"`); }
  await p.locator('#content details', { hasText: /Earlier|Answered/ }).first().evaluate(d => d.open = true).catch(()=>{});
  await p.screenshot({ path: 'check-history.png', fullPage: true });
  console.log('answered:', who, '| groups:', JSON.stringify(hist.map(h => h.s + ' → ' + h.rows.length)));
  console.log(fails.length ? 'FAIL\n- ' + fails.join('\n- ') : 'PASS — one Sending, history shows what you did');
  await b.close(); process.exit(fails.length ? 1 : 0);
})();
