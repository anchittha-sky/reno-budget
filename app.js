(function(){
"use strict";
const CFG = window.RENO_CONFIG;
const STORE_KEY = "reno_state_v1";
const CAT_KEY = "reno_catalog_v1";
const CATS = [
  {id:"structure", label:"โครงสร้าง", ic:"🧱"},
  {id:"furniture", label:"เฟอร์นิเจอร์", ic:"🛋️"},
  {id:"consumable", label:"ของใช้", ic:"🧴"}
];
const CAT_LABEL = {structure:"โครงสร้าง", furniture:"เฟอร์นิเจอร์", consumable:"ของใช้สิ้นเปลือง"};
const ROOM_PRESETS = ["ห้องนอน","ห้องนอนใหญ่","ห้องน้ำ","ห้องนั่งเล่น","ห้องครัว","ห้องทำงาน","ระเบียง","ทางเดิน / บันได"];
// ความครอบคลุมของสีโดยประมาณ: 1 แกลลอน ≈ 35 ตร.ม. ต่อ 1 รอบ
const PAINT_COVER = 35;
const CALC_INFO = {
  paint:   {label:"ตามพื้นที่ผนัง (สีทับหน้า 2 รอบ)"},
  primer:  {label:"ตามพื้นที่ผนัง (รองพื้น 1 รอบ)"},
  wall:    {label:"= พื้นที่ผนัง"},
  floor:   {label:"= พื้นที่พื้น"},
  tile:    {label:"= พื้นที่พื้น + เผื่อเสีย 10%"},
  adhesive:{label:"ตามพื้นที่พื้น (≈1 ถุง / 4 ตร.ม.)"},
  grout:   {label:"ตามพื้นที่พื้น (≈1 ถุง / 5 ตร.ม.)"}
};

// ---------- state ----------
function load(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function save(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(S)); }catch(e){} }
function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }

let S = load(STORE_KEY, null);
if(!S || !Array.isArray(S.rooms)){
  const r = {id:uid(), name:"ห้องนอน 1", w:"", l:"", h:"2.6", open:""};
  S = {rooms:[r], cur:r.id, tab:"structure", items:{}, custom:{}, budget:"", contingency:10, onlySel:false, sumScope:"all"};
}
let CATALOG = load(CAT_KEY, {items:[], at:null}).items || [];
let catalogAt = load(CAT_KEY, {at:null}).at;
let syncState = CATALOG.length ? "cache" : "loading";

function room(){ return S.rooms.find(r => r.id === S.cur) || S.rooms[0]; }
function entry(roomId, itemId, create){
  S.items[roomId] = S.items[roomId] || {};
  let e = S.items[roomId][itemId];
  if(!e && create){ e = S.items[roomId][itemId] = {}; }
  return e || {};
}

