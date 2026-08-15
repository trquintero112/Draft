/* v50 safe Edit Rankings fix
   Important: this patch does not run during data load. It waits until the page is fully loaded and only activates when Edit Rankings is opened. */
(function(){
  let baseRenderRankEditor=null;
  let wired=false;
  let drag={row:null,ghost:null,id:null,offsetX:0,offsetY:0,timer:null,active:false,startX:0,startY:0};

  const qs=s=>document.querySelector(s);
  const qsa=s=>Array.from(document.querySelectorAll(s));
  const html=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const ready=()=>typeof window.render==='function'&&typeof window.rankRows==='function';
  const admin=()=>{try{return typeof window.isAdmin==='function'?window.isAdmin():localStorage.getItem('fantasy-war-room-auth-mode-v37')==='admin'}catch(e){return true}};
  const ignore=el=>!!el.closest('input,select,textarea,button,.rank-tab,.rank-search-wrap,.rank-editor-actions-top')&&!el.closest('.rank-drag');
  const setStatus=(m,c='ok')=>{try{if(typeof window.setStatus==='function')window.setStatus(m,c)}catch(e){}};
  const savePlayer=async p=>{try{if(typeof window.persistPlayer==='function')await window.persistPlayer(p);else if(typeof window.persistMany==='function')await window.persistMany([p])}catch(e){setStatus('Save failed: '+(e.message||e),'bad')}};
  const saveRows=async rows=>{try{if(typeof window.persistMany==='function')await window.persistMany(rows);else rows.forEach(p=>savePlayer(p))}catch(e){setStatus('Rank save failed: '+(e.message||e),'bad')}};
  const pushUndo=()=>{try{if(typeof window.pushUndo==='function')window.pushUndo()}catch(e){}};
  const star=p=>{try{if(typeof window.sleeperStarButtonV44==='function')return window.sleeperStarButtonV44(p,'rank-sleeper-star-v44')}catch(e){}return `<button class="sleep-add-btn sleeper-star-v44" data-sleep-id="${html(p.id)}" title="Sleeper pick" type="button">★</button>`};

  function getRows(){try{return window.rankRows()}catch(e){return[]}}
  function renderEditorSafe(){
    const wrap=qs('#rankEditorRows');
    if(!wrap||!ready())return;
    const header=qs('.rank-grid-head');
    if(header)header.innerHTML='<div>Rank</div><div>Player</div><div>Pos</div><div>Tier</div><div>Notes / Sleeper</div>';
    const rows=getRows();
    wrap.innerHTML=rows.map(p=>`<div class="rank-editor-row" data-rank-id="${html(p.id)}">
      <div class="rank-num"><span class="rank-drag" title="Drag to reorder">☰</span><span class="rank-number-v50">${html(p.custom_rank)}</span></div>
      <div class="rank-player-name">${html(p.name)}<div class="rank-mobile-sub-v50">${html(p.team||'')} · ${html(p.pos||'')}</div></div>
      <div class="rank-pos-cell-v50"><span class="pos ${html(p.pos||'')}">${html(p.pos||'')}</span></div>
      <div><input class="rank-tier-input" type="number" min="1" value="${html(p.tier)}" data-tier-id="${html(p.id)}"></div>
      <div class="rank-note-star-group-v50"><button class="note-btn" type="button" data-info-id="${html(p.id)}" title="View notes">📝</button>${star(p)}</div>
    </div>`).join('');
    attachEditorEvents();
  }
  function attachEditorEvents(){
    qsa('#rankEditorRows .rank-editor-row').forEach(row=>{
      row.addEventListener('pointerdown',pointerDown,{capture:true});
      row.addEventListener('touchstart',touchStart,{capture:true,passive:false});
      row.addEventListener('touchmove',touchMove,{capture:true,passive:false});
      row.addEventListener('touchend',touchEnd,{capture:true,passive:false});
      row.addEventListener('touchcancel',touchEnd,{capture:true,passive:false});
      row.addEventListener('contextmenu',e=>e.preventDefault());
    });
    qsa('.rank-tier-input').forEach(inp=>{
      inp.addEventListener('pointerdown',e=>e.stopPropagation());
      inp.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
      inp.onchange=async()=>{
        if(!admin())return;
        pushUndo();
        const p=getRows().find(x=>String(x.id)===String(inp.dataset.tierId));
        if(!p)return;
        p.tier=Number(inp.value)||p.tier;
        await savePlayer(p);
        try{window.render();window.refreshBestRecommendation&&window.refreshBestRecommendation()}catch(e){}
        renderEditorSafe();
      };
    });
    qsa('.note-btn').forEach(btn=>btn.onclick=e=>{e.stopPropagation();e.preventDefault();try{window.showPlayerInfo&&window.showPlayerInfo(btn.dataset.infoId)}catch(_){}});
    try{if(typeof window.attachSleeperStarHandlersV44==='function')window.attachSleeperStarHandlersV44()}catch(e){}
    qsa('.sleep-add-btn[data-sleep-id]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();e.preventDefault();try{window.toggleManualSleeper&&window.toggleManualSleeper(btn.dataset.sleepId)}catch(_){}});
  }
  function rowFor(id){return qs(`#rankEditorRows .rank-editor-row[data-rank-id="${CSS.escape(String(id||''))}"]`)}
  function begin(row,x,y){
    if(!row||drag.ghost)return;
    pushUndo();
    drag.row=row;drag.id=row.dataset.rankId;
    row.classList.add('rank-placeholder');
    document.body.classList.add('rank-dragging');
    const r=row.getBoundingClientRect();
    drag.offsetX=x-r.left;drag.offsetY=y-r.top;
    drag.ghost=row.cloneNode(true);
    drag.ghost.classList.add('rank-drag-ghost');
    drag.ghost.style.width=r.width+'px';
    document.body.appendChild(drag.ghost);
    moveGhost(x,y);
  }
  function moveGhost(x,y){if(drag.ghost){drag.ghost.style.left=(x-drag.offsetX)+'px';drag.ghost.style.top=(y-drag.offsetY)+'px'}}
  function move(x,y){
    moveGhost(x,y);
    if(y<90)window.scrollBy(0,-18);
    if(y>window.innerHeight-90)window.scrollBy(0,18);
    const row=rowFor(drag.id); if(!row)return;
    if(drag.ghost)drag.ghost.style.display='none';
    const target=document.elementFromPoint(x,y)?.closest?.('.rank-editor-row');
    if(drag.ghost)drag.ghost.style.display='';
    if(target&&target!==row&&target.parentNode===row.parentNode){
      const r=target.getBoundingClientRect();
      target.parentNode.insertBefore(row,y<r.top+r.height/2?target:target.nextSibling);
    }
  }
  async function finish(){
    const row=rowFor(drag.id);
    if(drag.ghost){drag.ghost.remove();drag.ghost=null;}
    if(row)row.classList.remove('rank-placeholder','press-arming');
    document.body.classList.remove('rank-dragging');
    await commitOrder();
    drag={row:null,ghost:null,id:null,offsetX:0,offsetY:0,timer:null,active:false,startX:0,startY:0};
  }
  async function commitOrder(){
    const ids=qsa('#rankEditorRows .rank-editor-row').map(r=>r.dataset.rankId);
    const rows=getRows();
    const slots=rows.map(p=>Number(p.custom_rank)).sort((a,b)=>a-b);
    const active=window.rankEditor?.active||'ALL';
    const byId=new Map(rows.map(p=>[String(p.id),p]));
    if(active==='ALL')ids.forEach((id,i)=>{const p=byId.get(String(id));if(p)p.custom_rank=i+1});
    else ids.forEach((id,i)=>{const p=byId.get(String(id));if(p)p.custom_rank=slots[i]});
    await saveRows(rows);
    try{window.render();window.refreshBestRecommendation&&window.refreshBestRecommendation()}catch(e){}
    renderEditorSafe();
    setStatus('Custom ranking order saved.');
  }
  function pointerDown(e){
    if(('ontouchstart' in window)||!admin()||ignore(e.target))return;
    if(e.button!==undefined&&e.button!==0)return;
    e.preventDefault();
    begin(e.currentTarget,e.clientX,e.clientY);
    const mm=ev=>{ev.preventDefault();move(ev.clientX,ev.clientY)};
    const up=async()=>{document.removeEventListener('pointermove',mm);document.removeEventListener('pointerup',up);await finish()};
    document.addEventListener('pointermove',mm,{passive:false});document.addEventListener('pointerup',up,{once:true});
  }
  function touchStart(e){
    if(!admin()||e.touches.length!==1||ignore(e.target))return;
    const t=e.touches[0];drag.row=e.currentTarget;drag.startX=t.clientX;drag.startY=t.clientY;drag.active=false;
    drag.row.classList.add('press-arming');
    drag.timer=setTimeout(()=>{drag.active=true;begin(drag.row,t.clientX,t.clientY);navigator.vibrate&&navigator.vibrate([18])},220);
  }
  function touchMove(e){
    if(!drag.row)return;
    const t=e.touches[0]; const dx=Math.abs(t.clientX-drag.startX),dy=Math.abs(t.clientY-drag.startY);
    if(!drag.active){if(dx>38||dy>38){clearTimeout(drag.timer);drag.row.classList.remove('press-arming');drag={row:null,ghost:null,id:null,offsetX:0,offsetY:0,timer:null,active:false,startX:0,startY:0};}return;}
    e.preventDefault();move(t.clientX,t.clientY);
  }
  async function touchEnd(e){
    if(!drag.row)return;
    clearTimeout(drag.timer);drag.row.classList.remove('press-arming');
    if(drag.active){e.preventDefault();await finish();}
    else drag={row:null,ghost:null,id:null,offsetX:0,offsetY:0,timer:null,active:false,startX:0,startY:0};
  }
  function install(){
    if(wired)return;
    if(!ready()){setTimeout(install,300);return;}
    wired=true;
    baseRenderRankEditor=window.renderRankEditor;
    window.renderRankEditor=function(){renderEditorSafe()};
    const oldOpen=window.openRankEditor;
    if(typeof oldOpen==='function')window.openRankEditor=function(){const out=oldOpen.apply(this,arguments);setTimeout(renderEditorSafe,0);return out};
    const btn=qs('#editRanksBtn'); if(btn)btn.addEventListener('click',()=>setTimeout(renderEditorSafe,250));
    const view=qs('#rankEditorView'); if(view)new MutationObserver(()=>{if(!view.hidden&&qs('#rankEditorRows'))attachEditorEvents()}).observe(view,{childList:true,subtree:true});
  }
  window.addEventListener('load',()=>setTimeout(install,500));
})();
