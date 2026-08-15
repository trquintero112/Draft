const STORE_KEY='fantasy-war-room-2026-v21';
const TABLE=window.SUPABASE_TABLE||'fantasy_players';
let state={players:[],activePos:'ALL'};
let sb=null, usingSupabase=false, saveTimer=null, realtimeChannel=null, currentRecommendation=null;
const POSITIONS=['QB','RB','WR','TE','K','DST'];
const $=s=>document.querySelector(s); const $$=s=>Array.from(document.querySelectorAll(s));
const rankEditor={active:'ALL',undoStack:[],pressTimer:null,dragging:false,dragId:null,startX:0,startY:0};
function uid(name){return String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function configured(){return window.SUPABASE_URL && !window.SUPABASE_URL.includes('PASTE_') && window.SUPABASE_PUBLIC_KEY && !window.SUPABASE_PUBLIC_KEY.includes('PASTE_')}
async function init(){bind(); await connect(); render(); setupRankEditor(); refreshBestRecommendation()}
async function connect(){
  if(configured()&&window.supabase){sb=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLIC_KEY);usingSupabase=true;await loadFromSupabase();subscribeRealtime();setStatus('Connected to Supabase. Edits sync for everyone.','ok')}
  else{usingSupabase=false;await loadLocalOrSeed();setStatus('Supabase is not linked yet. Using local browser save only. Update config.js to sync for everyone.','warn')}
}
async function loadLocalOrSeed(){const saved=localStorage.getItem(STORE_KEY);if(saved){state=JSON.parse(saved)}else{const res=await fetch('data/seed-rankings.json');const data=await res.json();state.players=normalizeRows(data.players);state.activePos='ALL';localSave()}}
async function loadSeedRows(){const res=await fetch('data/seed-rankings.json');const data=await res.json();return normalizeRows(data.players||[])}
async function loadFromSupabase(){const {data,error}=await sb.from(TABLE).select('*').order('custom_rank',{ascending:true});if(error){setStatus('Supabase error: '+error.message,'bad');await loadLocalOrSeed();return}if(!data||!data.length){await loadLocalOrSeed();setStatus('Supabase connected, table empty. Select Seed Supabase to publish the starter board.','warn');return}const saved=localStorage.getItem(STORE_KEY);const old=saved?JSON.parse(saved):{};state.players=normalizeRows(data);state.activePos=old.activePos||'ALL';await mergeSeedRows(true,false);localSave(false)}
function normalizeRows(rows){return rows.map(p=>({id:p.id||uid(p.name),name:p.name,team:p.team||'',pos:p.pos||'RB',custom_rank:Number(p.custom_rank??p.rank??999),tier:Number(p.tier??99),sources:p.sources||{},drafted:!!p.drafted,draftedBy:p.drafted_by??p.draftedBy??'',pick:p.pick??null,updated_at:p.updated_at||null}))}
function toDb(p){return{id:p.id||uid(p.name),name:p.name,team:p.team,pos:p.pos,custom_rank:Number(p.custom_rank),tier:Number(p.tier),sources:p.sources||{},notes:'',drafted:!!p.drafted,drafted_by:p.draftedBy||'',pick:p.pick||null,updated_at:new Date().toISOString()}}
function bind(){
 ['search','statusFilter','sortBy'].forEach(id=>{const el=$('#'+id); if(el) el.addEventListener('input',()=>{render();refreshBestRecommendation()})});
 const on=(id,fn)=>{const el=$('#'+id); if(el) el.onclick=fn};
 on('bestBtn',refreshBestRecommendation);on('chooseRecommendedBtn',draftRecommended);on('resetDraftBtn',resetAllDraft);on('seedSupabaseBtn',seedSupabase);on('refreshSourcesBtn',refreshSourceRankings);on('exportCsvBtn',exportCsv);on('printPdfBtn',()=>window.print());on('editRanksBtn',openRankEditor);on('backToDraftBtn',closeRankEditor);on('undoRankChangeBtn',undoRankChange);
 const imp=$('#importAny');if(imp)imp.onchange=e=>importAny(e.target.files[0]);
 on('cancelEdit',()=>$('#editDialog').close());const form=$('#editForm');if(form)form.addEventListener('submit',saveEdit);
}
function setStatus(msg,cls){const el=$('#syncStatus');if(!el)return;el.textContent=msg;el.className='sync-status '+cls}
function localSave(stamp=true){localStorage.setItem(STORE_KEY,JSON.stringify(state));if(stamp&&$('#lastSaved'))$('#lastSaved').textContent='Saved '+new Date().toLocaleTimeString()}
async function persistPlayer(p){localSave();if(!usingSupabase||!sb)return;clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{const {error}=await sb.from(TABLE).upsert(toDb(p));if(error)setStatus('Supabase save failed: '+error.message,'bad');else setStatus('Saved to Supabase. Everyone will see this update.','ok')},120)}
async function persistMany(players){localSave();if(!usingSupabase||!sb)return;const {error}=await sb.from(TABLE).upsert(players.map(toDb));if(error)setStatus('Supabase bulk save failed: '+error.message,'bad');else setStatus('Bulk save complete in Supabase.','ok')}
async function mergeSeedRows(addMissing=true,mergeSources=true){const seed=await loadSeedRows();const byName=new Map(state.players.map(p=>[p.name.toLowerCase(),p]));seed.forEach(sp=>{let p=byName.get(sp.name.toLowerCase());if(!p&&addMissing){state.players.push(sp);byName.set(sp.name.toLowerCase(),sp)}else if(p&&mergeSources){p.sources={...(p.sources||{}),...(sp.sources||{})};if(!p.pos)p.pos=sp.pos;if(!p.team)p.team=sp.team}})}
async function seedSupabase(){if(!usingSupabase||!sb){alert('Add your Supabase URL and publishable/anon key in config.js first.');return}await mergeSeedRows(true,true);await persistMany(state.players);await loadFromSupabase();render();refreshBestRecommendation()}
async function refreshSourceRankings(){await mergeSeedRows(true,true);await persistMany(state.players);render();refreshBestRecommendation();setStatus('Source rankings refreshed and missing seed players added.','ok')}
function subscribeRealtime(){if(!sb)return;if(realtimeChannel)sb.removeChannel(realtimeChannel);realtimeChannel=sb.channel('fantasy-board-changes').on('postgres_changes',{event:'*',schema:'public',table:TABLE},payload=>handleRealtime(payload)).subscribe()}
function handleRealtime(payload){const row=payload.new||payload.old;if(!row)return;const id=row.id;if(payload.eventType==='DELETE')state.players=state.players.filter(p=>p.id!==id);else{const np=normalizeRows([row])[0];const ix=state.players.findIndex(p=>p.id===id);if(ix>-1)state.players[ix]=np;else state.players.push(np)}localSave(false);render();if(!$('#rankEditorView')?.hidden)renderRankEditor();refreshBestRecommendation();setStatus('Live update received from Supabase.','ok')}
function myTeam(){return state.players.filter(p=>p.draftedBy==='Me')}
function teamCounts(){return myTeam().reduce((a,p)=>{a[p.pos]=(a[p.pos]||0)+1;return a},{QB:0,RB:0,WR:0,TE:0,K:0,DST:0})}
function currentPick(){return state.players.filter(p=>p.drafted).length+1}
function sourceAvg(p){const vals=Object.values(p.sources||{}).map(Number).filter(Boolean);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:p.custom_rank}
function posRank(p){const same=state.players.filter(x=>x.pos===p.pos).sort((a,b)=>a.custom_rank-b.custom_rank);return p.pos+(same.findIndex(x=>x.id===p.id)+1)}
function availablePlayers(){return state.players.filter(p=>!p.drafted)}
function rosterNeedBonus(p){const c=teamCounts(),pick=currentPick();let bonus=0,reason=[];if(p.pos==='QB'){if(c.QB<1&&pick>55){bonus+=22;reason.push('QB starter still open')}else if(c.QB>=1){bonus-=28;reason.push('QB need already filled')}}if(p.pos==='RB'){if(c.RB<2){bonus+=60;reason.push('need core RB starters')}else if(c.RB<4){bonus+=24;reason.push('RB depth/flex value')}}if(p.pos==='WR'){if(c.WR<2){bonus+=52;reason.push('need core WR starters')}else if(c.WR<5){bonus+=20;reason.push('WR depth/flex value')}}if(p.pos==='TE'){if(c.TE<1){bonus+=25;reason.push('TE starter still open')}else bonus-=18}if(p.pos==='K'){if(c.K<1&&pick>115){bonus+=35;reason.push('late draft K slot open')}else bonus-=95}if(p.pos==='DST'){if(c.DST<1&&pick>105){bonus+=35;reason.push('late draft DST slot open')}else bonus-=90}return{bonus,reason}}
function scarcityBonus(p){const avail=availablePlayers();const sameTierPos=avail.filter(x=>x.pos===p.pos&&x.tier===p.tier).length;const samePos=avail.filter(x=>x.pos===p.pos).length;const tierCliff=sameTierPos<=2?28:sameTierPos<=4?18:sameTierPos<=7?9:0;const posCliff=samePos<=8?14:samePos<=14?7:0;const premium=(p.pos==='RB'||p.pos==='WR')?4:p.pos==='TE'?3:0;return{bonus:tierCliff+posCliff+premium,sameTierPos}}
function recommendationScore(p){const consensus=sourceAvg(p);const base=1000-(p.custom_rank*5);const consensusEdge=Math.max(-40,Math.min(40,(p.custom_rank-consensus)*2));const tierBoost=Math.max(0,90-(p.tier*8));return Math.round(base+consensusEdge+tierBoost+scarcityBonus(p).bonus+rosterNeedBonus(p).bonus)}
function bestAvailable(){return availablePlayers().sort((a,b)=>recommendationScore(b)-recommendationScore(a)||a.custom_rank-b.custom_rank)[0]||null}
function getFiltered(){const q=$('#search')?.value.trim().toLowerCase()||'',status=$('#statusFilter')?.value||'available';let arr=[...state.players];if(state.activePos!=='ALL')arr=arr.filter(p=>p.pos===state.activePos);if(q)arr=arr.filter(p=>(p.name+' '+p.team+' '+p.pos).toLowerCase().includes(q));if(status==='available')arr=arr.filter(p=>!p.drafted);if(status==='mine')arr=arr.filter(p=>p.draftedBy==='Me');if(status==='drafted')arr=arr.filter(p=>p.drafted);const sort=$('#sortBy')?.value||'custom_rank';arr.sort((a,b)=>sort==='recommendation'?(recommendationScore(b)-recommendationScore(a)||a.custom_rank-b.custom_rank):sort==='tier'?(a.tier-b.tier||a.custom_rank-b.custom_rank):sort==='adp'?(sourceAvg(a)-sourceAvg(b)):sort==='pos'?(a.pos.localeCompare(b.pos)||a.custom_rank-b.custom_rank):a.custom_rank-b.custom_rank);return arr}
function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function fmt(n){return Number.isInteger(n)?n:n.toFixed(1)}
function render(){renderChips();renderScarcity();const tbody=$('#board tbody');if(!tbody)return;tbody.innerHTML='';for(const p of getFiltered()){const cons=sourceAvg(p);const tr=document.createElement('tr');tr.className=`tier-${Math.min(14,Math.max(1,p.tier))} ${p.drafted?'drafted-row':''}`;tr.innerHTML=`<td data-label="Player"><div class="compact-player-line"><span class="player-name">${esc(p.name)}</span><span class="pos ${p.pos}">${posRank(p)}</span><span class="compact-team">${esc(p.team)}</span></div><div class="meta">${p.drafted?p.draftedBy==='Me'?'On my team':'Drafted by other':'Available'}</div><div class="mobile-metrics"><div class="metric-pill"><span>Rank</span><strong>${p.custom_rank}</strong></div><div class="metric-pill"><span>Tier</span><strong>${p.tier}</strong></div><div class="metric-pill"><span>Cons</span><strong>${fmt(cons)}</strong></div><div class="metric-pill"><span>Score</span><strong>${recommendationScore(p)}</strong></div></div></td><td data-label="Custom Ranking"><input class="rank-input" type="number" min="1" value="${p.custom_rank}" data-field="custom_rank" data-id="${p.id}"></td><td data-label="Tier"><input class="tier-input" type="number" min="1" value="${p.tier}" data-field="tier" data-id="${p.id}"></td><td data-label="Consensus"><strong>${fmt(cons)}</strong></td><td data-label="Score"><span class="score-pill">${recommendationScore(p)}</span></td><td data-label="Action"><div class="actions"><button class="mine" data-act="mine" data-id="${p.id}">Mine</button><button class="gone" data-act="gone" data-id="${p.id}">Gone</button><button class="edit" data-act="edit" data-id="${p.id}">Edit</button></div></td>`;tbody.appendChild(tr)}$$('.actions button').forEach(b=>b.onclick=()=>act(b.dataset.act,b.dataset.id));$$('.rank-input,.tier-input').forEach(inp=>inp.onchange=()=>inlineUpdate(inp));renderSidebars()}
function renderChips(){const wrap=$('#positionChips');if(!wrap)return;wrap.innerHTML='';['ALL',...POSITIONS].forEach(pos=>{const b=document.createElement('button');b.className='chip '+(state.activePos===pos?'active':'');b.textContent=pos;b.onclick=()=>{state.activePos=pos;localSave(false);render();refreshBestRecommendation()};wrap.appendChild(b)})}
function renderScarcity(){const wrap=$('#scarcityGrid'),roster=$('#rosterBuild'),avail=availablePlayers(),c=teamCounts();if(roster)roster.innerHTML=`<div class="roster-mode">Current roster</div><div class="roster-counts">QB ${c.QB||0} | RB ${c.RB||0} | WR ${c.WR||0} | TE ${c.TE||0} | K ${c.K||0} | DST ${c.DST||0}</div>`;if(!wrap)return;wrap.innerHTML=POSITIONS.map(pos=>{const list=avail.filter(p=>p.pos===pos);const tiers=[1,2,3,4,5,11,12,13].map(t=>`T${t}: ${list.filter(p=>p.tier===t).length}`).join(' | ');return`<div class="scarcity-tile"><div class="scarcity-pos ${pos}">${pos}</div><div class="scarcity-total">${list.length}</div><div class="scarcity-tiers">${tiers}</div></div>`}).join('')}
function renderSidebars(){const mine=myTeam().sort((a,b)=>(a.pick||999)-(b.pick||999));$('#myTeam').innerHTML=mine.map(p=>`<li><strong>${esc(p.name)}</strong> <span class="meta">${p.pos} ${esc(p.team)}, Custom ${p.custom_rank}/Tier ${p.tier}</span></li>`).join('')||'<li class="meta">No picks yet</li>';const drafted=state.players.filter(p=>p.drafted).sort((a,b)=>(a.pick||999)-(b.pick||999));$('#liveDraftBoard').innerHTML=drafted.map(p=>`<li><span class="pick-num">${p.pick||''}</span> ${esc(p.name)} <span class="meta">${p.pos} ${esc(p.team)} - ${esc(p.draftedBy)}</span></li>`).join('')||'<li class="meta">No picks yet</li>';$('#draftedLog').innerHTML=drafted.slice(-24).reverse().map(p=>`<li>${esc(p.name)} <span class="meta">${esc(p.draftedBy)}</span></li>`).join('')||'<li class="meta">No drafted players yet</li>';$('#availableCount').textContent=availablePlayers().length;$('#myCount').textContent=mine.length;$('#draftedCount').textContent=drafted.length}
function inlineUpdate(inp){const p=state.players.find(x=>x.id===inp.dataset.id);if(!p)return;p[inp.dataset.field]=Number(inp.value);persistPlayer(p);render();refreshBestRecommendation()}
function act(action,id){const p=state.players.find(x=>x.id===id);if(!p)return;if(action==='mine'){p.drafted=true;p.draftedBy='Me';p.pick=nextPick()}if(action==='gone'){p.drafted=true;p.draftedBy='Other';p.pick=nextPick()}if(action==='edit')return openEdit(p);persistPlayer(p);render();refreshBestRecommendation()}
function nextPick(){return Math.max(0,...state.players.map(p=>p.pick||0))+1}
async function resetAllDraft(){const first=confirm('Reset the entire draft board back to the beginning? This clears drafted players and pick numbers.');if(!first)return;const second=confirm('Final confirmation: this resets the draft for everyone using Supabase. Continue?');if(!second)return;state.players.forEach(p=>{p.drafted=false;p.draftedBy='';p.pick=null});await persistMany(state.players);if(usingSupabase&&sb)await loadFromSupabase();render();refreshBestRecommendation();setStatus('Draft reset complete. All players are available again.','ok')}
function refreshBestRecommendation(){const p=bestAvailable();currentRecommendation=p;const box=$('#recommendationBox'),btn=$('#chooseRecommendedBtn');if(!box)return;if(!p){box.textContent='No available players left.';if(btn)btn.hidden=true;return}const need=rosterNeedBonus(p),scarcity=scarcityBonus(p);const reasons=[...need.reason,`${scarcity.sameTierPos} ${p.pos}s remain in Tier ${p.tier}`].filter(Boolean);box.innerHTML=`<div class="recommendation-main">${esc(p.name)} <span class="pos ${p.pos}">${p.pos}</span></div><div class="recommendation-meta">${esc(p.team)} | Custom Ranking ${p.custom_rank} | Consensus ${fmt(sourceAvg(p))} | Tier ${p.tier} | Score ${recommendationScore(p)}</div><div class="recommendation-reason">Why: ${reasons.join('; ')||'best combined value by ranking, consensus, tier, and scarcity'}.</div>`;if(btn)btn.hidden=false}
function draftRecommended(){if(!currentRecommendation)currentRecommendation=bestAvailable();if(!currentRecommendation){alert('No available players left.');return}act('mine',currentRecommendation.id)}
function openEdit(p){$('#editId').value=p.id;$('#editName').value=p.name;$('#editTeam').value=p.team;$('#editPos').value=p.pos;$('#editRank').value=p.custom_rank;$('#editTier').value=p.tier;$('#editDialog').showModal()}
function saveEdit(e){e.preventDefault();const p=state.players.find(x=>x.id===$('#editId').value);if(!p)return;Object.assign(p,{name:$('#editName').value,team:$('#editTeam').value,pos:$('#editPos').value,custom_rank:+$('#editRank').value,tier:+$('#editTier').value});p.id=uid(p.name);persistPlayer(p);$('#editDialog').close();render();refreshBestRecommendation()}
function csvRows(){const rows=[['pick','drafted_by','name','team','pos','custom_rank','consensus_rank','tier','recommendation_score','sources']];state.players.sort((a,b)=>a.custom_rank-b.custom_rank).forEach(p=>rows.push([p.pick||'',p.draftedBy||'',p.name,p.team,p.pos,p.custom_rank,fmt(sourceAvg(p)),p.tier,recommendationScore(p),JSON.stringify(p.sources||{})]));return rows}
function exportCsv(){const text=csvRows().map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');download(new Blob([text],{type:'text/csv'}),'fantasy-war-room-export.csv')}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}
function importAny(file){if(!file)return;const r=new FileReader();r.onload=async()=>{const text=r.result.trim();try{if(file.name.toLowerCase().endsWith('.json')||text.startsWith('{')||text.startsWith('[')){const obj=JSON.parse(text);const incoming=Array.isArray(obj)?obj:(obj.players||[]);if(!incoming.length)throw new Error('No players found in JSON');state.players=normalizeRows(incoming)}else mergeCsv(text);await persistMany(state.players);render();refreshBestRecommendation();setStatus('Import complete.','ok')}catch(err){alert('Import failed: '+err.message)}};r.readAsText(file)}
function parseCsv(text){const rows=[];let row=[],cur='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&q&&n==='"'){cur+='"';i++}else if(c==='"')q=!q;else if(c===','&&!q){row.push(cur);cur=''}else if((c==='\n'||c==='\r')&&!q){if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''}if(c==='\r'&&n==='\n')i++}else cur+=c}if(cur||row.length){row.push(cur);rows.push(row)}return rows}
function mergeCsv(text){const rows=parseCsv(text).filter(r=>r.length);const headers=rows.shift().map(h=>h.trim().toLowerCase());const idx=h=>headers.indexOf(h);rows.forEach(r=>{const name=r[idx('name')]||r[idx('player')]||'';if(!name)return;const id=uid(name);let p=state.players.find(x=>x.id===id||x.name.toLowerCase()===name.toLowerCase());if(!p){p={id,name,team:'',pos:'RB',custom_rank:999,tier:99,sources:{},drafted:false,draftedBy:'',pick:null};state.players.push(p)}const source=r[idx('source')]||'Imported';const rankVal=(idx('custom_rank')>-1?r[idx('custom_rank')]:r[idx('rank')]);if(rankVal){p.sources=p.sources||{};p.sources[source]=+rankVal;p.custom_rank=+rankVal}if(idx('tier')>-1&&r[idx('tier')])p.tier=+r[idx('tier')];if(idx('team')>-1&&r[idx('team')])p.team=r[idx('team')];if(idx('pos')>-1&&r[idx('pos')])p.pos=r[idx('pos')]});state.players.sort((a,b)=>a.custom_rank-b.custom_rank)}
// Ranking editor with long-press live reordering
function setupRankEditor(){renderRankTabs();updateUndoButton()}
function openRankEditor(){document.body.classList.add('edit-rank-mode');const v=$('#rankEditorView');if(v){v.hidden=false;renderRankTabs();renderRankEditor();v.scrollIntoView({behavior:'smooth',block:'start'})}}
function closeRankEditor(){document.body.classList.remove('edit-rank-mode');const v=$('#rankEditorView');if(v)v.hidden=true;render();refreshBestRecommendation()}
function rankRows(){return[...state.players].filter(p=>rankEditor.active==='ALL'||p.pos===rankEditor.active).sort((a,b)=>a.custom_rank-b.custom_rank||a.name.localeCompare(b.name))}
function renderRankTabs(){const tabs=$('#rankEditorTabs');if(!tabs)return;tabs.innerHTML=['ALL',...POSITIONS].map(pos=>`<button class="rank-tab ${rankEditor.active===pos?'active':''}" data-pos="${pos}">${pos}</button>`).join('');tabs.querySelectorAll('[data-pos]').forEach(b=>b.onclick=()=>{rankEditor.active=b.dataset.pos;renderRankTabs();renderRankEditor()})}
function renderRankEditor(){const wrap=$('#rankEditorRows');if(!wrap)return;const rows=rankRows();wrap.innerHTML=rows.map(p=>`<div class="rank-editor-row" data-rank-id="${p.id}"><div class="rank-num"><span class="rank-drag" aria-label="Drag handle">☰</span><span>${p.custom_rank}</span></div><div class="rank-player-name">${esc(p.name)}</div><div class="rank-team">${esc(p.team||'')}</div><div><input class="rank-tier-input" type="number" min="1" value="${p.tier}" data-tier-id="${p.id}"></div></div>`).join('')||'<div class="rank-editor-empty">No players found for this tab.</div>';wrap.querySelectorAll('.rank-drag').forEach(h=>h.addEventListener('pointerdown',startLongPressDrag));wrap.querySelectorAll('.rank-tier-input').forEach(i=>i.onchange=rankTierChange);updateUndoButton()}
function snapshotRanks(){return state.players.map(p=>({id:p.id,custom_rank:p.custom_rank,tier:p.tier}))}
function pushUndo(){rankEditor.undoStack.push(snapshotRanks());if(rankEditor.undoStack.length>20)rankEditor.undoStack.shift();updateUndoButton()}
function updateUndoButton(){const b=$('#undoRankChangeBtn');if(b){b.disabled=!rankEditor.undoStack.length;b.textContent=rankEditor.undoStack.length?'Undo Last Change':'Undo Last Change'}}
async function undoRankChange(){const snap=rankEditor.undoStack.pop();if(!snap)return;const map=new Map(snap.map(x=>[x.id,x]));state.players.forEach(p=>{const old=map.get(p.id);if(old){p.custom_rank=old.custom_rank;p.tier=old.tier}});await persistMany(state.players);render();renderRankEditor();refreshBestRecommendation();setStatus('Last ranking edit undone.','ok');updateUndoButton()}
function startLongPressDrag(e){if(e.button!==undefined&&e.button!==0)return;const row=e.currentTarget.closest('.rank-editor-row');if(!row)return;e.preventDefault();rankEditor.startX=e.clientX;rankEditor.startY=e.clientY;clearTimeout(rankEditor.pressTimer);rankEditor.pressTimer=setTimeout(()=>activateDrag(row,e.pointerId),360);const cancel=ev=>{if(Math.abs(ev.clientX-rankEditor.startX)>8||Math.abs(ev.clientY-rankEditor.startY)>8){clearTimeout(rankEditor.pressTimer);cleanup()}};const up=()=>{clearTimeout(rankEditor.pressTimer);cleanup()};const cleanup=()=>{document.removeEventListener('pointermove',cancel);document.removeEventListener('pointerup',up)};document.addEventListener('pointermove',cancel,{passive:true});document.addEventListener('pointerup',up,{once:true})}
function activateDrag(row,pointerId){rankEditor.dragging=true;rankEditor.dragId=row.dataset.rankId;pushUndo();row.classList.add('dragging');document.body.classList.add('rank-dragging');row.setPointerCapture?.(pointerId);const move=ev=>{ev.preventDefault();const el=document.elementFromPoint(ev.clientX,ev.clientY);const target=el?.closest?.('.rank-editor-row');if(target&&target!==row){const rect=target.getBoundingClientRect();const before=ev.clientY<rect.top+rect.height/2;target.parentNode.insertBefore(row,before?target:target.nextSibling)}};const up=async ev=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);row.classList.remove('dragging');document.body.classList.remove('rank-dragging');rankEditor.dragging=false;await commitLiveOrder()};document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up,{once:true})}
async function commitLiveOrder(){const ids=$$('#rankEditorRows .rank-editor-row').map(r=>r.dataset.rankId);const visible=rankRows();const slots=visible.map(p=>p.custom_rank).sort((a,b)=>a-b);if(rankEditor.active==='ALL'){ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=i+1})}else{ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=slots[i]})}await persistMany(state.players);render();renderRankEditor();refreshBestRecommendation();setStatus('Custom ranking order saved.','ok')}
async function rankTierChange(e){const p=state.players.find(x=>x.id===e.target.dataset.tierId);if(!p)return;pushUndo();p.tier=Number(e.target.value)||p.tier;await persistPlayer(p);render();renderRankEditor();refreshBestRecommendation();setStatus('Tier saved.','ok')}
init();

