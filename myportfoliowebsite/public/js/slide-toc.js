(function(){
  const host = document.getElementById('ntoc');
  const list = document.getElementById('ntoc-list');
  if (!host || !list) return;

  // 1) Flatten Hugo TOC <nav> -> <ul>
  const nav = list.querySelector('nav#TableOfContents');
  if (nav) {
    const ul = nav.querySelector('ul');
    if (ul) { list.appendChild(ul); nav.remove(); }
  }

  // 2) Collect anchors (all levels) and map to headings in the document
  const allLinks = Array.from(list.querySelectorAll('a[href^="#"]'));
  if (!allLinks.length) { host.style.display = 'none'; return; }

  // Keep only headings we care about (H2 by default; add H3 if you like)
  const INCLUDE_LEVELS = new Set(['H2']);         // or new Set(['H2','H3'])
  const filtered = allLinks.filter(a => {
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    const el = document.getElementById(id);
    return el && INCLUDE_LEVELS.has((el.tagName || '').toUpperCase());
  });

  if (!filtered.length) { host.style.display = 'none'; return; }

  // 3) Smooth scroll
  host.addEventListener('click', e => {
    const a = e.target.closest('.ntoc-list a[href^="#"]'); if (!a) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    const t  = document.getElementById(id); if (!t) return;
    e.preventDefault(); window.history.pushState(null,'','#'+id);
    t.scrollIntoView({behavior:'smooth', block:'start'});
  }, { passive:false });

  // 4) Build a map of heading elements -> links (using filtered list)
  const map = new Map();
  filtered.forEach(a => {
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    const el = document.getElementById(id);
    if (el) map.set(el, a);
  });

  // 5) Ticks inside the boxed rail
  const railbox   = host.querySelector('.ntoc-railbox');
  const ticksWrap = host.querySelector('.ntoc-rail .ticks');
  const ticks     = [];

  // Optional: size host to content (compact height). Comment out if you don’t use it.
  const article =
    document.querySelector('main .content section.container.page > article') ||
    document.querySelector('article');
  const SAFE_TOP = 12, SAFE_BOTTOM = 64;

  function sizeHostToContent(){
    if (!article) return;
    const artRect      = article.getBoundingClientRect();
    const contentTop   = window.scrollY + artRect.top;
    const contentH     = Math.max(article.scrollHeight, article.offsetHeight, artRect.height);
    const maxViewportH = Math.max(80, window.innerHeight - SAFE_TOP - SAFE_BOTTOM);
    const railH        = Math.min(contentH, maxViewportH);
    const hostTop      = (contentH <= maxViewportH)
      ? Math.max(SAFE_TOP, Math.round(contentTop - window.scrollY))
      : SAFE_TOP;
    host.style.top    = hostTop + 'px';
    host.style.height = railH + 'px';
  }

  function placeTicks(){
    sizeHostToContent(); // optional

    ticksWrap.innerHTML = '';
    ticks.length = 0;

    const railRect      = railbox.getBoundingClientRect();
    const railH         = Math.max(1, railRect.height);

    // Build ordered list of (el, posPx) by content-relative position
    const items = [];
    map.forEach((a, el) => {
      const yAbs = el.getBoundingClientRect().top + window.scrollY;
      items.push({ el, yAbs });
    });
    items.sort((a,b)=> a.yAbs - b.yAbs);

    // Convert absolute Y to rail pixels
    // If you used sizeHostToContent(), align against article span:
    let baseTop = 0, span = 1;
    if (article) {
      const artRect      = article.getBoundingClientRect();
      const contentTop   = window.scrollY + artRect.top;
      const contentH     = Math.max(article.scrollHeight, article.offsetHeight, artRect.height);
      baseTop = contentTop;
      span    = Math.max(1, contentH);
    } else {
      baseTop = 0;
      span = Math.max(
        document.body.scrollHeight, document.documentElement.scrollHeight
      );
    }

    const MIN_GAP_PX = 14; // <- enforce spacing between ticks
    let lastYpx = -1e9;

    items.forEach(({el}) => {
      const yAbs  = el.getBoundingClientRect().top + window.scrollY;
      const ratio = Math.min(1, Math.max(0, (yAbs - baseTop) / span));
      const ypx   = Math.round(ratio * railH);

      if (ypx - lastYpx < MIN_GAP_PX) {
        // too close to previous tick → skip (keeps rail compact)
        return;
      }

      const tick = document.createElement('div');
      tick.className = 'tick';
      tick.style.top = ypx + 'px';
      ticksWrap.appendChild(tick);
      ticks.push(tick);
      lastYpx = ypx;
    });
  }

  placeTicks();
  window.addEventListener('resize', placeTicks, { passive:true });
  window.addEventListener('orientationchange', placeTicks, { passive:true });
  window.addEventListener('scroll', () => sizeHostToContent(), { passive:true });
  window.addEventListener('load', placeTicks);

  // 6) Scrollspy for filtered links only
  const linksArr = Array.from(filtered);
  const obs = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const a = map.get(en.target); if (!a) return;
      if (en.isIntersecting) {
        linksArr.forEach(x => x.classList.remove('active'));
        a.classList.add('active');
        const i = linksArr.indexOf(a);
        ticks.forEach(t => t.classList.remove('active'));
        if (i >= 0 && ticks[i]) ticks[i].classList.add('active');
      }
    });
  }, { rootMargin:'0px 0px -70% 0px', threshold: 0.01 });

  map.forEach((_, el) => obs.observe(el));
})();
