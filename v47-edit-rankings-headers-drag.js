/* v47 Edit Rankings visual/header + drag/drop fix
   Load after app.js. Keeps v38/v45 layout, fixes Edit Rankings columns, and restores drag/drop using direct global state access. */
(function(){
  let dragGhost=null;
  let touchState={row:null,timer:null,startX:0,startY:0,active:false};

  function qs(s){return document.querySelector(s)}
  function qsa(s){return Array.from(document.querySelectorAll(s))}
  function isAdminSafe(){try{return typeof isAdmin==='function'?isAdmin():localStorage.getItem('fantasy-war-room-auth-mode-v37')==='admin'}catch(e){return false}}
  function safeEsc(v){try{return typeof esc==='function'?esc(v):String(v??'')}catch(e){return String(v??'')}}
  function shouldIgnore(el){return !!el.closest('input,select,textarea,button,.rank-tab,.rank-search-wrap,.rank-editor-actions-top') && !el.closest('.rank-drag')}
  function rowFor(id){return document.querySelector(`#rankEditorRows .rank-editor-row[data-rank-id="${CSS.escape(id||'')}"]`)}
  function getRows(){try{return typeof rankRows==='function'?rankRows():[]}catch(e){return []}}
  function setMsg(m){try{if(typeof setStatus==='function')setStatus(m,'ok')}catch(e){}}
  function safeRefresh(){try{render();renderRankEditor();refreshBestRecommendation()}catch(e){try{renderRankEditor()}catch(_){}}}
  function safePushUndo(){try{if(typeof pushUndo==='function')pushUndo()}catch(e){}}
  async function safePersist(){try{if(typeof persistMany==='function')await persistMany(state.players,true)}catch(e){try{localStorage.setItem('fantasy-war-room-v43-state',JSON.stringify(state))}catch(_){}}}
  function sleeperButton(p){
    try{if(typeof sleeperStarButtonV44==='function')return sleeperStarButtonV44(p,'rank-sleeper-star-v44')}catch(e){}
    return `<button class="sleep-add-btn sleeper-star-v44" type="button" data-sleep-id="${p.id}" title="Sleeper Pick">★</button>`;
  }
  function attachStarHandlers(){
    if(typeof attachSleeperStarHandlersV44==='function'){try{attachSleeperStarHandlersV44();return}catch(e){}}
    qsa('.sleep-add-btn[data-sleep-id]').forEach(b=>{b.onclick=e=>{e.preventDefault();e.stopPropagation();if(typeof toggleManualSleeper==='function')toggleManualSleeper(b.dataset.sleepId)}});
  }
  function updateHeader(){
    const h=qs('.rank-grid-head');
    if(!h)return;
    h.innerHTML='<div>Rank</div><div>Player</div><div>Pos</div><div>Tier</div><div>Notes / Sleeper</div>';
  }

  window.renderRankEditor=function(){
    const w=qs('#rankEditorRows'); if(!w)return;
    updateHeader();
    const rows=getRows();
    w.innerHTML=rows.map(p=>`<div class="rank-editor-row" data-rank-id="${p.id}">
      <div class="rank-num"><span class="rank-drag" title="Drag to reorder">☰</span><span class="rank-number-v47">${p.custom_rank}</span></div>
      <div class="rank-player-name">${safeEsc(p.name)}<div class="rank-mobile-sub-v47">${safeEsc(p.team||'')} · ${safeEsc(p.pos||'')}</div></div>
      <div class="rank-pos-cell-v47"><span class="pos ${p.pos}">${safeEsc(p.pos||'')}</span></div>
      <div><input class="rank-tier-input" type="number" min="1" value="${p.tier}" data-tier-id="${p.id}" aria-label="Edit tier for ${safeEsc(p.name)}"></div>
      <div class="rank-note-star-group-v47"><button class="note-btn" type="button" data-info-id="${p.id}" title="View notes">📝</button>${sleeperButton(p)}</div>
    </div>`).join('')||'<div class="rank-editor-empty">No players found.</div>';

    qsa('#rankEditorRows .rank-editor-row').forEach(row=>{
      row.addEventListener('pointerdown',pointerStart,{capture:true});
      row.addEventListener('touchstart',touchStart,{passive:false,capture:true});
      row.addEventListener('touchmove',touchMove,{passive:false,capture:true});
      row.addEventListener('touchend',touchEnd,{passive:false,capture:true});
      row.addEventListener('touchcancel',touchEnd,{passive:false,capture:true});
      row.addEventListener('contextmenu',e=>e.preventDefault());
    });
    qsa('.rank-tier-input').forEach(i=>{
      i.addEventListener('pointerdown',e=>e.stopPropagation());
      i.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
      i.onchange=async()=>{
        if(!isAdminSafe())return;
        safePushUndo();
        const p=state.players.find(x=>x.id===i.dataset.tierId);
        if(!p)return;
        p.tier=Number(i.value)||p.tier;
        try{if(typeof persistPlayer==='function')await persistPlayer(p);else await safePersist()}catch(e){await safePersist()}
        safeRefresh();
      };
    });
    qsa('.note-btn').forEach(b=>{b.onclick=e=>{e.preventDefault();e.stopPropagation();if(typeof showPlayerInfo==='function')showPlayerInfo(b.dataset.infoId)}});
    attachStarHandlers();
    const ub=qs('#undoRankChangeBtn'); if(ub)ub.disabled=!(typeof rankEditor==='object'&&rankEditor.undoStack&&rankEditor.undoStack.length);
  };

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
  function moveGhost(x,y){if(dragGhost){dragGhost.style.left=(x-Number(dragGhost.dataset.offsetX))+'px';dragGhost.style.top=(y-Number(dragGhost.dataset.offsetY))+'px'}}
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
    const rows=getRows();
    const slots=rows.map(p=>p.custom_rank).sort((a,b)=>a-b);
    const active=typeof rankEditor==='object'?rankEditor.active:'ALL';
    if(!state||!Array.isArray(state.players))return;
    if(active==='ALL')ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=i+1;});
    else ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=slots[i];});
    await safePersist();
    safeRefresh();
    setMsg('Custom ranking order saved.');
  }

  function pointerStart(e){
    if(('ontouchstart' in window))return;
    if(!isAdminSafe())return;
    if(e.button!==undefined&&e.button!==0)return;
    if(shouldIgnore(e.target))return;
    e.preventDefault();
    begin(e.currentTarget,e.clientX,e.clientY);
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
    },210);
  }
  function touchMove(e){
    if(!touchState.row)return;
    const t=e.touches[0];
    const dx=Math.abs(t.clientX-touchState.startX),dy=Math.abs(t.clientY-touchState.startY);
    if(!touchState.active){
      if(dx>38||dy>38){clearTimeout(touchState.timer);touchState.row.classList.remove('press-arming');touchState={row:null,timer:null,startX:0,startY:0,active:false};}
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
  function boot(){
    updateHeader();
    window.renderRankEditor();
    const v=qs('#rankEditorView');
    if(v) new MutationObserver(()=>{updateHeader();qsa('#rankEditorRows .rank-editor-row').forEach(row=>{if(!row.dataset.v47Observed){row.dataset.v47Observed='1';}})}).observe(v,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,650));else setTimeout(boot,650);
})();