// ---------- maths ----------
const n = v => { const x = parseFloat(String(v).replace(/,/g,"")); return isFinite(x) ? x : 0; };
const r1 = v => Math.round(v*10)/10;
function areas(rm){
  const w=n(rm.w), l=n(rm.l), h=n(rm.h), o=n(rm.open);
  const floor = w*l;
  const wall = Math.max(0, 2*(w+l)*h - o);
  return {floor:r1(floor), wall:r1(wall), ok: w>0 && l>0};
}
function autoQty(calc, rm){
  const a = areas(rm);
  switch(calc){
    case "paint": return a.wall ? Math.ceil(a.wall*2/PAINT_COVER) : 0;
    case "primer": return a.wall ? Math.ceil(a.wall/PAINT_COVER) : 0;
    case "wall": return a.wall;
    case "floor": return a.floor;
    case "tile": return r1(a.floor*1.1);
    case "adhesive": return a.floor ? Math.ceil(a.floor/4) : 0;
    case "grout": return a.floor ? Math.ceil(a.floor/5) : 0;
  }
  return 0;
}
// คำนวณรายการทั้งหมดของห้อง (ทั้งจากรายการกลางและที่เพิ่มเอง)
function roomLines(rm){
  const out = [];
  for(const it of CATALOG){
    const e = (S.items[rm.id]||{})[it.id] || {};
    const canAuto = !!(it.calc && CALC_INFO[it.calc]);
    const isAuto = canAuto && !!e.on && !e.qtyManual;
    const offer = canAuto && !e.on && !e.qtyManual;
    const qty = isAuto ? autoQty(it.calc, rm) : (offer ? 0 : n(e.qty));
    const own = e.price !== undefined && e.price !== null && e.price !== "";
    const price = own ? n(e.price) : n(it.price);
    out.push({src:"cat", id:it.id, it, e, category:it.category, group:it.group_name, name:it.name, unit:it.unit,
      link:it.link, note:it.note, labor:!!it.is_labor, isAuto, offer, suggest: canAuto ? autoQty(it.calc, rm) : 0, qty, price, own,
      newPrice: own && e.priceBase !== undefined && n(e.priceBase) !== n(it.price) ? n(it.price) : null,
      bought:!!e.bought, total: qty*price});
  }
  for(const c of (S.custom[rm.id]||[])){
    const qty = n(c.qty), price = n(c.price);
    out.push({src:"custom", id:c.id, c, category:c.category, group:c.group||"รายการที่เพิ่มเอง", name:c.name, unit:c.unit||"ชิ้น",
      link:c.link, labor:!!c.labor, isAuto:false, qty, price, own:false, newPrice:null, bought:!!c.bought, total:qty*price});
  }
  return out;
}
const baht = v => "฿" + Math.round(v).toLocaleString("th-TH");
const fmtQ = v => (Math.round(v*100)/100).toLocaleString("th-TH",{maximumFractionDigits:2});
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl = u => { try{ const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; }catch(e){ return ""; } };

// ---------- catalog sync ----------
async function fetchCatalog(){
  try{
    const res = await fetch(CFG.url + "/rest/v1/reno_items?select=*&order=category,group_name,sort,name", {
      headers:{apikey:CFG.key, Authorization:"Bearer " + CFG.key}, cache:"no-store"});
    if(!res.ok) throw new Error(res.status);
    const items = await res.json();
    CATALOG = items; catalogAt = new Date().toISOString();
    try{ localStorage.setItem(CAT_KEY, JSON.stringify({items, at:catalogAt})); }catch(e){}
    syncState = "ok";
  }catch(err){
    syncState = CATALOG.length ? "offline" : "error";
  }
  render();
}

// ---------- render ----------
const $ = id => document.getElementById(id);
function renderSync(){
  const t = catalogAt ? new Date(catalogAt).toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "";
  $("sync").textContent = {loading:"กำลังโหลดราคา…", ok:"ราคาล่าสุด ✓", cache:"ราคาจากเครื่อง · "+t, offline:"ออฟไลน์ · ราคา "+t, error:"โหลดราคาไม่ได้"}[syncState] || "";
}
function renderRooms(){
  $("rooms").innerHTML = S.rooms.map(r =>
    `<button class="chip ${r.id===S.cur?"on":""}" data-act="room" data-id="${r.id}">${esc(r.name)}</button>`).join("")
    + `<button class="chip add" data-act="addRoom">+ เพิ่มห้อง</button>`;
}
function renderTabs(){
  const tabs = CATS.concat([{id:"summary", label:"สรุป", ic:"📊"}]);
  $("tabs").innerHTML = tabs.map(t =>
    `<button class="${S.tab===t.id?"on":""}" data-act="tab" data-id="${t.id}"><span class="ic">${t.ic}</span>${t.label}</button>`).join("");
}
function render(){
  renderSync(); renderRooms(); renderTabs();
  if(S.tab === "summary") renderSummary(); else renderCategory(S.tab);
  renderTotalbar();
}
function renderTotalbar(){
  if(S.tab === "summary"){ $("totalbar").innerHTML = ""; return; }
  const rm = room();
  const lines = roomLines(rm);
  const tabTotal = lines.filter(l => l.category===S.tab).reduce((a,l)=>a+l.total,0);
  const roomTotal = lines.reduce((a,l)=>a+l.total,0);
  $("totalbar").innerHTML = `<div class="wrap"><div><span class="small">${esc(CAT_LABEL[S.tab])} · ${esc(rm.name)}<br><span style="opacity:.7">ทั้งห้อง ${baht(roomTotal)}</span></span><b id="tabTotal">${baht(tabTotal)}</b></div></div>`;
}

