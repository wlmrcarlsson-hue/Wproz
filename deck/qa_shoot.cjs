(async () => {
const { chromium } = require('playwright');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport:{width:1400,height:900}, deviceScaleFactor: 1.2 })).newPage();
await p.goto('file:///home/user/Wproz/deck/qa.html');
await p.waitForTimeout(600);

// Quantitative checks the eye is bad at: text that spills past its own box,
// and anything sitting outside the slide or inside the 0.5" margin.
const findings = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('.slide').forEach(sl => {
    const n = sl.dataset.n;
    const sb = sl.getBoundingClientRect();
    const M = 0.5 * 96;
    sl.querySelectorAll('.tx').forEach(t => {
      const inner = [...t.children].reduce((a,c)=>a+c.getBoundingClientRect().height, 0);
      const boxH = t.getBoundingClientRect().height;
      if (inner > boxH + 3) out.push(`s${n} OVERFLOW-V ${Math.round(inner-boxH)}px "${t.textContent.trim().slice(0,42)}"`);
      const r = t.getBoundingClientRect();
      const wide = [...t.children].some(c => c.scrollWidth > c.clientWidth + 2);
      if (wide) out.push(`s${n} OVERFLOW-H "${t.textContent.trim().slice(0,42)}"`);
      if (r.left - sb.left < M - 1 || r.top - sb.top < M - 1 ||
          sb.right - r.right < M - 1 || sb.bottom - r.bottom < M - 1) {
        const m = Math.round(Math.min(r.left-sb.left, r.top-sb.top, sb.right-r.right, sb.bottom-r.bottom));
        out.push(`s${n} MARGIN ${m}px "${t.textContent.trim().slice(0,42)}"`);
      }
      if (r.right > sb.right + 1 || r.bottom > sb.bottom + 1 || r.left < sb.left - 1 || r.top < sb.top - 1)
        out.push(`s${n} OFFSLIDE "${t.textContent.trim().slice(0,42)}"`);
    });
  });
  return out;
});
console.log(findings.length ? findings.join('\n') : 'no geometry findings');

const slides = await p.$$('.slide');
for (let i=0;i<slides.length;i++) {
  await slides[i].screenshot({ path: `/home/user/Wproz/deck/qa-slide-${String(i+1).padStart(2,'0')}.png` });
}
console.log('shot', slides.length, 'slides');
await b.close();
})();
