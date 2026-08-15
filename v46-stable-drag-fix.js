/* v46 stable Edit Rankings drag/drop overlay
   Load after app.js. Keeps the existing v45 site, only replaces Edit Rankings drag behavior. */
(function(){
  let dragGhost=null;
  let touchState={row:null,timer:null,startX:0,startY:0,active:false};

  function qs(s){return document.querySelector(s)}
  function qsa(s){return Array.from(document.querySelectorAll(s))}
  function isAdminSafe(){try{return typeof isAdmin==='function'?isAdmin():localStorage.getItem('fantasy-war-room-auth-mode-v37')==='admin'}catch(e){return false}}
  function shouldIgnore(el){return !!el.closest('input,select,textarea,button,.rank-tab,.rank-search-wrap,.rank-editor-actions-top') && !el.closest('.rank-drag')}
  function rowFor(id){return document.querySelector(`#rankEditorRows .rank-editor-row[data-rank-id="${CSS.escape(id||'')}"]`)}
  function safePushUndo(){try{if(typeof pushUndo==='function')pushUndo()}catch(e){}}
  async function safePersist(){try{if(typeof persistMany==='function')await persistMany(state.players,true)}catch(e){try{localStorage.setItem('fantasy-war-room-v43-state',JSON.stringify(state))}catch(_){}}}
  function safeRefresh(){try{render();renderRankEditor();refreshBestRecommendation()}catch(e){try{renderRankEditor()}catch(_){}}}
  function setMsg(m){try{if(typeof setStatus==='function')setStatus(m,'ok')}catch(e){}}

  function begin(row,x,y){
    if(dragGhost||!row)return;
    safePushUndo();
    if(typeof rankEditor==='object')rankEditor.dragId=row.dataset.rankId;
    row.classList.remove('press-arming');
    row.classList.add('rank-placeholder');
    document.body.classList.add('rank-dragging');
    const r=row.getBoundingClientRect();
    dragGhost=row.cloneNode(true);
    dragGhost.classList.add('rank-drag-ghost');
    dragGhost.style.width=r.width+'px';
    dragGhost.style.left=r.left+'px';
    dragGhost.style.top=r.top+'px';
    dragGhost.dataset.offsetX=x-r.left;
    dragGhost.dataset.offsetY=y-r.top;
    document.body.appendChild(dragGhost);
    moveGhost(x,y);
  }
  function moveGhost(x,y){
    if(!dragGhost)return;
    dragGhost.style.left=(x-Number(dragGhost.dataset.offsetX))+'px';
    dragGhost.style.top=(y-Number(dragGhost.dataset.offsetY))+'px';
  }
  function move(x,y){
    moveGhost(x,y);
    if(y<90)window.scrollBy(0,-18);
    if(y>window.innerHeight-90)window.scrollBy(0,18);
    const id=typeof rankEditor==='object'?rankEditor.dragId:'';
    const row=rowFor(id);
    if(!row)return;
    if(dragGhost)dragGhost.style.display='none';
    const target=document.elementFromPoint(x,y)?.closest?.('.rank-editor-row');
    if(dragGhost)dragGhost.style.display='';
    if(target&&target!==row&&target.parentNode===row.parentNode){
      const r=target.getBoundingClientRect();
      target.parentNode.insertBefore(row,y<r.top+r.height/2?target:target.nextSibling);
    }
  }
  async function finish(){
    const id=typeof rankEditor==='object'?rankEditor.dragId:'';
    const row=rowFor(id);
    if(dragGhost){dragGhost.remove();dragGhost=null;}
    if(row)row.classList.remove('rank-placeholder','press-arming');
    document.body.classList.remove('rank-dragging');
    await commitOrder();
    if(typeof rankEditor==='object')rankEditor.dragId=null;
  }
  async function commitOrder(){
    const ids=qsa('#rankEditorRows .rank-editor-row').map(r=>r.dataset.rankId);
    const rows=(typeof rankRows==='function'?rankRows():[]);
    const slots=rows.map(p=>p.custom_rank).sort((a,b)=>a-b);
    const active=(typeof rankEditor==='object'?rankEditor.active:'ALL');
    if(!window.state||!Array.isArray(state.players))return;
    if(active==='ALL'){
      ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=i+1;});
    }else{
      ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=slots[i];});
    }
    await safePersist();
    safeRefresh();
    setMsg('Custom ranking order saved.');
  }

  function pointerStart(e){
    if(('ontouchstart' in window))return;
    if(!isAdminSafe())return;
    if(e.button!==undefined&&e.button!==0)return;
    if(shouldIgnore(e.target))return;
    const row=e.currentTarget;
    e.preventDefault();
    begin(row,e.clientX,e.clientY);
    const mm=ev=>{ev.preventDefault();move(ev.clientX,ev.clientY)};
    const up=async()=>{document.removeEventListener('pointermove',mm);document.removeEventListener('pointerup',up);await finish()};
    document.addEventListener('pointermove',mm,{passive:false});
    document.addEventListener('pointerup',up,{once:true});
  }
  function touchStart(e){
    if(!isAdminSafe()||e.touches.length!==1)return;
    if(shouldIgnore(e.target))return;
    const row=e.currentTarget,t=e.touches[0];
    touchState={row,timer:null,startX:t.clientX,startY:t.clientY,active:false};
    row.classList.add('press-arming');
    touchState.timer=setTimeout(()=>{
      touchState.active=true;
      begin(row,t.clientX,t.clientY);
      if(navigator.vibrate)navigator.vibrate([18]);
    },220);
  }
  function touchMove(e){
    if(!touchState.row)return;
    const t=e.touches[0];
    const dx=Math.abs(t.clientX-touchState.startX),dy=Math.abs(t.clientY-touchState.startY);
    if(!touchState.active){
      if(dx>36||dy>36){clearTimeout(touchState.timer);touchState.row.classList.remove('press-arming');touchState={row:null,timer:null,startX:0,startY:0,active:false};}
      return;
    }
    e.preventDefault();
    move(t.clientX,t.clientY);
  }
  async function touchEnd(e){
    if(!touchState.row)return;
    clearTimeout(touchState.timer);
    touchState.row.classList.remove('press-arming');
    if(touchState.active){e.preventDefault();await finish();}
    touchState={row:null,timer:null,startX:0,startY:0,active:false};
  }
  function attach(){
    qsa('#rankEditorRows .rank-editor-row').forEach(row=>{
      if(row.dataset.v46DragAttached==='1')return;
      row.dataset.v46DragAttached='1';
      row.addEventListener('pointerdown',pointerStart,{capture:true});
      row.addEventListener('touchstart',touchStart,{passive:false,capture:true});
      row.addEventListener('touchmove',touchMove,{passive:false,capture:true});
      row.addEventListener('touchend',touchEnd,{passive:false,capture:true});
      row.addEventListener('touchcancel',touchEnd,{passive:false,capture:true});
    });
  }
  function hookRenderRankEditor(){
    if(window.__v46_drag_hooked)return;
    window.__v46_drag_hooked=true;
    const old=window.renderRankEditor;
    if(typeof old==='function'){
      window.renderRankEditor=function(){const out=old.apply(this,arguments);setTimeout(attach,0);return out};
    }
  }
  function boot(){hookRenderRankEditor();attach();const v=qs('#rankEditorView');if(v) new MutationObserver(()=>attach()).observe(v,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,500));else setTimeout(boot,500);
})();