function renderCategory(cat){
  const rm = room();
  const a = areas(rm);
  let html = "";
  if(cat === "structure"){
    html += `<details class="card dims" ${a.ok?"":"open"}>
      <summary><span>📐 ขนาดห้อง ${esc(rm.name)}</span><span class="small muted">${a.ok ? `พื้น ${fmtQ(a.floor)} · ผนัง ${fmtQ(a.wall)} ตร.ม.` : "แตะเพื่อใส่ขนาด"}</span></summary>
      <div class="dimgrid">
        <div><label>กว้าง (เมตร)</label><input class="num" inputmode="decimal" data-dim="w" value="${esc(rm.w)}" placeholder="0"></div>
        <div><label>ยาว (เมตร)</label><input class="num" inputmode="decimal" data-dim="l" value="${esc(rm.l)}" placeholder="0"></div>
        <div><label>สูงฝ้า (เมตร)</label><input class="num" inputmode="decimal" data-dim="h" value="${esc(rm.h)}" placeholder="2.6"></div>
        <div><label>หักประตู/หน้าต่าง (ตร.ม.)</label><input class="num" inputmode="decimal" data-dim="open" value="${esc(rm.open)}" placeholder="เช่น 3.5"></div>
      </div>
      <div class="areas"><div class="area">พื้นที่พื้น<b id="aFloor">${fmtQ(a.floor)} ตร.ม.</b></div><div class="area">พื้นที่ผนัง<b id="aWall">${fmtQ(a.wall)} ตร.ม.</b></div></div>
      <div class="hint">ประตู 1 บาน ≈ 1.8 ตร.ม. · หน้าต่าง 1 บาน ≈ 1.5 ตร.ม. · แอปจะคำนวณจำนวนสี กระเบื้อง และค่าแรงให้อัตโนมัติ</div>
    </details>`;
  }
  const lines = roomLines(rm).filter(l => l.category === cat);
  const shown = S.onlySel ? lines.filter(l => l.qty > 0) : lines;
  html += `<div class="toolbar"><label class="switch"><input type="checkbox" data-act="onlySel" ${S.onlySel?"checked":""}> แสดงเฉพาะที่เลือก</label>
    <button class="btn ghost" data-act="addCustom">+ เพิ่มรายการเอง</button></div>`;
  if(!CATALOG.length && syncState === "loading") html += `<div class="empty">กำลังโหลดรายการ…</div>`;
  else if(!CATALOG.length && syncState === "error") html += `<div class="empty">โหลดรายการไม่ได้ ลองเชื่อมต่ออินเทอร์เน็ตแล้วเปิดใหม่<br><br><button class="btn" data-act="retry">ลองอีกครั้ง</button></div>`;
  const groups = [];
  for(const l of shown){ let g = groups.find(x => x.name === l.group); if(!g){ g = {name:l.group, lines:[]}; groups.push(g); } g.lines.push(l); }
  if(!shown.length && CATALOG.length) html += `<div class="empty">${S.onlySel ? "ยังไม่ได้เลือกรายการในหมวดนี้<br>ใส่จำนวนเพื่อเลือกรายการ" : "ยังไม่มีรายการ"}</div>`;
  for(const g of groups){
    const gt = g.lines.reduce((a,l)=>a+l.total,0);
    html += `<div class="group"><h3><span>${esc(g.name)}</span><span>${gt?baht(gt):""}</span></h3>`;
    html += g.lines.map(itemCard).join("");
    html += `</div>`;
  }
  html += `<div class="foot">ราคาเป็นราคาโดยประมาณ แก้ไขให้ตรงกับร้านที่ซื้อจริงได้ · บางลิงก์เป็นลิงก์ affiliate</div>`;
  $("view").innerHTML = html;
}