/* v22 final override: long-press sortable with ghost tile, live placeholder line, reliable undo */
let rankDragGhostV22=null;
function setupRankEditor(){
  renderRankTabs();
  const undoBtn=document.getElementById('undoRankChangeBtn');
  if(undoBtn) undoBtn.onclick=undoRankChange;
  updateUndoButton();
}
function renderRankEditor(){
  const wrap=$('#rankEditorRows');
  if(!wrap)return;
  const rows=rankRows();
  wrap.innerHTML=rows.map(p=>`<div class="rank-editor-row" data-rank-id="${p.id}"><div class="rank-num"><span class="rank-drag" aria-label="Drag handle">☰</span><span>${p.custom_rank}</span></div><div class="rank-player-name">${esc(p.name)}</div><div class="rank-team">${esc(p.team||'')}</div><div><input class="rank-tier-input" type="number" min="1" value="${p.tier}" data-tier-id="${p.id}"></div></div>`).join('')||'<div class="rank-editor-empty">No players found for this tab.</div>';
  wrap.querySelectorAll('.rank-drag').forEach(h=>h.addEventListener('pointerdown',startLongPressDrag));
  wrap.querySelectorAll('.rank-tier-input').forEach(i=>i.onchange=rankTierChange);
  updateUndoButton();
}
function updateUndoButton(){
  const b=$('#undoRankChangeBtn');
  if(!b)return;
  b.disabled=!rankEditor.undoStack.length;
  b.classList.toggle('is-disabled',!rankEditor.undoStack.length);
}
async function undoRankChange(){
  const snap=rankEditor.undoStack.pop();
  if(!snap){updateUndoButton();return;}
  const map=new Map(snap.map(x=>[x.id,x]));
  state.players.forEach(p=>{const old=map.get(p.id); if(old){p.custom_rank=old.custom_rank; p.tier=old.tier;}});
  await persistMany(state.players);
  render();
  renderRankEditor();
  refreshBestRecommendation();
  setStatus('Last ranking edit undone.','ok');
  updateUndoButton();
}
function startLongPressDrag(e){
  if(e.button!==undefined&&e.button!==0)return;
  const handle=e.currentTarget;
  const row=handle.closest('.rank-editor-row');
  if(!row)return;
  e.preventDefault();
  rankEditor.startX=e.clientX;
  rankEditor.startY=e.clientY;
  clearTimeout(rankEditor.pressTimer);
  rankEditor.pressTimer=setTimeout(()=>activateDrag(row,e.pointerId,e.clientX,e.clientY),420);
  const cancel=ev=>{
    if(Math.abs(ev.clientX-rankEditor.startX)>8||Math.abs(ev.clientY-rankEditor.startY)>8){
      clearTimeout(rankEditor.pressTimer);
      cleanup();
    }
  };
  const up=()=>{clearTimeout(rankEditor.pressTimer);cleanup();};
  const cleanup=()=>{document.removeEventListener('pointermove',cancel);document.removeEventListener('pointerup',up);};
  document.addEventListener('pointermove',cancel,{passive:true});
  document.addEventListener('pointerup',up,{once:true});
}
function makeDragGhost(row,x,y){
  const rect=row.getBoundingClientRect();
  const ghost=row.cloneNode(true);
  ghost.classList.add('rank-drag-ghost');
  ghost.style.width=rect.width+'px';
  ghost.style.left=rect.left+'px';
  ghost.style.top=rect.top+'px';
  ghost.dataset.offsetX=x-rect.left;
  ghost.dataset.offsetY=y-rect.top;
  document.body.appendChild(ghost);
  return ghost;
}
function moveDragGhost(x,y){
  if(!rankDragGhostV22)return;
  const ox=Number(rankDragGhostV22.dataset.offsetX||0), oy=Number(rankDragGhostV22.dataset.offsetY||0);
  rankDragGhostV22.style.left=(x-ox)+'px';
  rankDragGhostV22.style.top=(y-oy)+'px';
}
function cleanupDragGhost(){
  if(rankDragGhostV22){rankDragGhostV22.remove();rankDragGhostV22=null;}
}
function activateDrag(row,pointerId,x,y){
  if(rankEditor.dragging)return;
  rankEditor.dragging=true;
  rankEditor.dragId=row.dataset.rankId;
  pushUndo();
  row.classList.add('rank-placeholder','drop-line');
  document.body.classList.add('rank-dragging');
  rankDragGhostV22=makeDragGhost(row,x,y);
  moveDragGhost(x,y);
  row.setPointerCapture?.(pointerId);
  const move=ev=>{
    ev.preventDefault();
    moveDragGhost(ev.clientX,ev.clientY);
    if(ev.clientY<90) window.scrollBy(0,-14);
    if(ev.clientY>window.innerHeight-90) window.scrollBy(0,14);
    const ghost=rankDragGhostV22;
    if(ghost) ghost.style.display='none';
    const el=document.elementFromPoint(ev.clientX,ev.clientY);
    if(ghost) ghost.style.display='';
    const target=el?.closest?.('.rank-editor-row');
    if(target&&target!==row&&target.parentNode===row.parentNode){
      const rect=target.getBoundingClientRect();
      const before=ev.clientY<rect.top+rect.height/2;
      row.classList.remove('drop-line-after');
      row.classList.add('drop-line');
      target.parentNode.insertBefore(row,before?target:target.nextSibling);
    }
  };
  const up=async ev=>{
    document.removeEventListener('pointermove',move);
    document.removeEventListener('pointerup',up);
    cleanupDragGhost();
    row.classList.remove('rank-placeholder','drop-line','drop-line-after');
    document.body.classList.remove('rank-dragging');
    rankEditor.dragging=false;
    await commitLiveOrder();
  };
  document.addEventListener('pointermove',move,{passive:false});
  document.addEventListener('pointerup',up,{once:true});
}
async function rankTierChange(e){
  const p=state.players.find(x=>x.id===e.target.dataset.tierId);
  if(!p)return;
  pushUndo();
  p.tier=Number(e.target.value)||p.tier;
  await persistPlayer(p);
  render();
  renderRankEditor();
  refreshBestRecommendation();
  setStatus('Tier saved.','ok');
}
setTimeout(()=>{setupRankEditor();},300);

