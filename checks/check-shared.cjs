// The shared practice world, run as two or three browsers against a fake room server.
const { chromium } = require('playwright');
const fs = require('fs');
const { randomBytes } = require('crypto');
const FILE = process.argv[2] || __dirname + '/../index.html';
const doc = fs.readFileSync(FILE, 'utf8');
const rooms = new Map();
const presence = new Map();
let roomNo = 0, conflicts = 0, barrier = null, delayedGetRoom = null, delayedPutRoom = null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const body = value => ({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
function store(room) { if (!rooms.has(room)) rooms.set(room, { version: 0, generation: 1, world: null, claims: new Map() }); return rooms.get(room); }
async function api(route) {
  const request = route.request(), url = new URL(request.url()), state = store(url.searchParams.get('room'));
  if (url.pathname === '/api/world/reset') {
    const { teamCode, keep } = JSON.parse(request.postData() || '{}');
    if (teamCode !== 'check') return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
    if (keep !== null && (!keep || typeof keep !== 'object' || Array.isArray(keep) || Object.getPrototypeOf(keep) !== Object.prototype))
      return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
    state.version++; state.generation++; state.world = keep; state.claims.clear();
    return route.fulfill(body({ version: state.version, generation: state.generation, world: state.world }));
  }
  if (url.pathname === '/api/claim') {
    const { token, id } = JSON.parse(request.postData() || '{}');
    if (!/^[0-9a-f]{32}$/.test(token || '') || !/^[0-9a-f]{32}$/.test(id || '')) return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
    const prior = state.claims.get(token) || state.world?.invites?.[token]?.claimedBy;
    if (prior) return route.fulfill({ status: prior === id ? 200 : 409, contentType: 'application/json', body: JSON.stringify({ claimedBy: prior }) });
    if (!state.world?.invites?.[token] || state.world.invites[token].removed) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    state.claims.set(token, id);
    return route.fulfill(body({ claimedBy: id }));
  }
  if (request.method() === 'GET') {
    if (delayedGetRoom === url.searchParams.get('room')) { delayedGetRoom = null; await sleep(1500); }
    return route.fulfill(body(state));
  }
  const input = JSON.parse(request.postData() || '{}');
  if (delayedPutRoom === url.searchParams.get('room')) { delayedPutRoom = null; await sleep(900); }
  if (barrier && barrier.room === url.searchParams.get('room') && input.baseVersion === barrier.version) {
    barrier.arrived++;
    if (barrier.arrived >= 2) barrier.release();
    await Promise.race([barrier.promise, sleep(5000)]);
  }
  if (input.generation !== state.generation || input.baseVersion !== state.version) {
    conflicts++;
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(state) });
  }
  state.world = input.world; state.version++;
  return route.fulfill(body({ version: state.version, generation: state.generation }));
}
async function presenceApi(route) {
  const request = route.request(), room = new URL(request.url()).searchParams.get('room');
  if (!presence.has(room)) presence.set(room, new Map());
  const people = presence.get(room), now = Date.now();
  for (const [id, person] of people) if (now - person.at >= 30000) people.delete(id);
  if (request.method() === 'POST') {
    const { browserId, persona } = JSON.parse(request.postData() || '{}');
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(browserId || '') || typeof persona !== 'string')
      return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
    people.set(browserId, { browserId, persona, at: now });
  }
  return route.fulfill(body({ here: [...people.values()] }));
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 400, height: 900 } })));
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const thirdContext = await browser.newContext({ viewport: { width: 400, height: 900 } });
  const third = await thirdContext.newPage();
  const errors = [], lines = [];
  for (const page of [...pages, third]) {
    page.on('pageerror', e => errors.push('page error: ' + e.message));
    await page.route('http://mock.test/**', route => route.fulfill({ body: doc, contentType: 'text/html' }));
    await page.route('http://mock.test/api/world**', api);
    await page.route('http://mock.test/api/claim**', api);
    await page.route('http://mock.test/api/presence**', presenceApi);
  }
  const fresh = () => `check-${++roomNo}`;
  const open = async (page, room, code) => { await page.goto(`http://mock.test/?room=${room}${code ? '&code=' + code : ''}`); await page.waitForFunction(room => document.querySelector('#shared-header')?.textContent.includes(`Room · ${room}`), room); };
  const click = (page, name) => page.getByRole('button', { name, exact: true }).first().click();
  const choose = async (page, name) => {
    await click(page, 'Sign in with your passkey');
    await page.locator(`.passkey-choice[data-value="${name}"]`).click();
  };
  const switchTo = async (page, id) => { await page.locator('#practice-toggle').click(); await page.selectOption('#persona', id); };
  const create = async (page, name = 'Jimbo') => {
    if (!await page.locator('#identity-name').count()) await click(page, 'New here? Create your key');
    await page.locator('#identity-name').fill(name); await click(page, 'Create your passkey');
  };
  const operator = async page => {
    await create(page); await click(page, 'Interfold node operator');
    await page.locator('#node-address').fill('https://node.jimbo.example'); await click(page, 'Check my node');
    await page.getByRole('heading', { name: 'Do you run any other nodes?' }).waitFor();
    await click(page, "No, that's all"); await click(page, 'Just me');
    await click(page, 'Get endorsed →'); await click(page, "They're with me now · QR code");
    await page.locator('.arrival-code').getByText(/^[A-Z0-9]{6}$/).waitFor();
    return (await page.locator('.arrival-code').innerText()).trim();
  };
  const answerAll = async page => {
    await page.getByRole('heading', { name: 'Answer Jimbo' }).waitFor();
    for (let i = 0; i < 3; i++) await page.locator('#content .answer-slot[data-yes="true"]').nth(i).click();
    await page.waitForTimeout(1750);
  };
  const check = async (name, fn) => { try { await fn(); lines.push('PASS — ' + name); } catch (e) { errors.push(name + ': ' + e.message); lines.push('FAIL — ' + name); } };
  const makeInvite = async (page, room, name = 'Rowan') => {
    await open(page, room); await switchTo(page, 'philip'); await click(page, 'Home');
    await click(page, 'Invite someone →'); await page.locator('#invite-name').fill(name);
    delayedPutRoom = room; await click(page, 'Create invite');
    if (await page.locator('#invite-url').count()) throw Error('link appeared before PUT acknowledgement');
    await page.locator('#invite-url').waitFor({ timeout: 6000 });
    await page.locator('#arrival-qr-image[src^="data:image/png"]').waitFor();
    return (await page.locator('#invite-url').innerText()).trim();
  };
  await check('Operator invite across browsers', async () => {
    const room = fresh(), [a, b] = pages, link = await makeInvite(a, room);
    await b.goto(link); await b.getByText('Philip invited you').waitFor({ timeout: 6000 });
    if (await b.locator('#identity-name').inputValue() !== 'Rowan') throw Error('invite name not prefilled');
    await click(b, 'Create your passkey'); await b.getByRole('heading', { name: /Your main node’s public address/ }).waitFor();
    await b.locator('#node-address').fill('https://node.rowan.example'); await click(b, 'Check my node');
    await click(b, "No, that's all"); await click(b, 'Just me'); await click(b, 'Get endorsed →');
    await b.getByText("You've asked 1").waitFor(); await b.locator('#content').getByText('Philip').first().waitFor();
    await click(a, 'Requests'); await a.locator('.request-section.role-operator', { hasText: 'Rowan' }).waitFor({ timeout: 6000 });
    await a.locator('.request-section.role-operator .lego-dense-row', { hasText: 'Rowan' }).first().click();
    for (let i = 0; i < 3; i++) await a.locator('#content .answer-slot[data-yes="true"]').nth(i).click();
    await b.locator('#content').getByText('Philip').first().waitFor(); await click(b, 'Home');
    await b.getByText('1 of 2 answered Yes').waitFor({ timeout: 6000 });
  });
  await check('One invite has one winner', async () => {
    const room = fresh(), a = pages[0], b = pages[1], c = third, link = await makeInvite(a, room);
    await Promise.all([b.goto(link), c.goto(link)]);
    await Promise.all([b, c].map(page => page.locator('#identity-name').waitFor()));
    await Promise.all([click(b, 'Create your passkey'), click(c, 'Create your passkey')]);
    await Promise.all([b, c].map(page => page.getByText(/This invite was already used|Your main node’s public address/).first().waitFor({ timeout: 6000 })));
    const states = await Promise.all([b, c].map(page => page.evaluate(() => ({ persona: window.auraMockAdapter.ui.persona, text: document.querySelector('#content').textContent }))));
    if (states.filter(x => x.persona !== 'newcomer').length !== 1 || states.filter(x => x.text.includes('This invite was already used') && x.persona === 'newcomer').length !== 1) throw Error('claim did not have exactly one winner');
  });
  await check('Invalid and used invite links', async () => {
    const room = fresh(), a = pages[0], b = pages[1], link = await makeInvite(a, room);
    await b.goto(`http://mock.test/?room=${room}&invite=${randomBytes(16).toString('hex')}`); await b.getByText("This invite link isn't valid").waitFor({ timeout: 6000 });
    await b.goto(link); await b.locator('#identity-name').waitFor(); await click(b, 'Create your passkey');
    await b.getByRole('heading', { name: /Your main node’s public address/ }).waitFor();
    const token = new URL(link).searchParams.get('invite');
    for (let i = 0; i < 40 && !store(room).world?.invites?.[token]?.claimedBy; i++) await sleep(150);
    await third.goto(link); await third.getByText('This invite was already used').waitFor({ timeout: 6000 });
  });
  await check('Invite name XSS is inert', async () => {
    const room = fresh(), attack = '<img src=x onerror=window.__x=1>', token = 'a'.repeat(32), state = store(room);
    state.version = 1; state.world = { invites: { [token]: { inviter: 'philip', name: attack, createdAt: Date.now(), updatedAt: Date.now(), by: 'philip' } } };
    const [a, b] = pages; await open(a, room); await switchTo(a, 'philip'); await click(a, 'Requests'); await a.getByText(`Invite · ${attack} · not opened yet`).waitFor({ timeout: 6000 });
    await b.goto(`http://mock.test/?room=${room}&invite=${token}`); await b.locator('#identity-name').waitFor({ timeout: 6000 });
    if (await b.locator('#identity-name').inputValue() !== attack || await a.evaluate(() => window.__x) || await b.evaluate(() => window.__x)) throw Error('invite name executed or was lost');
  });
  await check('Reset seeds named work', async () => {
    const room = fresh(), [a, b] = pages; await open(a, room); await switchTo(a, 'philip');
    await a.locator('#practice-toggle').click(); await a.locator('#team-code').fill('check'); await click(a, 'Reset this room to the start');
    for (let i = 0; i < 30 && store(room).generation === 1; i++) await sleep(100);
    await a.locator('#practice-drawer').waitFor({ state: 'hidden' });
    await click(a, 'Requests');
    for (const name of ['Kenji', 'Rosa']) await a.locator('.request-section.role-operator', { hasText: name }).waitFor();
    for (const name of ['Kenji', 'Rosa']) if (/Seated/.test(await a.locator('.request-section.role-operator .lego-dense-row', { hasText: name }).first().innerText())) throw Error(name + ' is already seated in the demo');
    await a.getByText('Invite · Sam · not opened yet').waitFor();
    await a.locator('.request-section.role-operator .lego-dense-row', { hasText: 'Rosa' }).first().click();
    await a.getByText('3 nodes', { exact: false }).waitFor(); await a.locator('.answer-profile summary').click(); await a.getByText('Shares control with this operator').waitFor();
    if (await a.locator('#content .answer-slot[data-yes="true"]').count() !== 3) throw Error('Rosa questions lack answer controls');
    await open(b, room); await switchTo(b, 'adam'); await click(b, 'Requests');
    for (const name of ['Kenji', 'Rosa', 'Mateo']) await b.locator('.request-section.role-operator', { hasText: name }).waitFor();
    await switchTo(b, 'auryn'); await b.selectOption('#domain', 'uniqueness'); await click(b, 'Requests');
    for (const name of ['Philip', 'Adam']) {
      const row = b.locator('.sent-kind .lego-dense-row', { hasText: name }).first();
      await row.waitFor(); if (!(await row.innerText()).includes('Waiting')) throw Error(name + ' trainer ask is not waiting');
    }
    for (const id of ['philip', 'adam', 'auryn']) {
      await switchTo(b, id);
      for (const domain of ['interfold', 'uniqueness']) {
        await b.selectOption('#domain', domain);
        for (const view of ['Home', 'Requests']) {
          await click(b, view);
          const text = await b.locator('#content').innerText();
          if (/[A-Za-z0-9_-]{8}…/.test(text)) throw Error(`${id} ${domain} ${view} shows a truncated ID`);
          if (domain === 'interfold' && /What are you here for\?|Choose a role|Ask to be a player|Ask to be a trainer|Get endorsed as a node operator/.test(text)) throw Error(`${id} ${view} shows a founding-team ask`);
          if (domain === 'interfold' && view === 'Home') {
            for (const role of ['Player', 'Trainer', 'Manager']) if (!await b.locator(`.home-role-chip[data-role="${role.toLowerCase()}"]`, { hasText: role }).count()) throw Error(`${id} lacks ${role} chip`);
            if (id === 'auryn' && !await b.locator('.home-role-chip[data-role="operator"]', { hasText: 'Node operator · getting endorsed' }).count()) throw Error('Auryn lacks operator chip');
            if ((id === 'auryn' && text.includes('Also run a node →')) || (id !== 'auryn' && !text.includes('Also run a node →'))) throw Error(`${id} has the wrong node link`);
          }
          if (id === 'philip' && domain === 'uniqueness' && view === 'Home' && (!text.includes('Trainer L2') || !text.includes('Manager L2'))) throw Error('Philip Uniqueness levels are not L2');
          if (id === 'auryn' && domain === 'uniqueness' && view === 'Home' && (!text.includes('Trainer ask · 0 of 2 Yes') || text.includes('Ask to be a trainer →'))) throw Error('Auryn open trainer ask is repeated');
          if (id === 'philip' && domain === 'interfold' && view === 'Requests') {
            const rosa = await b.locator('.request-section.role-operator .lego-dense-row', { hasText: 'Rosa' }).first().innerText();
            const kenji = await b.locator('.request-section.role-operator .lego-dense-row', { hasText: 'Kenji' }).first().innerText();
            if (!rosa.includes('Unique · L2') || !kenji.includes('Not verified for uniqueness')) throw Error('operator uniqueness contrast missing');
          }
        }
      }
    }
  });
  await check('Real people survive a reset', async () => {
    const room = fresh(), [a, b] = pages;
    await open(a, room); await create(a, 'Rowan'); await click(a, 'Interfold node operator');
    await a.locator('#node-address').fill('https://node.rowan.example'); await click(a, 'Check my node');
    await click(a, "No, that's all"); await click(a, 'Just me'); await click(a, 'Get endorsed →');
    await click(a, "They're with me now · QR code");
    const code = (await a.locator('.arrival-code').innerText()).trim();
    await click(a, 'Done → Home');
    const rowan = await a.evaluate(() => window.auraMockAdapter.ui.persona);
    await open(b, room); await switchTo(b, 'philip'); await click(b, 'Requests');
    await b.locator('#arrival-code-input').fill(code); await click(b, 'Open request');
    for (let i = 0; i < 3; i++) await b.locator('#content .answer-slot[data-yes="true"]').nth(i).click();
    await click(b, 'Requests');
    await b.locator('.request-section.role-operator .lego-dense-row', { hasText: 'Kenji' }).first().click();
    for (let i = 0; i < 3; i++) await b.locator('#content .answer-slot[data-yes="true"]').nth(i).click();
    await b.waitForFunction(() => window.auraMockAdapter.ui.answers.filter(x => x.rater === 'philip' && x.subject === 'kenji').length === 3);
    await b.locator('#practice-toggle').click(); await b.locator('#team-code').fill('check'); await click(b, 'Reset this room to the start');
    await a.waitForFunction(id => window.auraMockAdapter.ui.persona === id && document.querySelector('#content')?.textContent.includes('1 of 2 answered Yes'), rowan, { timeout: 6000 });
    if (await a.evaluate(() => window.auraMockAdapter.ui.view) !== 'home') throw Error('Rowan left Home');
    if (await b.evaluate(() => window.auraMockAdapter.ui.persona) !== 'philip') throw Error('Philip signed out');
    await click(b, 'Requests');
    const kenji = b.locator('.request-section.role-operator .lego-dense-row', { hasText: 'Kenji' }).first();
    await kenji.click();
    await b.locator('#content .answer-slot[data-yes="true"]').first().waitFor({ timeout: 6000 });
    await click(b, 'Requests');
    if (await b.getByText('Invite · Sam · not opened yet').count() !== 1) throw Error('Sam invite not restored once');
    for (const page of pages) if (!await page.locator('#persona optgroup[label="New on this call"] option', { hasText: 'Rowan ·' }).count()) throw Error('Rowan absent from picker');
    if (!Object.values(store(room).world.nodes || {}).some(x => !x.removed && x.owner === rowan)) throw Error('Rowan node was lost');
    if (Object.values(store(room).world.answers || {}).some(x => !x.removed && x.rater === 'philip' && x.subject === 'kenji')) throw Error('Kenji answer survived');
  });
  await check('Hostile world is inert on Requests, Home, and QR', async () => {
    const room = fresh(), page = pages[0], attack = '<img src=x onerror=window.__x=1>', badStatus = '"><img src=x onerror=window.__x=1>';
    const state = store(room); state.version = 1; state.world = {
      arrivalCodes: { [attack]: { from: 'auryn', time: Date.now(), updatedAt: 1, by: 'evil' } },
      answers: { bad: { domain: 'interfold', subject: 'viktor', rater: 'lena', role: 'subject', question: 0, yes: true, conf: attack, updatedAt: 1, by: 'evil' } },
      playerRequests: { bad: { from: 'auryn', to: 'lena', domain: 'interfold', role: 'player', status: badStatus, time: new Date().toISOString(), updatedAt: 1, by: 'evil' } }
    };
    const before = errors.length; await open(page, room); await switchTo(page, 'lena');
    await click(page, 'Requests'); await click(page, 'Home'); await switchTo(page, 'auryn'); await click(page, 'Get endorsed →'); await click(page, "They're with me now · QR code");
    if (await page.evaluate(() => window.__x) !== undefined || errors.length !== before) throw Error('hostile world executed or caused a page error');
  });
  await check('Malformed world recovers on next version', async () => {
    const room = fresh(), page = pages[0], state = store(room); state.version = 1; state.world = { answers: null, nodes: 'x' };
    const before = errors.length; await open(page, room); await switchTo(page, 'lena'); await click(page, 'Home');
    await page.getByRole('heading', { name: /Hi, Lena/ }).waitFor();
    state.version = 2; state.world = { identities: { good: { name: 'Recovered', createdAt: Date.now(), updatedAt: Date.now(), by: 'server' } } };
    await page.waitForFunction(() => window.auraMockAdapter.ui.created.includes('good'), null, { timeout: 6000 });
    if (errors.length !== before) throw Error('malformed world caused a page error');
  });
  await check('Early push survives initial generation conflict', async () => {
    const room = fresh(), page = pages[0]; delayedGetRoom = room;
    await open(page, room); await create(page, 'Early');
    for (let i = 0; i < 50 && !Object.values(store(room).world?.identities || {}).some(x => x.name === 'Early' && !x.removed); i++) await sleep(150);
    if (!Object.values(store(room).world?.identities || {}).some(x => x.name === 'Early' && !x.removed)) throw Error('early identity never reached server');
  });
  await check('A No does not erase another player Yes', async () => {
    const room = fresh(), page = pages[0], state = store(room), now = Date.now();
    state.version = 1; state.world = {
      identities: { newcomer1: { name: 'New Player', createdAt: now, updatedAt: now, by: 'server' } },
      playerRequests: Object.fromEntries(['lena', 'nora'].map(to => [JSON.stringify(['newcomer1', to, 'interfold', 'player']),
        { from: 'newcomer1', to, domain: 'interfold', role: 'player', status: 'waiting', time: new Date().toISOString(), updatedAt: now, by: 'server' }]))
    };
    await open(page, room); await switchTo(page, 'lena'); await click(page, 'Requests');
    await page.locator('.request-section.role-player .answer-slot[data-yes="true"]').first().click();
    await page.waitForFunction(() => window.auraMockAdapter.ui.playerReady.newcomer1 === true, null, { timeout: 6000 });
    await switchTo(page, 'nora'); await click(page, 'Requests');
    await page.locator('.request-section.role-player .answer-slot[data-yes="false"]').first().click();
    await page.waitForTimeout(1750);
    if (!await page.evaluate(() => window.auraMockAdapter.ui.playerReady.newcomer1)) throw Error('Nora No erased Lena Yes');
  });
  await check('Conflicting control additions both remain', async () => {
    const room = fresh(), [a, b] = pages; await Promise.all(pages.map(p => open(p, room)));
    for (const page of pages) { await switchTo(page, 'mira'); await click(page, 'Home'); await click(page, 'Operators I share control with →'); }
    const version = store(room).version, before = conflicts; let release; const promise = new Promise(resolve => { release = resolve; });
    barrier = { room, version, promise, release, arrived: 0 };
    await Promise.all([[a, 'Lena'], [b, 'Nora']].map(async ([page, name]) => { await page.locator('#control-relationships').fill(name); await click(page, 'Save disclosure'); }));
    await Promise.race([promise, sleep(5500)]); barrier = null;
    for (let i = 0; i < 50 && Object.values(store(room).world?.controlRelationships || {}).filter(x => !x.removed && x.owner === 'mira').length < 2; i++) await sleep(150);
    const controllers = Object.values(store(room).world?.controlRelationships || {}).filter(x => !x.removed && x.owner === 'mira').map(x => x.controller);
    if (conflicts <= before) throw Error('control additions did not conflict');
    if (!controllers.includes('lena') || !controllers.includes('nora')) throw Error('a controller was lost');
  });
  await check('Newcomer to all set across browsers', async () => {
    const room = fresh(), [a, b] = pages; await open(a, room); const code = await operator(a);
    await open(b, room, code); await choose(b, 'lena'); await answerAll(b);
    await a.locator('#arrival-count', { hasText: '1 of 2 answered Yes' }).waitFor({ timeout: 6000 });
    await click(a, 'Done → Home'); await switchTo(b, 'nora'); await click(b, 'Requests');
    await b.locator('#arrival-code-input').fill(code); await click(b, 'Open request'); await answerAll(b);
    await a.getByText("You're all set as a node operator", { exact: false }).waitFor({ timeout: 6000 });
  });
  await check('Two newcomers stay two people', async () => {
    const room = fresh(); await Promise.all(pages.map(p => open(p, room)));
    await create(pages[0]); await create(pages[1]);
    await pages[0].waitForFunction(() => document.querySelectorAll('#persona optgroup[label="New on this call"] option').length === 2, null, { timeout: 6000 });
    for (const page of pages) {
      const people = await page.locator('#persona optgroup[label="New on this call"] option').evaluateAll(rows => rows.map(x => ({ value: x.value, text: x.textContent })));
      if (people.length !== 2 || new Set(people.map(x => x.value)).size !== 2 || people.some(x => !x.text.startsWith('Jimbo ·'))) throw Error('newcomers collided');
      if (await page.locator('#persona > option').count() !== 20) throw Error('seeded picker changed');
    }
    const ownKey = await pages[0].evaluate(() => window.auraMockAdapter.ui.persona);
    await pages[0].reload();
    await pages[0].waitForFunction(id => window.auraMockAdapter.ui.persona === id && document.querySelector('#persona')?.value === id, ownKey, { timeout: 6000 });
  });
  await check('Real conflict keeps both answers', async () => {
    const room = fresh(), [a, b] = pages; await open(a, room); const code = await operator(a);
    await switchTo(a, 'lena'); await click(a, 'Requests'); await a.locator('#arrival-code-input').fill(code); await click(a, 'Open request');
    await open(b, room, code); await choose(b, 'nora');
    await sleep(800);
    const version = store(room).version;
    let release; const promise = new Promise(resolve => { release = resolve; });
    barrier = { room, version, promise, release, arrived: 0 }; const before = conflicts;
    await Promise.all(pages.map(p => p.locator('#content .answer-slot[data-yes="true"]').first().click()));
    await Promise.race([promise, sleep(5500)]); barrier = null;
    const jim = store(room).world.arrivalCodes[code].from;
    for (const page of pages) await page.waitForFunction(id => new Set(window.auraMockAdapter.ui.answers.filter(a => a.subject === id && a.question === 0).map(a => a.rater)).size >= 2, jim, { timeout: 6000 });
    if (conflicts <= before) throw Error('no compare-and-set conflict');
    const answers = Object.values(store(room).world.answers).filter(x => !x.removed && x.subject === jim && x.question === 0 && ['lena', 'nora'].includes(x.rater));
    if (answers.length !== 2) throw Error('server lost an answer');
  });
  await check('Undo stays local', async () => {
    const room = fresh(), [a, b] = pages; await open(a, room); const code = await operator(a);
    await switchTo(a, 'lena'); await click(a, 'Requests'); await a.locator('#arrival-code-input').fill(code); await click(a, 'Open request');
    await open(b, room); await choose(b, 'nora');
    await a.locator('#content .answer-slot[data-yes="true"]').first().click(); await click(a, 'Undo');
    await sleep(4500);
    const jim = store(room).world.arrivalCodes[code].from;
    if (Object.values(store(room).world.answers).some(x => !x.removed && x.rater === 'lena' && x.subject === jim)) throw Error('undone answer reached server');
    if (await b.getByText('1 of 2 answered Yes').count()) throw Error('other browser showed undone answer');
  });
  await check('Typing survives a poll', async () => {
    const room = fresh(), [a, b] = pages; await Promise.all(pages.map(p => open(p, room)));
    await click(a, 'New here? Create your key'); await a.locator('#identity-name').fill('Jimbo still typing'); await a.locator('#identity-name').focus();
    await create(b, 'Another'); await sleep(2400);
    if (await a.locator('#identity-name').inputValue() !== 'Jimbo still typing' || !await a.locator('#identity-name').evaluate(x => x === document.activeElement)) throw Error('poll replaced focused input');
  });
  await check('Stale tab cannot undo reset', async () => {
    const room = fresh(), [a, b] = pages; await open(a, room); await switchTo(a, 'philip'); await click(a, 'Requests');
    await a.locator('.request-section.role-operator .lego-dense-row', { hasText: 'Kenji' }).first().click();
    await open(b, room); await switchTo(b, 'adam');
    await a.locator('#content .answer-slot[data-yes="true"]').first().click();
    await b.locator('#practice-toggle').click(); await b.locator('#team-code').fill('check'); await click(b, 'Reset this room to the start');
    await b.locator('#practice-drawer').waitFor({ state: 'hidden', timeout: 6000 });
    await a.waitForTimeout(2200);
    await a.waitForFunction(() => !window.auraMockAdapter.ui.answers.some(x => x.rater === 'philip' && x.subject === 'kenji'), null, { timeout: 6000 });
    await a.locator('#content .answer-slot[data-yes="true"]').first().waitFor({ timeout: 6000 });
    if (Object.values(store(room).world?.answers || {}).some(x => !x.removed && x.rater === 'philip' && x.subject === 'kenji')) throw Error('stale answer restored');
  });
  const uniqueness = async (page, persona) => { await switchTo(page, persona); await page.selectOption('#domain', 'uniqueness'); };
  const yesThree = async (page, selector) => {
    for (let i = 0; i < 3; i++) await page.locator(selector).click();
    await page.locator('#content .answer-status[data-confidence="3"]').first().waitFor();
  };
  await check('Promotion across browsers', async () => {
    const room = fresh(), [a, b] = pages;
    await open(a, room); await uniqueness(a, 'auryn');
    await click(a, 'Ask to be a trainer →');
    for (const to of ['philip', 'adam']) { const slot = a.locator(`.send-control[data-kind="trainer"][data-to="${to}"]`); if (!await slot.isDisabled()) await slot.click(); }
    await a.locator('.send-control[data-kind="trainer"].sent').first().waitFor();
    await click(a, 'Home');
    await open(b, room); await uniqueness(b, 'philip'); await click(b, 'Requests');
    await b.locator('.request-section.role-trainer .player-answer-unit:has-text("Auryn") .answer-slot[data-yes="true"]').waitFor({ timeout: 6000 });
    await yesThree(b, '.request-section.role-trainer .player-answer-unit:has-text("Auryn") .answer-slot[data-yes="true"]');
    await b.waitForFunction(() => window.auraMockAdapter.ui.answers.some(x => x.rater === 'philip' && x.subject === 'auryn' && x.role === 'trainer' && x.conf === 3), null, { timeout: 6000 });
    await a.getByText('Trainer ask · 1 of 2 Yes', { exact: false }).waitFor({ timeout: 6000 });
    await switchTo(b, 'adam'); await click(b, 'Requests');
    await b.locator('.request-section.role-trainer .player-answer-unit:has-text("Auryn") .answer-slot[data-yes="true"]').waitFor({ timeout: 6000 });
    await yesThree(b, '.request-section.role-trainer .player-answer-unit:has-text("Auryn") .answer-slot[data-yes="true"]');
    await b.waitForFunction(() => window.auraMockAdapter.ui.answers.some(x => x.rater === 'adam' && x.subject === 'auryn' && x.role === 'trainer' && x.conf === 3), null, { timeout: 6000 });
    await a.locator('.home-role-chip[data-role="trainer"]', { hasText: 'Trainer' }).waitFor({ timeout: 6000 });
    await a.getByText("You're a trainer now. You can rate players.", { exact: true }).waitFor({ timeout: 6000 });
    if (await b.getByText("You're a trainer now. You can rate players.", { exact: true }).count()) throw Error('other viewer saw promotion notice');
    const answerRows = Object.values(store(room).world.answers).filter(x => !x.removed && x.domain === 'uniqueness' && x.subject === 'auryn' && x.role === 'trainer' && x.yes);
    if (new Set(answerRows.map(x => x.rater)).size !== 2) throw Error('shared trainer answers missing');
    if ('promotedRoles' in store(room).world || 'promotionNotices' in store(room).world) throw Error('derived role or notice stored in world');
  });
  await check('Unasked rating across browsers', async () => {
    const room = fresh(), [a, b] = pages;
    await open(a, room); await uniqueness(a, 'elena');
    await open(b, room); await uniqueness(b, 'philip');
    for (const rater of ['philip', 'adam']) {
      if (rater === 'adam') await switchTo(b, 'adam');
      await click(b, 'Rate someone');
      await b.locator('#rate-results [data-view="detail"][data-detail="elena"]').click();
      await yesThree(b, '#content .answer-slot[data-kind="trainer"][data-subject="elena"][data-yes="true"]');
      await b.waitForFunction(id => window.auraMockAdapter.ui.answers.some(x => x.rater === id && x.subject === 'elena' && x.role === 'trainer'), rater, { timeout: 6000 });
    }
    await a.locator('.home-role-chip[data-role="trainer"]', { hasText: 'Trainer' }).waitFor({ timeout: 6000 });
    await a.waitForFunction(() => new Set(window.auraMockAdapter.ui.answers.filter(x => x.subject === 'elena' && x.domain === 'uniqueness' && x.role === 'trainer' && x.yes).map(x => x.rater)).size >= 2, null, { timeout: 6000 });
    if (Object.values(store(room).world.playerRequests).some(x => !x.removed && x.from === 'elena' && x.role === 'trainer')) throw Error('unexpected ask');
  });
  await check('Presence and in-use warning', async () => {
    const room = fresh(), [a, b] = pages;
    await open(a, room); await switchTo(a, 'auryn');
    await open(b, room); await switchTo(b, 'philip');
    await b.locator('#practice-toggle').click();
    await b.locator('#practice-drawer #shared-header', { hasText: '· 2 here' }).waitFor({ timeout: 12000 });
    await b.locator('#persona option[value="auryn"]', { hasText: '· in use' }).waitFor({ timeout: 12000 });
    await b.selectOption('#persona', 'auryn');
    await b.getByText('Someone else is using Auryn. Use it anyway?', { exact: true }).waitFor();
    await click(b, 'Cancel');
    if (await b.locator('#persona').inputValue() !== 'philip' || await b.evaluate(() => window.auraMockAdapter.ui.persona) !== 'philip') throw Error('Cancel changed persona');
    if (store(room).world && 'presence' in store(room).world) throw Error('presence stored in world');
  });
  await check('Shared header keeps its controls whole', async () => {
    const room = fresh(), [a] = pages;
    for (const width of [360, 400, 620, 786]) {
      await a.setViewportSize({ width, height: 900 }); await open(a, room);
      const box = await a.locator('#practice-toggle').boundingBox();
      if (box.height > 48 || box.width < 60) throw Error(`Practice button squeezed at ${width}px: ${Math.round(box.width)}x${Math.round(box.height)}`);
      if (await a.locator('.app-head > #shared-header').count()) throw Error(`room line remains in header at ${width}px`);
      await a.locator('#practice-toggle').click();
      await a.locator('#practice-drawer #shared-header', { hasText: `Room · ${room}` }).waitFor();
    }
    await a.setViewportSize({ width: 400, height: 900 });
  });
  await check('Merge is pure', async () => {
    const page = pages[0];
    const okay = await page.evaluate(() => {
      const a = { answers: { a: { yes: true, updatedAt: 1, by: 'a' } } }, b = { answers: { a: { yes: false, updatedAt: 1, by: 'b' }, c: { yes: true, updatedAt: 2, by: 'c' } } };
      const before = JSON.stringify([a, b]);
      return JSON.stringify(window.mergeWorld(a, b)) === JSON.stringify(window.mergeWorld(b, a)) && JSON.stringify(window.mergeWorld(a, a)) === JSON.stringify(a) && before === JSON.stringify([a, b]);
    });
    if (!okay) throw Error('merge is not pure, commutative, and idempotent');
  });
  await check('keepAfterReset is pure', async () => {
    const okay = await pages[0].evaluate(() => {
      const w = { identities: { rowan: { name: 'Rowan' } }, answers: {
        real: { rater: 'philip', subject: 'rowan', removed: true },
        practice: { rater: 'philip', subject: 'kenji', removed: true },
      }, nodes: { real: { owner: 'rowan' }, practice: { owner: 'rosa' } } };
      const before = JSON.stringify(w), kept = window.keepAfterReset(w);
      return JSON.stringify(window.keepAfterReset(kept)) === JSON.stringify(kept) &&
        before === JSON.stringify(w) && !!kept.answers.real && !kept.answers.practice &&
        !!kept.nodes.real && !kept.nodes.practice;
    });
    if (!okay) throw Error('filter mutates, is not idempotent, or retains practice records');
  });
  console.log(lines.join('\n')); if (errors.length) console.log('FAIL\n- ' + errors.join('\n- '));
  await browser.close(); process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