function itemCard(l){
  const url = safeUrl(l.link);
  const tags = (l.labor?`<span class="tag labor">ค่าแรง</span>`:"")
    + (l.isAuto?`<span class="tag auto">คำนวณอัตโนมัติ</span>`:"")
    + (l.own?`<span class="tag own">ราคาของฉัน</span>`:"")
    + (l.src==="custom"?`<span class="tag own">เพิ่มเอง</span>`:"");
  const okDims = areas(room()).ok;
  const autoHint = l.src==="cat" && l.it.calc && CALC_INFO[l.it.calc]
    ? (l.offer ? `<button class="btn block" data-act="autoOn" style="margin-top:8px;border-style:dashed;color:var(--ok)">✓ ใช้รายการนี้ · ${okDims?`คำนวณได้ ${fmtQ(l.suggest)} ${esc(l.unit)}`:"คำนวณจากขนาดห้อง"}</button>`
      : l.isAuto ? `<div class="hint">${esc(CALC_INFO[l.it.calc].label)}${okDims?"":" · ใส่ขนาดห้องด้านบนก่อน"} · <a href="#" data-act="autoOff">ไม่ใช้</a></div>`
      : `<div class="hint">ใส่จำนวนเอง · <a href="#" data-act="autoOn">กลับไปคำนวณอัตโนมัติ</a></div>`) : "";
  return `<div class="item ${l.qty>0?"sel":""} ${l.bought?"bought":""}" data-src="${l.src}" data-id="${l.id}">
    <div class="row between"><div class="grow"><span class="name">${esc(l.name)}</span>${tags}</div></div>
    ${l.note?`<div class="hint">${esc(l.note)}</div>`:""}
    <div class="fields">
      <div><label>ราคา / ${esc(l.unit)}</label><input class="num" inputmode="decimal" data-f="price" value="${l.price||l.price===0?l.price:""}"></div>
      <div><label>จำนวน (${esc(l.unit)})</label><div class="qty"><button data-act="dec">−</button><input inputmode="decimal" data-f="qty" value="${l.qty?fmtQ(l.qty).replace(/,/g,""):""}" placeholder="0"><button data-act="inc">+</button></div></div>
      <div class="sub" data-sub>${l.total?baht(l.total):"–"}</div>
    </div>
    ${autoHint}
    ${l.newPrice!==null?`<div class="newprice"><span>ราคาแนะนำใหม่ ${baht(l.newPrice)}</span><button data-act="useNew">ใช้ราคานี้</button></div>`:""}
    <div class="actions">
      ${url?`<a class="btn shop" href="${esc(url)}" target="_blank" rel="noopener sponsored">🛒 ดูสินค้า</a>`:""}
      ${l.own?`<button class="btn ghost small" data-act="resetPrice">ใช้ราคาแนะนำ</button>`:""}
      ${l.src==="custom"?`<button class="btn ghost small" data-act="editCustom">แก้ไข</button>`:""}
      <label class="check"><input type="checkbox" data-act="bought" ${l.bought?"checked":""}> ซื้อแล้ว</label>
    </div>
  </div>`;
}