/* v23 override: long-press anywhere on player row, live placeholder, ghost tile, haptic, fixed undo */
let rankDragGhostV23=null;
function setupRankEditor(){
  renderRankTabs();
  const undoBtn=document.getElementById('undoRankChangeBtn');
  if(undoBtn){
    undoBtn.onclick=undoRankChange;
    undoBtn.addEventListener('click',undoRankChange);
  }
  updateUndoButton();
}
function renderRankEditor(){
  const wrap=$('#rankEditorRows');
  if(!wrap)return;
  const rows=rankRows();
  wrap.innerHTML=rows.map(p=>`<div class="rank-editor-row" data-rank-id="${p.id}"><div class="rank-num"><span class="rank-drag" aria-label="Drag handle">☰</span><span>${p.custom_rank}</span></div><div class="rank-player-name">${esc(p.name)}</div><div class="rank-team">${esc(p.team||'')}</div><div><input class="rank-tier-input" type="number" min="1" value="${p.tier}" data-tier-id="${p.id}"></div></div>`).join('')||'<div class="rank-editor-empty">No players found for this tab.</div>';
  wrap.querySelectorAll('.rank-editor-row').forEach(row=>{
    row.addEventListener('pointerdown',startLongPressDrag);
    row.addEventListener('contextmenu',e=>e.preventDefault());
  });
  wrap.querySelectorAll('.rank-tier-input').forEach(i=>{
    i.addEventListener('pointerdown',e=>e.stopPropagation());
    i.onchange=rankTierChange;
  });
  updateUndoButton();
}
function updateUndoButton(){
  const b=$('#undoRankChangeBtn');
  if(!b)return;
  const hasUndo=rankEditor.undoStack&&rankEditor.undoStack.length>0;
  b.disabled=!hasUndo;
  b.classList.toggle('is-disabled',!hasUndo);
}
async function undoRankChange(e){
  if(e)e.preventDefault();
  const snap=rankEditor.undoStack.pop();
  if(!snap){updateUndoButton();return;}
  const map=new Map(snap.map(x=>[x.id,x]));
  state.players.forEach(p=>{const old=map.get(p.id); if(old){p.custom_rank=old.custom_rank; p.tier=old.tier;}});
  await persistMany(state.players);
  render();
  renderRankEditor();
  refreshBestRecommendation();
  setStatus('Last ranking edit undone.','ok');
  updateUndoButton();
}
function startLongPressDrag(e){
  if(e.button!==undefined&&e.button!==0)return;
  if(e.target.closest('input,button,select,textarea'))return;
  const row=e.currentTarget.closest('.rank-editor-row');
  if(!row)return;
  rankEditor.startX=e.clientX;
  rankEditor.startY=e.clientY;
  clearTimeout(rankEditor.pressTimer);
  rankEditor.pressTimer=setTimeout(()=>activateDrag(row,e.pointerId,e.clientX,e.clientY),430);
  const cancel=ev=>{
    if(Math.abs(ev.clientX-rankEditor.startX)>9||Math.abs(ev.clientY-rankEditor.startY)>9){
      clearTimeout(rankEditor.pressTimer);
      cleanup();
    }
  };
  const up=()=>{clearTimeout(rankEditor.pressTimer);cleanup();};
  const cleanup=()=>{document.removeEventListener('pointermove',cancel);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);};
  document.addEventListener('pointermove',cancel,{passive:true});
  document.addEventListener('pointerup',up,{once:true});
  document.addEventListener('pointercancel',up,{once:true});
}
function makeDragGhost(row,x,y){
  const rect=row.getBoundingClientRect();
  const ghost=row.cloneNode(true);
  ghost.classList.add('rank-drag-ghost');
  ghost.style.width=rect.width+'px';
  ghost.style.left=rect.left+'px';
  ghost.style.top=rect.top+'px';
  ghost.dataset.offsetX=x-rect.left;
  ghost.dataset.offsetY=y-rect.top;
  document.body.appendChild(ghost);
  return ghost;
}
function moveDragGhost(x,y){
  if(!rankDragGhostV23)return;
  const ox=Number(rankDragGhostV23.dataset.offsetX||0),oy=Number(rankDragGhostV23.dataset.offsetY||0);
  rankDragGhostV23.style.left=(x-ox)+'px';
  rankDragGhostV23.style.top=(y-oy)+'px';
}
function cleanupDragGhost(){if(rankDragGhostV23){rankDragGhostV23.remove();rankDragGhostV23=null;}}
function activateDrag(row,pointerId,x,y){
  if(rankEditor.dragging)return;
  rankEditor.dragging=true;
  rankEditor.dragId=row.dataset.rankId;
  pushUndo();
  if(navigator.vibrate)navigator.vibrate(18);
  row.classList.add('rank-placeholder','drop-line');
  document.body.classList.add('rank-dragging');
  rankDragGhostV23=makeDragGhost(row,x,y);
  moveDragGhost(x,y);
  row.setPointerCapture?.(pointerId);
  const move=ev=>{
    ev.preventDefault();
    moveDragGhost(ev.clientX,ev.clientY);
    if(ev.clientY<84)window.scrollBy(0,-16);
    if(ev.clientY>window.innerHeight-84)window.scrollBy(0,16);
    const ghost=rankDragGhostV23;
    if(ghost)ghost.style.display='none';
    const el=document.elementFromPoint(ev.clientX,ev.clientY);
    if(ghost)ghost.style.display='';
    const target=el?.closest?.('.rank-editor-row');
    if(target&&target!==row&&target.parentNode===row.parentNode){
      const rect=target.getBoundingClientRect();
      const before=ev.clientY<rect.top+rect.height/2;
      row.classList.add('drop-line');
      target.parentNode.insertBefore(row,before?target:target.nextSibling);
    }
  };
  const up=async ev=>{
    document.removeEventListener('pointermove',move);
    document.removeEventListener('pointerup',up);
    document.removeEventListener('pointercancel',up);
    cleanupDragGhost();
    row.classList.remove('rank-placeholder','drop-line');
    document.body.classList.remove('rank-dragging');
    rankEditor.dragging=false;
    await commitLiveOrder();
  };
  document.addEventListener('pointermove',move,{passive:false});
  document.addEventListener('pointerup',up,{once:true});
  document.addEventListener('pointercancel',up,{once:true});
}
async function rankTierChange(e){
  const p=state.players.find(x=>x.id===e.target.dataset.tierId);
  if(!p)return;
  pushUndo();
  p.tier=Number(e.target.value)||p.tier;
  await persistPlayer(p);
  render();
  renderRankEditor();
  refreshBestRecommendation();
  setStatus('Tier saved.','ok');
}
setTimeout(()=>{setupRankEditor();},350);

