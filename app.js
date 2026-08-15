const STORE_KEY='fantasy-war-room-v43-state';
const AUTH_KEY='fantasy-war-room-auth-mode-v37';
const TABLE=window.SUPABASE_TABLE||'fantasy_players';
const POSITIONS=['QB','RB','WR','TE','K','DST'];
const ADMIN_USER='admin',ADMIN_PASS='tqsd26',GUEST_PASS='password';
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
let state={players:[],activePos:'ALL'},sb=null,usingSupabase=false,currentRecommendation=null,seedPlayers=[];
const rankEditor={active:'ALL',undoStack:[]};
function uid(n){return String(n||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}function key(v){return String(v||'').toLowerCase().trim()}function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}function parseInfo(x){if(!x)return{};if(typeof x==='object')return x;try{return JSON.parse(x)}catch{return{}}}function authMode(){return localStorage.getItem(AUTH_KEY)||''}function isAdmin(){return authMode()==='admin'}function configured(){return window.SUPABASE_URL&&window.SUPABASE_PUBLIC_KEY&&String(window.SUPABASE_URL).startsWith('https://')}
async function init(){bind();await waitForAuth();await loadSeed();await connect();render();setupRankEditor();refreshBestRecommendation();selectionGuard();applyAuthUI()}
function waitForAuth(){if(authMode())return Promise.resolve();showAuthGate();return new Promise(r=>document.addEventListener('auth-ready',r,{once:true}))}
function showAuthGate(){const gate=document.createElement('div');gate.className='auth-gate';gate.innerHTML=`<div class="auth-card"><p class="eyebrow">Fantasy Draft War Room</p><h2>Sign in to access draft board</h2><p class="sub">Admin can edit and save. Guest is read-only.</p><div class="auth-tabs"><button id="authAdminTab" class="active">Admin</button><button id="authGuestTab">Guest</button></div><div id="adminPanel"><label>Username<input id="authUser"></label><label>Password<input id="authPass" type="password"></label><div id="authErr" class="auth-error" hidden>Invalid admin username or password.</div><button id="authLogin" style="width:100%;margin-top:12px">Login as Admin</button></div><div id="guestPanel" hidden><label>Guest Password<input id="guestPass" type="password"></label><div id="guestErr" class="auth-error" hidden>Invalid guest password.</div><button id="guestLogin" style="width:100%;margin-top:12px">Continue as Guest</button></div></div>`;document.body.appendChild(gate);const tab=g=>{document.getElementById('adminPanel').hidden=g;document.getElementById('guestPanel').hidden=!g;document.getElementById('authAdminTab').classList.toggle('active',!g);document.getElementById('authGuestTab').classList.toggle('active',g);setTimeout(()=>document.getElementById(g?'guestPass':'authUser').focus(),20)};$('#authAdminTab').onclick=()=>tab(false);$('#authGuestTab').onclick=()=>tab(true);function ok(){gate.remove();document.dispatchEvent(new CustomEvent('auth-ready'))}function admin(){if($('#authUser').value.trim().toLowerCase()===ADMIN_USER&&$('#authPass').value===ADMIN_PASS){localStorage.setItem(AUTH_KEY,'admin');ok()}else{$('#authErr').hidden=false;$('#authPass').value='';$('#authPass').focus()}}function guest(){if($('#guestPass').value===GUEST_PASS){localStorage.setItem(AUTH_KEY,'guest');ok()}else{$('#guestErr').hidden=false;$('#guestPass').value='';$('#guestPass').focus()}}$('#authLogin').onclick=admin;$('#guestLogin').onclick=guest;$('#authPass').onkeydown=e=>{if(e.key==='Enter')admin()};$('#guestPass').onkeydown=e=>{if(e.key==='Enter')guest()};setTimeout(()=>$('#authUser').focus(),50)}
async function loadSeed(){const r=await fetch('excel-seed-v45.json?v=45').catch(()=>null);const data=r&&r.ok?await r.json():{players:[]};seedPlayers=normalizeRows(data.players||[])}
function normalizeRows(rows){return rows.map(p=>{const info=p.player_info||parseInfo(p.notes);return{id:p.id||uid(p.name),name:p.name,team:p.team||'',pos:p.pos||'RB',custom_rank:Number(p.custom_rank??p.rank??info['Consensus Rank']??999),rank:Number(p.rank??p.custom_rank??info['Consensus Rank']??999),tier:Number(p.tier??99),sources:p.sources||{},player_info:info,notes:p.notes||JSON.stringify(info),drafted:!!p.drafted,draftedBy:p.draftedBy??p.drafted_by??'',pick:p.pick??null}})}function buildState(existing=[]){const old=normalizeRows(existing||[]),byId=new Map(old.map(p=>[p.id,p]));state.players=seedPlayers.map(sp=>{const o=byId.get(sp.id);return{...sp,custom_rank:o?.custom_rank??sp.custom_rank,tier:o?.tier??sp.tier,drafted:!!o?.drafted,draftedBy:o?.draftedBy||'',pick:o?.pick??null}});localSave(false)}async function connect(){try{if(configured()&&window.supabase){sb=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLIC_KEY);usingSupabase=true;const {data,error}=await sb.from(TABLE).select('*').order('custom_rank',{ascending:true});if(error)throw error;buildState(data||[]);if(isAdmin())await persistMany(state.players,false);setStatus('Connected to Supabase.','ok')}else{const saved=localStorage.getItem(STORE_KEY);if(saved)buildState(JSON.parse(saved).players||[]);else buildState([]);setStatus('Supabase not connected. Local save only.','warn')}}catch(e){const saved=localStorage.getItem(STORE_KEY);if(saved)buildState(JSON.parse(saved).players||[]);else buildState([]);setStatus('Supabase connection failed: '+(e.message||e),'bad')}}function toDb(p){return{id:p.id,name:p.name,team:p.team,pos:p.pos,custom_rank:p.custom_rank,tier:p.tier,sources:p.sources,notes:JSON.stringify(p.player_info||{}),drafted:!!p.drafted,drafted_by:p.draftedBy||'',pick:p.pick||null,updated_at:new Date().toISOString()}}function localSave(stamp=true){localStorage.setItem(STORE_KEY,JSON.stringify(state));if(stamp&&$('#lastSaved'))$('#lastSaved').textContent='Saved '+new Date().toLocaleTimeString()}function assertAdmin(){if(isAdmin())return true;setStatus('Guest mode is read-only. Login as admin to save changes.','warn');return false}async function persistPlayer(p){if(!assertAdmin())return;localSave();if(usingSupabase&&sb){const {error}=await sb.from(TABLE).upsert(toDb(p));if(error)setStatus('Supabase save failed: '+error.message,'bad')}}async function persistMany(players=state.players,show=true){if(!assertAdmin())return;localSave();if(usingSupabase&&sb){const {error}=await sb.from(TABLE).upsert(players.map(toDb));if(error)setStatus('Supabase save failed: '+error.message,'bad');else if(show)setStatus('Saved to Supabase.','ok')}}function bind(){['search','statusFilter','sortBy'].forEach(id=>$('#'+id)?.addEventListener('input',()=>{render();refreshBestRecommendation()}));$('#bestBtn').onclick=refreshBestRecommendation;$('#chooseRecommendedBtn').onclick=draftRecommended;$('#editRanksBtn').onclick=openRankEditor;$('#backToDraftBtn').onclick=closeRankEditor;$('#undoRankChangeBtn').onclick=undoRankChange;$('#resetDraftBtn').onclick=resetAllDraft;$('#seedSupabaseBtn').onclick=()=>persistMany(state.players,true);$('#refreshSourcesBtn').onclick=()=>{buildState(state.players.map(toDb));persistMany(state.players,true);render();renderRankEditor()};$('#sleeperPicksBtn').onclick=showSleeperPicks;$('#exportCsvBtn').onclick=exportCsv;$('#printPdfBtn').onclick=()=>window.print();$('#importAny').onchange=e=>importAny(e.target.files[0]);$('#cancelEdit').onclick=()=>$('#editDialog').close();$('#editForm').onsubmit=saveEdit;$('#closePlayerInfoBtn').onclick=()=>$('#playerInfoDialog').close();$('#closeSleeperBtn').onclick=()=>$('#sleeperDialog').close();$('#rankSearch').addEventListener('input',rankSearchInput);$('#rankSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const b=$('#rankSuggestions [data-jump-id]');if(b)jumpToRankPlayer(b.dataset.jumpId)}})}function setStatus(m,c='ok'){const e=$('#syncStatus');if(e){e.textContent=m;e.className='sync-status '+c}}function applyAuthUI(){document.body.classList.toggle('guest-mode',!isAdmin());let w=$('#authStatus');if(!w){w=document.createElement('div');w.id='authStatus';w.className='auth-status';$('.top-actions').appendChild(w)}w.innerHTML=isAdmin()?'<span class="auth-chip admin">Admin</span><button id="logoutBtn">Logout</button>':'<span class="auth-chip guest">Guest View</span><button id="logoutBtn">Login</button>';$('#logoutBtn').onclick=()=>{localStorage.removeItem(AUTH_KEY);location.reload()};['editRanksBtn','resetDraftBtn','seedSupabaseBtn','refreshSourcesBtn'].forEach(id=>{const e=$('#'+id);if(e)e.hidden=!isAdmin()});$$('.file-btn').forEach(e=>e.hidden=!isAdmin())}
function sourceAvg(p){const v=Object.values(p.sources||{}).map(Number).filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:p.custom_rank}function fmt(n){return Number.isInteger(Number(n))?Number(n):Number(n||0).toFixed(1)}function availablePlayers(){return state.players.filter(p=>!p.drafted)}function currentPick(){return state.players.filter(p=>p.drafted).length+1}function myTeam(){return state.players.filter(p=>p.draftedBy==='Me')}function teamCounts(){return myTeam().reduce((a,p)=>{a[p.pos]=(a[p.pos]||0)+1;return a},{})}function posRank(p){const s=state.players.filter(x=>x.pos===p.pos).sort((a,b)=>a.custom_rank-b.custom_rank);return p.pos+(s.findIndex(x=>x.id===p.id)+1)}function recommendationScore(p){const c=teamCounts();let s=1000-p.custom_rank*5+Math.max(0,90-p.tier*8);if(p.pos==='RB'&&(c.RB||0)<3)s+=50;if(p.pos==='WR'&&(c.WR||0)<4)s+=42;if(p.pos==='TE'&&(c.TE||0)<1)s+=25;if(p.pos==='QB'&&(c.QB||0)<1&&currentPick()>45)s+=20;if(['K','DST'].includes(p.pos)&&currentPick()<105)s-=90;return Math.round(s)}function bestAvailable(){return availablePlayers().sort((a,b)=>recommendationScore(b)-recommendationScore(a)||a.custom_rank-b.custom_rank)[0]||null}function infoFor(p){return p.player_info||parseInfo(p.notes)}function getFiltered(){let a=[...state.players],q=key($('#search').value);if(state.activePos!=='ALL')a=a.filter(p=>p.pos===state.activePos);if(q)a=a.filter(p=>key(p.name+' '+p.team+' '+p.pos).includes(q));const st=$('#statusFilter').value;if(st==='available')a=a.filter(p=>!p.drafted);if(st==='mine')a=a.filter(p=>p.draftedBy==='Me');if(st==='drafted')a=a.filter(p=>p.drafted);const s=$('#sortBy').value;a.sort((x,y)=>s==='recommendation'?recommendationScore(y)-recommendationScore(x)||x.custom_rank-y.custom_rank:s==='tier'?x.tier-y.tier||x.custom_rank-y.custom_rank:s==='adp'?sourceAvg(x)-sourceAvg(y):s==='pos'?x.pos.localeCompare(y.pos)||x.custom_rank-y.custom_rank:x.custom_rank-y.custom_rank);return a}
function render(){renderChips();renderScarcity();const tb=$('#board tbody');tb.innerHTML='';for(const p of getFiltered()){const tr=document.createElement('tr'),ro=isAdmin()?'':'disabled readonly';tr.className=p.drafted?'drafted-row':'';tr.innerHTML=`<td data-label="Player"><div class="compact-player-line"><span class="player-name">${esc(p.name)}</span><span class="pos ${p.pos}">${posRank(p)}</span><span class="compact-team">${esc(p.team)}</span><button class="tile-note-btn" data-info-id="${p.id}">📝</button></div><div class="meta">${p.drafted?p.draftedBy==='Me'?'On my team':'Drafted by other':'Available'}</div><div class="mobile-metrics"><div class="metric-pill"><span>Rank</span><strong>${p.custom_rank}</strong></div><div class="metric-pill"><span>Tier</span><strong>${p.tier}</strong></div><div class="metric-pill"><span>Cons</span><strong>${fmt(sourceAvg(p))}</strong></div><div class="metric-pill"><span>Score</span><strong>${recommendationScore(p)}</strong></div></div></td><td data-label="Custom Ranking"><input class="rank-input" type="number" value="${p.custom_rank}" data-field="custom_rank" data-id="${p.id}" ${ro}></td><td data-label="Tier"><input class="tier-input" type="number" value="${p.tier}" data-field="tier" data-id="${p.id}" ${ro}></td><td data-label="Consensus"><strong>${fmt(sourceAvg(p))}</strong></td><td data-label="Score"><span class="score-pill">${recommendationScore(p)}</span></td><td data-label="Action">${isAdmin()?`<div class="actions"><button class="mine" data-act="mine" data-id="${p.id}">Mine</button><button class="gone" data-act="gone" data-id="${p.id}">Gone</button><button class="edit" data-act="edit" data-id="${p.id}">Edit</button></div>`:'<span class="guest-readonly">View only</span>'}</td>`;tb.appendChild(tr)}$$('.tile-note-btn').forEach(b=>b.onclick=()=>showPlayerInfo(b.dataset.infoId));if(isAdmin()){$$('.actions button').forEach(b=>b.onclick=()=>act(b.dataset.act,b.dataset.id));$$('.rank-input,.tier-input').forEach(i=>i.onchange=()=>inlineUpdate(i))}renderSidebars();applyAuthUI()}function renderChips(){const w=$('#positionChips');w.innerHTML='';['ALL',...POSITIONS].forEach(pos=>{const b=document.createElement('button');b.className='chip '+(state.activePos===pos?'active':'');b.textContent=pos;b.onclick=()=>{state.activePos=pos;localSave(false);render();refreshBestRecommendation()};w.appendChild(b)})}function renderScarcity(){const c=teamCounts();$('#rosterBuild').innerHTML=`QB ${c.QB||0} | RB ${c.RB||0} | WR ${c.WR||0} | TE ${c.TE||0} | K ${c.K||0} | DST ${c.DST||0}`;$('#scarcityGrid').innerHTML=POSITIONS.map(pos=>`<div class="scarcity-tile"><div class="scarcity-pos ${pos}">${pos}</div><div class="scarcity-total">${availablePlayers().filter(p=>p.pos===pos).length}</div><div class="scarcity-tiers">Available</div></div>`).join('')}function renderSidebars(){const mine=myTeam().sort((a,b)=>(a.pick||999)-(b.pick||999)),d=state.players.filter(p=>p.drafted).sort((a,b)=>(a.pick||999)-(b.pick||999));$('#myTeam').innerHTML=mine.map(p=>`<li><strong>${esc(p.name)}</strong> <span class="meta">${p.pos} ${p.team}</span></li>`).join('')||'<li class="meta">No picks yet</li>';$('#liveDraftBoard').innerHTML=d.map(p=>`<li><span class="pick-num">${p.pick||''}</span> ${esc(p.name)} <span class="meta">${p.draftedBy}</span></li>`).join('')||'<li class="meta">No picks yet</li>';$('#draftedLog').innerHTML=d.slice(-24).reverse().map(p=>`<li>${esc(p.name)} <span class="meta">${p.draftedBy}</span></li>`).join('')||'<li class="meta">No drafted players yet</li>';$('#availableCount').textContent=availablePlayers().length;$('#myCount').textContent=mine.length;$('#draftedCount').textContent=d.length}
function showPlayerInfo(id){const p=state.players.find(x=>x.id===id),i=infoFor(p);if(!p)return;const rows=['Consensus Rank','Consensus Tier','FantasyPros ECR','Draft Sharks (3D)','Rotoworld Top 200','Avg ADP'];$('#playerInfoContent').innerHTML=`<h2>${esc(p.name)}</h2><div class="player-info-sub"><span class="pos ${p.pos}">${p.pos}</span> <strong>${esc(p.team)}</strong></div><div class="player-info-grid">${rows.map(k=>`<div><span>${k}</span><strong>${esc(i[k]??'')}</strong></div>`).join('')}</div><div class="player-info-notes"><h3>Key Player Notes & Analysis</h3><p>${esc(i['Key Player Notes & Analysis']||'No notes loaded.')}</p></div>`;$('#playerInfoDialog').showModal()}function inlineUpdate(inp){if(!assertAdmin())return;const p=state.players.find(x=>x.id===inp.dataset.id);p[inp.dataset.field]=Number(inp.value);persistPlayer(p);render();refreshBestRecommendation()}function nextPick(){return Math.max(0,...state.players.map(p=>p.pick||0))+1}function act(a,id){if(!assertAdmin())return;const p=state.players.find(x=>x.id===id);if(a==='mine'){p.drafted=true;p.draftedBy='Me';p.pick=nextPick()}if(a==='gone'){p.drafted=true;p.draftedBy='Other';p.pick=nextPick()}if(a==='edit')return openEdit(p);persistPlayer(p);render();refreshBestRecommendation()}function openEdit(p){$('#editId').value=p.id;$('#editName').value=p.name;$('#editTeam').value=p.team;$('#editPos').value=p.pos;$('#editRank').value=p.custom_rank;$('#editTier').value=p.tier;$('#editDialog').showModal()}function saveEdit(e){e.preventDefault();if(!assertAdmin())return;const p=state.players.find(x=>x.id===$('#editId').value);Object.assign(p,{name:$('#editName').value,team:$('#editTeam').value,pos:$('#editPos').value,custom_rank:+$('#editRank').value,tier:+$('#editTier').value});persistPlayer(p);$('#editDialog').close();render();renderRankEditor();refreshBestRecommendation()}async function resetAllDraft(){if(!assertAdmin())return;if(!confirm('Reset entire draft board?'))return;state.players.forEach(p=>{p.drafted=false;p.draftedBy='';p.pick=null});await persistMany();render();refreshBestRecommendation()}function refreshBestRecommendation(){const p=bestAvailable();currentRecommendation=p;if(!p){$('#recommendationBox').textContent='No available players left.';$('#chooseRecommendedBtn').hidden=true;return}$('#recommendationBox').innerHTML=`<div class="recommendation-main">${esc(p.name)} <span class="pos ${p.pos}">${p.pos}</span></div><div class="recommendation-meta">${p.team} | Custom ${p.custom_rank} | Consensus ${fmt(sourceAvg(p))} | Tier ${p.tier} | Score ${recommendationScore(p)}</div><div class="recommendation-reason">Best combined value by ranking, tier, roster need, and scarcity.</div>`;$('#chooseRecommendedBtn').hidden=false}function draftRecommended(){if(currentRecommendation)act('mine',currentRecommendation.id)}
function setupRankEditor(){renderRankTabs();renderRankEditor()}function openRankEditor(){if(!assertAdmin())return;$('#rankEditorView').hidden=false;renderRankTabs();renderRankEditor();$('#rankEditorView').scrollIntoView({behavior:'smooth'})}function closeRankEditor(){$('#rankEditorView').hidden=true;render()}function renderRankTabs(){const w=$('#rankEditorTabs');w.innerHTML='';['ALL',...POSITIONS].forEach(pos=>{const b=document.createElement('button');b.className='rank-tab '+(rankEditor.active===pos?'active':'');b.textContent=pos;b.onclick=()=>{rankEditor.active=pos;renderRankTabs();renderRankEditor()};w.appendChild(b)})}function rankRows(){return state.players.filter(p=>rankEditor.active==='ALL'||p.pos===rankEditor.active).sort((a,b)=>a.custom_rank-b.custom_rank)}function renderRankEditor(){const w=$('#rankEditorRows');w.innerHTML=rankRows().map(p=>`<div class="rank-editor-row" data-rank-id="${p.id}"><div class="rank-num"><span class="rank-drag">☰</span>${p.custom_rank}</div><div class="rank-player-name">${esc(p.name)}</div><div class="rank-team">${esc(p.team)}</div><div><input class="rank-tier-input" value="${p.tier}" type="number" data-tier-id="${p.id}"></div><div><button class="note-btn" data-info-id="${p.id}">📝</button><button class="sleep-add-btn ${isManualSleeper(p.id)?'active':''}" data-sleep-id="${p.id}">${isManualSleeper(p.id)?'⭐':'☆'}</button></div></div>`).join('');$$('.rank-tier-input').forEach(i=>i.onchange=()=>{const p=state.players.find(x=>x.id===i.dataset.tierId);p.tier=Number(i.value);persistPlayer(p);render();renderRankEditor();refreshBestRecommendation()});$$('.note-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();showPlayerInfo(b.dataset.infoId)});$$('.sleep-add-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();toggleManualSleeper(b.dataset.sleepId)})}
async function undoRankChange(){}function rankSearchInput(){const q=key($('#rankSearch').value),box=$('#rankSuggestions');if(!q){box.hidden=true;box.innerHTML='';return}const m=state.players.filter(p=>key(p.name).includes(q)||key(p.team).includes(q)||key(p.pos).includes(q)).sort((a,b)=>(key(a.name).startsWith(q)?0:1)-(key(b.name).startsWith(q)?0:1)||a.custom_rank-b.custom_rank).slice(0,8);box.innerHTML=m.map(p=>`<button data-jump-id="${p.id}"><b>${esc(p.name)}</b><span>${p.pos} ${p.team} · Rank ${p.custom_rank}</span></button>`).join('')||'<div class="meta" style="padding:10px">No player found</div>';box.hidden=false;$$('#rankSuggestions [data-jump-id]').forEach(b=>b.onclick=()=>jumpToRankPlayer(b.dataset.jumpId))}function jumpToRankPlayer(id){rankEditor.active='ALL';renderRankTabs();renderRankEditor();setTimeout(()=>{const row=$(`#rankEditorRows .rank-editor-row[data-rank-id="${CSS.escape(id)}"]`);if(row){row.scrollIntoView({behavior:'smooth',block:'center'});row.classList.add('rank-jump-highlight');setTimeout(()=>row.classList.remove('rank-jump-highlight'),2200)}$('#rankSuggestions').hidden=true},80)}function manualSleepers(){try{return JSON.parse(localStorage.getItem('manual-sleepers-v43')||'{}')}catch{return{}}}function isManualSleeper(id){return !!manualSleepers()[id]}function toggleManualSleeper(id){if(!assertAdmin())return;const p=state.players.find(x=>x.id===id),o=manualSleepers();if(o[id])delete o[id];else o[id]={id:p.id,name:p.name,pos:p.pos,team:p.team};localStorage.setItem('manual-sleepers-v43',JSON.stringify(o));renderRankEditor();setStatus(o[id]?`${p.name} added to Sleeper Picks.`:`${p.name} removed from Sleeper Picks.`,'ok')}async function showSleeperPicks(){let meta={};try{meta=await(await fetch('v45-sleepers.json?v=45')).json()}catch{}const excel=new Set((meta.excelSleeperNames||[]).map(key)),add=new Set((meta.copilotSleeperNames||[]).map(key)),manual=manualSleepers();const rows=state.players.filter(p=>!p.drafted).map(p=>{const i=infoFor(p);let s='';if(manual[p.id])s='Manual Sleeper';else if(excel.has(key(p.name)))s='Excel Sleeper Tab';else if(add.has(key(p.name)))s='Added Sleeper';else if(p.custom_rank>=50&&p.custom_rank<=110&&!['K','DST'].includes(p.pos)&&/rookie|breakout|handcuff|upside|late flier|ppr|slot|goal-line|target/i.test(i['Key Player Notes & Analysis']||''))s='Added Sleeper';return s?{p,i,s}:null}).filter(Boolean).sort((a,b)=>a.p.custom_rank-b.p.custom_rank);$('#sleeperContent').innerHTML=`<h2>Remaining Sleeper Picks</h2><p class="sub">Excel sleeper tab, added sleepers, and manual stars. Drafted players hidden.</p><div class="sleeper-list">${rows.map(({p,i,s})=>`<div class="sleeper-row"><div class="sleeper-main"><b>${esc(p.name)}</b><span class="pos ${p.pos}">${p.pos}</span><span>${p.team}</span></div><div class="sleeper-meta"><span>Rank ${p.custom_rank}</span><span>Tier ${p.tier}</span><span>${s}</span></div><p>${esc(i['Key Player Notes & Analysis']||'Added sleeper pick.')}</p></div>`).join('')||'<div class="sleeper-row">No remaining sleepers.</div>'}</div>`;$('#sleeperDialog').showModal()}function exportCsv(){const r=[['pick','drafted_by','name','team','pos','custom_rank','tier'],...state.players.map(p=>[p.pick||'',p.draftedBy||'',p.name,p.team,p.pos,p.custom_rank,p.tier])];const t=r.map(x=>x.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/csv'}));a.download='fantasy-war-room-export.csv';a.click();URL.revokeObjectURL(a.href)}function importAny(file){if(!assertAdmin()||!file)return;setStatus('Import skipped in this build. Use Supabase/seed refresh for shared data.','warn')}function selectionGuard(){document.addEventListener('selectstart',e=>{if(!e.target.closest('#search,#rankSearch,input,textarea'))e.preventDefault()},true)}document.addEventListener('DOMContentLoaded',()=>init().catch(e=>{console.error(e);setStatus('Startup failed: '+(e.message||e),'bad')}));


/* v44 fixed rank drag and sleeper stars */
const BASE_SLEEPER_NAMES_V44 = new Set([
  'ashton jeanty','omarion hampton','tetairoa mcmillan','emeka egbuka','cam skattebo','caleb williams','jaxson dart','quinn ewers',
  'luther burden iii','ladd mcconkey','tucker kraft','dalton kincaid','isaiah likely','trey benson','zach charbonnet','blake corum','jaylen warren','christian watson','josh downs','parker washington','bucky irving','ray davis','rico dowdle'
]);
function isSleeperV44(p){
  const i=infoFor(p)||{};
  if(isManualSleeper(p.id))return true;
  if(BASE_SLEEPER_NAMES_V44.has(key(p.name)))return true;
  if(p.custom_rank>=50&&p.custom_rank<=110&&!['K','DST'].includes(p.pos)&&/rookie|breakout|handcuff|upside|late flier|ppr|slot|goal-line|target/i.test(i['Key Player Notes & Analysis']||''))return true;
  return false;
}
function sleeperStarButtonV44(p, extraClass=''){
  const active=isSleeperV44(p);
  return `<button class="sleep-add-btn sleeper-star-v44 ${active?'active':''} ${extraClass}" type="button" data-sleep-id="${p.id}" title="${active?'Sleeper pick':'Add to Sleeper Picks'}">★</button>`;
}
function attachSleeperStarHandlersV44(){
  $$('.sleep-add-btn[data-sleep-id]').forEach(b=>{
    b.onclick=e=>{e.preventDefault();e.stopPropagation();toggleManualSleeper(b.dataset.sleepId)};
  });
}
function pushUndo(){
  rankEditor.undoStack.push(state.players.map(p=>({id:p.id,custom_rank:p.custom_rank,tier:p.tier})));
  if(rankEditor.undoStack.length>20)rankEditor.undoStack.shift();
  const b=$('#undoRankChangeBtn'); if(b)b.disabled=rankEditor.undoStack.length===0;
}
async function undoRankChange(){
  if(!assertAdmin())return;
  const snap=rankEditor.undoStack.pop();
  if(!snap){const b=$('#undoRankChangeBtn'); if(b)b.disabled=true; return;}
  const map=new Map(snap.map(x=>[x.id,x]));
  state.players.forEach(p=>{const old=map.get(p.id); if(old){p.custom_rank=old.custom_rank; p.tier=old.tier;}});
  await persistMany(state.players,true);
  render(); renderRankEditor(); refreshBestRecommendation();
  const b=$('#undoRankChangeBtn'); if(b)b.disabled=rankEditor.undoStack.length===0;
}
function render(){
  renderChips();renderScarcity();
  const tb=$('#board tbody'); if(!tb)return; tb.innerHTML='';
  for(const p of getFiltered()){
    const tr=document.createElement('tr'),ro=isAdmin()?'':'disabled readonly';
    tr.className=p.drafted?'drafted-row':'';
    tr.innerHTML=`<td data-label="Player"><div class="compact-player-line"><span class="player-name">${esc(p.name)}</span><span class="pos ${p.pos}">${posRank(p)}</span><span class="compact-team">${esc(p.team)}</span><span class="board-icon-group-v44"><button class="tile-note-btn" type="button" data-info-id="${p.id}" title="View player notes">📝</button>${sleeperStarButtonV44(p,'board-sleeper-star-v44')}</span></div><div class="meta">${p.drafted?p.draftedBy==='Me'?'On my team':'Drafted by other':'Available'}</div><div class="mobile-metrics"><div class="metric-pill"><span>Rank</span><strong>${p.custom_rank}</strong></div><div class="metric-pill"><span>Tier</span><strong>${p.tier}</strong></div><div class="metric-pill"><span>Cons</span><strong>${fmt(sourceAvg(p))}</strong></div><div class="metric-pill"><span>Score</span><strong>${recommendationScore(p)}</strong></div></div></td><td data-label="Custom Ranking"><input class="rank-input" type="number" value="${p.custom_rank}" data-field="custom_rank" data-id="${p.id}" ${ro}></td><td data-label="Tier"><input class="tier-input" type="number" value="${p.tier}" data-field="tier" data-id="${p.id}" ${ro}></td><td data-label="Consensus"><strong>${fmt(sourceAvg(p))}</strong></td><td data-label="Score"><span class="score-pill">${recommendationScore(p)}</span></td><td data-label="Action">${isAdmin()?`<div class="actions"><button class="mine" data-act="mine" data-id="${p.id}">Mine</button><button class="gone" data-act="gone" data-id="${p.id}">Gone</button><button class="edit" data-act="edit" data-id="${p.id}">Edit</button></div>`:'<span class="guest-readonly">View only</span>'}</td>`;
    tb.appendChild(tr);
  }
  $$('.tile-note-btn').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();showPlayerInfo(b.dataset.infoId)});
  attachSleeperStarHandlersV44();
  if(isAdmin()){
    $$('.actions button').forEach(b=>b.onclick=()=>act(b.dataset.act,b.dataset.id));
    $$('.rank-input,.tier-input').forEach(i=>i.onchange=()=>inlineUpdate(i));
  }
  renderSidebars();applyAuthUI();
}
let rankDragGhostV44=null;
function renderRankEditor(){
  const w=$('#rankEditorRows'); if(!w)return;
  w.innerHTML=rankRows().map(p=>`<div class="rank-editor-row" data-rank-id="${p.id}"><div class="rank-num"><span class="rank-drag">☰</span>${p.custom_rank}</div><div class="rank-player-name">${esc(p.name)}</div><div class="rank-team">${esc(p.team)}</div><div><input class="rank-tier-input" value="${p.tier}" type="number" data-tier-id="${p.id}"></div><div class="rank-note-star-group-v44"><button class="note-btn" type="button" data-info-id="${p.id}" title="View notes">📝</button>${sleeperStarButtonV44(p,'rank-sleeper-star-v44')}</div></div>`).join('');
  $$('#rankEditorRows .rank-editor-row').forEach(r=>{r.addEventListener('pointerdown',rankPointerStartV44)});
  $$('.rank-tier-input').forEach(i=>i.onchange=()=>{if(!assertAdmin())return;pushUndo();const p=state.players.find(x=>x.id===i.dataset.tierId);p.tier=Number(i.value);persistPlayer(p);render();renderRankEditor();refreshBestRecommendation()});
  $$('.note-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();showPlayerInfo(b.dataset.infoId)});
  attachSleeperStarHandlersV44();
  const ub=$('#undoRankChangeBtn'); if(ub)ub.disabled=rankEditor.undoStack.length===0;
}
function rankPointerStartV44(e){
  if(!isAdmin())return;
  if(e.button!==undefined&&e.button!==0)return;
  if(e.target.closest('input,button,select,textarea,.rank-tab,.rank-search-wrap'))return;
  const row=e.currentTarget;
  e.preventDefault();
  pushUndo();
  row.classList.add('rank-placeholder');
  document.body.classList.add('rank-dragging');
  const rect=row.getBoundingClientRect();
  rankDragGhostV44=row.cloneNode(true);
  rankDragGhostV44.classList.add('rank-drag-ghost');
  rankDragGhostV44.style.width=rect.width+'px';
  rankDragGhostV44.dataset.offsetX=e.clientX-rect.left;
  rankDragGhostV44.dataset.offsetY=e.clientY-rect.top;
  document.body.appendChild(rankDragGhostV44);
  moveRankGhostV44(e.clientX,e.clientY);
  const move=ev=>{
    ev.preventDefault();
    moveRankGhostV44(ev.clientX,ev.clientY);
    const ghost=rankDragGhostV44; if(ghost)ghost.style.display='none';
    const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('.rank-editor-row');
    if(ghost)ghost.style.display='';
    if(target&&target!==row&&target.parentNode===row.parentNode){
      const r=target.getBoundingClientRect();
      target.parentNode.insertBefore(row,ev.clientY<r.top+r.height/2?target:target.nextSibling);
    }
    if(ev.clientY<85)window.scrollBy(0,-16);
    if(ev.clientY>window.innerHeight-85)window.scrollBy(0,16);
  };
  const up=async()=>{
    document.removeEventListener('pointermove',move);
    document.removeEventListener('pointerup',up);
    if(rankDragGhostV44){rankDragGhostV44.remove(); rankDragGhostV44=null;}
    row.classList.remove('rank-placeholder');
    document.body.classList.remove('rank-dragging');
    await commitLiveOrderV44();
  };
  document.addEventListener('pointermove',move,{passive:false});
  document.addEventListener('pointerup',up,{once:true});
}
function moveRankGhostV44(x,y){if(rankDragGhostV44){rankDragGhostV44.style.left=(x-Number(rankDragGhostV44.dataset.offsetX))+'px';rankDragGhostV44.style.top=(y-Number(rankDragGhostV44.dataset.offsetY))+'px';}}
async function commitLiveOrderV44(){
  const ids=$$('#rankEditorRows .rank-editor-row').map(r=>r.dataset.rankId);
  const slots=rankRows().map(p=>p.custom_rank).sort((a,b)=>a-b);
  if(rankEditor.active==='ALL')ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=i+1;});
  else ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=slots[i];});
  await persistMany(state.players,true);
  render(); renderRankEditor(); refreshBestRecommendation();
  setStatus('Custom ranking order saved.','ok');
}


