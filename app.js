const STORE_KEY='fantasy-war-room-2026-v32';
const TABLE=window.SUPABASE_TABLE||'fantasy_players';
let state={players:[],activePos:'ALL'};
let sb=null, usingSupabase=false, realtimeChannel=null, currentRecommendation=null;
const POSITIONS=['QB','RB','WR','TE','K','DST'];
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const rankEditor={active:'ALL',undoStack:[],dragging:false,dragId:null};
let SEED_PLAYERS=[], SEED_BY_ID=new Map(), SEED_BY_NAME=new Map();

function uid(name){return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function key(v){return String(v||'').toLowerCase().trim()}
function parseInfo(notes){if(!notes)return{};if(typeof notes==='object')return notes;try{return JSON.parse(notes)}catch{return{}}}
function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function fmt(n){return Number.isInteger(n)?n:(Number(n)||0).toFixed(1)}
function configured(){const url=String(window.SUPABASE_URL||'').trim(), k=String(window.SUPABASE_PUBLIC_KEY||window.SUPABASE_ANON_KEY||'').trim(); if(k&&!window.SUPABASE_PUBLIC_KEY)window.SUPABASE_PUBLIC_KEY=k; return !!(url&&k&&url.startsWith('https://')&&!url.includes('PASTE_')&&!k.includes('PASTE_'))}

async function loadSeed(){
  if(SEED_PLAYERS.length)return SEED_PLAYERS;
  const data=await (await fetch('data/seed-rankings.json?v=32')).json();
  SEED_PLAYERS=normalizeRows(data.players||[]);
  SEED_BY_ID=new Map(); SEED_BY_NAME=new Map();
  SEED_PLAYERS.forEach(p=>{SEED_BY_ID.set(key(p.id||uid(p.name)),p);SEED_BY_NAME.set(key(p.name),p)});
  return SEED_PLAYERS;
}
function seedFor(p){return SEED_BY_ID.get(key(p?.id||uid(p?.name)))||SEED_BY_NAME.get(key(p?.name))}
function normalizeRows(rows){return rows.map(p=>{const info=p.player_info||p.playerInfo||parseInfo(p.notes);return{id:p.id||uid(p.name),name:p.name,team:p.team||'',pos:p.pos||'RB',custom_rank:Number(p.custom_rank??p.rank??info['Consensus Rank']??999),tier:Number(p.tier??99),sources:p.sources||{},player_info:info,notes:p.notes||JSON.stringify(info||{}),drafted:!!p.drafted,draftedBy:p.drafted_by??p.draftedBy??'',pick:p.pick??null,updated_at:p.updated_at||null}})}
function toDb(p){return{id:p.id||uid(p.name),name:p.name,team:p.team,pos:p.pos,custom_rank:Number(p.custom_rank),tier:Number(p.tier),sources:p.sources||{},notes:JSON.stringify(getInfoForPlayer(p)||{}),drafted:!!p.drafted,drafted_by:p.draftedBy||'',pick:p.pick||null,updated_at:new Date().toISOString()}}
function hydrateFromSeed(){
  const byId=new Map(state.players.map(p=>[key(p.id||uid(p.name)),p]));
  const byName=new Map(state.players.map(p=>[key(p.name),p]));
  SEED_PLAYERS.forEach(sp=>{
    const p=byId.get(key(sp.id||uid(sp.name)))||byName.get(key(sp.name));
    if(!p){state.players.push({...sp});return;}
    p.sources={...(sp.sources||{}),...(p.sources||{})};
    p.player_info={...(sp.player_info||{}),...(parseInfo(p.notes)||{}),...(p.player_info||{}),...(sp.player_info||{})};
    p.notes=JSON.stringify(p.player_info||{});
    p.pos=p.pos||sp.pos; p.team=p.team||sp.team;
  });
}
function getInfoForPlayer(p){const sp=seedFor(p);return{...(sp?.player_info||{}),...(parseInfo(p?.notes)||{}),...(p?.player_info||{})}}

async function init(){bind();await loadSeed();await connect();render();setupRankEditor();refreshBestRecommendation();selectionGuard();}
async function connect(){
  try{
    if(configured()&&window.supabase){
      sb=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLIC_KEY||window.SUPABASE_ANON_KEY); usingSupabase=true;
      setStatus('Connecting to Supabase...','warn'); await loadFromSupabase(); subscribeRealtime(); setStatus('Connected to Supabase table '+TABLE+'.','ok');
    }else{usingSupabase=false;await loadLocalOrSeed();setStatus(configured()?'Supabase library did not load. Using local browser save only.':'Supabase is not linked yet. Using local browser save only.','warn')}
  }catch(err){console.error(err);usingSupabase=false;await loadLocalOrSeed();setStatus('Supabase connection failed: '+(err?.message||err)+'. Using local browser save only.','bad')}
}
async function loadLocalOrSeed(){const saved=localStorage.getItem(STORE_KEY);state=saved?JSON.parse(saved):{players:SEED_PLAYERS.map(p=>({...p})),activePos:'ALL'};hydrateFromSeed();localSave(false)}
async function loadFromSupabase(){const {data,error}=await sb.from(TABLE).select('*').order('custom_rank',{ascending:true}); if(error)throw error; if(data&&data.length){state.players=normalizeRows(data);hydrateFromSeed();await persistMany(state.players,false)}else{state.players=SEED_PLAYERS.map(p=>({...p}));hydrateFromSeed();localSave(false);setStatus('Supabase table is empty. Click Seed Supabase to publish Excel seed.','warn')}}
function localSave(stamp=true){localStorage.setItem(STORE_KEY,JSON.stringify(state));if(stamp&&$('#lastSaved'))$('#lastSaved').textContent='Saved '+new Date().toLocaleTimeString()}
async function persistPlayer(p){localSave(); if(!usingSupabase||!sb)return; const {error}=await sb.from(TABLE).upsert(toDb(p)); if(error)setStatus('Supabase save failed: '+error.message,'bad')}
async function persistMany(players=state.players,show=true){localSave(); if(!usingSupabase||!sb)return; const {error}=await sb.from(TABLE).upsert(players.map(toDb)); if(error)setStatus('Supabase bulk save failed: '+error.message,'bad'); else if(show)setStatus('Saved to Supabase.','ok')}
async function seedSupabase(){if(!usingSupabase||!sb){alert('Supabase is not connected. Check config.js.');return}const current=new Map(state.players.map(p=>[key(p.id||uid(p.name)),p]));state.players=SEED_PLAYERS.map(sp=>{const old=current.get(key(sp.id||uid(sp.name)));return{...sp,custom_rank:old?.custom_rank??sp.custom_rank,tier:old?.tier??sp.tier,drafted:!!old?.drafted,draftedBy:old?.draftedBy||'',pick:old?.pick??null}});hydrateFromSeed();await persistMany(state.players);render();renderRankEditor();refreshBestRecommendation();setStatus('Supabase seeded from Excel-backed seed file.','ok')}
async function refreshSourceRankings(){hydrateFromSeed();await persistMany(state.players);render();if(!$('#rankEditorView')?.hidden)renderRankEditor();refreshBestRecommendation();setStatus('Excel player notes and source rankings refreshed.','ok')}
function subscribeRealtime(){if(!sb)return;if(realtimeChannel)sb.removeChannel(realtimeChannel);realtimeChannel=sb.channel('fantasy-board-changes').on('postgres_changes',{event:'*',schema:'public',table:TABLE},payload=>{const row=payload.new||payload.old;if(!row)return;if(payload.eventType==='DELETE')state.players=state.players.filter(p=>p.id!==row.id);else{const np=normalizeRows([row])[0];const ix=state.players.findIndex(p=>p.id===np.id);if(ix>-1)state.players[ix]=np;else state.players.push(np);hydrateFromSeed()}localSave(false);render();refreshBestRecommendation();}).subscribe()}

