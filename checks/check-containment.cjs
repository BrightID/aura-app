// Nothing spills out of the box it sits in.
// Walks every persona × domain × main view, plus every answer screen reachable from Requests, and flags any
// element whose box pokes outside its nearest bordered or clipping ancestor by more than 1px.
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.argv[2] || __dirname + '/../index.html';
(async () => {
  const source = fs.readFileSync(FILE, 'utf8');
  const stampLine = /^  const BUILD_STAMP = "[^"]*";$/m;
  if (!stampLine.test(source)) throw new Error('BUILD_STAMP line missing');
  const stamped = source.replace(stampLine, '  const BUILD_STAMP = "v23.2 · 2026-09-30 14:19";');
  const doc = stamped;
  const b = await chromium.launch({ headless: true }), fails = new Set(); let scans = 0;
  for (const W of [400, 786]) {
    const ctx = await b.newContext({ viewport:{width:W,height:900}, colorScheme:'dark' });
    await ctx.route('http://mock.test/**', r => r.fulfill({ body: doc, contentType:'text/html' }));
    const p = await ctx.newPage();
    const open = async (a,d,v) => { await p.goto('http://mock.test/'); await p.evaluate(([a,b,c]) => { localStorage.setItem('auraMock_persona',a); localStorage.setItem('auraMock_domain',b); localStorage.setItem('auraMock_view',c) }, [a,d,v]); await p.reload(); };
    await p.goto('http://mock.test/'); const personasByDomain = {};
    for (const domain of ['interfold','uniqueness']) { await p.evaluate(d => localStorage.setItem('auraMock_domain',d), domain); await p.reload(); personasByDomain[domain] = await p.evaluate(() => [...document.querySelectorAll('#persona option')].map(o => o.value)); }
    const scanHeader = async (where) => {
      scans++;
      for (const f of await p.evaluate(() => {
        const out = [], head = document.querySelector('.app-head'), bounds = head.getBoundingClientRect();
        const avatar = document.querySelector('#avatar').getBoundingClientRect();
        if (Math.abs(avatar.right - bounds.right) > 1) out.push(`avatar right edge ${avatar.right.toFixed(1)} misses header content edge ${bounds.right.toFixed(1)}`);
        if (document.querySelector('#build-stamp').textContent !== 'v23.2' || document.querySelector('#build-stamp').title !== 'v23.2 · 2026-09-30 14:19') out.push('version display or full hover stamp is missing');
        const select = document.querySelector('#domain');
        if (select.selectedOptions[0].textContent !== (select.value === 'interfold' ? 'Interfold' : 'Uniqueness')) out.push('domain label includes extra text');
        for (const el of head.querySelectorAll('*')) {
          const style = getComputedStyle(el), box = el.getBoundingClientRect();
          if (!box.width || !box.height || style.display === 'none') continue;
          if (style.textOverflow === 'ellipsis') out.push(`${el.id || el.className || el.tagName} uses ellipsis`);
          if (box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1) out.push(`${el.id || el.className || el.tagName} escapes header`);
          if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(`${el.id || el.className || el.tagName} clips content`);
          for (const node of el.childNodes) {
            if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
            const range = document.createRange(); range.selectNodeContents(node);
            const rects = [...range.getClientRects()];
            if (rects.length > 1) out.push(`${el.id || el.className || el.tagName} wraps text`);
            for (const rect of rects) if (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1) out.push(`${el.id || el.className || el.tagName} clips text`);
          }
        }
        const context = document.createElement('canvas').getContext('2d');
        context.font = getComputedStyle(select).font;
        const needed = context.measureText(select.selectedOptions[0].textContent).width + parseFloat(getComputedStyle(select).paddingLeft) + parseFloat(getComputedStyle(select).paddingRight);
        if (select.getBoundingClientRect().width + 1 < needed) out.push('domain label does not fit select');
        return out;
      })) fails.add(`[${W}] ${where}: ${f}`);
    };
    for (const domain of ['interfold','uniqueness']) { await p.evaluate(d => localStorage.setItem('auraMock_domain', d), domain); await p.reload(); await scanHeader(domain); }
    const scan = async (where) => { scans++; for (const f of await p.evaluate(() => {
      const out = [], boxed = e => { const s = getComputedStyle(e); return parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderBottomWidth) > 0 || ['hidden','clip'].includes(s.overflowY); };
      for (const el of document.querySelectorAll('#content *')) {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        if (getComputedStyle(el).position === 'fixed') continue;
        let a = el.parentElement; while (a && a.id !== 'content' && !boxed(a)) a = a.parentElement;
        if (!a || a.id === 'content') continue;
        const q = a.getBoundingClientRect();
        if (r.bottom > q.bottom + 1 || r.top < q.top - 1 || r.right > q.right + 1 || r.left < q.left - 1)
          out.push(`${(el.className||el.tagName).toString().slice(0,40)} "${el.textContent.trim().slice(0,24)}" spills out of ${(a.className||a.tagName).toString().slice(0,40)}`);
      }
      const inset=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-4'));
      for (const el of document.querySelectorAll('#content button, #content input, #content .flow-action-bar, #content .flow-secondary')) {
        const r=el.getBoundingClientRect(), style=getComputedStyle(el);
        if (!r.width || !r.height || style.visibility==='hidden' || style.display==='none') continue;
        let holder=el.parentElement?.closest('.card, .flow-shell, .app');
        while (holder?.matches('.card') && parseFloat(getComputedStyle(holder).paddingLeft)<inset) holder=holder.parentElement?.closest('.card, .flow-shell, .app');
        holder ||= document.querySelector('.app');
        const edge=holder.getBoundingClientRect().left;
        if (r.left < edge+inset-1) out.push(`${el.className||el.tagName} left ${Math.round(r.left-edge)}px from ${holder.className||holder.tagName}`);
        if (r.right > holder.getBoundingClientRect().right-inset+1) out.push(`${el.className||el.tagName} reaches right edge of ${holder.className||holder.tagName}`);
        const shell=el.closest('.flow-shell'), heading=shell?.querySelector('.flow-main h1');
        if (heading && el.matches('.flow-action-bar, .flow-secondary, .flow-action-bar .primary, .flow-secondary .nav') && Math.abs(r.left-heading.getBoundingClientRect().left)>1) out.push(`${el.className||el.tagName} misses heading left edge`);
      }
      // Authored headings, questions, and actions must keep every word visible.
      for (const el of document.querySelectorAll('#content h1, #content h2, #content .question-text, #content .compact-question .row-title, #content .vouch-question .row-title, #content .lego-chip-prompt, #content .lego-text-prompt, #content button, #content label, #content .nav')) {
        const style = getComputedStyle(el), box = el.getBoundingClientRect();
        if (!box.width || !box.height || style.visibility === 'hidden' || style.display === 'none') continue;
        if (style.textOverflow === 'ellipsis') out.push(`${el.tagName} "${el.textContent.trim().slice(0,35)}" uses ellipsis`);
        if ((['hidden','clip'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 1) ||
            (['hidden','clip'].includes(style.overflowY) && el.scrollHeight > el.clientHeight + 1))
          out.push(`${el.tagName} "${el.textContent.trim().slice(0,35)}" clips its label`);
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            let ancestor = el;
            while (ancestor && ancestor.id !== 'content') {
              const s = getComputedStyle(ancestor), a = ancestor.getBoundingClientRect();
              if ((['hidden','clip'].includes(s.overflowX) && (rect.left < a.left - 1 || rect.right > a.right + 1)) ||
                  (['hidden','clip'].includes(s.overflowY) && (rect.top < a.top - 1 || rect.bottom > a.bottom + 1)))
                out.push(`${el.tagName} "${node.textContent.trim().slice(0,35)}" clipped by ${ancestor.className || ancestor.tagName}`);
              ancestor = ancestor.parentElement;
            }
          }
        }
      }
 return out; })) fails.add(`[${W}] ${where}: ${f}`); };
    const scanOverlay = async (where) => {
      scans++;
      for (const f of await p.evaluate(() => {
        const out=[];
        for (const shell of document.querySelectorAll('#content .flow-shell')) {
          const overlays=[...shell.querySelectorAll(':scope > .flow-action-bar, :scope > .flow-secondary')].filter(el=>getComputedStyle(el).display!=='none');
          if (!overlays.length) continue;
          const walker=document.createTreeWalker(shell.querySelector('.flow-main'),NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node=walker.currentNode, parent=node.parentElement;
            if (!node.textContent.trim() || !parent || getComputedStyle(parent).visibility==='hidden' || getComputedStyle(parent).display==='none') continue;
            const range=document.createRange(); range.selectNodeContents(node);
            for (const textBox of range.getClientRects()) for (const overlay of overlays) {
              const controlBox=overlay.getBoundingClientRect();
              if (Math.min(textBox.right,controlBox.right)-Math.max(textBox.left,controlBox.left)>0.5 && Math.min(textBox.bottom,controlBox.bottom)-Math.max(textBox.top,controlBox.top)>0.5)
                out.push(`text "${node.textContent.trim().slice(0,35)}" intersects ${overlay.className}`);
            }
          }
        }
        return out;
      })) fails.add(`[${W}] ${where}: ${f}`);
    };
    const scanAccountText = async (where) => {
      scans++;
      for (const f of await p.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('#content *')) {
          if (![...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())) continue;
          const style = getComputedStyle(el), box = el.getBoundingClientRect();
          if (!box.width || !box.height || style.visibility === 'hidden' || style.display === 'none') continue;
          const clipped = ['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY);
          if (clipped && el.scrollWidth > el.clientWidth + 1)
            out.push(`${el.className || el.tagName} "${el.textContent.trim().slice(0, 35)}" clips text`);
          for (const node of el.childNodes) {
            if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
            const range = document.createRange(); range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              let ancestor = el;
              while (ancestor && ancestor.id !== 'content') {
                const s = getComputedStyle(ancestor);
                if (['hidden', 'clip'].includes(s.overflowX) || ['hidden', 'clip'].includes(s.overflowY)) {
                  const a = ancestor.getBoundingClientRect();
                  if (rect.left < a.left - 1 || rect.right > a.right + 1 || rect.top < a.top - 1 || rect.bottom > a.bottom + 1)
                    out.push(`${el.className || el.tagName} "${node.textContent.trim().slice(0, 35)}" clipped by ${ancestor.className || ancestor.tagName}`);
                }
                ancestor = ancestor.parentElement;
              }
            }
          }
        }
        return out;
      })) fails.add(`[${W}] ${where}: ${f}`);
    };
    for (const d of ['interfold','uniqueness']) for (const who of personasByDomain[d].filter(x => !process.env.ONLY || x === process.env.ONLY)) {
      await open(who,d,'sign-in-flow'); await scan(`${who} ${d} sign in`);
      await p.getByRole('button', { name: 'Sign in with your passkey' }).click(); await scan(`${who} ${d} passkey chooser`);
      await open(who,d,'account'); await scan('account ' + who + ' ' + d); await scanAccountText('account ' + who + ' ' + d);
      for (const v of ['home','requests','board']) { await open(who,d,v); await scan(`${who} ${d} ${v}`); }
      for (const v of ['home','requests','board','network','account','status','ask','invite','answer','past-answer','detail','endorse','identity-start','sign-in-flow','create-key','role-choice','together','send-link','find-player','node-choice','node-address','node-checking','node-guide','node-guide-link','shared-control','edit-disclosure','player-start','player-trainer','advanced-role','player-name-question','name-visibility','invite-detail','player-ask','setup-node','declare-node']) { await open(who,d,v); await scanOverlay(`${who} ${d} ${v}`); }
      await open(who,d,'requests');
      const targets = await p.locator('#content [data-view="answer"]').evaluateAll(els => els.map(e => e.dataset.detail));
      for (const t of targets.slice(0,3)) {
        await open(who,d,'requests'); await p.locator(`#content [data-view="answer"][data-detail="${t}"]`).first().click(); await scan(`${who} ${d} answer ${t}`); await scanOverlay(`${who} ${d} answer ${t}`);
        const yes = '#content .answer-slot[data-yes="true"]', n = await p.locator(yes).count();
        for (let i = 0; i < n; i++) { await p.locator(yes).nth(i).click(); await p.waitForTimeout(40); }
        await p.waitForTimeout(1700); if (process.env.DEBUG) console.log(who, d, t, await p.locator('#content button').allTextContents()); await scan(`${who} ${d} answer ${t} after done`); await scanOverlay(`${who} ${d} answer ${t} after done`);
      }
    }
    await ctx.close();
  }
  if (!scans) fails.add('checked nothing: no personas found');
  console.log(`${scans} screens checked`);
  console.log(fails.size ? `FAIL (${fails.size})\n- ` + [...fails].slice(0,40).join('\n- ') : 'PASS — nothing spills out of its box');
  await b.close(); process.exit(fails.size ? 1 : 0);
})();
