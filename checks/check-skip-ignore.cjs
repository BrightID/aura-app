// App-side request choices in both domains. Usage: node check-skip-ignore.cjs [mockup.html]
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.argv[2] || __dirname + '/../index.html';
(async () => {
  const doc = fs.readFileSync(FILE, 'utf8');
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const context = await browser.newContext({ viewport: { width: 400, height: 900 }, colorScheme: 'dark' });
  await context.route('http://mock.test/**', route => route.fulfill({ body: doc, contentType: 'text/html' }));
  const page = await context.newPage();
  const open = async (persona, domain) => {
    await page.goto('http://mock.test/');
    await page.evaluate(([p, d]) => {
      localStorage.setItem('auraMock_persona', p);
      localStorage.setItem('auraMock_domain', d);
      localStorage.setItem('auraMock_view', 'requests');
    }, [persona, domain]);
    await page.reload();
  };
  const count = () => page.locator('#content').getAttribute('data-node-record-count');
  const assert = (ok, message) => { if (!ok) failures.push(message); };
  for (const [persona, domain, subject] of [['nora', 'interfold', 'idris'], ['dara', 'uniqueness', 'nora']]) {
    const contextName = `${persona}/${domain}`;
    await open(persona, domain);
    const before = await count();
    const active = page.locator(`#content [data-view="answer"][data-detail="${subject}"]`).first();
    assert(await active.count() > 0, `${contextName}: no active request for ${subject}`);
    if (!await active.count()) continue;
    await active.click();
    await page.locator('#content [data-action="defer-choice"][data-kind="later"]').first().click();
    assert(await page.getByText('Skipping… Undo').count() > 0, `${contextName}: Not now did not show Undo immediately`);
    await page.waitForTimeout(1650);
    assert(await page.getByText('Skipped', { exact: true }).count() > 0, `${contextName}: Not now did not settle as Skipped`);
    await page.locator('.tab[data-tab="requests"]').click();
    assert(await page.locator('#content .section', { has: page.getByRole('heading', { name: 'Later' }) }).locator(`[data-view="answer"][data-detail="${subject}"]`).count() === 1, `${contextName}: request did not move to Later`);
    assert(await count() === before, `${contextName}: Not now recorded a node operation`);
    await page.locator(`#content [data-view="answer"][data-detail="${subject}"]`).last().click();
    await page.locator('#content [data-action="defer-choice"][data-kind="ignored"]').first().click();
    assert(await page.getByText('Ignoring… Undo').count() > 0, `${contextName}: Ignore did not show Undo immediately`);
    await page.locator('#content [data-action="choice-undo"]').click();
    await page.waitForTimeout(1700);
    await page.locator('.tab[data-tab="requests"]').click();
    assert(await page.getByText('Ignored (1)').count() === 0, `${contextName}: undone Ignore still changed the queue`);
    assert(await page.locator('#content .section', { has: page.getByRole('heading', { name: 'Later' }) }).locator(`[data-view="answer"][data-detail="${subject}"]`).count() === 1, `${contextName}: undone Ignore lost the Later request`);
    assert(await count() === before, `${contextName}: undone Ignore recorded a node operation`);
    await page.locator(`#content [data-view="answer"][data-detail="${subject}"]`).last().click();
    await page.locator('#content [data-action="defer-choice"][data-kind="ignored"]').first().click();
    await page.waitForTimeout(1650);
    assert(await page.getByText('Ignored', { exact: true }).count() > 0, `${contextName}: Ignore did not settle as Ignored`);
    await page.locator('.tab[data-tab="requests"]').click();
    assert(await page.getByText('Ignored (1)').count() === 1, `${contextName}: committed Ignore did not show Ignored (1)`);
    assert(await count() === before, `${contextName}: committed Ignore recorded a node operation`);
    await page.locator('#content .ignored-list summary').click();
    await page.locator('#content [data-action="unignore"][data-subject="' + subject + '"]').click();
    assert(await page.getByText('Ignored (1)').count() === 0, `${contextName}: un-ignore left Ignored (1)`);
    assert(await page.locator(`#content [data-view="answer"][data-detail="${subject}"]`).count() === 1, `${contextName}: un-ignore did not restore the request`);
    assert(await count() === before, `${contextName}: un-ignore recorded a node operation`);
  }
  await browser.close();
  console.log(failures.length ? 'FAIL\n- ' + failures.join('\n- ') : 'PASS — Not now, Ignore, Undo, Later, un-ignore and no node record in both domains');
  process.exit(failures.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