function bind(){
  ['search','statusFilter','sortBy'].forEach(id=>{const el=$('#'+id);if(el)el.addEventListener('input',()=>{render();refreshBestRecommendation()})});
  const on=(id,fn)=>{const el=$('#'+id); if(el)el.onclick=fn};
  on('bestBtn',refreshBestRecommendation);on('chooseRecommendedBtn',draftRecommended);on('resetDraftBtn',resetAllDraft);on('seedSupabaseBtn',seedSupabase);on('refreshSourcesBtn',refreshSourceRankings);on('exportCsvBtn',exportCsv);on('printPdfBtn',()=>window.print());on('editRanksBtn',openRankEditor);on('backToDraftBtn',closeRankEditor);on('undoRankChangeBtn',undoRankChange);on('closePlayerInfoBtn',closePlayerInfo);on('cancelEdit',()=>$('#editDialog').close());
  const form=$('#editForm'); if(form)form.addEventListener('submit',saveEdit); const imp=$('#importAny'); if(imp)imp.onchange=e=>importAny(e.target.files[0]); const d=$('#playerInfoDialog'); if(d)d.addEventListener('click',e=>{if(e.target===d)closePlayerInfo()});
}
function setStatus(msg,cls){const el=$('#syncStatus');if(el){el.textContent=msg;el.className='sync-status '+cls}}
function myTeam(){return state.players.filter(p=>p.draftedBy==='Me')}function teamCounts(){return myTeam().reduce((a,p)=>{a[p.pos]=(a[p.pos]||0)+1;return a},{QB:0,RB:0,WR:0,TE:0,K:0,DST:0})}function currentPick(){return state.players.filter(p=>p.drafted).length+1}function availablePlayers(){return state.players.filter(p=>!p.drafted)}
function sourceAvg(p){const vals=Object.values(p.sources||{}).map(Number).filter(Number.isFinite);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:p.custom_rank}
function posRank(p){const same=state.players.filter(x=>x.pos===p.pos).sort((a,b)=>a.custom_rank-b.custom_rank);return p.pos+(same.findIndex(x=>x.id===p.id)+1)}
function rosterNeedBonus(p){const c=teamCounts(),pick=currentPick();let bonus=0,reason=[];if(p.pos==='QB'){if(c.QB<1&&pick>55){bonus+=22;reason.push('QB starter open')}else if(c.QB>=1)bonus-=28}if(p.pos==='RB'){if(c.RB<2){bonus+=60;reason.push('need RB starters')}else if(c.RB<4)bonus+=24}if(p.pos==='WR'){if(c.WR<2){bonus+=52;reason.push('need WR starters')}else if(c.WR<5)bonus+=20}if(p.pos==='TE'){if(c.TE<1)bonus+=25;else bonus-=18}if(p.pos==='K')bonus+=(c.K<1&&pick>115)?35:-95;if(p.pos==='DST')bonus+=(c.DST<1&&pick>105)?35:-90;return{bonus,reason}}
function scarcityBonus(p){const avail=availablePlayers(),sameTierPos=avail.filter(x=>x.pos===p.pos&&x.tier===p.tier).length,samePos=avail.filter(x=>x.pos===p.pos).length;return{sameTierPos,bonus:(sameTierPos<=2?28:sameTierPos<=4?18:sameTierPos<=7?9:0)+(samePos<=8?14:samePos<=14?7:0)+((p.pos==='RB'||p.pos==='WR')?4:p.pos==='TE'?3:0)}}
function recommendationScore(p){return Math.round(1000-(p.custom_rank*5)+Math.max(-40,Math.min(40,(p.custom_rank-sourceAvg(p))*2))+Math.max(0,90-(p.tier*8))+scarcityBonus(p).bonus+rosterNeedBonus(p).bonus)}
function bestAvailable(){return availablePlayers().sort((a,b)=>recommendationScore(b)-recommendationScore(a)||a.custom_rank-b.custom_rank)[0]||null}
function getFiltered(){const q=$('#search')?.value.trim().toLowerCase()||'',status=$('#statusFilter')?.value||'available';let arr=[...state.players];if(state.activePos!=='ALL')arr=arr.filter(p=>p.pos===state.activePos);if(q)arr=arr.filter(p=>(p.name+' '+p.team+' '+p.pos).toLowerCase().includes(q));if(status==='available')arr=arr.filter(p=>!p.drafted);if(status==='mine')arr=arr.filter(p=>p.draftedBy==='Me');if(status==='drafted')arr=arr.filter(p=>p.drafted);const sort=$('#sortBy')?.value||'custom_rank';arr.sort((a,b)=>sort==='recommendation'?(recommendationScore(b)-recommendationScore(a)||a.custom_rank-b.custom_rank):sort==='tier'?(a.tier-b.tier||a.custom_rank-b.custom_rank):sort==='adp'?(sourceAvg(a)-sourceAvg(b)):sort==='pos'?(a.pos.localeCompare(b.pos)||a.custom_rank-b.custom_rank):a.custom_rank-b.custom_rank);return arr}
function playerInfoHtml(p){const info=getInfoForPlayer(p);const rows=[['Consensus Rank',info['Consensus Rank']??p.custom_rank],['Consensus Tier',info['Consensus Tier']??('Tier '+p.tier)],['FantasyPros ECR',info['FantasyPros ECR']??''],['Draft Sharks (3D)',info['Draft Sharks (3D)']??''],['Rotoworld Top 200',info['Rotoworld Top 200']??''],['Avg ADP',info['Avg ADP']??'']];const note=info['Key Player Notes & Analysis']||'';return`<h2>${esc(p.name)}</h2><div class="player-info-sub"><span class="pos ${p.pos}">${esc(p.pos)}</span> <strong>${esc(p.team||'')}</strong></div><div class="player-info-grid">${rows.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v??'')}</strong></div>`).join('')}</div><div class="player-info-notes"><h3>Key Player Notes & Analysis</h3><p>${esc(note||'No notes loaded for this player.')}</p></div>`}
function showPlayerInfo(id){const p=state.players.find(x=>x.id===id);if(!p)return;$('#playerInfoContent').innerHTML=playerInfoHtml(p);const d=$('#playerInfoDialog');if(d?.showModal)d.showModal();else d?.setAttribute('open','open')}function closePlayerInfo(){const d=$('#playerInfoDialog');if(d?.close)d.close();else d?.removeAttribute('open')}
function render(){renderChips();renderScarcity();const tbody=$('#board tbody');if(!tbody)return;tbody.innerHTML='';for(const p of getFiltered()){const cons=sourceAvg(p);const tr=document.createElement('tr');tr.className=`tier-${Math.min(14,Math.max(1,p.tier))} ${p.drafted?'drafted-row':''}`;tr.innerHTML=`<td data-label="Player"><div class="compact-player-line"><span class="player-name">${esc(p.name)}</span><span class="pos ${p.pos}">${posRank(p)}</span><span class="compact-team">${esc(p.team)}</span><button class="tile-note-btn" type="button" data-info-id="${p.id}" title="View player notes">📝</button></div><div class="meta">${p.drafted?p.draftedBy==='Me'?'On my team':'Drafted by other':'Available'}</div><div class="mobile-metrics"><div class="metric-pill"><span>Rank</span><strong>${p.custom_rank}</strong></div><div class="metric-pill"><span>Tier</span><strong>${p.tier}</strong></div><div class="metric-pill"><span>Cons</span><strong>${fmt(cons)}</strong></div><div class="metric-pill"><span>Score</span><strong>${recommendationScore(p)}</strong></div></div></td><td data-label="Custom Ranking"><input class="rank-input" type="number" min="1" value="${p.custom_rank}" data-field="custom_rank" data-id="${p.id}"></td><td data-label="Tier"><input class="tier-input" type="number" min="1" value="${p.tier}" data-field="tier" data-id="${p.id}"></td><td data-label="Consensus"><strong>${fmt(cons)}</strong></td><td data-label="Score"><span class="score-pill">${recommendationScore(p)}</span></td><td data-label="Action"><div class="actions"><button class="mine" data-act="mine" data-id="${p.id}">Mine</button><button class="gone" data-act="gone" data-id="${p.id}">Gone</button><button class="edit" data-act="edit" data-id="${p.id}">Edit</button></div></td>`;tbody.appendChild(tr)}$$('.actions button').forEach(b=>b.onclick=()=>act(b.dataset.act,b.dataset.id));$$('.rank-input,.tier-input').forEach(inp=>inp.onchange=()=>inlineUpdate(inp));$$('.tile-note-btn').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();showPlayerInfo(btn.dataset.infoId)});renderSidebars()}
function renderChips(){const wrap=$('#positionChips');if(!wrap)return;wrap.innerHTML='';['ALL',...POSITIONS].forEach(pos=>{const b=document.createElement('button');b.className='chip '+(state.activePos===pos?'active':'');b.textContent=pos;b.onclick=()=>{state.activePos=pos;localSave(false);render();refreshBestRecommendation()};wrap.appendChild(b)})}
function renderScarcity(){const wrap=$('#scarcityGrid'),roster=$('#rosterBuild'),avail=availablePlayers(),c=teamCounts();if(roster)roster.innerHTML=`<div class="roster-mode">Current roster</div><div class="roster-counts">QB ${c.QB||0} | RB ${c.RB||0} | WR ${c.WR||0} | TE ${c.TE||0} | K ${c.K||0} | DST ${c.DST||0}</div>`;if(!wrap)return;wrap.innerHTML=POSITIONS.map(pos=>{const list=avail.filter(p=>p.pos===pos);const tiers=[1,2,3,4,5,11,12,13].map(t=>`T${t}: ${list.filter(p=>p.tier===t).length}`).join(' | ');return`<div class="scarcity-tile"><div class="scarcity-pos ${pos}">${pos}</div><div class="scarcity-total">${list.length}</div><div class="scarcity-tiers">${tiers}</div></div>`}).join('')}
function renderSidebars(){const mine=myTeam().sort((a,b)=>(a.pick||999)-(b.pick||999)),drafted=state.players.filter(p=>p.drafted).sort((a,b)=>(a.pick||999)-(b.pick||999));$('#myTeam').innerHTML=mine.map(p=>`<li><strong>${esc(p.name)}</strong> <span class="meta">${p.pos} ${esc(p.team)}, Custom ${p.custom_rank}/Tier ${p.tier}</span></li>`).join('')||'<li class="meta">No picks yet</li>';$('#liveDraftBoard').innerHTML=drafted.map(p=>`<li><span class="pick-num">${p.pick||''}</span> ${esc(p.name)} <span class="meta">${p.pos} ${esc(p.team)} - ${esc(p.draftedBy)}</span></li>`).join('')||'<li class="meta">No picks yet</li>';$('#draftedLog').innerHTML=drafted.slice(-24).reverse().map(p=>`<li>${esc(p.name)} <span class="meta">${esc(p.draftedBy)}</span></li>`).join('')||'<li class="meta">No drafted players yet</li>';$('#availableCount').textContent=availablePlayers().length;$('#myCount').textContent=mine.length;$('#draftedCount').textContent=drafted.length}
function inlineUpdate(inp){const p=state.players.find(x=>x.id===inp.dataset.id);if(!p)return;p[inp.dataset.field]=Number(inp.value);persistPlayer(p);render();refreshBestRecommendation()}function nextPick(){return Math.max(0,...state.players.map(p=>p.pick||0))+1}function act(action,id){const p=state.players.find(x=>x.id===id);if(!p)return;if(action==='mine'){p.drafted=true;p.draftedBy='Me';p.pick=nextPick()}if(action==='gone'){p.drafted=true;p.draftedBy='Other';p.pick=nextPick()}if(action==='edit')return openEdit(p);persistPlayer(p);render();refreshBestRecommendation()}async function resetAllDraft(){if(!confirm('Reset entire draft board?'))return;if(!confirm('Final confirmation: reset for everyone?'))return;state.players.forEach(p=>{p.drafted=false;p.draftedBy='';p.pick=null});await persistMany();render();refreshBestRecommendation()}
function refreshBestRecommendation(){const p=bestAvailable();currentRecommendation=p;const box=$('#recommendationBox'),btn=$('#chooseRecommendedBtn');if(!box)return;if(!p){box.textContent='No available players left.';if(btn)btn.hidden=true;return}const scar=scarcityBonus(p);box.innerHTML=`<div class="recommendation-main">${esc(p.name)} <span class="pos ${p.pos}">${p.pos}</span></div><div class="recommendation-meta">${esc(p.team)} | Custom Ranking ${p.custom_rank} | Consensus ${fmt(sourceAvg(p))} | Tier ${p.tier} | Score ${recommendationScore(p)}</div><div class="recommendation-reason">Why: ${scar.sameTierPos} ${p.pos}s remain in Tier ${p.tier}.</div>`;if(btn)btn.hidden=false}function draftRecommended(){if(!currentRecommendation)currentRecommendation=bestAvailable();if(currentRecommendation)act('mine',currentRecommendation.id)}
function openEdit(p){$('#editId').value=p.id;$('#editName').value=p.name;$('#editTeam').value=p.team;$('#editPos').value=p.pos;$('#editRank').value=p.custom_rank;$('#editTier').value=p.tier;$('#editDialog').showModal()}function saveEdit(e){e.preventDefault();const p=state.players.find(x=>x.id===$('#editId').value);if(!p)return;Object.assign(p,{name:$('#editName').value,team:$('#editTeam').value,pos:$('#editPos').value,custom_rank:+$('#editRank').value,tier:+$('#editTier').value});p.id=uid(p.name);persistPlayer(p);$('#editDialog').close();render();refreshBestRecommendation()}
function exportCsv(){const rows=[['pick','drafted_by','name','team','pos','custom_rank','consensus_rank','tier','recommendation_score','sources','player_info'],...state.players.sort((a,b)=>a.custom_rank-b.custom_rank).map(p=>[p.pick||'',p.draftedBy||'',p.name,p.team,p.pos,p.custom_rank,fmt(sourceAvg(p)),p.tier,recommendationScore(p),JSON.stringify(p.sources||{}),JSON.stringify(getInfoForPlayer(p)||{})])];const text=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'}));a.download='fantasy-war-room-export.csv';a.click();URL.revokeObjectURL(a.href)}function importAny(file){alert('Use seed-rankings.json/data seed for this Excel-backed build. JSON import is not needed.')} 
// Ranking editor
function setupRankEditor(){renderRankTabs();updateUndoButton()}function openRankEditor(){document.body.classList.add('edit-rank-mode');const v=$('#rankEditorView');if(v){v.hidden=false;renderRankTabs();renderRankEditor();v.scrollIntoView({behavior:'smooth',block:'start'})}}function closeRankEditor(){document.body.classList.remove('edit-rank-mode');const v=$('#rankEditorView');if(v)v.hidden=true;render();refreshBestRecommendation()}function rankRows(){return[...state.players].filter(p=>rankEditor.active==='ALL'||p.pos===rankEditor.active).sort((a,b)=>a.custom_rank-b.custom_rank||a.name.localeCompare(b.name))}function renderRankTabs(){const tabs=$('#rankEditorTabs');if(!tabs)return;tabs.innerHTML=['ALL',...POSITIONS].map(pos=>`<button class="rank-tab ${rankEditor.active===pos?'active':''}" data-pos="${pos}">${pos}</button>`).join('');tabs.querySelectorAll('[data-pos]').forEach(b=>b.onclick=()=>{rankEditor.active=b.dataset.pos;renderRankTabs();renderRankEditor()})}
function renderRankEditor(){const wrap=$('#rankEditorRows');if(!wrap)return;const rows=rankRows();wrap.innerHTML=rows.map(p=>`<div class="rank-editor-row" data-rank-id="${p.id}"><div class="rank-num"><span class="rank-drag">☰</span><span>${p.custom_rank}</span></div><div class="rank-player-name">${esc(p.name)}</div><div class="rank-team">${esc(p.team||'')}</div><div><input class="rank-tier-input" type="number" min="1" value="${p.tier}" data-tier-id="${p.id}"></div><div><button class="note-btn" type="button" data-info-id="${p.id}" title="View notes">📝</button></div></div>`).join('')||'<div class="rank-editor-empty">No players found.</div>';wrap.querySelectorAll('.rank-editor-row').forEach(row=>{row.addEventListener('touchstart',rankTouchStart,{passive:false,capture:true});row.addEventListener('touchmove',rankTouchMove,{passive:false,capture:true});row.addEventListener('touchend',rankTouchEnd,{passive:false,capture:true});row.addEventListener('touchcancel',rankTouchCancel,{passive:false,capture:true});row.addEventListener('pointerdown',rankPointerStart,{capture:true});row.addEventListener('contextmenu',e=>e.preventDefault())});wrap.querySelectorAll('.rank-tier-input').forEach(i=>{i.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});i.addEventListener('pointerdown',e=>e.stopPropagation());i.onchange=rankTierChange});wrap.querySelectorAll('.note-btn').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();showPlayerInfo(btn.dataset.infoId)});updateUndoButton()}
function snapshotRanks(){return state.players.map(p=>({id:p.id,custom_rank:p.custom_rank,tier:p.tier}))}function pushUndo(){rankEditor.undoStack.push(snapshotRanks());if(rankEditor.undoStack.length>20)rankEditor.undoStack.shift();updateUndoButton()}function updateUndoButton(){const b=$('#undoRankChangeBtn');if(b){const has=rankEditor.undoStack.length>0;b.disabled=!has;b.classList.toggle('is-disabled',!has)}}async function undoRankChange(e){if(e){e.preventDefault();e.stopPropagation()}const snap=rankEditor.undoStack.pop();if(!snap){updateUndoButton();return}const map=new Map(snap.map(x=>[x.id,x]));state.players.forEach(p=>{const old=map.get(p.id);if(old){p.custom_rank=old.custom_rank;p.tier=old.tier}});await persistMany();render();renderRankEditor();refreshBestRecommendation();updateUndoButton()}
let dragGhost=null,touchState={};function isInteractive(el){return !!el.closest('input,button,select,textarea,.rank-tab,.rank-editor-actions-top')}function rankTouchStart(e){if(e.touches.length!==1||isInteractive(e.target))return;const row=e.currentTarget,t=e.touches[0];touchState={row,startX:t.clientX,startY:t.clientY,active:false,timer:setTimeout(()=>activateDrag(row,t.clientX,t.clientY),320)};row.classList.add('press-arming')}function rankTouchMove(e){if(!touchState.row)return;const t=e.touches[0],dx=Math.abs(t.clientX-touchState.startX),dy=Math.abs(t.clientY-touchState.startY);if(!touchState.active&&(dx>24||dy>24)){clearTimeout(touchState.timer);touchState.row.classList.remove('press-arming');touchState={};return}if(touchState.active){e.preventDefault();moveDrag(t.clientX,t.clientY)}}function rankTouchEnd(e){clearTimeout(touchState.timer);if(touchState.row)touchState.row.classList.remove('press-arming');if(touchState.active){e.preventDefault();finishDrag()}touchState={}}function rankTouchCancel(){rankTouchEnd({preventDefault(){}})}function rankPointerStart(e){if(('ontouchstart'in window)||isInteractive(e.target))return;if(e.button!==undefined&&e.button!==0)return;const row=e.currentTarget;e.preventDefault();activateDrag(row,e.clientX,e.clientY);const move=ev=>{ev.preventDefault();moveDrag(ev.clientX,ev.clientY)},up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);finishDrag()};document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up,{once:true})}
function activateDrag(row,x,y){if(rankEditor.dragging)return;rankEditor.dragging=true;touchState.active=true;rankEditor.dragId=row.dataset.rankId;pushUndo();if(navigator.vibrate)navigator.vibrate([22]);row.classList.remove('press-arming');row.classList.add('rank-placeholder');document.body.classList.add('rank-dragging');dragGhost=makeGhost(row,x,y);moveGhost(x,y)}function makeGhost(row,x,y){const r=row.getBoundingClientRect(),g=row.cloneNode(true);g.classList.add('rank-drag-ghost');g.style.width=r.width+'px';g.style.left=r.left+'px';g.style.top=r.top+'px';g.dataset.offsetX=x-r.left;g.dataset.offsetY=y-r.top;document.body.appendChild(g);return g}function moveGhost(x,y){if(!dragGhost)return;dragGhost.style.left=(x-Number(dragGhost.dataset.offsetX))+'px';dragGhost.style.top=(y-Number(dragGhost.dataset.offsetY))+'px'}function moveDrag(x,y){moveGhost(x,y);if(y<84)window.scrollBy(0,-18);if(y>window.innerHeight-84)window.scrollBy(0,18);const row=document.querySelector(`.rank-editor-row[data-rank-id="${rankEditor.dragId}"]`);if(!row)return;if(dragGhost)dragGhost.style.display='none';const el=document.elementFromPoint(x,y);if(dragGhost)dragGhost.style.display='';const target=el?.closest?.('.rank-editor-row');if(target&&target!==row&&target.parentNode===row.parentNode){const rect=target.getBoundingClientRect(),before=y<rect.top+rect.height/2;target.parentNode.insertBefore(row,before?target:target.nextSibling)}}async function finishDrag(){const row=document.querySelector(`.rank-editor-row[data-rank-id="${rankEditor.dragId}"]`);if(dragGhost){dragGhost.remove();dragGhost=null}if(row)row.classList.remove('rank-placeholder','press-arming');document.body.classList.remove('rank-dragging');rankEditor.dragging=false;await commitLiveOrder()}async function commitLiveOrder(){const ids=$$('#rankEditorRows .rank-editor-row').map(r=>r.dataset.rankId),vis=rankRows(),slots=vis.map(p=>p.custom_rank).sort((a,b)=>a-b);if(rankEditor.active==='ALL')ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=i+1});else ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=slots[i]});await persistMany();render();renderRankEditor();refreshBestRecommendation()}async function rankTierChange(e){const p=state.players.find(x=>x.id===e.target.dataset.tierId);if(!p)return;pushUndo();p.tier=Number(e.target.value)||p.tier;await persistPlayer(p);render();renderRankEditor();refreshBestRecommendation()}
function selectionGuard(){document.addEventListener('selectstart',e=>{if(!e.target.closest('#search'))e.preventDefault()},true);document.addEventListener('copy',e=>{if(!e.target.closest('#search'))e.preventDefault()},true);document.addEventListener('cut',e=>{if(!e.target.closest('#search'))e.preventDefault()},true);document.addEventListener('contextmenu',e=>{if(!e.target.closest('#search'))e.preventDefault()},true)}
/* v33 Excel seed migration supremacy */
function rowHasExcelInfoV33(p){
  const info=getInfoForPlayer(p);
  return !!(info && info['FantasyPros ECR']!==undefined && info['Key Player Notes & Analysis']);
}
function supabaseNeedsExcelMigrationV33(rows){
  if(!Array.isArray(rows) || rows.length!==SEED_PLAYERS.length)return true;
  const sample=rows.slice(0,8).map(r=>normalizeRows([r])[0]);
  if(sample.some(p=>!rowHasExcelInfoV33(p)))return true;
  const ids=new Set(rows.map(r=>key(r.id||uid(r.name))));
  if(SEED_PLAYERS.some(p=>!ids.has(key(p.id||uid(p.name)))))return true;
  return false;
}
function buildExcelSeedStateV33(existingRows=[]){
  const existing=normalizeRows(existingRows||[]);
  const byId=new Map(existing.map(p=>[key(p.id||uid(p.name)),p]));
  const byName=new Map(existing.map(p=>[key(p.name),p]));
  state.players=SEED_PLAYERS.map(sp=>{
    const old=byId.get(key(sp.id||uid(sp.name)))||byName.get(key(sp.name));
    return {
      ...sp,
      // Excel file is source of truth for base ranking and player info.
      custom_rank: sp.custom_rank,
      tier: sp.tier,
      sources: {...(sp.sources||{})},
      player_info: {...(sp.player_info||{})},
      notes: JSON.stringify(sp.player_info||{}),
      // Keep only live draft state from older Supabase rows.
      drafted: !!old?.drafted,
      draftedBy: old?.draftedBy||'',
      pick: old?.pick??null
    };
  });
  state.activePos=state.activePos||'ALL';
}
async function loadFromSupabase(){
  const {data,error}=await sb.from(TABLE).select('*').order('custom_rank',{ascending:true});
  if(error)throw error;
  if(!data||!data.length){
    buildExcelSeedStateV33([]);
    localSave(false);
    setStatus('Supabase table empty. Excel seed loaded locally. Click Seed Supabase to publish.','warn');
    return;
  }
  if(supabaseNeedsExcelMigrationV33(data)){
    buildExcelSeedStateV33(data);
    await persistMany(state.players,true);
    setStatus('Supabase was migrated to the Excel ranking file and player notes.','ok');
    return;
  }
  state.players=normalizeRows(data);
  hydrateFromSeed();
  localSave(false);
  setStatus('Loaded rankings from Supabase with Excel player notes fallback.','ok');
}
async function loadLocalOrSeed(){
  const saved=localStorage.getItem(STORE_KEY);
  if(saved){
    state=JSON.parse(saved);
    // If local rows are stale, replace ranking base from Excel while preserving draft state.
    if(supabaseNeedsExcelMigrationV33(state.players.map(p=>toDb(p)))){
      buildExcelSeedStateV33(state.players.map(p=>toDb(p)));
    }else{
      hydrateFromSeed();
    }
  }else{
    buildExcelSeedStateV33([]);
  }
  localSave(false);
}
async function seedSupabase(){
  if(!usingSupabase||!sb){alert('Supabase is not connected. Check config.js.');return;}
  buildExcelSeedStateV33(state.players.map(p=>toDb(p)));
  await persistMany(state.players,true);
  render();
  if(!$('#rankEditorView')?.hidden)renderRankEditor();
  refreshBestRecommendation();
  setStatus('Supabase published from the Excel ranking file.','ok');
}
async function refreshSourceRankings(){
  buildExcelSeedStateV33(state.players.map(p=>toDb(p)));
  await persistMany(state.players,true);
  render();
  if(!$('#rankEditorView')?.hidden)renderRankEditor();
  refreshBestRecommendation();
  setStatus('Excel rankings and notes were forced into the site.','ok');
}


/* v34 EXCEL ONLY SOURCE OF TRUTH
   This intentionally ignores old/original Supabase/local seed ranking rows.
   The Excel file is the only source for player list, rank, tier, sources, and notes.
   Supabase is used only to preserve live draft state: drafted, draftedBy, and pick. */
let EXCEL_SEED_V34=[];
let EXCEL_BY_ID_V34=new Map();
let EXCEL_BY_NAME_V34=new Map();
function excelKeyV34(v){return String(v||'').toLowerCase().trim();}
async function loadExcelSeedV34(){
  if(EXCEL_SEED_V34.length)return EXCEL_SEED_V34;
  const data=await (await fetch('excel-seed-v34.json?v=34-' + Date.now())).json();
  EXCEL_SEED_V34=normalizeRows(data.players||[]);
  EXCEL_BY_ID_V34=new Map();EXCEL_BY_NAME_V34=new Map();
  EXCEL_SEED_V34.forEach(p=>{EXCEL_BY_ID_V34.set(excelKeyV34(p.id||uid(p.name)),p);EXCEL_BY_NAME_V34.set(excelKeyV34(p.name),p);});
  return EXCEL_SEED_V34;
}
function excelSeedForV34(p){return EXCEL_BY_ID_V34.get(excelKeyV34(p?.id||uid(p?.name)))||EXCEL_BY_NAME_V34.get(excelKeyV34(p?.name));}
function buildExcelOnlyStateV34(existingRows=[]){
  const existing=normalizeRows(existingRows||[]);
  const byId=new Map(existing.map(p=>[excelKeyV34(p.id||uid(p.name)),p]));
  const byName=new Map(existing.map(p=>[excelKeyV34(p.name),p]));
  state.players=EXCEL_SEED_V34.map(sp=>{
    const old=byId.get(excelKeyV34(sp.id||uid(sp.name)))||byName.get(excelKeyV34(sp.name));
    return {
      ...sp,
      // Excel is source of truth for rank/tier/sources/notes.
      custom_rank: sp.custom_rank,
      tier: sp.tier,
      sources: {...(sp.sources||{})},
      player_info: {...(sp.player_info||{})},
      notes: JSON.stringify(sp.player_info||{}),
      drafted: !!old?.drafted,
      draftedBy: old?.draftedBy||'',
      pick: old?.pick??null
    };
  });
  state.activePos=state.activePos||'ALL';
  localSave(false);
}
function getInfoForPlayer(p){
  const sp=excelSeedForV34(p);
  return {...(sp?.player_info||{})};
}
async function init(){
  bind();
  await loadExcelSeedV34();
  await connect();
  render();
  setupRankEditor();
  refreshBestRecommendation();
  selectionGuard();
}
async function loadLocalOrSeed(){
  // Ignore previous local storage seed/rank rows. Preserve draft state only.
  const saved=localStorage.getItem(STORE_KEY);
  let oldRows=[];
  if(saved){try{oldRows=(JSON.parse(saved).players||[]).map(p=>toDb(p));}catch(e){oldRows=[];}}
  buildExcelOnlyStateV34(oldRows);
}
async function loadSeedRows(){return await loadExcelSeedV34();}
async function loadFromSupabase(){
  const {data,error}=await sb.from(TABLE).select('*').order('custom_rank',{ascending:true});
  if(error)throw error;
  buildExcelOnlyStateV34(data||[]);
  // Push Excel-only source into Supabase immediately if permitted.
  await persistMany(state.players,true);
  setStatus('Loaded ONLY the Excel seed and pushed it to Supabase.','ok');
}
async function seedSupabase(){
  if(!usingSupabase||!sb){alert('Supabase is not connected. Check config.js.');return;}
  buildExcelOnlyStateV34(state.players.map(p=>toDb(p)));
  await persistMany(state.players,true);
  render();
  if(!$('#rankEditorView')?.hidden)renderRankEditor();
  refreshBestRecommendation();
  setStatus('Supabase overwritten with Excel-only rankings, sources, and notes.','ok');
}
async function refreshSourceRankings(){
  buildExcelOnlyStateV34(state.players.map(p=>toDb(p)));
  await persistMany(state.players,true);
  render();
  if(!$('#rankEditorView')?.hidden)renderRankEditor();
  refreshBestRecommendation();
  setStatus('Excel-only rankings, sources, and notes reloaded.','ok');
}
function playerInfoHtml(p){
  const info=getInfoForPlayer(p);
  const rows=[['Consensus Rank',info['Consensus Rank']??p.custom_rank],['Consensus Tier',info['Consensus Tier']??('Tier '+p.tier)],['FantasyPros ECR',info['FantasyPros ECR']??''],['Draft Sharks (3D)',info['Draft Sharks (3D)']??''],['Rotoworld Top 200',info['Rotoworld Top 200']??''],['Avg ADP',info['Avg ADP']??'']];
  const note=info['Key Player Notes & Analysis']||'';
  return `<h2>${esc(p.name)}</h2><div class="player-info-sub"><span class="pos ${p.pos}">${esc(p.pos)}</span> <strong>${esc(p.team||'')}</strong></div><div class="player-info-grid">${rows.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v??'')}</strong></div>`).join('')}</div><div class="player-info-notes"><h3>Key Player Notes & Analysis</h3><p>${esc(note||'No notes loaded from Excel for this player.')}</p></div>`;
}


