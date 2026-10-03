// Gallery contract and the same containment/text/spacing rules as the app checks,
// scoped to each specimen frame.
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.argv[2] || __dirname + '/../index.html';
const doc = fs.readFileSync(FILE,'utf8');
const expected = {
  Tokens:['done','waiting','problem','not started','player role','trainer role','manager role','operator role','type scale','space steps','radii'],
  ScreenShell:['flow with button and secondary','list-flow','flow with a notice','plain with the Seated footer','plain with no footer'],
  RoleChipRow:['1 chips at 375 px','2 chips at 375 px','3 chips at 375 px','4 chips at 375 px','5 chips at 375 px'], Stack:['dense','prompt'], Text:['body','prompt'], Surface:['plain','with eyebrow'],
  FlowAction:['bar with a ready primary','bar with a disabled primary','inline','choice group'],
  NavLink:['default','← Back'], InputField:['empty with placeholder','filled','error'],
  ChoiceChip:['idle','selected','long label'], ChipGroup:['none selected','first selected'],
  DenseRow:['rating row with Not rated yet','subtitle and StatusChip tail','tappable','long name','Mateo (you)','grid with three VoteCells'],
  StatusChip:['Seated','Verified','Answered','Rated in','Pending','Waiting','Sent','Disputed','Held back','Declined','Not started','+3'],
  VoteCell:['empty','1 Yes','2 Yes','1 No','Yes + No','5 Yes (+3)','4 Yes + 1 No'],
  AnswerControl:['unanswered','Yes pending, confidence 1','Yes pending, confidence 4','No pending, confidence 2','Yes committed','No committed','edited','skip pending','Skipped','Ignored','player unanswered','trainer No committed','vouch confidence 3','Numbers only','Numbers and words'],
  SendSlot:['ready Ask','ready Rate in','sending','sent',"Didn't send · Try again"], DoneState:['title only','title plus next action'], Disclosure:['closed','open']
};
(async () => {
  const browser = await chromium.launch({headless:true});
  const failures = new Set(); let scans = 0;
  for (const W of [400,786]) {
    const context = await browser.newContext({viewport:{width:W+48,height:900},colorScheme:'dark'});
    await context.route('http://mock.test/**', r => r.fulfill({body:doc,contentType:'text/html'}));
    const page = await context.newPage();
    page.on('pageerror', e => failures.add(`[${W}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') failures.add(`[${W}] console.error: ${m.text()}`); });
    await page.goto('http://mock.test/');
    const before = await page.evaluate(() => localStorage.getItem('auraMock_view'));
    await page.goto('http://mock.test/#gallery');
    for (const theme of ['dark','light']) {
      await page.locator(`[data-gallery-theme="${theme}"]`).click();
      const problems = await page.evaluate(({expected,W,theme}) => {
        const out = [];
        const sections = [...document.querySelectorAll('#content [data-lego]')];
        const send = document.querySelector('[data-lego="SendSlot"]');
        const sentBox = send?.querySelector('[data-state="sent"] .lego-send-slot')?.getBoundingClientRect();
        const failedBox = send?.querySelector('[data-state="Didn\'t send · Try again"] .lego-send-slot')?.getBoundingClientRect();
        const sentFrame = send?.querySelector('[data-state="sent"]')?.getBoundingClientRect();
        const failedFrame = send?.querySelector('[data-state="Didn\'t send · Try again"]')?.getBoundingClientRect();
        if (!sentBox || !failedBox || Math.abs(sentBox.height-failedBox.height)>.5 || Math.abs((sentBox.left-sentFrame.left)-(failedBox.left-failedFrame.left))>.5 || Math.abs((sentBox.top-sentFrame.top)-(failedBox.top-failedFrame.top))>.5) out.push('SendSlot failed differs from Sent height or position');
        const answerSection = document.querySelector('[data-lego="AnswerControl"]');
        for (const name of ['Numbers only','Numbers and words']) if (!answerSection?.querySelector(`[data-state="${name}"]`)) out.push(`missing ${name} confidence option`);
        if (!answerSection?.querySelector('[data-state="Numbers only"]')?.textContent.includes('confidence 3')) out.push('numeric confidence readout missing');
        if (!answerSection?.querySelector('[data-state="Numbers and words"]')?.textContent.includes('3 of 4 · High')) out.push('confidence words missing');
        if (sections.length !== 18) out.push(`sections: ${sections.length}`);
        if (sections.map(x => x.dataset.lego).join('|') !== Object.keys(expected).join('|')) out.push('section order');
        if (document.documentElement.dataset.theme !== theme) out.push('theme');
        if (/\bundefined\b|\bNaN\b/.test(document.querySelector('#content').textContent)) out.push('undefined or NaN text');
        if (!document.body.classList.contains('gallery-mode')) out.push('gallery mode');
        if (document.querySelector('[data-gallery-width]')) out.push('width toggle remains');
        const css = getComputedStyle(document.documentElement);
        const roles = ['player','trainer','manager','operator'].map(x => css.getPropertyValue('--role-' + x).trim());
        const status = ['--positive','--accent','--negative'].map(x => css.getPropertyValue(x).trim());
        if (roles.some(x => !x) || new Set(roles).size !== 4 || roles.some(x => status.includes(x))) out.push('role tokens missing or overlap status tokens');
        if (roles[3] !== css.getPropertyValue('--text').trim()) out.push('operator role must use --text');
        for (const [i,swatch] of [...document.querySelectorAll('[data-lego=Tokens] [data-state="space steps"] .gallery-token')].entries()) { const bar=swatch.lastElementChild, expectedWidth=[4,8,12,16,24,32,48,64][i]; if (!bar || Math.abs(bar.getBoundingClientRect().width-expectedWidth)>1 || !swatch.textContent.includes(`${expectedWidth}px`)) out.push(`space ${i+1}: width or label`); }
        if (getComputedStyle(document.querySelector('.app-head')).display !== 'none' || getComputedStyle(document.querySelector('.tabs')).display !== 'none' || getComputedStyle(document.querySelector('#practice-drawer')).display !== 'none') out.push('app chrome visible');
        const boxed = e => { const s=getComputedStyle(e); return parseFloat(s.borderTopWidth)>0 || parseFloat(s.borderBottomWidth)>0 || ['hidden','clip'].includes(s.overflowY); };
        const painted = el => { const s=getComputedStyle(el),r=el.getBoundingClientRect(); if(r.width<20||r.height<20||s.visibility==='hidden'||s.display==='none'||s.position==='fixed') return false; return ['Top','Right','Bottom','Left'].every(side=>parseFloat(s[`border${side}Width`])>0&&s[`border${side}Style`]!=='none')||(s.backgroundColor!=='rgba(0, 0, 0, 0)'&&s.backgroundColor!=='transparent'); };
        for (const sec of sections) {
          if (sec.id !== `lego-${sec.dataset.lego.toLowerCase()}`) out.push(`${sec.dataset.lego}: id`);
          const frames=[...sec.querySelectorAll('.gallery-frame')], names=frames.map(f=>f.dataset.state);
          if (names.join('|') !== expected[sec.dataset.lego].join('|')) out.push(`${sec.dataset.lego}: states ${names.join(', ')}`);
          for (const frame of frames) {
            const where=`${sec.dataset.lego}/${frame.dataset.state}`; const box=frame.getBoundingClientRect();
            for (const group of frame.querySelectorAll('.choice-group')) {
              const buttons=[...group.querySelectorAll('button')].filter(b=>getComputedStyle(b).display!=='none');
              if (buttons.length<2) out.push(`${where}: choice group has fewer than two buttons`);
              for (const button of buttons.slice(1)) {
                const first=buttons[0].getBoundingClientRect(), next=button.getBoundingClientRect();
                if (Math.abs(first.width-next.width)>1 || Math.abs(first.height-next.height)>1) out.push(`${where}: choice buttons differ in width or height`);
              }
            }
            if (sec.dataset.lego === 'RoleChipRow') {
              const chips=[...frame.querySelectorAll('.home-role-chip')];
              const lines=[...new Set(chips.map(x=>Math.round(x.getBoundingClientRect().top)))].map(y=>chips.filter(x=>Math.round(x.getBoundingClientRect().top)===y).length);
              if (!(lines.length===1 || lines.slice(0,-1).every(n=>n===2) && (lines.at(-1)===2 || chips.length%2===1 && lines.at(-1)===1))) out.push(`${where}: chip lines ${lines}`);
            }
            if (sec.dataset.lego === 'AnswerControl') {
              if (frame.dataset.state === 'player unanswered' && [...frame.querySelectorAll('.answer-slot')].map(x => x.getAttribute('aria-label')).join('|') !== 'Yes|No') out.push(`${where}: expected Yes and No`);
              for (const button of frame.querySelectorAll('.answer-slot')) {
                const strip = button.querySelector('.confidence-segments');
                const b = button.getBoundingClientRect(), r = strip.getBoundingClientRect();
                const slotStyle = getComputedStyle(button), overlay = getComputedStyle(button, '::after');
                if (!['hidden', 'clip'].includes(slotStyle.overflowX) || !['hidden', 'clip'].includes(slotStyle.overflowY)) out.push(`${where}: answer slot does not clip contents`);
                if (overlay.position !== 'absolute' || overlay.pointerEvents !== 'none' || overlay.content === 'none') out.push(`${where}: answer border overlay missing`);
                if (['top', 'right', 'bottom', 'left'].some(side => Math.abs(parseFloat(overlay[side])) > .5 || !(parseFloat(overlay[`border${side[0].toUpperCase()+side.slice(1)}Width`]) > 0))) out.push(`${where}: answer border overlay does not cover all four sides`);
                const ow = parseFloat(overlay.width) + parseFloat(overlay.borderLeftWidth) + parseFloat(overlay.borderRightWidth);
                const oh = parseFloat(overlay.height) + parseFloat(overlay.borderTopWidth) + parseFloat(overlay.borderBottomWidth);
                if (Math.abs(ow - button.clientWidth) > .5 || Math.abs(oh - button.clientHeight) > .5) out.push(`${where}: answer border overlay misses slot box`);
                if (overlay.borderTopColor !== slotStyle.borderTopColor) out.push(`${where}: answer border overlay has wrong state colour`);
                if (r.left < b.left - .5 || r.right > b.right + .5 || r.top < b.top - .5 || r.bottom > b.bottom + .5) out.push(`${where}: answer strip outside button border box`);
                if (strip.children.length !== 4) out.push(`${where}: expected four strip segments`);
              }
            }
            if (!box.width||!box.height) out.push(`${where}: empty frame`);
            if (Math.abs(box.width - (sec.dataset.lego === 'RoleChipRow' ? 375 : 400))>1) out.push(`${where}: width ${box.width}`);
            if (/\bundefined\b|\bNaN\b/.test(frame.textContent)) out.push(`${where}: undefined or NaN`);
            const inset=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-4'));
            for (const el of frame.querySelectorAll('button, input, .flow-action-bar, .flow-secondary')) {
              const r=el.getBoundingClientRect(), style=getComputedStyle(el);
              if (!r.width || !r.height || style.visibility==='hidden' || style.display==='none') continue;
              let holder=el.parentElement?.closest('.card, .flow-shell, .gallery-frame');
              while (holder?.matches('.card') && parseFloat(getComputedStyle(holder).paddingLeft)<inset) holder=holder.parentElement?.closest('.card, .flow-shell, .gallery-frame');
              holder ||= frame;
              const edge=holder.getBoundingClientRect().left;
              if (r.left < edge+inset-1) out.push(`${where}: ${el.className||el.tagName} left ${Math.round(r.left-edge)}px from ${holder.className||holder.tagName}`);
              if (r.right > holder.getBoundingClientRect().right-inset+1) out.push(`${where}: ${el.className||el.tagName} reaches right edge of ${holder.className||holder.tagName}`);
              const shell=el.closest('.flow-shell');
              const heading=shell?.querySelector('.flow-main h1');
              if (heading && el.matches('.flow-action-bar, .flow-secondary, .flow-action-bar .primary, .flow-secondary .nav') && Math.abs(r.left-heading.getBoundingClientRect().left)>1) out.push(`${where}: ${el.className||el.tagName} misses heading left edge`);
            }
            for (const el of frame.querySelectorAll('*')) {
              const r=el.getBoundingClientRect(), style=getComputedStyle(el);
              if (!r.width||!r.height||style.visibility==='hidden') continue;
              if (style.position==='fixed') { if (r.left<box.left-1||r.right>box.right+1||r.top<box.top-1||r.bottom>box.bottom+1) out.push(`${where}: fixed ${el.className||el.tagName} escapes frame`); continue; }
              let a=el.parentElement; while(a&&a!==frame&&!boxed(a)) a=a.parentElement;
              if(a&&a!==frame) { const q=a.getBoundingClientRect(); if(r.bottom>q.bottom+1||r.top<q.top-1||r.right>q.right+1||r.left<q.left-1) out.push(`${where}: ${(el.className||el.tagName).toString().slice(0,40)} spills out of ${(a.className||a.tagName).toString().slice(0,40)}`); }
              if (![...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())) continue;
              if (frame.dataset.expect==='ellipsis') continue;
              const clipped=['hidden','clip'].includes(style.overflowX)||['hidden','clip'].includes(style.overflowY);
              if(clipped&&el.scrollWidth>el.clientWidth+1) out.push(`${where}: ${el.className||el.tagName} clips text`);
              for(const node of el.childNodes) { if(node.nodeType!==Node.TEXT_NODE||!node.textContent.trim()) continue; const range=document.createRange();range.selectNodeContents(node);for(const rect of range.getClientRects()) {let ancestor=el;while(ancestor&&ancestor!==frame){const s=getComputedStyle(ancestor);if(['hidden','clip'].includes(s.overflowX)||['hidden','clip'].includes(s.overflowY)){const a=ancestor.getBoundingClientRect();if(rect.left<a.left-1||rect.right>a.right+1||rect.top<a.top-1||rect.bottom>a.bottom+1)out.push(`${where}: ${el.className||el.tagName} text clipped by ${ancestor.className||ancestor.tagName}`);}ancestor=ancestor.parentElement;}}}
            }
            for(const parent of frame.querySelectorAll('*')) { const children=[...parent.children].filter(painted);for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++){const a=children[i],c=children[j],x=a.getBoundingClientRect(),y=c.getBoundingClientRect(),horizontal=Math.min(x.right,y.right)-Math.max(x.left,y.left),vertical=Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top),gap=horizontal>1?Math.max(y.top-x.bottom,x.top-y.bottom):vertical>1?Math.max(y.left-x.right,x.left-y.right):Infinity;if(gap<7.5 && ![a,c].some(el=>el.matches(".undo-badge,.send-undo")))out.push(`${where}: ${a.className||a.tagName} and ${c.className||c.tagName}: ${gap.toFixed(1)}px`);}}
          }
        }
        return out;
      },{expected,W,theme});
      problems.forEach(x=>failures.add(`[${W}/${theme}] ${x}`)); scans++;
    }
    await page.evaluate(() => { location.hash=''; });
    await page.waitForFunction(() => !document.body.classList.contains('gallery-mode'));
    const after=await page.evaluate(() => localStorage.getItem('auraMock_view'));
    if(after!==before)failures.add(`[${W}] auraMock_view changed: ${before} -> ${after}`);
    await context.close();
  }
  await browser.close();
  console.log(`${scans} gallery combinations checked`);
  console.log(failures.size ? `FAIL (${failures.size})\n- `+[...failures].slice(0,60).join('\n- ') : 'PASS — gallery states, containment, spacing, and isolation');
  process.exit(failures.size?1:0);
})().catch(e => {console.error(e);process.exit(1)});
