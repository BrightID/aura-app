// Interfold arrival walks and the Home each person sees.
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.argv[2] || __dirname + '/../index.html';
const doc = fs.readFileSync(FILE,'utf8');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 400, height: 900 } });
  const failures = [], lines = [];
  let worldRequests = 0;
  page.on('pageerror', e => failures.push('page error: ' + e.message));
  await page.route('http://mock.test/**', r => { if (r.request().url().includes('/api/world')) worldRequests++; return r.fulfill({ body: doc, contentType: 'text/html' }); });
  const check = async (name, fn) => { try { await fn(); lines.push('PASS — ' + name); } catch (e) { failures.push(name + ': ' + e.message); lines.push('FAIL — ' + name); } };
  const open = async (who, view='home') => { await page.goto('http://mock.test/'); await page.evaluate(([who,view]) => { localStorage.removeItem('auraMock_practiceState'); localStorage.setItem('auraMock_persona',who); localStorage.setItem('auraMock_domain','interfold'); localStorage.setItem('auraMock_view',view); },[who,view]); await page.reload(); };
  const has = async text => { if (!await page.locator('#content').getByText(text, { exact: false }).count()) throw Error('missing ' + text); };
  const click = async name => page.getByRole('button', { name, exact: true }).first().click();
  const home = async who => { await open(who); return page.locator('#content').innerText(); };
  const switchPerson = async who => { await page.locator('#practice-toggle').click(); await page.selectOption('#persona', who); };
  await check('debug=0 hides public console hooks', async () => {
    await page.goto('http://mock.test/?debug=0');
    if (await page.evaluate(() => window.mergeWorld !== undefined || window.auraMockAdapter !== undefined)) throw Error('console hook exposed');
  });
  await check('No passkey → Create your passkey', async () => { await open('newcomer'); await has('Create your passkey'); await has('Stuck? Any Aura player can help you set one up.'); await has('I already have one → Sign in'); });
  await check('Solo makes no world request or shared header', async () => { if (worldRequests) throw Error('world request in solo mode'); if (await page.locator('#shared-header:visible').count() || (await page.locator('header').innerText()).includes('Room ·')) throw Error('shared header in solo mode'); });
  await check('Solo invite shows a link and QR', async () => { await home('philip'); await click('Invite someone →'); await page.locator('#invite-name').fill('Rowan'); await click('Create invite'); await page.locator('#invite-url').waitFor(); await page.locator('#arrival-qr-image[src^="data:image/png"]').waitFor(); if (!/\?invite=[0-9a-f]{32}$/.test(await page.locator('#invite-url').innerText())) throw Error('invalid solo invite link'); if ((await page.locator('body').innerText()).includes('Invite an operator')) throw Error('old invite label remains'); });
  await check('Not verified uniqueness chip is dim', async () => { await home('lena'); await click('Requests'); await page.locator('.request-section.role-operator [data-view="answer"]', { hasText: 'Leo' }).first().click(); const chip = page.locator('#content .lego-status', { hasText: 'Not verified unique' }).first(); await chip.waitFor(); if (await chip.evaluate(el => el.classList.contains('state-bad') || !el.classList.contains('state-dim'))) throw Error('chip is not dim'); });
  await check('Passkey, no role → What are you here for?', async () => { await home('mira'); await has('What are you here for?'); });
  await check('Role is saved on the step’s primary action', async () => { await home('mira'); await click('Choose a role →'); await click('Interfold node operator'); await has('Your main node’s public address'); await click('← Back'); await has('What are you here for?'); await click('← Back'); await has('Choose a role →'); await click('Choose a role →'); await click('Interfold node operator'); await page.fill('#node-address','https://node.mira.example'); await click('Check my node'); await page.getByRole('heading', { name: 'Do you run any other nodes?' }).waitFor(); await click("No, that's all"); await page.getByRole('heading', { name: "Who controls your nodes' keys?" }).waitFor(); await click('Home'); await has('Answer shared control →'); });
  await check('Operator, node listed, fewer than 2 asked', async () => { await home('auryn'); await page.getByRole('heading', { name: 'Get endorsed', exact: true }).waitFor(); await has('0 of 2 asked'); if (await page.locator('#content button.primary').count() !== 1 || !await page.getByRole('button', { name: 'Get endorsed →', exact: true }).count()) throw Error('zero ask Home must have one Get endorsed primary'); });
  await check('Seated → quiet node links', async () => { const text = await home('viktor'); if (!text.includes("You're all set as a node operator") || (await page.locator('#content .row-title').filter({ hasText: /^Node [123]$/ }).count()) !== 3) throw Error('Viktor must show seated and three nodes'); if (text.includes('Do you run a node?')) throw Error('old node prompt'); });
  await check('Disputed → See answers', async () => { await home('idris'); await has('Priya answered No on Self-custody'); await has('See answers'); });
  await check('Newcomer walk', async () => {
    await open('newcomer'); await page.fill('#identity-name','Jimbo'); await click('Create your passkey'); await click('Interfold node operator'); await page.fill('#node-address','https://node.jimbo.example'); await click('Check my node'); await page.getByRole('heading', { name: 'Do you run any other nodes?' }).waitFor(); await click("No, that's all"); await page.getByRole('heading', { name: "Who controls your nodes' keys?" }).waitFor(); await click('Just me'); await has('Shared control ✓'); await page.getByRole('heading', { name: 'Get endorsed', exact: true }).waitFor(); await has('0 of 2 asked');
    await click('Get endorsed →');
    const clipped = await page.locator('#content h1, #content .arrival-options > button').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim()));
    if (clipped.length) throw Error('endorsement text clipped: ' + clipped.join(', '));
    await click("They're with me now · QR code"); const code = await page.locator('.arrival-code').innerText(); if (!/^[A-Z0-9]{6}$/.test(code)) throw Error('invalid code'); await page.locator('#arrival-qr-image[src^="data:image/png"]').waitFor();
    await switchPerson('lena'); await click('Requests'); await page.fill('#arrival-code-input',code); await click('Open request'); await has('Answer Jimbo');
    for (let i=0;i<3;i++) await page.locator('#content .answer-slot[data-yes="true"]').nth(i).click();
    await page.waitForTimeout(1800); await switchPerson('created1'); await has('1 of 2 answered Yes');
  });
  await check('Asked, fewer than 2 Yes → Waiting', async () => { await click('Home'); await page.getByRole('heading', { name: 'Get endorsed', exact: true }).waitFor(); await has('1 of 2 asked'); await click('Get endorsed →'); await click('Ask the Interfold team'); await click('Home'); await page.getByRole('heading', { name: "You're waiting on endorsements" }).waitFor(); await has('1 of 2 answered Yes'); await has('Ask someone else'); });
  await check('Auryn walk', async () => { const text = await home('auryn'); if (!/Requests waiting · [0-9]+ →/.test(text) || text.indexOf('Requests waiting ·') > text.indexOf('0 of 2 asked')) throw Error('request line must precede operator step'); if (text.includes('Get endorsed as a player')) throw Error('player ask repeated'); for (const role of ['Player', 'Trainer']) if (!await page.locator(`#content .home-role-chip[data-role="${role.toLowerCase()}"]`, { hasText: role }).count()) throw Error(`missing ${role} Home chip`); const requestLine = page.locator('#content .home-request-line'); if (!await requestLine.locator('.home-request-breakdown .home-request-chip').count()) throw Error('request kinds missing beneath waiting link'); });
  await check('Lena walk', async () => { await home('lena'); await page.locator('.home-request-line').getByText(/^Requests waiting · [0-9]+ →$/).waitFor(); await click('Requests'); await has('Enter a code'); await has('Leo'); });
  await check('Mira walk', async () => { await home('mira'); await click('Choose a role →'); await click('Interfold node operator'); await page.fill('#node-address','https://node.mira.example'); await click('Check my node'); await page.getByRole('heading', { name: 'Do you run any other nodes?' }).waitFor(); await click("No, that's all"); await page.getByRole('heading', { name: "Who controls your nodes' keys?" }).waitFor(); await click('Just me'); await has('Shared control ✓'); await page.getByRole('heading', { name: 'Get endorsed', exact: true }).waitFor(); await has('0 of 2 asked'); await click('Get endorsed →'); await click('Find a player'); await has('Lena'); await has('Nora'); for (const name of ['Lena','Nora']) { const row = page.locator('.lego-dense-row', { hasText: name }).first(); await row.getByRole('button', { name: 'Ask' }).click(); await page.waitForTimeout(1600); } await page.getByRole('heading', { name: "You're waiting on endorsements" }).waitFor(); await has('0 of 2 answered Yes'); await has("You've done your part."); });
  await check('Two asks stay visible when returning to Find a player', async () => { await click('Ask someone else →'); await page.getByRole('heading', { name: 'Find an Interfold player' }).waitFor(); await has("You've asked 2"); const list = page.locator('#content .asked-list'); for (const name of ['Lena', 'Nora']) { const row = list.locator('.lego-dense-row', { hasText: name }); if (await row.count() !== 1 || await row.locator('.lego-status', { hasText: /^Waiting$/ }).count() !== 1 || await row.locator('time').count() !== 1) throw Error(name + ' ask row is incomplete'); } await click('Home'); });
  await check('Two unanswered asks show a calm Home', async () => { const card = page.locator('#content .card', { has: page.getByRole('heading', { name: "You're waiting on endorsements" }) }); await card.getByText("✓ You've done your part. Now we wait for their answers.", { exact: true }).waitFor(); if (await card.locator('.lego-status', { hasText: /^Waiting$/ }).count() !== 2) throw Error('expected two Waiting chips'); if (await card.locator('.primary-link, .flow-action-bar').count()) throw Error('waiting card has a primary action'); await card.getByRole('button', { name: 'Ask someone else →', exact: true }).waitFor(); await card.getByText('Just me', { exact: true }).waitFor(); });
  await check('Waiting node opens detail and Back returns Home', async () => { await page.locator('#content .lego-dense-row[data-view="node-detail"]').first().click(); await page.getByRole('heading', { name: 'Node detail' }).waitFor(); await has('https://node.mira.example'); await has('Hetzner · Helsinki'); await click('← Back'); await page.getByRole('heading', { name: "You're waiting on endorsements" }).waitFor(); });
  await check('Arrival link opens Answer', async () => { await click('Ask someone else →'); await click('Send them a link'); await page.locator('.share-message a').click(); if (await page.locator('#content select, #content .tag').count()) throw Error('passkey chooser must stay off the first screen'); if (await page.locator('#content .flow-action-bar .primary').count() !== 1) throw Error('expected one primary sign-in button'); await click('Sign in with your passkey'); await page.getByRole('dialog', { name: 'Choose a passkey' }).getByRole('button', { name: 'Lena' }).click(); await page.getByText('Answer Mira').waitFor(); });
  await check('Lena’s node shortcut opens the address step', async () => { await home('lena'); await click('Also run a node →'); await has('Your main node’s public address'); await click('← Back'); await has('Hi, Lena'); await click('Home'); await has('Also run a node →'); });
  await check('Mira switches from operator Home to player flow and back', async () => { await home('mira'); await click('Choose a role →'); await click('Interfold node operator'); await page.fill('#node-address', 'https://node.mira.switch.example'); await click('Check my node'); await page.getByRole('heading', { name: 'Do you run any other nodes?' }).waitFor(); await click("No, that's all"); await page.getByRole('heading', { name: "Who controls your nodes' keys?" }).waitFor(); await click('Just me'); await has('Shared control ✓'); const before = await page.locator('#content .ladder-step').innerText(); await click('Also play in Interfold →'); await page.getByRole('heading', { name: 'Get endorsed as a player' }).waitFor(); await click('← Back'); await has('Hi, Mira'); if (await page.locator('#content .ladder-step').innerText() !== before || !await page.getByRole('button', { name: 'Get endorsed →', exact: true }).count()) throw Error('operator progress changed after Back'); });
  await check('Roles appear only when held', async () => { await open('newcomer'); await page.fill('#identity-name','New arrival'); await click('Create your passkey'); await has('What are you here for?'); for (const name of ['Trainer','Manager']) if (await page.getByRole('button', { name, exact: true }).count()) throw Error(name + ' is visible to newcomer'); for (const hint of ['Be a player first','Be a trainer first']) if (await page.getByText(hint).count()) throw Error(hint + ' is visible'); await open('lena','role-choice'); if (!await page.getByRole('button', { name: 'Trainer', exact: true }).count()) throw Error('Lena cannot see Trainer'); if (await page.getByRole('button', { name: 'Manager', exact: true }).count()) throw Error('Lena can see Manager'); await open('nora','role-choice'); for (const name of ['Trainer','Manager']) if (!await page.getByRole('button', { name, exact: true }).count()) throw Error('Nora cannot see ' + name); });
  await check('Back follows each arrival step', async () => { await home('mira'); await click('Choose a role →'); await click('Interfold node operator'); await click('← Back'); await has('What are you here for?'); await click('Interfold node operator'); await page.fill('#node-address','https://node.back.example'); await click('Check my node'); await page.getByRole('heading', { name: 'Do you run any other nodes?' }).waitFor(); await click("No, that's all"); await page.getByRole('heading', { name: "Who controls your nodes' keys?" }).waitFor(); await click('← Back'); await has('Do you run any other nodes?'); await click('← Back'); await has('Your main node’s public address'); await click('Home'); await has('Hi, Mira'); });
  await check('Mira adds a second node before shared control', async () => { await home('mira'); await click('Choose a role →'); await click('Interfold node operator'); await page.fill('#node-address', 'https://node.one.example'); await click('Check my node'); await page.getByRole('heading', { name: 'Do you run any other nodes?' }).waitFor(); await has('Node 1 · Hetzner · Helsinki'); await click('Add another node'); await page.getByRole('heading', { name: 'Add another node' }).waitFor(); await page.fill('#node-address', 'https://node.two.example'); await click('Check my node'); await page.getByRole('heading', { name: 'Do you run any other nodes?' }).waitFor(); await has('Node 1 · Hetzner · Helsinki'); await has('Node 2 · Hetzner · Helsinki'); await click("No, that's all"); await page.getByRole('heading', { name: "Who controls your nodes' keys?" }).waitFor(); });
  await check('Back follows endorsement arrival branches', async () => { await home('auryn'); await click('Get endorsed →'); for (const [button, heading] of [["They're with me now · QR code", "They're with me now"], ['Send them a link', 'Send them a link'], ['Find a player', 'Find a player']]) { await click(button); await page.getByRole('heading', { name: heading }).waitFor(); await click('← Back'); await page.getByRole('heading', { name: 'Find an Interfold player' }).waitFor(); } await click('← Back'); await has('Hi, Auryn'); });
  await check('Send link destinations and copy feedback', async () => {
    await home('auryn'); await click('Get endorsed →'); await click('Send them a link');
    const message = 'Can you endorse me as a node operator in Interfold? ' + await page.locator('.share-message a').innerText();
    for (const [name, prefix] of [['Messages', 'sms:?&body='], ['Email', 'mailto:?subject=Endorse%20me%20as%20a%20node%20operator&body=']]) {
      const anchor = page.locator('.arrival-actions').getByRole('link', { name });
      const href = await anchor.getAttribute('href');
      if (href !== prefix + encodeURIComponent(message)) throw Error(name + ' href does not carry the message');
    }
    if (await page.locator('.arrival-actions').getByRole('link', { name: 'Discord' }).getAttribute('href') !== 'https://discord.com/channels/@me') throw Error('Discord href is wrong');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('unavailable'); } } }));
    await click('Copy link');
    if (!await page.locator('.arrival-actions').getByRole('button', { name: 'Copied ✓', exact: true }).count()) throw Error('Copy link did not show copied feedback');
    await has('Did you send it?'); await has('Yes, I sent it'); await has('Not yet');
    await page.waitForTimeout(2100);
    if (!await page.locator('.arrival-actions').getByRole('button', { name: 'Copy link', exact: true }).count()) throw Error('Copy link label did not reset');
  });
  await check('Link confirmation counts once and Not yet leaves count alone', async () => {
    await home('auryn'); await click('Get endorsed →'); await click('Send them a link');
    await has('Did you send it?'); await click('Not yet'); await page.getByRole('heading', { name: 'Find an Interfold player' }).waitFor();
    if (await page.getByText("You've asked", { exact: false }).count()) throw Error('Not yet counted an ask');
    await click('Send them a link'); await click('Yes, I sent it'); await page.locator('#content .lego-status', { hasText: /^Sent$/ }).waitFor();
    await click('← Back'); await has("You've asked 1");
    const linkRow = page.locator('.asked-list .lego-dense-row', { hasText: 'Someone you sent a link to' });
    if (await linkRow.count() !== 1 || await linkRow.locator('.lego-status', { hasText: /^Waiting$/ }).count() !== 1 || await linkRow.locator('time').count() !== 1) throw Error('confirmed link ask row is incomplete');
    await click('Send them a link');
    if (await page.getByRole('button', { name: 'Yes, I sent it' }).count()) throw Error('same link can be confirmed twice');
    await click('← Back'); await has("You've asked 1");
    await click('Ask the Interfold team'); await page.getByRole('heading', { name: "You're waiting on endorsements" }).waitFor();
    await click('Ask someone else →'); await has("You've asked 2");
    if (await page.locator('.asked-list .lego-dense-row').count() !== 2) throw Error('expected link and team rows');
  });
  await check('Interfold team ask counts once', async () => {
    await home('auryn'); await click('Get endorsed →');
    if (await page.locator('#content .lego-dense-row', { hasText: 'Interfold team' }).count()) throw Error('team already asked');
    await click('Ask the Interfold team');
    const teamSlot = page.locator('#content .arrival-options > button.lego-send-slot', { hasText: 'Sent ✓' });
    if (await teamSlot.count() !== 1 || !await teamSlot.isDisabled()) throw Error('team ask must show a disabled Sent ✓ slot');
    const teamRow = page.locator('.asked-list .lego-dense-row', { hasText: 'Interfold team' });
    if (await teamRow.count() !== 1 || await teamRow.locator('.lego-status', { hasText: /^Waiting$/ }).count() !== 1 || await teamRow.locator('time').count() !== 1) throw Error('team ask must appear as a full waiting row');
    if (await page.getByRole('button', { name: 'Ask the Interfold team', exact: true }).count()) throw Error('team ask remains tappable');
    await click('Home');
    await has('1 of 2 asked');
    if (await page.locator('#content button.primary').count() !== 1 || !await page.getByRole('button', { name: 'Get endorsed →', exact: true }).count()) throw Error('one ask Home must have one Get endorsed primary');
    await click('Requests'); await has('Waiting on others · 1');
    await click('Home'); await click('Get endorsed →'); await click('Find a player');
    const row = page.locator('.lego-dense-row', { hasText: 'Lena' }).first(); await row.getByRole('button', { name: 'Ask' }).click(); await page.waitForTimeout(1600);
    await click('Home'); await page.getByRole('heading', { name: "You're waiting on endorsements" }).waitFor();
    if (await page.locator('#content .lego-dense-row', { hasText: 'Interfold team' }).count() !== 1) throw Error('expected one team ask in operator status');
  });
  await check('Board list expands and collapses at five', async () => { await open('lena', 'board'); await page.selectOption('#domain', 'uniqueness'); await click('Board'); await page.locator('#content .board-list-toggle').waitFor(); const list = page.locator('#content .board-list-toggle').first(); const count = Number(await list.getAttribute('data-count')); if (count <= 5) throw Error('fixture needs more than five'); const visible = page.locator('#content .card .lego-dense-row:visible'); if (await visible.count() !== 5) throw Error('expected five rows'); await click(`Show all ${count} →`); if (await visible.count() !== count) throw Error('expanded count differs'); await click('Show fewer'); if (await visible.count() !== 5) throw Error('collapse failed'); });
  await check('Newcomer has no Requests tab', async () => { await open('newcomer'); if (await page.getByRole('button', { name: 'Requests', exact: true }).count()) throw Error('Requests tab visible'); });
  await check('Just me completes shared control', async () => { await home('mira'); await click('Choose a role →'); await click('Interfold node operator'); await page.fill('#node-address','https://node.none.example'); await click('Check my node'); await page.getByRole('heading', { name: 'Do you run any other nodes?' }).waitFor(); await click("No, that's all"); await page.getByRole('heading', { name: "Who controls your nodes' keys?" }).waitFor(); await click('Just me'); await has('Shared control ✓'); await has('Get endorsed →'); });
  await check('Shared control saves one person at a time', async () => { await home('mira'); await click('Choose a role →'); await click('Interfold node operator'); await page.fill('#node-address','https://node.shared.example'); await click('Check my node'); await click("No, that's all"); await click('Someone else too'); await click('Done'); await has('Who else controls your nodes?'); await page.fill('#arrival-control-name','Lena'); await click('Add another'); await page.fill('#arrival-control-name','Nora'); await click('Add another'); if (await page.locator('.arrival-control-row').count() !== 2) throw Error('expected two separate people'); await page.locator('.arrival-control-row').first().getByRole('button', { name: 'Remove' }).click(); if (await page.locator('.arrival-control-row').count() !== 1) throw Error('Remove did not delete one person'); await click('Done'); await has('Shared control ✓'); await has('Get endorsed →'); });
  await check('Player ask can be answered No and undone', async () => {
    await open('auryn', 'requests');
    await page.getByRole('heading', { name: 'Player asks' }).waitFor();
    const ask = page.locator('.request-section', { has: page.getByRole('heading', { name: 'Player asks' }) }).locator('.player-answer-unit').first();
    await ask.getByRole('button', { name: 'No', exact: true }).click();
    await ask.getByRole('button', { name: 'Undo' }).click();
    if (await ask.locator('.answer-slot[aria-pressed="true"]').count() || await ask.locator('.confidence-segments .filled').count() || /Confidence [1-4] of 4/.test(await ask.innerText())) throw Error('Undo left a choice selected');
  });
  await check('Viktor trainer sees grouped player asks', async () => {
    await open('auryn', 'requests');
    await page.getByRole('heading', { name: 'Player asks' }).waitFor();
    await page.locator('.request-section', { has: page.getByRole('heading', { name: 'Player asks' }) }).getByText('Viktor').waitFor();
  });
  await check('Waiting Home setup has no avatars', async () => {
    await home('mira'); await click('Choose a role →'); await click('Interfold node operator'); await page.fill('#node-address','https://node.setup.example'); await click('Check my node'); await click("No, that's all"); await click('Just me'); await click('Get endorsed →'); await click('Ask the Interfold team'); await click('Find a player');
    const row = page.locator('.lego-dense-row', { hasText: 'Lena' }).first(); await row.getByRole('button', { name: 'Ask' }).click(); await page.waitForTimeout(1600);
    const setup = page.locator('#content .setup-section'); await setup.waitFor();
    if (await setup.locator('.person-avatar, .avatar').count()) throw Error('setup contains an avatar');
  });
  await check('Viktor walk', async () => { await home('viktor'); await has("You're all set as a node operator"); });
  await check('Idris walk', async () => { await home('idris'); await has('Priya answered No on Self-custody'); });
  await check('Auryn asks for trainer in Uniqueness and manager receives it', async () => {
    await open('auryn'); await page.selectOption('#domain', 'uniqueness'); await click('Home');
    await has('Ask to be a trainer →'); await click('Ask to be a trainer →');
    await page.getByRole('heading', { name: 'Get endorsed as a trainer' }).waitFor(); await has('Managers in Uniqueness answer this.');
    await page.locator('#content .send-control[data-to="adam"]').click(); await page.waitForTimeout(1650);
    await click('Home'); await has('Trainer · getting endorsed'); await click('Requests'); await has('Trainer ask');
    await switchPerson('adam'); await click('Requests');
    const section = page.locator('.request-section.role-trainer'); await section.getByText(/Auryn/).waitFor();
  });
  await check('Manager has no role ask', async () => { await open('adam'); await page.selectOption('#domain', 'uniqueness'); await click('Home'); if (await page.getByRole('button', { name: /^Ask to be a/ }).count()) throw Error('manager sees ask'); });
  await check('Trainer can ask for manager in Interfold', async () => { await home('tomas'); await has('Ask to be a manager →'); await click('Ask to be a manager →'); await has('Managers in Interfold answer this.'); await page.locator('#content .send-control[data-to="nora"]').click(); await page.waitForTimeout(1650); await click('Home'); await has('Manager · getting endorsed'); await switchPerson('nora'); await click('Requests'); await page.locator('.request-section.role-manager [data-request-row-status="Manager ask"]').waitFor(); });
  await check('All-set operator sees the signed Interfold view', async () => { await home('viktor'); await click('What Interfold sees →'); await page.getByRole('heading', { name: 'What Interfold sees' }).waitFor(); if (await page.locator('.partner-question').count() !== 3) throw Error('expected three questions'); await has('Signed by the Aura node'); await click('← Back'); await has('Hi, Viktor'); });
  await check('Auryn standing explains the next level without clipping', async () => { await home('auryn'); await page.locator('.home-role-chip[data-role="player"]').click(); const line = page.locator('.standing-next'); await line.waitFor(); if (!/Level (\d|3) (needs|is the top)/.test(await line.innerText())) throw Error('next level missing'); if (await line.evaluate(e => e.scrollWidth > e.clientWidth + 1)) throw Error('next level clipped'); });
  await check('New key starts at level zero with one next step', async () => { await open('newcomer'); await page.fill('#identity-name', 'Fresh key'); await click('Create your passkey'); await has('Not verified yet'); if (await page.getByRole('button', { name: 'Choose a role →' }).count() !== 1) throw Error('new key needs one next step'); });
  await check('Shipped HTML has no source leaks', async () => {
    for (const forbidden of ['labels.js', 'Aura Explorer', 'aura-node.brightid.org'])
      if (fs.readFileSync(FILE, 'utf8').includes(forbidden)) throw Error('source leak');
  });
  await check('Person picker is capped and labelled', async () => {
    await open('auryn');
    const options = await page.locator('#persona option').evaluateAll(els => els.map(el => el.textContent));
    if (options.length > 20) throw Error('too many people');
    if (options.slice(0,3).map(x => x.split(' · ')[0]).join('|') !== 'Philip|Adam|Auryn') throw Error('first people');
    if (options.some(x => !/^.+ · (Subject|Player|Trainer|Manager|Node operator)$/.test(x))) throw Error('unlabelled person');
    if (!options.some(x => x === 'Mira · Node operator')) throw Error('operator missing');
  });
  await check('Two manager Yes answers promote trainer, then manager', async () => {
    await open('auryn'); await page.selectOption('#domain', 'uniqueness'); await click('Home');
    const sendTo = async (role, who) => {
      const slot = page.locator(`#content .send-control[data-kind="${role}"][data-to="${who}"]`);
      if (!await slot.isDisabled()) await slot.click();
      await page.waitForTimeout(1650);
    };
    const answerAtThree = async (role, who) => {
      await switchPerson(who); await click('Requests');
      const section = page.locator('.request-section.role-' + role);
      if (role === 'manager') await section.locator('[data-view="answer"]').first().click();
      const yes = page.locator('#content .answer-slot[data-kind="' + role + '"][data-yes="true"]').first();
      await yes.scrollIntoViewIfNeeded();
      const box = await yes.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); await page.waitForTimeout(850); await page.mouse.up();
      await page.waitForTimeout(1650);
      await switchPerson('auryn');
    };
    await click('Ask to be a trainer →');
    await sendTo('trainer', 'philip'); await sendTo('trainer', 'adam');
    await answerAtThree('trainer', 'philip'); await click('Home');
    await has('Trainer ask · 1 of 2 Yes'); await page.locator('.home-role-chip[data-role="trainer"]').click();
    await has('Needs 2 Yes from managers · 1 so far');
    await click('Requests'); await has('Philip · Yes · 3'); await has('Adam · Waiting');
    await answerAtThree('trainer', 'adam'); await click('Home');
    await page.locator('.home-role-chip[data-role="trainer"]', { hasText: /^Trainer(?: L[0-9]+)?$/ }).waitFor();
    await has("You're a trainer now. You can rate players.");
    const promoted = await page.locator('#persona option[value="auryn"]').textContent();
    if (promoted !== 'Auryn · Trainer') throw Error('picker did not promote Auryn');
    await click('Requests'); await has("Done · you're a trainer");
    await page.getByRole('heading', { name: 'Player asks' }).waitFor();
    const playerAsk = page.locator('.request-section.role-player .answer-slot[data-yes="true"]').first();
    await playerAsk.click(); await page.waitForTimeout(1650);
    await click('Home'); await click('Ask to be a manager →');
    await sendTo('manager', 'philip'); await sendTo('manager', 'adam');
    await answerAtThree('manager', 'philip'); await click('Home'); await has('Manager ask · 1 of 2 Yes');
    await answerAtThree('manager', 'adam'); await click('Home');
    await page.locator('.home-role-chip[data-role="manager"]', { hasText: /^Manager(?: L[0-9]+)?$/ }).waitFor();
    await has("You're a manager now. You can rate trainers.");
    await click('Requests'); await has("Done · you're a manager");
  });
  await check('Unasked vouch appears in Answered', async () => {
    await open('auryn'); await page.selectOption('#domain', 'uniqueness'); await click('Home');
    await click('Rate someone'); await page.fill('#rate-search', 'Elena');
    await page.locator('#rate-results').getByRole('button', { name: /Elena Varga/ }).click();
    await has('Is this one real, unique person?');
    const yes = page.locator('#content .answer-slot[data-kind="vouch"][data-yes="true"]');
    const box = await yes.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up(); await page.waitForTimeout(1600);
    await click('Requests'); await page.locator('summary', { hasText: /^Answered ·/ }).click(); await has('Elena Varga'); await has('confidence 2');
  });
  await check('Manager ratings promote and survive reload without new asks', async () => {
    await open('philip'); await page.selectOption('#domain', 'uniqueness'); await click('Home');
    const asksBefore = await page.evaluate(() => window.auraMockAdapter.ui.playerRequests.filter(x => x.domain === 'uniqueness' && x.from === 'auryn' && x.role === 'trainer').length);
    const rateAuryn = async () => {
      await click('Rate someone'); await page.fill('#rate-search', 'Auryn');
      await page.locator('#rate-results').getByRole('button', { name: /Auryn/ }).click();
      await has('Should this person be a trainer?');
      await page.locator('#content .answer-slot[data-kind="trainer"][data-yes="true"]').click();
      await page.waitForTimeout(1600);
    };
    await rateAuryn(); await switchPerson('adam'); await click('Home'); await rateAuryn();
    if (await page.evaluate(() => window.auraMockAdapter.ui.playerRequests.filter(x => x.domain === 'uniqueness' && x.from === 'auryn' && x.role === 'trainer').length) !== asksBefore) throw Error('unasked rating created an ask');
    await switchPerson('auryn'); await click('Home');
    await page.locator('.home-role-chip[data-role="trainer"]', { hasText: /^Trainer(?: L[0-9]+)?$/ }).waitFor();
    await has("You're a trainer now. You can rate players.");
    if ((await page.locator('#practice-drawer #practice-you').textContent()).trim() !== "You're Auryn" || (await page.locator('#persona option[value="auryn"]').textContent()).trim() !== 'Auryn · Trainer') throw Error('promoted header label');
    await page.reload(); await page.locator('.home-role-chip[data-role="trainer"]', { hasText: /^Trainer(?: L[0-9]+)?$/ }).waitFor();
    if ((await page.locator('#practice-drawer #practice-you').textContent()).trim() !== "You're Auryn" || (await page.locator('#persona option[value="auryn"]').textContent()).trim() !== 'Auryn · Trainer') throw Error('reloaded header label');
  });
  await check('Rating rules hide ineligible roles and self', async () => {
    await open('auryn'); await page.selectOption('#domain', 'uniqueness'); await click('Home');
    if ((await page.locator('#practice-drawer #practice-you').textContent()).trim() !== "You're Auryn" || (await page.locator('#persona option[value="auryn"]').textContent()).trim() !== 'Auryn · Player') throw Error('player header label');
    await click('Rate someone'); await page.fill('#rate-search', 'Adam');
    await page.locator('#rate-results').getByRole('button', { name: /Adam/ }).click();
    if (await page.getByText('Should this person be a trainer?').count() || await page.getByText('Should this person be a manager?').count()) throw Error('player sees manager rating block');
    await switchPerson('adam'); await click('Home'); await click('Rate someone');
    await page.locator('#rate-results [data-view="detail"][data-detail="adam"]').click();
    if (await page.locator('#content .lego-answer-control').count()) throw Error('self rating block');
  });
  await check('Adam Uniqueness Home has one chip row and verified card', async () => {
    await open('adam'); await page.selectOption('#domain', 'uniqueness'); await click('Home');
    const row = page.locator('#content .home-role-chips');
    if (await row.count() !== 1) throw Error('expected one role row');
    for (const name of ['Unique L4', 'Player L3', 'Trainer L2', 'Manager L2']) if (await row.getByText(name, { exact: true }).count() !== 1) throw Error('missing ' + name);
    const tops = await row.locator('.home-role-chip').evaluateAll(xs => xs.map(x => Math.round(x.getBoundingClientRect().top)));
    const counts = [...new Set(tops)].map(y => tops.filter(x => x === y).length);
    if (!(counts.length === 1 || counts.length === 2 && counts.every(n => n === 2))) throw Error('uneven chip lines ' + counts);
    const text = await page.locator('#content').innerText();
    if (text.includes('See the board →') || text.includes('View Uniqueness status →') || await page.locator('#content .journey').count()) throw Error('old Home link or completed tracker');
    if (await page.getByRole('button', { name: 'Rate someone', exact: true }).count() !== 1) throw Error('Rate someone button missing');
    await page.locator('.verified-home-card').click(); await page.getByRole('heading', { name: 'Uniqueness status' }).waitFor();
  });
  await check('Open Uniqueness steps remain visible', async () => {
    await open('mira'); await page.selectOption('#domain', 'uniqueness'); await click('Home');
    if (!await page.locator('#content .journey').count()) throw Error('step tracker missing');
  });
  await check('Requests split incoming and sent', async () => {
    await open('auryn'); await click('Requests');
    const text = await page.locator('#content').innerText();
    const you = text.indexOf('Waiting on you · '), others = text.indexOf('Waiting on others · ');
    if (you < 0 || others < 0 || you >= others) throw Error('request order or count missing');
  });
  await check('Interfold operator answer shows Uniqueness status', async () => {
    await open('lena'); await click('Requests');
    await page.locator('.request-section.role-operator [data-view="answer"]').first().click();
    if (!await page.locator('#content .lego-status').filter({ hasText: /Unique ·|Not verified unique/ }).count()) throw Error('operator uniqueness chip missing');
  });
  await check('Try as header follows the selected role', async () => {
    await open('auryn'); await page.selectOption('#domain', 'uniqueness'); await click('Home');
    if ((await page.locator('#practice-drawer #practice-you').textContent()).trim() !== "You're Auryn" || (await page.locator('#persona option[value="auryn"]').textContent()).trim() !== 'Auryn · Player') throw Error('player header label');
    await page.locator('#practice-toggle').click();
    if (await page.locator('#persona option').count() !== 20) throw Error('picker does not have 20 people');
  });
  await check('v32 compact header and Practice drawer at 390 × 844', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await open('philip');
    const head = page.locator('header.app-head'), stamp = (await head.locator('#build-stamp').innerText()).trim();
    if (!/^v[0-9.]+$/.test(stamp) || !(await head.locator('#build-stamp').getAttribute('title')).includes('2026-10-05')) throw Error('visible version or hover stamp');
    if (!await head.getByText('Vouch', { exact: true }).count() || !await head.locator('#practice-toggle').count() || !await head.locator('#avatar').count()) throw Error('header controls missing');
    if (/Trying as|Shared practice/.test(await head.innerText())) throw Error('old header text');
    if ((await head.boundingBox()).height > 120) throw Error('header exceeds 120 px');
    await head.locator('#practice-toggle').click();
    await page.locator('#practice-drawer').getByText('Everything here is practice. Nothing touches the real BrightID network.').waitFor();
    await page.locator('#practice-drawer #persona').waitFor();
  });
  await check('v32 request groups remember collapsed state', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await open('philip', 'requests');
    const group = page.locator('.request-section.role-operator'), summary = group.locator('summary');
    await summary.getByText(/^Node operator questions · [0-9]+$/).waitFor();
    const count = await group.locator('.lego-dense-row').count(); if (!count) throw Error('no operator rows');
    await summary.click(); if (await group.getAttribute('open') !== null || await group.locator('.lego-dense-row:visible').count()) throw Error('group did not collapse');
    await summary.click(); if (await group.locator('.lego-dense-row:visible').count() !== count) throw Error('group did not expand');
    await summary.click(); await page.reload();
    if (await page.locator('.request-section.role-operator').getAttribute('open') !== null) throw Error('collapsed state was lost');
    await page.locator('.request-section.role-operator summary').click();
  });
  await check('v32 Requests badge matches waiting items', async () => {
    await open('philip', 'requests');
    const waiting = await page.locator('#content [data-request-row-status]').count();
    const badge = page.locator('#request-tab-count');
    if (!waiting || await badge.innerText() !== String(waiting) || !await badge.isVisible()) throw Error('waiting count badge mismatch');
    await open('mira', 'requests');
    if (await badge.isVisible()) throw Error('zero count badge visible');
  });
  await check('v32 sent ask shows every recipient and answer', async () => {
    await open('auryn'); await page.selectOption('#domain', 'uniqueness'); await click('Requests');
    await page.locator('.sent-kind .lego-dense-row', { hasText: 'Philip' }).first().click();
    await page.getByRole('heading', { name: 'Philip · Trainer ask' }).waitFor();
    for (const name of ['Philip', 'Adam']) await page.locator('.sent-answer-person', { has: page.getByRole('heading', { name, exact: true }) }).getByText('Waiting').waitFor();
    if (await page.locator('.sent-answer-question').count() !== 2) throw Error('recipient questions missing');
    await click('← Back'); await page.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
  });
  await check('Chips belong to the selected domain', async () => {
    await home('lena');
    let row = page.locator('#content .home-role-chips');
    if (/\b(?:Player|Trainer|Manager) L\d/.test(await row.innerText())) throw Error('Uniqueness levels leaked into Lena’s Interfold roles');
    await home('philip');
    row = page.locator('#content .home-role-chips');
    for (const name of ['Unique L4', 'Player', 'Trainer', 'Manager']) if (!await row.getByRole('button', { name, exact: true }).count()) throw Error('Philip missing Interfold ' + name);
    await page.selectOption('#domain', 'uniqueness'); await click('Home');
    row = page.locator('#content .home-role-chips');
    for (const name of ['Unique L4', 'Player L3', 'Trainer L2', 'Manager L2']) if (!await row.getByRole('button', { name, exact: true }).count()) throw Error('Philip missing Uniqueness ' + name);
  });
  await check('Every persona keeps domain roles separate', async () => {
    await home('philip');
    const people = await page.locator('#persona option').evaluateAll(options => options.map(option => option.value).filter(Boolean));
    for (const who of people) {
      await home(who);
      const interfold = await page.locator('#content .home-role-chips').count() ? await page.locator('#content .home-role-chips').innerText() : '';
      if (/\b(?:Player|Trainer|Manager) L\d/.test(interfold)) throw Error(who + ' has Uniqueness levels in Interfold');
      await page.selectOption('#domain', 'uniqueness'); await click('Home');
      if (await page.locator('#content .home-role-chip[data-role="operator"]').count()) throw Error(who + ' has Interfold operator in Uniqueness');
    }
  });
  await check('Also run a node opens its address step', async () => {
    await home('philip'); await click('Also run a node →');
    await has('Your main node’s public address');
    if ((await page.locator('#content').innerText()).includes('What are you here for?')) throw Error('role choice appeared');
  });
  await check('Shared control stays with node operators', async () => {
    await home('lena');
    if ((await page.locator('#content').innerText()).includes('Operators I share control with')) throw Error('non-operator has shared control link');
    await home('viktor');
    await has('Operators I share control with →');
  });
  await check('Player invite creates the inviter’s player ask', async () => {
    await home('philip'); await click('Invite someone →'); await page.locator('#invite-name').fill('Rowan');
    await page.getByRole('radio', { name: 'Player' }).check(); await click('Create invite');
    await has('Invite · Rowan · as player');
    const link = (await page.locator('#invite-url').innerText()).trim();
    await page.goto(link); if (await page.locator('#identity-name').inputValue() !== 'Rowan') throw Error('invite name was lost');
    await click('Create your passkey'); await has('Get endorsed as a player');
    await switchPerson('philip'); await click('Requests');
    await page.locator('.request-section.role-player', { hasText: 'Rowan' }).getByText('Wants to be a player').waitFor();
    await has('Invite · Rowan · as player');
  });
  console.log(lines.join('\n')); if (failures.length) console.log('FAIL\n- ' + failures.join('\n- '));
  await browser.close(); process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
