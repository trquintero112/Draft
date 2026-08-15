const STORE_KEY='fantasy-war-room-2026-v9';
const TABLE=window.SUPABASE_TABLE||'fantasy_players';
let state={players:[],activePos:'ALL'};
let sb=null, usingSupabase=false, saveTimer=null, realtimeChannel=null, currentRecommendation=null;
const $=s=>document.querySelector(s); const $$=s=>Array.from(document.querySelectorAll(s));
function uid(name){return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function configured(){return window.SUPABASE_URL && !window.SUPABASE_URL.includes('PASTE_') && window.SUPABASE_PUBLIC_KEY && !window.SUPABASE_PUBLIC_KEY.includes('PASTE_')}
async function init(){bind(); await connect(); render(); refreshBestRecommendation()}
async function connect(){
  if(configured() && window.supabase){sb=window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLIC_KEY); usingSupabase=true; await loadFromSupabase(); subscribeRealtime(); setStatus('Connected to Supabase. Edits sync for everyone.','ok')}
  else {usingSupabase=false; await loadLocalOrSeed(); setStatus('Supabase is not linked yet. Using local browser save only. Update config.js to sync for everyone.','warn')}
}
async function loadLocalOrSeed(){const saved=localStorage.getItem(STORE_KEY); if(saved){state=JSON.parse(saved)}else{const res=await fetch('data/seed-rankings.json'); const data=await res.json(); state.players=normalizeRows(data.players); state.activePos='ALL'; localSave()}}
async function loadSeedRows(){const res=await fetch('data/seed-rankings.json'); const data=await res.json(); return normalizeRows(data.players||[])}
async function loadFromSupabase(){const {data,error}=await sb.from(TABLE).select('*').order('custom_rank',{ascending:true}); if(error){setStatus('Supabase error: '+error.message,'bad'); await loadLocalOrSeed(); return} if(!data || data.length===0){await loadLocalOrSeed(); setStatus('Supabase connected, table empty. Select Seed Supabase to publish the starter board.','warn'); return} const saved=localStorage.getItem(STORE_KEY); const old=saved?JSON.parse(saved):{}; state.players=normalizeRows(data); state.activePos=old.activePos||'ALL'; await mergeSeedRows(true,false); localSave(false)}
function normalizeRows(rows){return rows.map(p=>({id:p.id||uid(p.name),name:p.name,team:p.team||'',pos:p.pos||'RB',custom_rank:Number(p.custom_rank??p.rank??999),tier:Number(p.tier??99),sources:p.sources||{},drafted:!!p.drafted,draftedBy:p.drafted_by??p.draftedBy??'',pick:p.pick??null,updated_at:p.updated_at||null}))}
function toDb(p){return {id:p.id||uid(p.name),name:p.name,team:p.team,pos:p.pos,custom_rank:Number(p.custom_rank),tier:Number(p.tier),sources:p.sources||{},notes:'',drafted:!!p.drafted,drafted_by:p.draftedBy||'',pick:p.pick||null,updated_at:new Date().toISOString()}}
function bind(){
  ['search','statusFilter','sortBy'].forEach(id=>{const el=$('#'+id); if(el) el.addEventListener('input',()=>{render(); refreshBestRecommendation()})});
  const on=(id,fn)=>{const el=$('#'+id); if(el) el.onclick=fn};
  on('bestBtn',refreshBestRecommendation); on('chooseRecommendedBtn',draftRecommended); on('resetDraftBtn',resetAllDraft);
  on('seedSupabaseBtn',seedSupabase); on('refreshSourcesBtn',refreshSourceRankings); on('exportCsvBtn',exportCsv); on('printPdfBtn',()=>window.print());
  const imp=$('#importAny'); if(imp) imp.onchange=e=>importAny(e.target.files[0]);
  on('cancelEdit',()=>$('#editDialog').close()); const form=$('#editForm'); if(form) form.addEventListener('submit',saveEdit)
}
function setStatus(msg,cls){const el=$('#syncStatus'); if(!el)return; el.textContent=msg; el.className='sync-status '+cls}
function localSave(stamp=true){localStorage.setItem(STORE_KEY,JSON.stringify(state)); if(stamp && $('#lastSaved')) $('#lastSaved').textContent='Saved '+new Date().toLocaleTimeString()}
async function persistPlayer(p){localSave(); if(!usingSupabase||!sb)return; clearTimeout(saveTimer); saveTimer=setTimeout(async()=>{const {error}=await sb.from(TABLE).upsert(toDb(p)); if(error)setStatus('Supabase save failed: '+error.message,'bad'); else setStatus('Saved to Supabase. Everyone will see this update.','ok')},150)}
async function persistMany(players){localSave(); if(!usingSupabase||!sb)return; const {error}=await sb.from(TABLE).upsert(players.map(toDb)); if(error)setStatus('Supabase bulk save failed: '+error.message,'bad'); else setStatus('Bulk save complete in Supabase.','ok')}
async function mergeSeedRows(addMissing=true,mergeSources=true){const seed=await loadSeedRows(); const byName=new Map(state.players.map(p=>[p.name.toLowerCase(),p])); seed.forEach(sp=>{let p=byName.get(sp.name.toLowerCase()); if(!p && addMissing){state.players.push(sp); byName.set(sp.name.toLowerCase(),sp)} else if(p && mergeSources){p.sources={...(p.sources||{}),...(sp.sources||{})}; if(!p.pos)p.pos=sp.pos; if(!p.team)p.team=sp.team}})}
async function seedSupabase(){if(!usingSupabase||!sb){alert('Add your Supabase URL and publishable/anon key in config.js first.'); return} await mergeSeedRows(true,true); await persistMany(state.players); await loadFromSupabase(); render(); refreshBestRecommendation()}
async function refreshSourceRankings(){await mergeSeedRows(true,true); await persistMany(state.players); render(); refreshBestRecommendation(); setStatus('Source rankings refreshed and missing seed players added.','ok')}
function subscribeRealtime(){if(!sb)return; if(realtimeChannel) sb.removeChannel(realtimeChannel); realtimeChannel=sb.channel('fantasy-board-changes').on('postgres_changes',{event:'*',schema:'public',table:TABLE},payload=>handleRealtime(payload)).subscribe()}
function handleRealtime(payload){const row=payload.new||payload.old; if(!row)return; const id=row.id; if(payload.eventType==='DELETE'){state.players=state.players.filter(p=>p.id!==id)}else{const np=normalizeRows([row])[0]; const ix=state.players.findIndex(p=>p.id===id); if(ix>-1)state.players[ix]=np; else state.players.push(np)} localSave(false); render(); refreshBestRecommendation(); setStatus('Live update received from Supabase.','ok')}
function myTeam(){return state.players.filter(p=>p.draftedBy==='Me')}
function teamCounts(){return myTeam().reduce((a,p)=>{a[p.pos]=(a[p.pos]||0)+1;return a},{QB:0,RB:0,WR:0,TE:0,K:0,DST:0})}
function currentPick(){return state.players.filter(p=>p.drafted).length+1}
function sourceAvg(p){const vals=Object.values(p.sources||{}).map(Number).filter(Boolean); return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:p.custom_rank}
function posRank(p){const same=state.players.filter(x=>x.pos===p.pos).sort((a,b)=>a.custom_rank-b.custom_rank); return p.pos+(same.findIndex(x=>x.id===p.id)+1)}
function availablePlayers(){return state.players.filter(p=>!p.drafted)}
function rosterNeedBonus(p){const c=teamCounts(), pick=currentPick(); let bonus=0, reason=[];
  if(p.pos==='QB'){ if(c.QB<1 && pick>55){bonus+=22; reason.push('QB starter still open')} else if(c.QB>=1){bonus-=28; reason.push('QB need already filled')} }
  if(p.pos==='RB'){ if(c.RB<2){bonus+=60; reason.push('need core RB starters')} else if(c.RB<4){bonus+=24; reason.push('RB depth/flex value')} }
  if(p.pos==='WR'){ if(c.WR<2){bonus+=52; reason.push('need core WR starters')} else if(c.WR<5){bonus+=20; reason.push('WR depth/flex value')} }
  if(p.pos==='TE'){ if(c.TE<1){bonus+=25; reason.push('TE starter still open')} else bonus-=18 }
  if(p.pos==='K'){ if(c.K<1 && pick>115){bonus+=35; reason.push('late draft K slot open')} else bonus-=95 }
  if(p.pos==='DST'){ if(c.DST<1 && pick>105){bonus+=35; reason.push('late draft DST slot open')} else bonus-=90 }
  return {bonus,reason}
}
function scarcityBonus(p){const avail=availablePlayers(); const sameTierPos=avail.filter(x=>x.pos===p.pos&&x.tier===p.tier).length; const samePos=avail.filter(x=>x.pos===p.pos).length; const tierCliff=sameTierPos<=2?28:sameTierPos<=4?18:sameTierPos<=7?9:0; const posCliff=samePos<=8?14:samePos<=14?7:0; const premium=(p.pos==='RB'||p.pos==='WR')?4:p.pos==='TE'?3:0; return {bonus:tierCliff+posCliff+premium,sameTierPos}}
function recommendationScore(p){const consensus=sourceAvg(p); const base=1000-(p.custom_rank*5); const consensusEdge=Math.max(-40,Math.min(40,(p.custom_rank-consensus)*2)); const tierBoost=Math.max(0,90-(p.tier*8)); return Math.round(base+consensusEdge+tierBoost+scarcityBonus(p).bonus+rosterNeedBonus(p).bonus)}
function bestAvailable(){return availablePlayers().sort((a,b)=>recommendationScore(b)-recommendationScore(a)||a.custom_rank-b.custom_rank)[0]||null}
function getFiltered(){const q=$('#search')?.value.trim().toLowerCase()||'', status=$('#statusFilter')?.value||'available'; let arr=[...state.players]; if(state.activePos!=='ALL')arr=arr.filter(p=>p.pos===state.activePos); if(q)arr=arr.filter(p=>(p.name+' '+p.team+' '+p.pos).toLowerCase().includes(q)); if(status==='available')arr=arr.filter(p=>!p.drafted); if(status==='mine')arr=arr.filter(p=>p.draftedBy==='Me'); if(status==='drafted')arr=arr.filter(p=>p.drafted); const sort=$('#sortBy')?.value||'custom_rank'; arr.sort((a,b)=>sort==='recommendation'?(recommendationScore(b)-recommendationScore(a)||a.custom_rank-b.custom_rank):sort==='tier'?(a.tier-b.tier||a.custom_rank-b.custom_rank):sort==='adp'?(sourceAvg(a)-sourceAvg(b)):sort==='pos'?(a.pos.localeCompare(b.pos)||a.custom_rank-b.custom_rank):a.custom_rank-b.custom_rank); return arr}
function render(){renderChips(); renderScarcity(); const tbody=$('#board tbody'); if(!tbody)return; tbody.innerHTML=''; for(const p of getFiltered()){const tr=document.createElement('tr'); tr.className=`tier-${Math.min(14,Math.max(1,p.tier))} ${p.drafted?'drafted-row':''}`; const consensus=sourceAvg(p); tr.innerHTML=`<td data-label="Custom Ranking"><input class="rank-input" type="number" min="1" value="${p.custom_rank}" data-field="custom_rank" data-id="${p.id}"></td><td data-label="Consensus"><strong>${fmt(consensus)}</strong></td><td data-label="Tier"><input class="tier-input" type="number" min="1" value="${p.tier}" data-field="tier" data-id="${p.id}"></td><td data-label="Player"><div class="player-name">${esc(p.name)}</div><div class="meta">${p.drafted?p.draftedBy==='Me'?'On my team':'Drafted by other':'Available'}</div></td><td data-label="Pos"><span class="pos ${p.pos}">${posRank(p)}</span></td><td data-label="Team">${esc(p.team)}</td><td data-label="Sources">${renderSources(p)}</td><td data-label="Score"><span class="score-pill">${recommendationScore(p)}</span></td><td data-label="Action"><div class="actions"><button class="mine" data-act="mine" data-id="${p.id}">Mine</button><button class="gone" data-act="gone" data-id="${p.id}">Gone</button><button class="edit" data-act="edit" data-id="${p.id}">Edit</button></div></td>`; tbody.appendChild(tr)} $$('.actions button').forEach(b=>b.onclick=()=>act(b.dataset.act,b.dataset.id)); $$('.rank-input,.tier-input').forEach(inp=>inp.onchange=()=>inlineUpdate(inp)); renderSidebars()}
function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function fmt(n){return Number.isInteger(n)?n:n.toFixed(1)}
function renderSources(p){const entries=Object.entries(p.sources||{}); return entries.map(([k,v])=>`<div><strong>${v}</strong> <span class="meta">${esc(k)}</span></div>`).join('')||'<span class="meta">No source loaded</span>'}
function renderChips(){const wrap=$('#positionChips'); if(!wrap)return; wrap.innerHTML=''; ['ALL','QB','RB','WR','TE','K','DST'].forEach(pos=>{const b=document.createElement('button'); b.className='chip '+(state.activePos===pos?'active':''); b.textContent=pos; b.onclick=()=>{state.activePos=pos; localSave(false); render(); refreshBestRecommendation()}; wrap.appendChild(b)})}
function renderScarcity(){const wrap=$('#scarcityGrid'), roster=$('#rosterBuild'), positions=['QB','RB','WR','TE','K','DST'], avail=availablePlayers(), c=teamCounts(); if(roster)roster.innerHTML=`<div class="roster-mode">Current roster</div><div class="roster-counts">QB ${c.QB||0} | RB ${c.RB||0} | WR ${c.WR||0} | TE ${c.TE||0} | K ${c.K||0} | DST ${c.DST||0}</div>`; if(!wrap)return; wrap.innerHTML=positions.map(pos=>{const list=avail.filter(p=>p.pos===pos); const tiers=[1,2,3,4,5,11,12,13].map(t=>`T${t}: ${list.filter(p=>p.tier===t).length}`).join(' | '); return `<div class="scarcity-tile"><div class="scarcity-pos ${pos}">${pos}</div><div class="scarcity-total">${list.length}</div><div class="scarcity-tiers">${tiers}</div></div>`}).join('')}
function renderSidebars(){const mine=myTeam().sort((a,b)=>(a.pick||999)-(b.pick||999)); $('#myTeam').innerHTML=mine.map(p=>`<li><strong>${esc(p.name)}</strong> <span class="meta">${p.pos} ${esc(p.team)}, Custom ${p.custom_rank}/Tier ${p.tier}</span></li>`).join('')||'<li class="meta">No picks yet</li>'; const drafted=state.players.filter(p=>p.drafted).sort((a,b)=>(a.pick||999)-(b.pick||999)); $('#liveDraftBoard').innerHTML=drafted.map(p=>`<li><span class="pick-num">${p.pick||''}</span> ${esc(p.name)} <span class="meta">${p.pos} ${esc(p.team)} - ${esc(p.draftedBy)}</span></li>`).join('')||'<li class="meta">No picks yet</li>'; $('#draftedLog').innerHTML=drafted.slice(-24).reverse().map(p=>`<li>${esc(p.name)} <span class="meta">${esc(p.draftedBy)}</span></li>`).join('')||'<li class="meta">No drafted players yet</li>'; $('#availableCount').textContent=availablePlayers().length; $('#myCount').textContent=mine.length; $('#draftedCount').textContent=drafted.length}
function inlineUpdate(inp){const p=state.players.find(x=>x.id===inp.dataset.id); if(!p)return; p[inp.dataset.field]=Number(inp.value); persistPlayer(p); render(); refreshBestRecommendation()}
function act(action,id){const p=state.players.find(x=>x.id===id); if(!p)return; if(action==='mine'){p.drafted=true;p.draftedBy='Me';p.pick=nextPick()} if(action==='gone'){p.drafted=true;p.draftedBy='Other';p.pick=nextPick()} if(action==='edit')return openEdit(p); persistPlayer(p); render(); refreshBestRecommendation()}
function nextPick(){return Math.max(0,...state.players.map(p=>p.pick||0))+1}
async function resetAllDraft(){const first=confirm('Reset the entire draft board back to the beginning? This clears drafted players and pick numbers.'); if(!first)return; const second=confirm('Final confirmation: this resets the draft for everyone using Supabase. Continue?'); if(!second)return; state.players.forEach(p=>{p.drafted=false;p.draftedBy='';p.pick=null}); await persistMany(state.players); if(usingSupabase&&sb){await loadFromSupabase()} render(); refreshBestRecommendation(); setStatus('Draft reset complete. All players are available again.','ok')}
function refreshBestRecommendation(){const p=bestAvailable(); currentRecommendation=p; const box=$('#recommendationBox'), btn=$('#chooseRecommendedBtn'); if(!box)return; if(!p){box.textContent='No available players left.'; if(btn)btn.hidden=true; return} const need=rosterNeedBonus(p), scarcity=scarcityBonus(p); const reasons=[...need.reason,`${scarcity.sameTierPos} ${p.pos}s remain in Tier ${p.tier}`].filter(Boolean); box.innerHTML=`<div class="recommendation-main">${esc(p.name)} <span class="pos ${p.pos}">${p.pos}</span></div><div class="recommendation-meta">${esc(p.team)} | Custom Ranking ${p.custom_rank} | Consensus ${fmt(sourceAvg(p))} | Tier ${p.tier} | Score ${recommendationScore(p)}</div><div class="recommendation-reason">Why: ${reasons.join('; ')||'best combined value by ranking, consensus, tier, and scarcity'}.</div>`; if(btn)btn.hidden=false}
function draftRecommended(){if(!currentRecommendation)currentRecommendation=bestAvailable(); if(!currentRecommendation){alert('No available players left.'); return} act('mine',currentRecommendation.id)}
function openEdit(p){$('#editId').value=p.id; $('#editName').value=p.name; $('#editTeam').value=p.team; $('#editPos').value=p.pos; $('#editRank').value=p.custom_rank; $('#editTier').value=p.tier; $('#editDialog').showModal()}
function saveEdit(e){e.preventDefault(); const p=state.players.find(x=>x.id===$('#editId').value); if(!p)return; Object.assign(p,{name:$('#editName').value,team:$('#editTeam').value,pos:$('#editPos').value,custom_rank:+$('#editRank').value,tier:+$('#editTier').value}); p.id=uid(p.name); persistPlayer(p); $('#editDialog').close(); render(); refreshBestRecommendation()}
function csvRows(){const rows=[['pick','drafted_by','name','team','pos','custom_rank','consensus_rank','tier','recommendation_score','sources']]; state.players.sort((a,b)=>a.custom_rank-b.custom_rank).forEach(p=>rows.push([p.pick||'',p.draftedBy||'',p.name,p.team,p.pos,p.custom_rank,fmt(sourceAvg(p)),p.tier,recommendationScore(p),JSON.stringify(p.sources||{})])); return rows}
function exportCsv(){const text=csvRows().map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n'); download(new Blob([text],{type:'text/csv'}),'fantasy-war-room-export.csv')}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}
function importAny(file){if(!file)return; const r=new FileReader(); r.onload=async()=>{const text=r.result.trim(); try{ if(file.name.toLowerCase().endsWith('.json')||text.startsWith('{')||text.startsWith('[')){const obj=JSON.parse(text); const incoming=Array.isArray(obj)?obj:(obj.players||[]); if(!incoming.length)throw new Error('No players found in JSON'); state.players=normalizeRows(incoming); } else {mergeCsv(text)} await persistMany(state.players); render(); refreshBestRecommendation(); setStatus('Import complete.','ok')}catch(err){alert('Import failed: '+err.message)} }; r.readAsText(file)}
function parseCsv(text){const rows=[];let row=[],cur='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&q&&n==='"'){cur+='"';i++}else if(c==='"'){q=!q}else if(c===','&&!q){row.push(cur);cur=''}else if((c==='\n'||c==='\r')&&!q){if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''}if(c==='\r'&&n==='\n')i++}else cur+=c}if(cur||row.length){row.push(cur);rows.push(row)}return rows}
function mergeCsv(text){const rows=parseCsv(text).filter(r=>r.length); const headers=rows.shift().map(h=>h.trim().toLowerCase()); const idx=h=>headers.indexOf(h); rows.forEach(r=>{const name=r[idx('name')]||r[idx('player')]||''; if(!name)return; const id=uid(name); let p=state.players.find(x=>x.id===id||x.name.toLowerCase()===name.toLowerCase()); if(!p){p={id,name,team:'',pos:'RB',custom_rank:999,tier:99,sources:{},drafted:false,draftedBy:'',pick:null}; state.players.push(p)} const source=r[idx('source')]||'Imported'; const rankVal=(idx('custom_rank')>-1?r[idx('custom_rank')]:r[idx('rank')]); if(rankVal){p.sources=p.sources||{}; p.sources[source]=+rankVal; p.custom_rank=+rankVal} if(idx('tier')>-1&&r[idx('tier')])p.tier=+r[idx('tier')]; if(idx('team')>-1&&r[idx('team')])p.team=r[idx('team')]; if(idx('pos')>-1&&r[idx('pos')])p.pos=r[idx('pos')];}); state.players.sort((a,b)=>a.custom_rank-b.custom_rank)}
init();

/* v18 drag/drop ranking editor */
const rankEditorState={activePos:'RB',dragId:null};
const RANK_EDITOR_POSITIONS=['QB','RB','WR','TE','K','DST'];
function setupRankEditor(){
  const topActions=document.querySelector('.top-actions');
  if(!topActions)return;
  if(!document.getElementById('rankEditorPanel')){
    const panel=document.createElement('section');
    panel.id='rankEditorPanel';
    panel.className='panel rank-editor-panel';
    panel.innerHTML=`<div class="rank-editor-header"><div><h2>Edit Custom Rankings</h2><div class="rank-editor-sub">Drag rows to reorder within each position. Tier is editable manually. Changes save back to Custom Ranking.</div></div><div class="rank-editor-actions"><button id="closeRankEditorBtn" class="danger">Close Editor</button></div></div><div id="rankTabs" class="rank-tabs"></div><div class="rank-editor-wrap"><table class="rank-editor-table"><thead><tr><th></th><th>Custom Rank</th><th>Player</th><th>Tier</th></tr></thead><tbody id="rankEditorBody"></tbody></table></div><div class="rank-editor-note">Position tabs keep the same custom-rank slots for that position and reorder the players within those slots. The All tab recalculates overall rank 1 through all players.</div>`;
    topActions.insertAdjacentElement('afterend',panel);
  }
  const editBtn=document.getElementById('editRanksBtn');
  if(editBtn) editBtn.addEventListener('click',openRankEditor);
  const closeBtn=document.getElementById('closeRankEditorBtn');
  if(closeBtn) closeBtn.addEventListener('click',closeRankEditor);
  renderRankTabs();
}
function openRankEditor(){
  const panel=document.getElementById('rankEditorPanel');
  if(!panel)return;
  panel.classList.add('active');
  renderRankEditor();
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function closeRankEditor(){
  const panel=document.getElementById('rankEditorPanel');
  if(panel) panel.classList.remove('active');
}
function renderRankTabs(){
  const wrap=document.getElementById('rankTabs');
  if(!wrap)return;
  const tabs=['ALL',...RANK_EDITOR_POSITIONS];
  wrap.innerHTML=tabs.map(pos=>`<button class="rank-tab ${rankEditorState.activePos===pos?'active':''}" data-rank-tab="${pos}">${pos}</button>`).join('');
  wrap.querySelectorAll('[data-rank-tab]').forEach(btn=>btn.addEventListener('click',()=>{rankEditorState.activePos=btn.dataset.rankTab;renderRankTabs();renderRankEditor();}));
}
function rankEditorPlayers(){
  const arr=[...state.players].filter(p=>rankEditorState.activePos==='ALL'||p.pos===rankEditorState.activePos);
  arr.sort((a,b)=>a.custom_rank-b.custom_rank||a.name.localeCompare(b.name));
  return arr;
}
function renderRankEditor(){
  const body=document.getElementById('rankEditorBody');
  if(!body)return;
  const rows=rankEditorPlayers();
  body.innerHTML=rows.map((p,i)=>`<tr draggable="true" data-rank-id="${p.id}"><td data-label="Move"><span class="drag-handle">☰</span></td><td data-label="Custom Rank"><input class="rank-editor-input" type="number" min="1" value="${p.custom_rank}" data-rank-field="custom_rank" data-rank-id="${p.id}" readonly></td><td data-label="Player"><div class="rank-editor-name">${esc(p.name)}</div><div class="rank-editor-meta">${p.pos} | ${esc(p.team||'')}</div></td><td data-label="Tier"><input class="rank-editor-tier" type="number" min="1" value="${p.tier}" data-rank-field="tier" data-rank-id="${p.id}"></td></tr>`).join('');
  body.querySelectorAll('tr[data-rank-id]').forEach(row=>{
    row.addEventListener('dragstart',rankDragStart);
    row.addEventListener('dragover',rankDragOver);
    row.addEventListener('dragleave',rankDragLeave);
    row.addEventListener('drop',rankDrop);
    row.addEventListener('dragend',rankDragEnd);
  });
  body.querySelectorAll('.rank-editor-tier').forEach(inp=>inp.addEventListener('change',rankTierChanged));
}
function rankDragStart(e){
  rankEditorState.dragId=this.dataset.rankId;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain',rankEditorState.dragId);
}
function rankDragOver(e){
  e.preventDefault();
  if(this.dataset.rankId!==rankEditorState.dragId)this.classList.add('drag-over');
}
function rankDragLeave(){this.classList.remove('drag-over')}
async function rankDrop(e){
  e.preventDefault();
  this.classList.remove('drag-over');
  const fromId=rankEditorState.dragId||e.dataTransfer.getData('text/plain');
  const toId=this.dataset.rankId;
  if(!fromId||!toId||fromId===toId)return;
  await reorderRankEditorPlayers(fromId,toId);
}
function rankDragEnd(){
  this.classList.remove('dragging');
  document.querySelectorAll('.rank-editor-table tr.drag-over').forEach(r=>r.classList.remove('drag-over'));
  rankEditorState.dragId=null;
}
async function reorderRankEditorPlayers(fromId,toId){
  const rows=rankEditorPlayers();
  const fromIndex=rows.findIndex(p=>p.id===fromId);
  const toIndex=rows.findIndex(p=>p.id===toId);
  if(fromIndex<0||toIndex<0)return;
  const [moved]=rows.splice(fromIndex,1);
  rows.splice(toIndex,0,moved);
  if(rankEditorState.activePos==='ALL'){
    rows.forEach((p,i)=>{p.custom_rank=i+1;});
  }else{
    const rankSlots=rows.map(p=>Number(p.custom_rank)).sort((a,b)=>a-b);
    rows.forEach((p,i)=>{p.custom_rank=rankSlots[i];});
  }
  await persistMany(state.players);
  render();
  renderRankEditor();
  refreshBestRecommendation();
  setStatus('Custom ranking order saved.','ok');
}
async function rankTierChanged(e){
  const p=state.players.find(x=>x.id===e.target.dataset.rankId);
  if(!p)return;
  p.tier=Number(e.target.value)||p.tier;
  await persistPlayer(p);
  render();
  renderRankEditor();
  refreshBestRecommendation();
  setStatus('Tier saved.','ok');
}
setupRankEditor();