/* v24 final override: touch-first sortable editor, whole-row long press, single-click undo */
let rankDragGhostV24=null;
let rankTouchV24={active:false,armed:false,row:null,timer:null,startX:0,startY:0,lastX:0,lastY:0,moved:false};
function setupRankEditor(){
  renderRankTabs();
  const undoBtn=document.getElementById('undoRankChangeBtn');
  if(undoBtn){
    undoBtn.disabled=!rankEditor.undoStack.length;
    undoBtn.onclick=null;
    undoBtn.addEventListener('click',undoRankChange,{capture:true});
    undoBtn.addEventListener('touchend',e=>{e.preventDefault();undoRankChange(e);},{capture:true});
  }
  updateUndoButton();
}
function renderRankEditor(){
  const wrap=$('#rankEditorRows');
  if(!wrap)return;
  const rows=rankRows();
  wrap.innerHTML=rows.map(p=>`<div class="rank-editor-row" data-rank-id="${p.id}"><div class="rank-num"><span class="rank-drag" aria-label="Drag handle">☰</span><span>${p.custom_rank}</span></div><div class="rank-player-name">${esc(p.name)}</div><div class="rank-team">${esc(p.team||'')}</div><div><input class="rank-tier-input" type="number" min="1" value="${p.tier}" data-tier-id="${p.id}"></div></div>`).join('')||'<div class="rank-editor-empty">No players found for this tab.</div>';
  wrap.querySelectorAll('.rank-editor-row').forEach(row=>{
    row.addEventListener('touchstart',rankTouchStartV24,{passive:false});
    row.addEventListener('touchmove',rankTouchMoveV24,{passive:false});
    row.addEventListener('touchend',rankTouchEndV24,{passive:false});
    row.addEventListener('touchcancel',rankTouchCancelV24,{passive:false});
    row.addEventListener('pointerdown',rankPointerStartV24);
    row.addEventListener('contextmenu',e=>e.preventDefault());
  });
  wrap.querySelectorAll('.rank-tier-input').forEach(i=>{
    i.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
    i.addEventListener('pointerdown',e=>e.stopPropagation());
    i.onchange=rankTierChange;
  });
  updateUndoButton();
}
function updateUndoButton(){
  const b=$('#undoRankChangeBtn');
  if(!b)return;
  const hasUndo=!!(rankEditor.undoStack&&rankEditor.undoStack.length);
  b.disabled=!hasUndo;
  b.classList.toggle('is-disabled',!hasUndo);
}
async function undoRankChange(e){
  if(e){e.preventDefault();e.stopPropagation();}
  const snap=rankEditor.undoStack.pop();
  if(!snap){updateUndoButton();return;}
  const map=new Map(snap.map(x=>[x.id,x]));
  state.players.forEach(p=>{const old=map.get(p.id);if(old){p.custom_rank=old.custom_rank;p.tier=old.tier;}});
  await persistMany(state.players);
  render();
  renderRankEditor();
  refreshBestRecommendation();
  setStatus('Last ranking edit undone.','ok');
  updateUndoButton();
}
function isRankInteractiveTarget(el){return !!el.closest('input,button,select,textarea,.rank-tab,.rank-editor-actions-top')}
function rankTouchStartV24(e){
  if(e.touches.length!==1||isRankInteractiveTarget(e.target))return;
  const row=e.currentTarget.closest('.rank-editor-row');
  if(!row)return;
  const t=e.touches[0];
  rankTouchV24={active:false,armed:true,row,timer:null,startX:t.clientX,startY:t.clientY,lastX:t.clientX,lastY:t.clientY,moved:false};
  clearTimeout(rankTouchV24.timer);
  rankTouchV24.timer=setTimeout(()=>rankActivateDragV24(row,t.clientX,t.clientY),480);
}
function rankTouchMoveV24(e){
  if(!rankTouchV24.armed)return;
  const t=e.touches[0];
  rankTouchV24.lastX=t.clientX;rankTouchV24.lastY=t.clientY;
  const dx=Math.abs(t.clientX-rankTouchV24.startX), dy=Math.abs(t.clientY-rankTouchV24.startY);
  if(!rankTouchV24.active && (dx>10||dy>10)){
    clearTimeout(rankTouchV24.timer);
    rankTouchV24.armed=false;
    return;
  }
  if(rankTouchV24.active){
    e.preventDefault();
    rankMoveDragV24(t.clientX,t.clientY);
  }
}
function rankTouchEndV24(e){
  clearTimeout(rankTouchV24.timer);
  if(rankTouchV24.active){e.preventDefault();rankFinishDragV24();}
  rankTouchV24.armed=false;rankTouchV24.active=false;
}
function rankTouchCancelV24(e){clearTimeout(rankTouchV24.timer);if(rankTouchV24.active)rankFinishDragV24();rankTouchV24.armed=false;rankTouchV24.active=false;}
function rankPointerStartV24(e){
  if(('ontouchstart' in window) || isRankInteractiveTarget(e.target))return;
  if(e.button!==undefined&&e.button!==0)return;
  const row=e.currentTarget.closest('.rank-editor-row');
  if(!row)return;
  e.preventDefault();
  rankActivateDragV24(row,e.clientX,e.clientY);
  const move=ev=>{ev.preventDefault();rankMoveDragV24(ev.clientX,ev.clientY);};
  const up=async ev=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);await rankFinishDragV24();};
  document.addEventListener('pointermove',move,{passive:false});
  document.addEventListener('pointerup',up,{once:true});
}
function rankActivateDragV24(row,x,y){
  if(rankEditor.dragging)return;
  rankEditor.dragging=true;
  rankTouchV24.active=true;
  rankEditor.dragId=row.dataset.rankId;
  pushUndo();
  if(navigator.vibrate)navigator.vibrate([18]);
  row.classList.add('rank-placeholder','rank-drop-target');
  document.body.classList.add('rank-dragging');
  rankDragGhostV24=rankMakeGhostV24(row,x,y);
  rankMoveGhostV24(x,y);
}
function rankMakeGhostV24(row,x,y){
  const rect=row.getBoundingClientRect();
  const ghost=row.cloneNode(true);
  ghost.classList.add('rank-drag-ghost');
  ghost.style.width=rect.width+'px';
  ghost.style.left=rect.left+'px';
  ghost.style.top=rect.top+'px';
  ghost.dataset.offsetX=x-rect.left;
  ghost.dataset.offsetY=y-rect.top;
  document.body.appendChild(ghost);
  return ghost;
}
function rankMoveGhostV24(x,y){
  if(!rankDragGhostV24)return;
  const ox=Number(rankDragGhostV24.dataset.offsetX||0),oy=Number(rankDragGhostV24.dataset.offsetY||0);
  rankDragGhostV24.style.left=(x-ox)+'px';
  rankDragGhostV24.style.top=(y-oy)+'px';
}
function rankMoveDragV24(x,y){
  rankMoveGhostV24(x,y);
  if(y<84)window.scrollBy(0,-18);
  if(y>window.innerHeight-84)window.scrollBy(0,18);
  const row=document.querySelector(`.rank-editor-row[data-rank-id="${rankEditor.dragId}"]`);
  if(!row)return;
  if(rankDragGhostV24)rankDragGhostV24.style.display='none';
  const el=document.elementFromPoint(x,y);
  if(rankDragGhostV24)rankDragGhostV24.style.display='';
  const target=el?.closest?.('.rank-editor-row');
  if(target&&target!==row&&target.parentNode===row.parentNode){
    const rect=target.getBoundingClientRect();
    const before=y<rect.top+rect.height/2;
    target.parentNode.insertBefore(row,before?target:target.nextSibling);
    row.classList.add('rank-drop-target');
  }
}
async function rankFinishDragV24(){
  const row=document.querySelector(`.rank-editor-row[data-rank-id="${rankEditor.dragId}"]`);
  if(rankDragGhostV24){rankDragGhostV24.remove();rankDragGhostV24=null;}
  if(row)row.classList.remove('rank-placeholder','rank-drop-target');
  document.body.classList.remove('rank-dragging');
  rankEditor.dragging=false;
  await commitLiveOrder();
}
async function rankTierChange(e){
  const p=state.players.find(x=>x.id===e.target.dataset.tierId);
  if(!p)return;
  pushUndo();
  p.tier=Number(e.target.value)||p.tier;
  await persistPlayer(p);
  render();renderRankEditor();refreshBestRecommendation();setStatus('Tier saved.','ok');
}
setTimeout(()=>setupRankEditor(),500);

