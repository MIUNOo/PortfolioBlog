(function(){
  // Smooth scroll for TOC links
  document.addEventListener('click', function(e){
    const a = e.target.closest('#slide-toc a[href^="#"]'); if(!a) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    const t = document.getElementById(id); if(!t) return;
    e.preventDefault(); window.history.pushState(null,'','#'+id);
    t.scrollIntoView({behavior:'smooth',block:'start'});
  }, {passive:false});

  const toc = document.querySelector('#slide-toc'); if(!toc) return;
  const links = Array.from(toc.querySelectorAll('a[href^="#"]'));
  const map = new Map();
  links.forEach(a=>{
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    const el = document.getElementById(id); if(el) map.set(el,a);
  });

  // Scrollspy: highlight current heading
  const spy = new IntersectionObserver(entries=>{
    entries.forEach(en=>{
      const a = map.get(en.target); if(!a) return;
      if(en.isIntersecting){ links.forEach(x=>x.classList.remove('active')); a.classList.add('active'); }
    });
  }, {rootMargin:'0px 0px -70% 0px', threshold:0.01});
  map.forEach((_,el)=>spy.observe(el));

  // Hover preview: first nearby paragraph/list/blockquote/code
  const tip = document.createElement('div'); tip.className='toc-tooltip'; document.body.appendChild(tip);
  function previewText(id){
    const h = document.getElementById(id); if(!h) return '';
    let n = h.nextElementSibling, s='';
    for(let i=0;i<6 && n;i++,n=n.nextElementSibling){
      if(n.matches('p,ul,ol,blockquote,pre')){ s = n.textContent.trim().replace(/\s+/g,' ').slice(0,240); break; }
    }
    return s;
  }
  toc.addEventListener('mousemove', e=>{
    const a = e.target.closest('a[href^="#"]');
    if(!a){ tip.style.display='none'; return; }
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    const txt = previewText(id); if(!txt){ tip.style.display='none'; return; }
    tip.textContent = txt; tip.style.display='block';
    const pad=14; tip.style.left=(e.clientX+pad)+'px'; tip.style.top=(e.clientY+pad)+'px';
  });
  toc.addEventListener('mouseleave', ()=> tip.style.display='none');
})();