/* v35 final startup fix */
(function(){
  window.addEventListener('DOMContentLoaded',function(){
    init().catch(function(err){
      console.error('App startup failed',err);
      const status=document.getElementById('syncStatus');
      if(status){status.textContent='Startup failed: '+(err&&err.message?err.message:String(err));status.className='sync-status bad';}
    });
  },{once:true});
})();


/* v36 custom rank and tier persistence
   Excel is still the source for player list, source rankings, and notes.
   User custom_rank and tier edits are now preserved across refreshes. */
const CUSTOM_RANK_OVERRIDES_KEY_V36='fantasy-war-room-custom-rank-overrides-v36';
function hasExcelPlayerInfoV36(row){
  const info=row?.player_info||parseInfo(row?.notes)||{};
  return info && info['FantasyPros ECR']!==undefined && info['Key Player Notes & Analysis']!==undefined;
}
function loadCustomOverridesV36(){
  try{return JSON.parse(localStorage.getItem(CUSTOM_RANK_OVERRIDES_KEY_V36)||'{}');}catch(e){return{};}
}
function saveCustomOverridesV36(){
  const overrides={};
  (state.players||[]).forEach(p=>{
    if(!p||!p.id)return;
    overrides[p.id]={custom_rank:Number(p.custom_rank),tier:Number(p.tier)};
  });
  localStorage.setItem(CUSTOM_RANK_OVERRIDES_KEY_V36,JSON.stringify(overrides));
}
function applyCustomOverridesV36(){
  const overrides=loadCustomOverridesV36();
  (state.players||[]).forEach(p=>{
    const ov=overrides[p.id];
    if(ov){
      if(Number.isFinite(Number(ov.custom_rank)))p.custom_rank=Number(ov.custom_rank);
      if(Number.isFinite(Number(ov.tier)))p.tier=Number(ov.tier);
    }
  });
}
function buildExcelOnlyStateV34(existingRows=[]){
  const existing=normalizeRows(existingRows||[]);
  const byId=new Map(existing.map(p=>[excelKeyV34(p.id||uid(p.name)),p]));
  const byName=new Map(existing.map(p=>[excelKeyV34(p.name),p]));
  state.players=EXCEL_SEED_V34.map(sp=>{
    const old=byId.get(excelKeyV34(sp.id||uid(sp.name)))||byName.get(excelKeyV34(sp.name));
    const oldHasExcel=hasExcelPlayerInfoV36(old);
    return {
      ...sp,
      // Excel remains source for player list, sources, and notes.
      sources:{...(sp.sources||{})},
      player_info:{...(sp.player_info||{})},
      notes:JSON.stringify(sp.player_info||{}),
      // Preserve user-edited custom rank and tier only after rows have been migrated to Excel info.
      custom_rank:oldHasExcel&&Number.isFinite(Number(old.custom_rank))?Number(old.custom_rank):sp.custom_rank,
      tier:oldHasExcel&&Number.isFinite(Number(old.tier))?Number(old.tier):sp.tier,
      // Preserve live draft state.
      drafted:!!old?.drafted,
      draftedBy:old?.draftedBy||'',
      pick:old?.pick??null
    };
  });
  state.activePos=state.activePos||'ALL';
  applyCustomOverridesV36();
  localSave(false);
}
function localSave(stamp=true){
  localStorage.setItem(STORE_KEY,JSON.stringify(state));
  saveCustomOverridesV36();
  if(stamp&&$('#lastSaved'))$('#lastSaved').textContent='Saved '+new Date().toLocaleTimeString();
}
async function persistPlayer(p){
  saveCustomOverridesV36();
  localSave();
  if(!usingSupabase||!sb)return;
  const {error}=await sb.from(TABLE).upsert(toDb(p));
  if(error)setStatus('Supabase save failed: '+error.message,'bad');
}
async function persistMany(players=state.players,show=true){
  saveCustomOverridesV36();
  localSave();
  if(!usingSupabase||!sb)return;
  const {error}=await sb.from(TABLE).upsert(players.map(toDb));
  if(error)setStatus('Supabase bulk save failed: '+error.message,'bad');
  else if(show)setStatus('Saved custom ranks and tiers to Supabase.','ok');
}
function inlineUpdate(inp){
  const p=state.players.find(x=>x.id===inp.dataset.id);
  if(!p)return;
  p[inp.dataset.field]=Number(inp.value);
  saveCustomOverridesV36();
  persistPlayer(p);
  render();
  refreshBestRecommendation();
}
async function rankTierChange(e){
  const p=state.players.find(x=>x.id===e.target.dataset.tierId);
  if(!p)return;
  pushUndo();
  p.tier=Number(e.target.value)||p.tier;
  saveCustomOverridesV36();
  await persistPlayer(p);
  render();
  renderRankEditor();
  refreshBestRecommendation();
}
async function commitLiveOrder(){
  const ids=$$('#rankEditorRows .rank-editor-row').map(r=>r.dataset.rankId),vis=rankRows(),slots=vis.map(p=>p.custom_rank).sort((a,b)=>a-b);
  if(rankEditor.active==='ALL')ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=i+1});
  else ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=slots[i]});
  saveCustomOverridesV36();
  await persistMany();
  render();
  renderRankEditor();
  refreshBestRecommendation();
}
async function undoRankChange(e){
  if(e){e.preventDefault();e.stopPropagation()}
  const snap=rankEditor.undoStack.pop();
  if(!snap){updateUndoButton();return}
  const map=new Map(snap.map(x=>[x.id,x]));
  state.players.forEach(p=>{const old=map.get(p.id);if(old){p.custom_rank=old.custom_rank;p.tier=old.tier}});
  saveCustomOverridesV36();
  await persistMany();
  render();
  renderRankEditor();
  refreshBestRecommendation();
  updateUndoButton();
}
async function seedSupabase(){
  if(!usingSupabase||!sb){alert('Supabase is not connected. Check config.js.');return;}
  // Keep current custom rank and tier overlays while publishing Excel-backed player info.
  buildExcelOnlyStateV34(state.players.map(p=>toDb(p)));
  saveCustomOverridesV36();
  await persistMany(state.players,true);
  render();
  if(!$('#rankEditorView')?.hidden)renderRankEditor();
  refreshBestRecommendation();
  setStatus('Supabase saved with Excel notes plus your custom ranks and tiers.','ok');
}
async function refreshSourceRankings(){
  // Refresh Excel source rankings/notes while keeping your custom rank and tier edits.
  buildExcelOnlyStateV34(state.players.map(p=>toDb(p)));
  saveCustomOverridesV36();
  await persistMany(state.players,true);
  render();
  if(!$('#rankEditorView')?.hidden)renderRankEditor();
  refreshBestRecommendation();
  setStatus('Excel notes refreshed and your custom ranks/tiers were preserved.','ok');
}