/* v25 Safari drag refinement: easier whole-row long press, clearer insertion bar, reliable undo */
let rankDragGhostV25=null;
let rankTouchV25={active:false,armed:false,row:null,timer:null,startX:0,startY:0,lastX:0,lastY:0};
function setupRankEditor(){
  renderRankTabs();
  const undoBtn=document.getElementById('undoRankChangeBtn');
  if(undoBtn){
    undoBtn.onclick=undoRankChange;
    undoBtn.ontouchend=e=>{e.preventDefault();undoRankChange(e);};
  }
  updateUndoButton();
}
function forceUndoEnabledIfNeeded(){
  const b=document.getElementById('undoRankChangeBtn');
  if(!b)return;
  const hasUndo=!!(rankEditor.undoStack&&rankEditor.undoStack.length);
  b.disabled=!hasUndo;
  b.classList.toggle('is-disabled',!hasUndo);
}
function updateUndoButton(){forceUndoEnabledIfNeeded();}
function pushUndo(){
  rankEditor.undoStack.push(snapshotRanks());
  if(rankEditor.undoStack.length>20)rankEditor.undoStack.shift();
  forceUndoEnabledIfNeeded();
}
async function undoRankChange(e){
  if(e){e.preventDefault();e.stopPropagation();}
  if(!rankEditor.undoStack||!rankEditor.undoStack.length){forceUndoEnabledIfNeeded();return;}
  const snap=rankEditor.undoStack.pop();
  const map=new Map(snap.map(x=>[x.id,x]));
  state.players.forEach(p=>{const old=map.get(p.id);if(old){p.custom_rank=old.custom_rank;p.tier=old.tier;}});
  await persistMany(state.players);
  render();renderRankEditor();refreshBestRecommendation();
  setStatus('Last ranking edit undone.','ok');
  forceUndoEnabledIfNeeded();
}
function renderRankEditor(){
  const wrap=$('#rankEditorRows');
  if(!wrap)return;
  const rows=rankRows();
  wrap.innerHTML=rows.map(p=>`<div class="rank-editor-row" data-rank-id="${p.id}"><div class="rank-num"><span class="rank-drag" aria-label="Drag handle">☰</span><span>${p.custom_rank}</span></div><div class="rank-player-name">${esc(p.name)}</div><div class="rank-team">${esc(p.team||'')}</div><div><input class="rank-tier-input" type="number" min="1" value="${p.tier}" data-tier-id="${p.id}"></div></div>`).join('')||'<div class="rank-editor-empty">No players found for this tab.</div>';
  wrap.querySelectorAll('.rank-editor-row').forEach(row=>{
    row.addEventListener('touchstart',rankTouchStartV25,{passive:false,capture:true});
    row.addEventListener('touchmove',rankTouchMoveV25,{passive:false,capture:true});
    row.addEventListener('touchend',rankTouchEndV25,{passive:false,capture:true});
    row.addEventListener('touchcancel',rankTouchCancelV25,{passive:false,capture:true});
    row.addEventListener('pointerdown',rankPointerStartV25,{capture:true});
    row.addEventListener('contextmenu',e=>e.preventDefault());
  });
  wrap.querySelectorAll('.rank-tier-input').forEach(i=>{
    i.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
    i.addEventListener('pointerdown',e=>e.stopPropagation());
    i.onchange=rankTierChange;
  });
  forceUndoEnabledIfNeeded();
}
function isRankInteractiveTarget(el){return !!el.closest('input,button,select,textarea,.rank-tab,.rank-editor-actions-top')}
function rankTouchStartV25(e){
  if(e.touches.length!==1||isRankInteractiveTarget(e.target))return;
  const row=e.currentTarget.closest('.rank-editor-row');if(!row)return;
  const t=e.touches[0];
  rankTouchV25={active:false,armed:true,row,timer:null,startX:t.clientX,startY:t.clientY,lastX:t.clientX,lastY:t.clientY};
  row.classList.add('press-arming');
  clearTimeout(rankTouchV25.timer);
  rankTouchV25.timer=setTimeout(()=>rankActivateDragV25(row,t.clientX,t.clientY),320);
}
function rankTouchMoveV25(e){
  if(!rankTouchV25.armed)return;
  const t=e.touches[0];rankTouchV25.lastX=t.clientX;rankTouchV25.lastY=t.clientY;
  const dx=Math.abs(t.clientX-rankTouchV25.startX),dy=Math.abs(t.clientY-rankTouchV25.startY);
  if(!rankTouchV25.active&&(dx>24||dy>24)){
    clearTimeout(rankTouchV25.timer);
    rankTouchV25.row?.classList.remove('press-arming');
    rankTouchV25.armed=false;
    return;
  }
  if(rankTouchV25.active){e.preventDefault();rankMoveDragV25(t.clientX,t.clientY);}
}
function rankTouchEndV25(e){
  clearTimeout(rankTouchV25.timer);
  rankTouchV25.row?.classList.remove('press-arming');
  if(rankTouchV25.active){e.preventDefault();rankFinishDragV25();}
  rankTouchV25.armed=false;rankTouchV25.active=false;
}
function rankTouchCancelV25(e){clearTimeout(rankTouchV25.timer);rankTouchV25.row?.classList.remove('press-arming');if(rankTouchV25.active)rankFinishDragV25();rankTouchV25.armed=false;rankTouchV25.active=false;}
function rankPointerStartV25(e){
  if(('ontouchstart' in window)||isRankInteractiveTarget(e.target))return;
  if(e.button!==undefined&&e.button!==0)return;
  const row=e.currentTarget.closest('.rank-editor-row');if(!row)return;
  e.preventDefault();rankActivateDragV25(row,e.clientX,e.clientY);
  const move=ev=>{ev.preventDefault();rankMoveDragV25(ev.clientX,ev.clientY);};
  const up=async()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);await rankFinishDragV25();};
  document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up,{once:true});
}
function rankActivateDragV25(row,x,y){
  if(rankEditor.dragging)return;
  rankEditor.dragging=true;rankTouchV25.active=true;rankEditor.dragId=row.dataset.rankId;
  pushUndo();forceUndoEnabledIfNeeded();
  if(navigator.vibrate)navigator.vibrate([22]);
  row.classList.remove('press-arming');row.classList.add('rank-placeholder','rank-drop-target');
  document.body.classList.add('rank-dragging');
  rankDragGhostV25=rankMakeGhostV25(row,x,y);rankMoveGhostV25(x,y);
}
function rankMakeGhostV25(row,x,y){
  const rect=row.getBoundingClientRect();const ghost=row.cloneNode(true);
  ghost.classList.add('rank-drag-ghost');ghost.style.width=rect.width+'px';ghost.style.left=rect.left+'px';ghost.style.top=rect.top+'px';ghost.dataset.offsetX=x-rect.left;ghost.dataset.offsetY=y-rect.top;document.body.appendChild(ghost);return ghost;
}
function rankMoveGhostV25(x,y){if(!rankDragGhostV25)return;const ox=Number(rankDragGhostV25.dataset.offsetX||0),oy=Number(rankDragGhostV25.dataset.offsetY||0);rankDragGhostV25.style.left=(x-ox)+'px';rankDragGhostV25.style.top=(y-oy)+'px';}
function rankMoveDragV25(x,y){
  rankMoveGhostV25(x,y);
  if(y<84)window.scrollBy(0,-18);if(y>window.innerHeight-84)window.scrollBy(0,18);
  const row=document.querySelector(`.rank-editor-row[data-rank-id="${rankEditor.dragId}"]`);if(!row)return;
  if(rankDragGhostV25)rankDragGhostV25.style.display='none';const el=document.elementFromPoint(x,y);if(rankDragGhostV25)rankDragGhostV25.style.display='';
  const target=el?.closest?.('.rank-editor-row');
  if(target&&target!==row&&target.parentNode===row.parentNode){const rect=target.getBoundingClientRect();const before=y<rect.top+rect.height/2;target.parentNode.insertBefore(row,before?target:target.nextSibling);row.classList.add('rank-drop-target');}
}
async function rankFinishDragV25(){
  const row=document.querySelector(`.rank-editor-row[data-rank-id="${rankEditor.dragId}"]`);
  if(rankDragGhostV25){rankDragGhostV25.remove();rankDragGhostV25=null;}
  if(row)row.classList.remove('rank-placeholder','rank-drop-target','press-arming');
  document.body.classList.remove('rank-dragging');rankEditor.dragging=false;
  await commitLiveOrder();forceUndoEnabledIfNeeded();
}
setTimeout(()=>setupRankEditor(),600);
