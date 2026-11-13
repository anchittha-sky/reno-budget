(function(){
"use strict";
const CFG = window.RENO_CONFIG;
const AUTH_KEY = "reno_admin_auth";
const CATS = [{id:"structure",label:"🧱 โครงสร้าง"},{id:"furniture",label:"🛋️ เฟอร์นิเจอร์"},{id:"consumable",label:"🧴 ของใช้สิ้นเปลือง"}];
const CALCS = [["","ไม่คำนวณ (ใส่จำนวนเอง)"],["paint","สีทับหน้า: ผนัง×2 รอบ ÷ 35"],["primer","สีรองพื้น: ผนัง ÷ 35"],["wall","= พื้นที่ผนัง (ตร.ม.)"],["floor","= พื้นที่พื้น (ตร.ม.)"],["tile","= พื้นที่พื้น + 10%"],["adhesive","ปูนกาว: พื้น ÷ 4"],["grout","ยาแนว: พื้น ÷ 5"]];
const $ = id => document.getElementById(id);
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let auth = null; try{ auth = JSON.parse(localStorage.getItem(AUTH_KEY)||"null"); }catch(e){}
let items = [], cat = "structure", isAdmin = false;

function saveAuth(a){ auth = a; try{ a ? localStorage.setItem(AUTH_KEY, JSON.stringify(a)) : localStorage.removeItem(AUTH_KEY); }catch(e){} }
async function authCall(grant, body){
  const r = await fetch(CFG.url + "/auth/v1/token?grant_type=" + grant, {method:"POST", headers:{apikey:CFG.key, "Content-Type":"application/json"}, body:JSON.stringify(body)});
  const d = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error_description || d.msg || "เข้าสู่ระบบไม่สำเร็จ");
  saveAuth({access:d.access_token, refresh:d.refresh_token, exp:Date.now() + (d.expires_in-60)*1000, email:d.user && d.user.email});
}
async function token(){
  if(auth && Date.now() > auth.exp){ try{ await authCall("refresh_token", {refresh_token:auth.refresh}); }catch(e){ saveAuth(null); } }
  return auth ? auth.access : CFG.key;
}
async function api(path, opt){
  opt = opt || {};
  const t = await token();
  const r = await fetch(CFG.url + "/rest/v1/" + path, Object.assign({}, opt, {headers:Object.assign({apikey:CFG.key, Authorization:"Bearer "+t, "Content-Type":"application/json", Prefer:"return=representation"}, opt.headers||{})}));
  if(!r.ok){ const d = await r.json().catch(()=>({})); throw new Error(d.message || ("ผิดพลาด " + r.status)); }
  return r.status === 204 ? null : r.json();
}
function toast(msg){ const t = document.createElement("div"); t.className="toast"; t.style.bottom="24px"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), 2200); }

function renderLogin(err){
  $("who").textContent = ""; $("cats").innerHTML = "";
  $("view").innerHTML = `<div class="card" style="margin-top:20px"><h2 style="margin:0 0 6px;font-size:18px">เข้าสู่ระบบแอดมิน</h2>
    <div class="hint" style="margin-bottom:12px">ใช้อีเมลและรหัสผ่านเดียวกับแอป My Task Board</div>
    <form id="lf"><div class="f" style="margin-bottom:8px"><input class="txt" id="em" type="email" autocomplete="username" placeholder="อีเมล" required></div>
    <div class="f" style="margin-bottom:12px"><input class="txt" id="pw" type="password" autocomplete="current-password" placeholder="รหัสผ่าน" required></div>
    ${err?`<div class="small" style="color:#b4413a;margin-bottom:8px">${esc(err)}</div>`:""}
    <button class="btn primary block" type="submit">เข้าสู่ระบบ</button></form>
    <p class="small muted" style="text-align:center"><a href="./">← กลับไปหน้าแอป</a></p></div>`;
  $("lf").addEventListener("submit", async ev => {
    ev.preventDefault();
    try{ await authCall("password", {email:$("em").value.trim(), password:$("pw").value}); await boot(); }
    catch(e){ renderLogin(e.message.includes("Invalid") ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : e.message); }
  });
}