function renderSummary(){
  const scopeRooms = S.sumScope === "room" ? [room()] : S.rooms;
  let all = [];
  for(const rm of scopeRooms) for(const l of roomLines(rm)) if(l.total>0) all.push(Object.assign({room:rm}, l));
  const sum = f => all.filter(f).reduce((a,l)=>a+l.total,0);
  const subtotal = sum(()=>true);
  const cont = subtotal * n(S.contingency)/100;
  const grand = subtotal + cont;
  const labor = sum(l=>l.labor), material = subtotal - labor;
  const bought = sum(l=>l.bought), remain = subtotal - bought;
  const budget = n(S.budget);
  let html = `<div class="seg"><button class="${S.sumScope!=="room"?"on":""}" data-act="scope" data-id="all">ทุกห้อง</button><button class="${S.sumScope==="room"?"on":""}" data-act="scope" data-id="room">เฉพาะ ${esc(room().name)}</button></div>`;
  html += `<div class="card"><div class="muted small">งบรวมที่ต้องใช้ (รวมเงินเผื่อ)</div><div class="big">${baht(grand)}</div>
    <div class="kv"><span>ค่าของ + ค่าแรง</span><b>${baht(subtotal)}</b></div>
    <div class="kv"><span>เงินเผื่อฉุกเฉิน <input class="num" style="width:58px;display:inline-block;padding:3px 6px" inputmode="decimal" data-g="contingency" value="${esc(S.contingency)}"> %</span><b>${baht(cont)}</b></div>`;
  if(S.sumScope !== "room"){
    html += `<div class="kv"><span>งบที่ตั้งไว้</span><span><input class="num" style="width:130px;padding:3px 8px" inputmode="decimal" data-g="budget" value="${esc(S.budget)}" placeholder="ใส่งบ"></span></div>`;
    if(budget>0){
      const pct = Math.min(100, grand/budget*100), over = grand > budget;
      html += `<div class="bar"><i class="${over?"over":""}" style="width:${pct}%"></i></div>
        <div class="small" style="color:${over?"#c2453a":"var(--ok)"}">${over?`เกินงบ ${baht(grand-budget)}`:`เหลืองบ ${baht(budget-grand)}`}</div>`;
    }
  }
  html += `</div>`;
  // by category
  html += `<div class="card"><b>แยกตามหมวด</b>` + CATS.map(c => `<div class="kv"><span>${c.ic} ${CAT_LABEL[c.id]}</span><b>${baht(sum(l=>l.category===c.id))}</b></div>`).join("") + `</div>`;
  // labor vs material
  const lp = subtotal ? labor/subtotal*100 : 0;
  html += `<div class="card"><b>ค่าของ vs ค่าแรง</b>
    <div class="split"><i style="width:${100-lp}%;background:var(--accent)"></i><i style="width:${lp}%;background:var(--labor)"></i></div>
    <div class="kv"><span><span style="color:var(--accent)">●</span> ค่าของ / วัสดุ</span><b>${baht(material)}</b></div>
    <div class="kv"><span><span style="color:var(--labor)">●</span> ค่าแรงช่าง</span><b>${baht(labor)}</b></div></div>`;
  // bought
  const bp = subtotal ? bought/subtotal*100 : 0;
  html += `<div class="card"><b>จ่ายไปแล้ว</b><div class="bar"><i style="width:${bp}%"></i></div>
    <div class="kv"><span>ซื้อ/จ่ายแล้ว</span><b>${baht(bought)}</b></div>
    <div class="kv"><span>ยังต้องจ่าย</span><b>${baht(remain)}</b></div></div>`;
  // by room
  if(S.sumScope !== "room"){
    html += `<div class="card"><b>แยกตามห้อง</b>` + S.rooms.map(rm => {
      const t = roomLines(rm).reduce((a,l)=>a+l.total,0);
      return `<div class="kv"><span>${esc(rm.name)}</span><b>${baht(t)}</b></div>`;}).join("") + `</div>`;
  }
  // shopping list
  const todo = all.filter(l => !l.bought && !l.labor);
  html += `<div class="card"><b>รายการที่ต้องซื้อ</b> <span class="small muted">(${todo.length} รายการ)</span>`;
  html += todo.length ? todo.map(l => {
    const url = safeUrl(l.link);
    return `<div class="shopline"><div class="grow"><div>${esc(l.name)}</div><div class="small muted">${S.sumScope!=="room"?esc(l.room.name)+" · ":""}${fmtQ(l.qty)} ${esc(l.unit)} · ${baht(l.total)}</div></div>
      ${url?`<a class="btn shop small" href="${esc(url)}" target="_blank" rel="noopener sponsored">🛒</a>`:""}</div>`;}).join("")
    : `<div class="empty" style="padding:12px">ยังไม่มีรายการที่ต้องซื้อ</div>`;
  html += `</div>`;
  // backup
  html += `<div class="card"><b>ห้อง & สำรองข้อมูล</b>
    <div class="hint" style="margin-bottom:8px">ข้อมูลของคุณเก็บในเครื่องนี้เท่านั้น ถ้าจะเปลี่ยนมือถือ ให้สำรองไฟล์ไว้ก่อน</div>
    <div class="actions"><button class="btn" data-act="editRoom">✏️ แก้ไขห้อง ${esc(room().name)}</button>
    <button class="btn" data-act="export">⬇️ สำรองข้อมูล</button>
    <label class="btn">⬆️ กู้คืน<input type="file" accept=".json,application/json" data-act="import" hidden></label></div></div>`;
  html += `<div class="foot">ราคาเป็นราคาโดยประมาณ · บางลิงก์เป็นลิงก์ affiliate</div>`;
  $("view").innerHTML = html;
}

