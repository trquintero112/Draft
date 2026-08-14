const STORE_KEY='fantasy-war-room-2026-v1';
let state={players:[],activePos:'ALL'};
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
function uid(name){return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
async function init(){
  const saved=localStorage.getItem(STORE_KEY);
  if(saved){state=JSON.parse(saved)}else{const res=await fetch('data/seed-rankings.json'); const data=await res.json(); state.players=data.players; state.activePos='ALL'; save();}
  bind(); render();
}
function bind(){
  ['search','statusFilter','sortBy'].forEach(id=>$('#'+id).addEventListener('input',render));
  $('#exportBtn').onclick=exportSave; $('#importJson').onchange=e=>importJson(e.target.files[0]); $('#importCsv').onchange=e=>importCsv(e.target.files[0]);
  $('#resetBtn').onclick=()=>{if(confirm('Reset all edits and draft picks?')){localStorage.removeItem(STORE_KEY); location.reload();}};
  $('#cancelEdit').onclick=()=>$('#editDialog').close(); $('#editForm').addEventListener('submit',saveEdit);
}
function save(){localStorage.setItem(STORE_KEY,JSON.stringify(state)); $('#lastSaved') && ($('#lastSaved').textContent='Saved '+new Date().toLocaleTimeString());}
function posRank(p){const same=state.players.filter(x=>x.pos===p.pos).sort((a,b)=>a.rank-b.rank); return p.pos+(same.findIndex(x=>x.id===p.id)+1)}
function sourceAvg(p){const vals=Object.values(p.sources||{}).map(Number).filter(Boolean); return vals.length? vals.reduce((a,b)=>a+b,0)/vals.length:p.rank;}
function getFiltered(){const q=$('#search').value.trim().toLowerCase(), status=$('#statusFilter').value; let arr=[...state.players];
 if(state.activePos!=='ALL') arr=arr.filter(p=>p.pos===state.activePos);
 if(q) arr=arr.filter(p=>(p.name+' '+p.team+' '+p.pos).toLowerCase().includes(q));
 if(status==='available') arr=arr.filter(p=>!p.drafted); if(status==='mine') arr=arr.filter(p=>p.draftedBy==='Me'); if(status==='drafted') arr=arr.filter(p=>p.drafted);
 const sort=$('#sortBy').value; arr.sort((a,b)=> sort==='tier' ? (a.tier-b.tier||a.rank-b.rank) : sort==='adp' ? (sourceAvg(a)-sourceAvg(b)) : sort==='pos' ? (a.pos.localeCompare(b.pos)||a.rank-b.rank) : a.rank-b.rank); return arr;}
function render(){renderChips(); const tbody=$('#board tbody'); tbody.innerHTML=''; const arr=getFiltered();
 for(const p of arr){const tr=document.createElement('tr'); if(p.drafted)tr.className='drafted-row'; tr.innerHTML=`<td class="rank">${p.rank}</td><td><span class="tier">${p.tier}</span></td><td><div class="player-name">${p.name}</div><div class="meta">${p.drafted?p.draftedBy==='Me'?'On my team':'Drafted by other':'Available'}</div></td><td><span class="pos ${p.pos}">${posRank(p)}</span></td><td>${p.team}</td><td>${renderSources(p)}</td><td>${p.notes||''}</td><td><div class="actions"><button class="mine" data-act="mine" data-id="${p.id}">Mine</button><button class="gone" data-act="gone" data-id="${p.id}">Gone</button><button class="edit" data-act="edit" data-id="${p.id}">Edit</button><button data-act="undo" data-id="${p.id}">Undo</button></div></td>`; tbody.appendChild(tr);}
 $$('.actions button').forEach(b=>b.onclick=()=>act(b.dataset.act,b.dataset.id)); renderSidebars();}
function renderSources(p){const entries=Object.entries(p.sources||{}); return entries.map(([k,v])=>`<div><strong>${v}</strong> <span class="meta">${k}</span></div>`).join('')||'<span class="meta">Manual</span>'}
function renderChips(){const wrap=$('#positionChips'); const positions=['ALL','QB','RB','WR','TE']; wrap.innerHTML=''; positions.forEach(pos=>{const b=document.createElement('button'); b.className='chip '+(state.activePos===pos?'active':''); b.textContent=pos; b.onclick=()=>{state.activePos=pos; render()}; wrap.appendChild(b);});}
function renderSidebars(){const mine=state.players.filter(p=>p.draftedBy==='Me').sort((a,b)=>(a.pick||999)-(b.pick||999)); $('#myTeam').innerHTML=mine.map(p=>`<li><strong>${p.name}</strong> <span class="meta">${p.pos} ${p.team}, R${p.rank}/T${p.tier}</span></li>`).join('')||'<li class="meta">No picks yet</li>'; const drafted=state.players.filter(p=>p.drafted).sort((a,b)=>(a.pick||999)-(b.pick||999)); $('#draftedLog').innerHTML=drafted.slice(-20).reverse().map(p=>`<li>${p.name} <span class="meta">${p.draftedBy}</span></li>`).join('')||'<li class="meta">No drafted players yet</li>'; $('#availableCount').textContent=state.players.filter(p=>!p.drafted).length; $('#myCount').textContent=mine.length; $('#draftedCount').textContent=drafted.length;}
function act(action,id){const p=state.players.find(x=>x.id===id); if(!p)return; if(action==='mine'){p.drafted=true;p.draftedBy='Me';p.pick=nextPick()} if(action==='gone'){p.drafted=true;p.draftedBy='Other';p.pick=nextPick()} if(action==='undo'){p.drafted=false;p.draftedBy='';delete p.pick} if(action==='edit') return openEdit(p); save(); render();}
function nextPick(){return Math.max(0,...state.players.map(p=>p.pick||0))+1}
function openEdit(p){$('#editId').value=p.id; $('#editName').value=p.name; $('#editTeam').value=p.team; $('#editPos').value=p.pos; $('#editRank').value=p.rank; $('#editTier').value=p.tier; $('#editNotes').value=p.notes||''; $('#editDialog').showModal();}
function saveEdit(e){e.preventDefault(); const p=state.players.find(x=>x.id===$('#editId').value); Object.assign(p,{name:$('#editName').value,team:$('#editTeam').value,pos:$('#editPos').value,rank:+$('#editRank').value,tier:+$('#editTier').value,notes:$('#editNotes').value}); p.id=uid(p.name); save(); $('#editDialog').close(); render();}
function exportSave(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); download(blob,'fantasy-war-room-save.json')}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}
function importJson(file){if(!file)return; const r=new FileReader(); r.onload=()=>{state=JSON.parse(r.result); save(); render();}; r.readAsText(file)}
function importCsv(file){if(!file)return; const r=new FileReader(); r.onload=()=>{mergeCsv(r.result); save(); render();}; r.readAsText(file)}
function parseCsv(text){const rows=[];let row=[],cur='',q=false; for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1]; if(c==='"'&&q&&n==='"'){cur+='"';i++} else if(c==='"'){q=!q} else if(c===','&&!q){row.push(cur);cur=''} else if((c==='\n'||c==='\r')&&!q){if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''} if(c==='\r'&&n==='\n')i++} else cur+=c} if(cur||row.length){row.push(cur);rows.push(row)} return rows}
function mergeCsv(text){const rows=parseCsv(text).filter(r=>r.length); const headers=rows.shift().map(h=>h.trim().toLowerCase()); const idx=h=>headers.indexOf(h); rows.forEach(r=>{const name=r[idx('name')]||r[idx('player')]||''; if(!name)return; const id=uid(name); let p=state.players.find(x=>x.id===id || x.name.toLowerCase()===name.toLowerCase()); if(!p){p={id,name,team:r[idx('team')]||'',pos:r[idx('pos')]||'RB',rank:999,tier:99,sources:{},notes:'',drafted:false,draftedBy:''}; state.players.push(p)}; const source=r[idx('source')]||'Imported'; if(idx('rank')>-1 && r[idx('rank')]){p.sources=p.sources||{}; p.sources[source]=+r[idx('rank')]; p.rank=+r[idx('rank')]} if(idx('tier')>-1 && r[idx('tier')]) p.tier=+r[idx('tier')]; if(idx('team')>-1 && r[idx('team')]) p.team=r[idx('team')]; if(idx('pos')>-1 && r[idx('pos')]) p.pos=r[idx('pos')]; if(idx('notes')>-1 && r[idx('notes')]) p.notes=r[idx('notes')];}); state.players.sort((a,b)=>a.rank-b.rank)}
init();