async function boot(){
  if(!auth){ renderLogin(); return; }
  try{
    const rows = await api("reno_admins?select=user_id");
    isAdmin = rows.length > 0;
  }catch(e){ saveAuth(null); renderLogin("กรุณาเข้าสู่ระบบอีกครั้ง"); return; }
  if(!isAdmin){ $("view").innerHTML = `<div class="empty">บัญชีนี้ไม่มีสิทธิ์แก้ไขรายการ<br><br><button class="btn" id="lo">ออกจากระบบ</button></div>`; $("lo").onclick = ()=>{ saveAuth(null); renderLogin(); }; return; }
  items = await api("reno_items?select=*&order=group_name,sort,name");
  render();
}

function render(){
  $("who").innerHTML = `${esc(auth.email||"")} · <a href="#" id="lo">ออก</a>`;
  $("lo").onclick = e => { e.preventDefault(); saveAuth(null); renderLogin(); };
  $("cats").innerHTML = CATS.map(c => `<button class="chip ${c.id===cat?"on":""}" data-cat="${c.id}">${c.label} (${items.filter(i=>i.category===c.id).length})</button>`).join("");
  const list = items.filter(i => i.category === cat);
  const groups = [...new Set(items.filter(i=>i.category===cat).map(i=>i.group_name))];
  let html = `<div class="card small"><b>วิธีใช้:</b> แก้ราคา ลิงก์ affiliate หรือชื่อรายการ แล้วกด "บันทึก" ที่รายการนั้น เพื่อนจะเห็นราคาใหม่ตอนเปิดแอปครั้งถัดไป · <a href="./">เปิดหน้าแอป</a></div>
    <button class="btn primary block" id="addBtn" style="margin-bottom:12px">+ เพิ่มรายการในหมวดนี้</button>
    <datalist id="groups">${groups.map(g=>`<option value="${esc(g)}">`).join("")}</datalist>`;
  let cur = null;
  for(const it of list){
    if(it.group_name !== cur){ cur = it.group_name; html += `<div class="group"><h3>${esc(cur)}</h3></div>`; }
    html += card(it);
  }
  $("view").innerHTML = html;
  $("addBtn").onclick = addItem;
}
function card(it){
  return `<div class="item" data-id="${it.id}">
    <div class="adm-grid">
      <div class="full"><label>ชื่อรายการ</label><input class="txt" data-k="name" value="${esc(it.name)}"></div>
      <div><label>ราคาแนะนำ (บาท)</label><input class="num" data-k="price" inputmode="decimal" value="${esc(it.price)}"></div>
      <div><label>หน่วย</label><input class="txt" data-k="unit" value="${esc(it.unit)}"></div>
      <div class="full"><label>ลิงก์ affiliate</label><input class="txt" data-k="link" value="${esc(it.link||"")}" placeholder="https://"></div>
      <div><label>กลุ่ม</label><input class="txt" data-k="group_name" list="groups" value="${esc(it.group_name)}"></div>
      <div><label>ลำดับ</label><input class="num" data-k="sort" inputmode="numeric" value="${esc(it.sort)}"></div>
      <div class="full"><label>คำนวณจำนวนอัตโนมัติ</label><select data-k="calc">${CALCS.map(([v,l])=>`<option value="${v}" ${(it.calc||"")===v?"selected":""}>${esc(l)}</option>`).join("")}</select></div>
      <div class="full"><label>หมายเหตุ (แสดงให้เพื่อนเห็น)</label><input class="txt" data-k="note" value="${esc(it.note||"")}"></div>
    </div>
    <div class="actions">
      <label class="switch"><input type="checkbox" data-k="is_labor" ${it.is_labor?"checked":""}> เป็นค่าแรงช่าง</label>
      <button class="btn danger" data-del style="margin-left:auto">ลบ</button>
      <button class="btn primary" data-save disabled>บันทึก</button>
    </div></div>`;
}
function readCard(el){
  const o = {};
  el.querySelectorAll("[data-k]").forEach(i => {
    const k = i.dataset.k;
    if(k === "is_labor") o[k] = i.checked;
    else if(k === "price") o[k] = parseFloat(i.value.replace(/,/g,"")) || 0;
    else if(k === "sort") o[k] = parseInt(i.value,10) || 0;
    else if(k === "calc") o[k] = i.value || null;
    else if(k === "link" || k === "note") o[k] = i.value.trim() || null;
    else o[k] = i.value.trim();
  });
  return o;
}
async function addItem(){
  try{
    const sameCat = items.filter(i=>i.category===cat);
    const last = sameCat[sameCat.length-1];
    const rows = await api("reno_items", {method:"POST", body:JSON.stringify({category:cat, group_name:last?last.group_name:"อื่นๆ", name:"รายการใหม่", unit:"ชิ้น", price:0, sort:(last?last.sort:0)+10})});
    items.push(rows[0]); items.sort((a,b)=> a.group_name.localeCompare(b.group_name,"th") || a.sort-b.sort);
    render();
    const el = document.querySelector(`.item[data-id="${rows[0].id}"]`); if(el){ el.scrollIntoView({block:"center"}); el.querySelector('[data-k="name"]').select(); }
  }catch(e){ toast("เพิ่มไม่สำเร็จ: " + e.message); }
}