/* v45 iPhone rank drag and full-width board */
let rankDragGhostV45=null;
let touchRankDragV45={timer:null,row:null,startX:0,startY:0,active:false};
function isRankDragHandleV45(el){return !!el.closest('.rank-drag');}
function renderRankEditor(){
  const w=$('#rankEditorRows'); if(!w)return;
  w.innerHTML=rankRows().map(p=>`<div class="rank-editor-row" data-rank-id="${p.id}"><div class="rank-num"><span class="rank-drag" title="Drag to reorder">☰</span>${p.custom_rank}</div><div class="rank-player-name">${esc(p.name)}</div><div class="rank-team">${esc(p.team)}</div><div><input class="rank-tier-input" value="${p.tier}" type="number" data-tier-id="${p.id}"></div><div class="rank-note-star-group-v44"><button class="note-btn" type="button" data-info-id="${p.id}" title="View notes">📝</button>${sleeperStarButtonV44(p,'rank-sleeper-star-v44')}</div></div>`).join('');
  $$('#rankEditorRows .rank-editor-row').forEach(row=>{
    row.addEventListener('pointerdown',rankPointerStartV45,{capture:true});
    row.addEventListener('touchstart',rankTouchStartV45,{passive:false,capture:true});
    row.addEventListener('touchmove',rankTouchMoveV45,{passive:false,capture:true});
    row.addEventListener('touchend',rankTouchEndV45,{passive:false,capture:true});
    row.addEventListener('touchcancel',rankTouchCancelV45,{passive:false,capture:true});
  });
  $$('.rank-tier-input').forEach(i=>{
    i.onchange=()=>{if(!assertAdmin())return;pushUndo();const p=state.players.find(x=>x.id===i.dataset.tierId);p.tier=Number(i.value);persistPlayer(p);render();renderRankEditor();refreshBestRecommendation()};
    i.addEventListener('pointerdown',e=>e.stopPropagation());
    i.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
  });
  $$('.note-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();showPlayerInfo(b.dataset.infoId)});
  attachSleeperStarHandlersV44();
  const ub=$('#undoRankChangeBtn'); if(ub)ub.disabled=rankEditor.undoStack.length===0;
}
function rankPointerStartV45(e){
  if(('ontouchstart' in window))return;
  if(!isAdmin())return;
  if(e.button!==undefined&&e.button!==0)return;
  if(e.target.closest('input,button,select,textarea,.rank-tab,.rank-search-wrap'))return;
  if(!isRankDragHandleV45(e.target) && !e.currentTarget.classList.contains('rank-editor-row'))return;
  e.preventDefault();
  beginRankDragV45(e.currentTarget,e.clientX,e.clientY);
  const move=ev=>{ev.preventDefault();moveRankDragV45(ev.clientX,ev.clientY)};
  const up=async()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);await finishRankDragV45()};
  document.addEventListener('pointermove',move,{passive:false});
  document.addEventListener('pointerup',up,{once:true});
}
function rankTouchStartV45(e){
  if(!isAdmin())return;
  if(e.touches.length!==1)return;
  if(e.target.closest('input,button,select,textarea,.rank-tab,.rank-search-wrap'))return;
  if(!isRankDragHandleV45(e.target))return;
  const t=e.touches[0],row=e.currentTarget;
  touchRankDragV45={timer:null,row,startX:t.clientX,startY:t.clientY,active:false};
  row.classList.add('press-arming');
  touchRankDragV45.timer=setTimeout(()=>{
    touchRankDragV45.active=true;
    beginRankDragV45(row,t.clientX,t.clientY);
    if(navigator.vibrate)navigator.vibrate([18]);
  },210);
}
function rankTouchMoveV45(e){
  if(!touchRankDragV45.row)return;
  const t=e.touches[0];
  const dx=Math.abs(t.clientX-touchRankDragV45.startX),dy=Math.abs(t.clientY-touchRankDragV45.startY);
  if(!touchRankDragV45.active && (dx>12||dy>12)){
    clearTimeout(touchRankDragV45.timer);
    touchRankDragV45.row.classList.remove('press-arming');
    touchRankDragV45={timer:null,row:null,startX:0,startY:0,active:false};
    return;
  }
  if(touchRankDragV45.active){
    e.preventDefault();
    moveRankDragV45(t.clientX,t.clientY);
  }
}
async function rankTouchEndV45(e){
  if(!touchRankDragV45.row)return;
  clearTimeout(touchRankDragV45.timer);
  touchRankDragV45.row.classList.remove('press-arming');
  if(touchRankDragV45.active){
    e.preventDefault();
    await finishRankDragV45();
  }
  touchRankDragV45={timer:null,row:null,startX:0,startY:0,active:false};
}
function rankTouchCancelV45(e){rankTouchEndV45(e)}
function beginRankDragV45(row,x,y){
  if(rankDragGhostV45)return;
  pushUndo();
  rankEditor.dragId=row.dataset.rankId;
  row.classList.add('rank-placeholder');
  document.body.classList.add('rank-dragging');
  const r=row.getBoundingClientRect();
  rankDragGhostV45=row.cloneNode(true);
  rankDragGhostV45.classList.add('rank-drag-ghost');
  rankDragGhostV45.style.width=r.width+'px';
  rankDragGhostV45.dataset.offsetX=x-r.left;
  rankDragGhostV45.dataset.offsetY=y-r.top;
  document.body.appendChild(rankDragGhostV45);
  moveRankGhostV45(x,y);
}
function moveRankDragV45(x,y){
  moveRankGhostV45(x,y);
  if(y<92)window.scrollBy(0,-18);
  if(y>window.innerHeight-92)window.scrollBy(0,18);
  const row=document.querySelector(`#rankEditorRows .rank-editor-row[data-rank-id="${CSS.escape(rankEditor.dragId||'')}"]`);
  if(!row)return;
  if(rankDragGhostV45)rankDragGhostV45.style.display='none';
  const target=document.elementFromPoint(x,y)?.closest?.('.rank-editor-row');
  if(rankDragGhostV45)rankDragGhostV45.style.display='';
  if(target&&target!==row&&target.parentNode===row.parentNode){
    const r=target.getBoundingClientRect();
    target.parentNode.insertBefore(row,y<r.top+r.height/2?target:target.nextSibling);
  }
}
async function finishRankDragV45(){
  const row=document.querySelector(`#rankEditorRows .rank-editor-row[data-rank-id="${CSS.escape(rankEditor.dragId||'')}"]`);
  if(rankDragGhostV45){rankDragGhostV45.remove();rankDragGhostV45=null;}
  if(row)row.classList.remove('rank-placeholder','press-arming');
  document.body.classList.remove('rank-dragging');
  await commitLiveOrderV45();
  rankEditor.dragId=null;
}
async function commitLiveOrderV45(){
  const ids=$$('#rankEditorRows .rank-editor-row').map(r=>r.dataset.rankId);
  const slots=rankRows().map(p=>p.custom_rank).sort((a,b)=>a-b);
  if(rankEditor.active==='ALL')ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=i+1;});
  else ids.forEach((id,i)=>{const p=state.players.find(x=>x.id===id);if(p)p.custom_rank=slots[i];});
  await persistMany(state.players,true);
  render();renderRankEditor();refreshBestRecommendation();
  setStatus('Custom ranking order saved.','ok');
}
