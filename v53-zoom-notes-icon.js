/* v53 zoom-out toggle + Draft Board i icon. Safe visual overlay only. */
(function(){
  const STORE='draft-war-room-compact-view-v53';
  const qs=s=>document.querySelector(s);
  const qsa=s=>Array.from(document.querySelectorAll(s));
  function normalizeBoardNoteIcons(){
    qsa('#board .tile-note-btn').forEach(btn=>{
      btn.textContent='i';
      btn.setAttribute('aria-label','View notes');
      btn.setAttribute('title','View notes');
      btn.classList.add('note-btn-v53');
    });
  }
  function applyCompact(on){
    document.body.classList.toggle('compact-view-v53',!!on);
    localStorage.setItem(STORE,on?'1':'0');
    const b=qs('#zoomToggleBtnV53');
    if(b){b.textContent=on?'Normal View':'Compact View';b.setAttribute('aria-pressed',on?'true':'false');b.title=on?'Return to normal spacing':'Zoom out to see more players'}
  }
  function installToggle(){
    if(qs('#zoomToggleBtnV53'))return;
    const row=qs('.top-actions .button-row')||qs('.button-row');
    if(!row)return;
    const btn=document.createElement('button');
    btn.id='zoomToggleBtnV53';btn.type='button';btn.className='zoom-toggle-v53';btn.onclick=()=>applyCompact(!document.body.classList.contains('compact-view-v53'));
    const print=qs('#printPdfBtn');
    if(print&&print.parentElement===row)print.insertAdjacentElement('afterend',btn);else row.appendChild(btn);
    applyCompact(localStorage.getItem(STORE)==='1');
  }
  function hookRender(){
    if(window.__v53_zoom_notes_hooked)return;window.__v53_zoom_notes_hooked=true;
    const oldRender=window.render;
    if(typeof oldRender==='function')window.render=function(){const out=oldRender.apply(this,arguments);setTimeout(normalizeBoardNoteIcons,0);return out};
    const oldRenderRankEditor=window.renderRankEditor;
    if(typeof oldRenderRankEditor==='function')window.renderRankEditor=function(){const out=oldRenderRankEditor.apply(this,arguments);setTimeout(normalizeBoardNoteIcons,0);return out};
  }
  function boot(){installToggle();hookRender();normalizeBoardNoteIcons();const board=qs('#board tbody');if(board)new MutationObserver(normalizeBoardNoteIcons).observe(board,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,700));else setTimeout(boot,700);
})();