document.addEventListener("click", async ev => {
  const c = ev.target.closest("[data-cat]"); if(c){ cat = c.dataset.cat; render(); window.scrollTo(0,0); return; }
  const card = ev.target.closest(".item"); if(!card) return;
  const id = card.dataset.id;
  if(ev.target.closest("[data-save]")){
    const btn = ev.target.closest("[data-save]"); btn.disabled = true; btn.textContent = "กำลังบันทึก…";
    try{
      const rows = await api("reno_items?id=eq." + id, {method:"PATCH", body:JSON.stringify(readCard(card))});
      if(!rows.length) throw new Error("ไม่มีสิทธิ์บันทึก");
      const i = items.findIndex(x=>x.id===id); items[i] = rows[0];
      const regroup = rows[0].group_name !== card.dataset.group;
      card.querySelectorAll(".dirty").forEach(x=>x.classList.remove("dirty"));
      btn.textContent = "บันทึกแล้ว ✓"; toast("บันทึกแล้ว");
      setTimeout(()=>{ items.sort((a,b)=> a.group_name.localeCompare(b.group_name,"th") || a.sort-b.sort); render(); }, 700);
    }catch(e){ btn.disabled = false; btn.textContent = "บันทึก"; toast("บันทึกไม่สำเร็จ: " + e.message); }
  }
  if(ev.target.closest("[data-del]")){
    const b = ev.target.closest("[data-del]");
    if(b.dataset.confirm !== "1"){ b.dataset.confirm = "1"; b.textContent = "แตะอีกครั้งเพื่อลบ"; return; }
    try{ await api("reno_items?id=eq." + id, {method:"DELETE"}); items = items.filter(x=>x.id!==id); render(); toast("ลบแล้ว"); }
    catch(e){ toast("ลบไม่สำเร็จ: " + e.message); }
  }
});
function markDirty(ev){
  const card = ev.target.closest(".item"); if(!card || !ev.target.dataset.k) return;
  ev.target.classList.add("dirty");
  const b = card.querySelector("[data-save]"); b.disabled = false; b.textContent = "บันทึก";
}
document.addEventListener("input", markDirty);
document.addEventListener("change", markDirty);

boot().catch(e => { $("view").innerHTML = `<div class="empty">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`; });
})();
