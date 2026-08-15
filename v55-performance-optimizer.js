/* v55 performance optimizer
   Safe overlay: does not change Supabase, draft actions, rank calculations, or data model. */
(function(){
  const FAST_KEY='draft-war-room-fast-mode-v55';
  const FILTER_IDS=['search','statusFilter','sortBy'];
  let renderQueued=false;
  let recQueued=false;
  let fastButtonInstalled=false;

  const qs=s=>document.querySelector(s);
  const qsa=s=>Array.from(document.querySelectorAll(s));

  function raf(fn){return window.requestAnimationFrame?requestAnimationFrame(fn):setTimeout(fn,0)}

  function applyFastMode(on){
    document.body.classList.toggle('fast-mode-v55',!!on);
    localStorage.setItem(FAST_KEY,on?'1':'0');
    const b=qs('#fastModeBtnV55');
    if(b){
      b.textContent=on?'Normal FX':'Fast Mode';
      b.setAttribute('aria-pressed',on?'true':'false');
      b.title=on?'Restore normal visual effects':'Reduce visual overhead for faster interactions';
    }
  }

  function installFastModeButton(){
    if(fastButtonInstalled||qs('#fastModeBtnV55'))return;
    const row=qs('.top-actions .button-row')||qs('.button-row');
    if(!row)return;
    const btn=document.createElement('button');
    btn.id='fastModeBtnV55';
    btn.type='button';
    btn.className='fast-mode-toggle-v55';
    btn.onclick=()=>applyFastMode(!document.body.classList.contains('fast-mode-v55'));
    const zoom=qs('#zoomToggleBtnV53');
    if(zoom&&zoom.parentElement===row)zoom.insertAdjacentElement('afterend',btn);
    else row.appendChild(btn);
    fastButtonInstalled=true;
    applyFastMode(localStorage.getItem(FAST_KEY)==='1');
  }

  function normalizeBoardNoteIconsThrottled(){
    if(window.__v55_note_pending)return;
    window.__v55_note_pending=true;
    raf(()=>{
      window.__v55_note_pending=false;
      qsa('#board .tile-note-btn').forEach(btn=>{
        if(btn.dataset.v55i==='1')return;
        btn.dataset.v55i='1';
        btn.textContent='i';
        btn.setAttribute('aria-label','View notes');
        btn.setAttribute('title','View notes');
        btn.classList.add('note-btn-v53');
      });
    });
  }

  function hookRenderCoalescing(){
    if(window.__v55_render_hooked)return;
    window.__v55_render_hooked=true;
    const originalRender=window.render;
    if(typeof originalRender==='function'){
      window.render=function(){
        if(renderQueued)return;
        renderQueued=true;
        raf(()=>{
          renderQueued=false;
          originalRender.apply(window,arguments);
          normalizeBoardNoteIconsThrottled();
        });
      };
    }
    const originalRec=window.refreshBestRecommendation;
    if(typeof originalRec==='function'){
      window.refreshBestRecommendation=function(){
        if(recQueued)return;
        recQueued=true;
        raf(()=>{recQueued=false;originalRec.apply(window,arguments);});
      };
    }
  }

  function installDebouncedFilters(){
    if(window.__v55_debounced_filters)return;
    window.__v55_debounced_filters=true;
    FILTER_IDS.forEach(id=>{
      const el=qs('#'+id);
      if(!el)return;
      let timer=null;
      const handler=e=>{
        if(e.__v55Synthetic)return;
        e.stopImmediatePropagation();
        clearTimeout(timer);
        timer=setTimeout(()=>{
          try{if(typeof window.render==='function')window.render();}catch(_){ }
          try{if(typeof window.refreshBestRecommendation==='function')window.refreshBestRecommendation();}catch(_){ }
        }, id==='search'?90:40);
      };
      el.addEventListener('input',handler,true);
      el.addEventListener('change',handler,true);
    });
  }

  function observeRowsForContentVisibility(){
    const tbody=qs('#board tbody');
    if(tbody&&!tbody.dataset.v55Observed){
      tbody.dataset.v55Observed='1';
      new MutationObserver(()=>normalizeBoardNoteIconsThrottled()).observe(tbody,{childList:true,subtree:true});
    }
    const rview=qs('#rankEditorView');
    if(rview&&!rview.dataset.v55Observed){
      rview.dataset.v55Observed='1';
      new MutationObserver(()=>normalizeBoardNoteIconsThrottled()).observe(rview,{childList:true,subtree:true});
    }
  }

  function boot(){
    hookRenderCoalescing();
    installDebouncedFilters();
    installFastModeButton();
    observeRowsForContentVisibility();
    normalizeBoardNoteIconsThrottled();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,850));
  else setTimeout(boot,850);
})();
