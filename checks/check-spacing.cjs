// Shared spacing check for the screens covered by check-containment.cjs.
// Independent painted sibling boxes must have at least the dense 8px gap.
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.argv[2] || __dirname + '/../index.html';
(async () => {
  const doc = fs.readFileSync(FILE,'utf8');
  const b = await chromium.launch({ headless: true });
  const fails = new Set(); let scans = 0;
  for (const W of [400, 786]) {
    const ctx = await b.newContext({ viewport:{width:W,height:900}, colorScheme:'dark' });
    await ctx.route('http://mock.test/**', r => r.fulfill({ body: doc, contentType:'text/html' }));
    const p = await ctx.newPage();
    const open = async (a,d,v) => { await p.goto('http://mock.test/'); await p.evaluate(([a,b,c]) => { localStorage.setItem('auraMock_persona',a); localStorage.setItem('auraMock_domain',b); localStorage.setItem('auraMock_view',c) }, [a,d,v]); await p.reload(); };
    await p.goto('http://mock.test/');
    const personasByDomain = {};
    for (const domain of ['interfold','uniqueness']) { await p.evaluate(d => localStorage.setItem('auraMock_domain',d), domain); await p.reload(); personasByDomain[domain] = await p.evaluate(() => [...document.querySelectorAll('#persona option')].map(o => o.value)); }
    let titleOffset = null;
    const scanTitle = async (where) => {
      scans++;
      const result = await p.evaluate(() => {
        const shell = document.querySelector('#content .lego-screen-shell');
        const heading = shell?.querySelector('h1');
        if (!shell || !heading) return null;
        const band = shell.querySelector(':scope > .screen-top-band');
        const bandBottom = band?.getBoundingClientRect().bottom;
        const overflow = band ? [...band.children].some(el => el.getBoundingClientRect().bottom > bandBottom + 1) : false;
        return { offset: heading.getBoundingClientRect().top - shell.getBoundingClientRect().top, bandHeight: band?.getBoundingClientRect().height, expectedBandHeight: parseFloat(getComputedStyle(shell).getPropertyValue('--screen-top-band-height')), overflow };
      });
      if (!result) { fails.add(`[${W}] ${where}: missing ScreenShell title`); return; }
      if (!Number.isFinite(result.bandHeight) || !Number.isFinite(result.expectedBandHeight) || Math.abs(result.bandHeight - result.expectedBandHeight) > 1) fails.add(`[${W}] ${where}: top band is ${result.bandHeight}px, expected ${result.expectedBandHeight}px`);
      if (result.overflow) fails.add(`[${W}] ${where}: Back or notice overflows the top band`);
      if (titleOffset === null) titleOffset = result.offset;
      else if (Math.abs(result.offset - titleOffset) > 1) fails.add(`[${W}] ${where}: title offset ${result.offset.toFixed(1)}px differs from ${titleOffset.toFixed(1)}px`);
    };
    const scan = async (where) => {
      scans++;
      const problems = await p.evaluate(() => {
        const painted = el => {
          const s = getComputedStyle(el), r = el.getBoundingClientRect();
          if (r.width < 20 || r.height < 20 || s.visibility === 'hidden' || s.display === 'none' || s.position === 'fixed') return false;
          return ['Top','Right','Bottom','Left'].every(side => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none') || (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent');
        };
        const out = [];
        for (const parent of document.querySelectorAll('#content *')) {
          const children = [...parent.children].filter(painted);
          for (let i = 0; i < children.length; i++) for (let j = i+1; j < children.length; j++) {
            const a=children[i], c=children[j], x=a.getBoundingClientRect(), y=c.getBoundingClientRect();
            const horizontal = Math.min(x.right,y.right)-Math.max(x.left,y.left);
            const vertical = Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top);
            const gap = horizontal > 1 ? Math.max(y.top-x.bottom,x.top-y.bottom) : vertical > 1 ? Math.max(y.left-x.right,x.left-y.right) : Infinity;
            if (gap < 7.5 && ![a,c].some(el => el.matches(".undo-badge,.send-undo"))) out.push(`${a.className||a.tagName} and ${c.className||c.tagName}: ${gap.toFixed(1)}px`);
          }
        }
        return out;
      });
      problems.forEach(f => fails.add(`[${W}] ${where}: ${f}`));
    };
    const scanTextButtonGap = async (where) => {
      scans++;
      for (const f of await p.evaluate(() => {
        const out=[];
        for (const main of document.querySelectorAll('#content .flow-main')) {
          const children=[...main.children].filter(el=>getComputedStyle(el).display!=='none');
          for (let i=1;i<children.length;i++) {
            const target=children[i];
            if (!target.matches('button,.choice-group,.arrival-actions,.role-options')) continue;
            const first=target.matches('button')?target:target.querySelector('button');
            if (!first) continue;
            const previous=children[i-1];
            if (!previous.textContent.trim()) continue;
            const gap=first.getBoundingClientRect().top-previous.getBoundingClientRect().bottom;
            if (gap<23.5) out.push(`${previous.className||previous.tagName} to ${first.textContent.trim().slice(0,24)}: ${gap.toFixed(1)}px`);
          }
          const bar=main.parentElement.querySelector(':scope > .flow-action-bar');
          if (bar) {
            const gap=bar.getBoundingClientRect().top-main.getBoundingClientRect().bottom;
            if (gap<23.5) out.push(`flow content to action bar: ${gap.toFixed(1)}px`);
          }
        }
        return out;
      })) fails.add(`[${W}] ${where}: ${f}`);
    };
    for (const d of ['interfold','uniqueness']) for (const who of personasByDomain[d].filter(x => !process.env.ONLY || x === process.env.ONLY)) {
      for (const v of ['home','requests','board']) { await open(who,d,v); await scan(`${who} ${d} ${v}`); }
      await open(who,d,'home');
      if (await p.locator('#content .own-person').count()) fails.add(`[${W}] ${who} ${d}: identity row remains in the card`);
      await p.locator('#avatar').click();
      const accountMenu = p.locator('#menu');
      if (!await accountMenu.isVisible() || !await accountMenu.locator('#menu-person-name').innerText() || !await accountMenu.getByText('Your passkey').count()) fails.add(`[${W}] ${who} ${d}: avatar sheet is missing identity details`);
      if (!await accountMenu.getByRole('button', { name: 'Not you? Switch' }).isVisible()) fails.add(`[${W}] ${who} ${d}: avatar sheet is missing Switch`);
      for (const v of ['home','requests','board','network','account','status','ask','invite','answer','past-answer','detail','endorse','identity-start','sign-in-flow','create-key','role-choice','together','send-link','find-player','node-choice','node-address','node-checking','node-guide','node-guide-link','shared-control','edit-disclosure','player-start','player-trainer','advanced-role','player-name-question','name-visibility','invite-detail','player-ask','setup-node','declare-node']) { await open(who,d,v); await scanTextButtonGap(`${who} ${d} ${v}`); if (v !== 'name-visibility') await scanTitle(`${who} ${d} ${v}`); }
      await open(who,d,'requests');
      const targets = await p.locator('#content [data-view="answer"]').evaluateAll(els => els.map(e => e.dataset.detail));
      for (const t of targets.slice(0,3)) {
        await open(who,d,'requests'); await p.locator(`#content [data-view="answer"][data-detail="${t}"]`).first().click(); await scan(`${who} ${d} answer ${t}`); await scanTextButtonGap(`${who} ${d} answer ${t}`); await scanTitle(`${who} ${d} answer ${t}`);
        const yes = '#content .answer-slot[data-yes="true"]', n = await p.locator(yes).count();
        for (let i=0;i<n;i++) { await p.locator(yes).nth(i).click(); await p.waitForTimeout(40); }
        await p.waitForTimeout(1700); await scan(`${who} ${d} answer ${t} after done`); await scanTextButtonGap(`${who} ${d} answer ${t} after done`); await scanTitle(`${who} ${d} answer ${t} after done`);
      }
    }
    for (const domain of ['interfold','uniqueness']) {
      await open('newcomer',domain,'home');
      const { top, expected } = await p.locator('#content .flow-action-bar .primary').first().evaluate(el => ({ top: el.getBoundingClientRect().top, expected: parseFloat(getComputedStyle(el).getPropertyValue('--flow-y')) }));
      if (!Number.isFinite(expected) || Math.abs(top - expected) > 1) fails.add(`[${W}] newcomer ${domain} primary starts at y=${top.toFixed(1)}px, expected ${expected}px`);
    }
    // The address and its fixed primary action are included explicitly.
    await open('auryn','interfold','node-address'); await scan('auryn interfold node-address');
    const gap = await p.evaluate(() => {
      const a=document.querySelector('#node-address')?.getBoundingClientRect();
      const b=document.querySelector('.flow-action-bar .primary')?.getBoundingClientRect();
      return a && b ? b.top-a.bottom : null;
    });
    if (gap == null || gap < 7.5) fails.add(`[${W}] node address / primary action gap: ${gap}px`);
    const primaryFilled = await p.evaluate(() => {
      const button = document.querySelector('.flow-action-bar .primary');
      return button && getComputedStyle(button).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(button).backgroundColor !== 'transparent';
    });
    if (!primaryFilled) fails.add(`[${W}] Check my node is not a filled primary button`);
    await ctx.close();
  }
  await b.close();
  if (!scans) fails.add('checked nothing');
  console.log(`${scans} screens checked`);
  console.log(fails.size ? `FAIL (${fails.size})\n- ` + [...fails].slice(0,50).join('\n- ') : 'PASS — painted sibling boxes have at least 8px spacing');
  process.exit(fails.size ? 1 : 0);
})();