// ---------- modal ----------
function modal(html){ $("modalRoot").innerHTML = `<div class="modal" data-act="closeBg"><div class="sheet">${html}</div></div>`; }
function closeModal(){ $("modalRoot").innerHTML = ""; }
function toast(msg){ const t = document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), 1800); }

function roomModal(rm){
  const isNew = !rm;
  modal(`<h2>${isNew?"เพิ่มห้อง":"แก้ไขห้อง"}</h2>
    ${isNew?`<div class="presets">${ROOM_PRESETS.map(p=>`<button class="chip" data-act="preset" data-v="${esc(p)}">${esc(p)}</button>`).join("")}</div>`:""}
    <div class="f"><label>ชื่อห้อง</label><input class="txt" id="mRoomName" value="${esc(rm?rm.name:"")}" placeholder="เช่น ห้องนอน 2"></div>
    ${isNew && S.rooms.length?`<div class="f"><label>คัดลอกรายการจากห้อง (ไม่บังคับ)</label><select id="mCopy"><option value="">– ห้องเปล่า –</option>${S.rooms.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></div>`:""}
    <div class="actions"><button class="btn primary" data-act="saveRoom" data-id="${rm?rm.id:""}">บันทึก</button>
    <button class="btn" data-act="close">ยกเลิก</button>
    ${!isNew && S.rooms.length>1?`<button class="btn danger" data-act="delRoom" data-id="${rm.id}" style="margin-left:auto">ลบห้อง</button>`:""}</div>`);
  setTimeout(()=>{ const i=$("mRoomName"); if(i) i.focus(); }, 50);
}
function customModal(c){
  const isNew = !c;
  c = c || {category:S.tab, name:"", unit:"ชิ้น", price:"", qty:"1", link:"", labor:false};
  modal(`<h2>${isNew?"เพิ่มรายการเอง":"แก้ไขรายการ"}</h2>
    <div class="f"><label>ชื่อรายการ</label><input class="txt" id="cName" value="${esc(c.name)}"></div>
    <div class="dimgrid" style="margin:0 0 10px">
      <div><label>ราคาต่อหน่วย (บาท)</label><input class="num" id="cPrice" inputmode="decimal" value="${esc(c.price)}"></div>
      <div><label>หน่วย</label><input class="txt" id="cUnit" value="${esc(c.unit)}"></div>
      <div><label>จำนวน</label><input class="num" id="cQty" inputmode="decimal" value="${esc(c.qty)}"></div>
      <div><label>หมวด</label><select id="cCat">${CATS.map(x=>`<option value="${x.id}" ${x.id===c.category?"selected":""}>${CAT_LABEL[x.id]}</option>`).join("")}</select></div>
    </div>
    <div class="f"><label>ลิงก์สินค้า (ไม่บังคับ)</label><input class="txt" id="cLink" value="${esc(c.link)}" placeholder="https://"></div>
    <label class="switch" style="margin-bottom:12px"><input type="checkbox" id="cLabor" ${c.labor?"checked":""}> เป็นค่าแรงช่าง</label>
    <div class="actions"><button class="btn primary" data-act="saveCustom" data-id="${isNew?"":c.id}">บันทึก</button>
    <button class="btn" data-act="close">ยกเลิก</button>
    ${!isNew?`<button class="btn danger" data-act="delCustom" data-id="${c.id}" style="margin-left:auto">ลบ</button>`:""}</div>`);
}

// ---------- events ----------
function cardInfo(el){ const card = el.closest(".item"); return card ? {card, src:card.dataset.src, id:card.dataset.id} : null; }
function findCustom(id){ return (S.custom[S.cur]||[]).find(c => c.id === id); }

function setQty(info, v){
  const rm = room();
  if(info.src === "custom"){ const c = findCustom(info.id); if(c) c.qty = v; }
  else { const e = entry(rm.id, info.id, true); e.qty = v; const it = CATALOG.find(x=>x.id===info.id); if(it && it.calc) e.qtyManual = true; }
}
function setPrice(info, v){
  const rm = room();
  if(info.src === "custom"){ const c = findCustom(info.id); if(c) c.price = v; return; }
  const it = CATALOG.find(x=>x.id===info.id); const e = entry(rm.id, info.id, true);
  if(v === "" ){ delete e.price; delete e.priceBase; return; }
  if(it && n(v) === n(it.price) && (e.price===undefined)) return;
  e.price = v; e.priceBase = it ? n(it.price) : 0;
}
function liveUpdate(info){
  const l = roomLines(room()).find(x => x.src===info.src && x.id===info.id);
  if(l){ const s = info.card.querySelector("[data-sub]"); if(s) s.textContent = l.total?baht(l.total):"–"; info.card.classList.toggle("sel", l.qty>0); }
  const lines = roomLines(room());
  const tt = $("tabTotal"); if(tt) tt.textContent = baht(lines.filter(x=>x.category===S.tab).reduce((a,x)=>a+x.total,0));
}

document.addEventListener("input", ev => {
  const t = ev.target;
  if(t.dataset.dim){
    room()[t.dataset.dim] = t.value; save();
    const a = areas(room()); $("aFloor").textContent = fmtQ(a.floor)+" ตร.ม."; $("aWall").textContent = fmtQ(a.wall)+" ตร.ม.";
    return;
  }
  if(t.dataset.g){ S[t.dataset.g] = t.value; save(); return; }
  const info = cardInfo(t); if(!info) return;
  if(t.dataset.f === "qty"){ setQty(info, t.value); save(); liveUpdate(info); }
  if(t.dataset.f === "price"){ setPrice(info, t.value); save(); liveUpdate(info); }
});
document.addEventListener("change", ev => {
  const t = ev.target;
  if(t.dataset.dim || t.dataset.f || t.dataset.g){ softRender(); return; }
  if(t.dataset.act === "onlySel"){ S.onlySel = t.checked; save(); render(); return; }
  if(t.dataset.act === "bought"){
    const info = cardInfo(t); if(!info) return;
    if(info.src === "custom"){ const c = findCustom(info.id); if(c) c.bought = t.checked; }
    else entry(S.cur, info.id, true).bought = t.checked;
    save(); render(); return;
  }
  if(t.dataset.act === "import"){
    const f = t.files && t.files[0]; if(!f) return;
    f.text().then(txt => {
      const d = JSON.parse(txt);
      if(!d || !Array.isArray(d.rooms) || !d.rooms.length) throw new Error("bad");
      S = Object.assign({items:{}, custom:{}, contingency:10, tab:"summary"}, d); S.cur = S.rooms[0].id; save(); render(); toast("กู้คืนข้อมูลแล้ว");
    }).catch(()=>toast("ไฟล์ไม่ถูกต้อง"));
  }
});
// re-render only once focus has left the input fields, so typing from one box to the next is never interrupted
function softRender(){
  setTimeout(() => {
    const a = document.activeElement;
    if(a && a.matches("input:not([type=checkbox]),select") && $("view").contains(a)) return;
    render();
  }, 0);
}
document.addEventListener("focusout", ev => {
  if(ev.target.matches && ev.target.matches("#view input:not([type=checkbox])")) softRender();
});
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-act]"); if(!b) return;
  const act = b.dataset.act;
  if(b.tagName === "INPUT" || (b.tagName === "LABEL")) return; // handled by change
  if(act === "closeBg"){ if(ev.target === b) closeModal(); return; }
  ev.preventDefault();
  const info = cardInfo(b);
  switch(act){
    case "tab": S.tab = b.dataset.id; save(); render(); window.scrollTo(0,0); break;
    case "room": if(S.cur === b.dataset.id){ roomModal(room()); break; } S.cur = b.dataset.id; save(); render(); break;
    case "addRoom": roomModal(null); break;
    case "editRoom": roomModal(room()); break;
    case "preset": {
      const base = b.dataset.v; let i = 1, name = base;
      while(S.rooms.some(r=>r.name===name)){ i++; name = base+" "+i; }
      $("mRoomName").value = name; break; }
    case "saveRoom": {
      const name = $("mRoomName").value.trim() || "ห้องใหม่";
      if(b.dataset.id){ const rm = S.rooms.find(r=>r.id===b.dataset.id); if(rm) rm.name = name; }
      else {
        const rm = {id:uid(), name, w:"", l:"", h:"2.6", open:""};
        const from = $("mCopy") && $("mCopy").value;
        if(from){
          const src = S.rooms.find(r=>r.id===from);
          if(src){ rm.w=src.w; rm.l=src.l; rm.h=src.h; rm.open=src.open; }
          S.items[rm.id] = JSON.parse(JSON.stringify(S.items[from]||{}));
          for(const k in S.items[rm.id]) S.items[rm.id][k].bought = false;
          S.custom[rm.id] = (S.custom[from]||[]).map(c => Object.assign({}, c, {id:uid(), bought:false}));
        }
        S.rooms.push(rm); S.cur = rm.id;
      }
      save(); closeModal(); render(); break; }
    case "delRoom": {
      if(b.dataset.confirm !== "1"){ b.dataset.confirm = "1"; b.textContent = "แตะอีกครั้งเพื่อลบ"; break; }
      const id = b.dataset.id; S.rooms = S.rooms.filter(r=>r.id!==id); delete S.items[id]; delete S.custom[id];
      S.cur = S.rooms[0].id; save(); closeModal(); render(); break; }
    case "close": closeModal(); break;
    case "inc": case "dec": {
      const ln = info.src==="cat" && roomLines(room()).find(x => x.src==="cat" && x.id===info.id);
      if(ln && ln.offer){ if(act==="inc"){ entry(S.cur, info.id, true).on = true; save(); render(); } break; }
      const inp = info.card.querySelector('[data-f="qty"]');
      const v = Math.max(0, Math.round((n(inp.value) + (act==="inc"?1:-1))*100)/100);
      setQty(info, String(v)); save(); render(); break; }
    case "autoOn": { const e = entry(S.cur, info.id, true); e.on = true; delete e.qtyManual; delete e.qty; save(); render(); break; }
    case "autoOff": { const e = entry(S.cur, info.id, true); delete e.on; delete e.qtyManual; delete e.qty; save(); render(); break; }
    case "useNew": case "resetPrice": { const e = entry(S.cur, info.id, true); delete e.price; delete e.priceBase; save(); render(); break; }
    case "addCustom": customModal(null); break;
    case "editCustom": customModal(findCustom(info.id)); break;
    case "saveCustom": {
      const c = {name:$("cName").value.trim()||"รายการใหม่", price:$("cPrice").value, unit:$("cUnit").value.trim()||"ชิ้น",
        qty:$("cQty").value, category:$("cCat").value, link:$("cLink").value.trim(), labor:$("cLabor").checked};
      S.custom[S.cur] = S.custom[S.cur] || [];
      if(b.dataset.id){ const old = findCustom(b.dataset.id); if(old) Object.assign(old, c); }
      else S.custom[S.cur].push(Object.assign({id:uid(), bought:false}, c));
      S.tab = c.category; save(); closeModal(); render(); break; }
    case "delCustom": {
      if(b.dataset.confirm !== "1"){ b.dataset.confirm = "1"; b.textContent = "แตะอีกครั้งเพื่อลบ"; break; }
      S.custom[S.cur] = (S.custom[S.cur]||[]).filter(c=>c.id!==b.dataset.id); save(); closeModal(); render(); break; }
    case "scope": S.sumScope = b.dataset.id; save(); render(); break;
    case "retry": syncState = "loading"; render(); fetchCatalog(); break;
    case "export": {
      const blob = new Blob([JSON.stringify(S, null, 1)], {type:"application/json"});
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "reno-budget-" + new Date().toISOString().slice(0,10) + ".json";
      document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast("บันทึกไฟล์สำรองแล้ว"); break; }
  }
});

render();
fetchCatalog();
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") fetchCatalog(); });
if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js").catch(()=>{}); }
})();
