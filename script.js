const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
const CATS = [["roads","🛣️","Roads","Roads Dept"],["water","💧","Water","Water Board"],["power","⚡","Power","Power Corp"],["garbage","🗑️","Garbage","Sanitation"],["drain","🌊","Drainage","Sanitation"],["parks","🌳","Parks","Horticulture"],["lights","💡","Street lights","Power Corp"],["other","📌","Other","General"]];
const CAT_IMAGES = {
    roads:   'https://images.unsplash.com/photo-1749407758749-88fa5e77019a?auto=format&fit=crop&w=600&h=400&q=85',
    water:   'https://images.unsplash.com/photo-1521207418485-99c705420785?auto=format&fit=crop&w=600&h=400&q=85',
    power:   'https://images.unsplash.com/photo-1664135835898-955d1e4f9800?auto=format&fit=crop&w=600&h=400&q=85',
    garbage: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=600&h=400&q=85',
    drain:   'https://images.unsplash.com/photo-1741997376476-04fb29e5af7d?auto=format&fit=crop&w=600&h=400&q=85',
    parks:   'https://images.unsplash.com/photo-1643473886441-ed3c866fffea?auto=format&fit=crop&w=600&h=400&q=85',
    lights:  'https://images.unsplash.com/photo-1505209100289-b4ba97066c6d?auto=format&fit=crop&w=600&h=400&q=85',
    other:   'https://images.unsplash.com/photo-1764463263237-8cacd4226690?auto=format&fit=crop&w=600&h=400&q=85',
};
const catIcon = id => `<div class="cat-img-wrap"><img class="cat-img" src="${CAT_IMAGES[id] || ''}" alt="${id}" onerror="this.style.display='none';this.parentNode.dataset.fallback='1'"></div>`;
const KEYS = { roads: "pothole road crack", water: "water leak pipe tap", power: "power electric wire", garbage: "garbage trash waste dump", drain: "drain sewer block", parks: "park tree bench", lights: "light lamp dark" };
const LV = ["Junior Engineer", "Executive Engineer", "Department Head", "Commissioner"], SLA = [48, 24, 24, 12];
let skew = 0, role = "cit", currentUser = null, view = "home", fil = "all", T = [], savedReports = [], maps = {}, selectedMarker = null, suggestionRequest = 0; const now = () => Date.now() + skew, H = 3600e3;
const API_BASE = ["localhost", "127.0.0.1"].includes(location.hostname) && location.port === "5500"
    ? `${location.protocol}//${location.hostname}:3000` : "";
const rawFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
    const originalUrl = String(args[0]?.url || args[0] || "");
    if (originalUrl.startsWith("/api/") && API_BASE) {
        args = [API_BASE + originalUrl, { ...(args[1] || {}), credentials: "include" }];
    }
    const response = await rawFetch(...args);
    const url = String(args[0]?.url || args[0] || "");
    if (response.status === 401 && currentUser && !url.includes("/api/auth/login") && !url.includes("/api/auth/register")) {
        currentUser = null; updateSession(); toast("Your session expired. Please sign in again."); if (view !== "auth") go("auth");
    }
    return response;
};
const toast = m => { const t = $("#toast"); t.textContent = m; t.style.display = "block"; clearTimeout(t.h); t.h = setTimeout(() => t.style.display = "none", 2600) };
const cat = id => CATS.find(c => c[0] == id);
const ph = (c, fx) => `<svg class="ph" viewBox="0 0 160 90"><defs><linearGradient id="g${fx}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fx ? "#bbf7d0" : "#fecaca"}"/><stop offset="1" stop-color="${fx ? "#e0f2fe" : "#fde68a"}"/></linearGradient></defs><rect width="160" height="90" fill="url(#g${fx})"/><rect y="58" width="160" height="32" fill="${fx ? "#64748b" : "#475569"}"/><path d="M0 76H160" stroke="#fff" stroke-dasharray="10 8"/>${fx ? '<g class="tick"><circle cx="80" cy="34" r="20" fill="#10B981"/><path d="M70 34l8 8 14-16" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/></g>' : '<ellipse cx="80" cy="70" rx="26" ry="8" fill="#1e293b"/><path d="M58 66l-12-6M102 66l14-8M80 62v-8" stroke="#1e293b" stroke-width="2"/><text x="80" y="44" font-size="30" text-anchor="middle">' + cat(c)[1] + '</text>'}<text x="6" y="14" font-size="9" font-weight="700" fill="#1e293b">${fx ? "AFTER" : "BEFORE"}</text></svg>`;
const conf = () => { for (let i = 0; i < 40; i++) { const e = document.createElement("i"); e.className = "cf"; e.style.cssText = `left:${Math.random() * 100}vw;background:hsl(${Math.random() * 360},80%,60%);animation-delay:${Math.random() * .4}s`; document.body.appendChild(e); setTimeout(() => e.remove(), 2900) } };
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const t = e.target; t.classList.add("in"); io.unobserve(t); setTimeout(() => { t.classList.remove("rv", "in"); t.style.transitionDelay = "" }, 1300) } }), { threshold: .08 });
const reveal = () => $$(`#v-${view} .card:not(.rv),#v-${view} .strip>div:not(.rv),#v-${view} .cta:not(.rv)`).forEach((e, i) => { e.classList.add("rv"); e.style.transitionDelay = (i % 4) * 80 + "ms"; io.observe(e) });
let LG = ["hi", "pa"].includes(localStorage.getItem("civic-language")) ? localStorage.getItem("civic-language") : "en"; const NV = { hi: { Home: "à¤¹à¥‹à¤®", Report: "à¤¶à¤¿à¤•à¤¾à¤¯à¤¤", Track: "à¤Ÿà¥à¤°à¥ˆà¤•", Map: "à¤¨à¤•à¥à¤¶à¤¾", Wards: "à¤µà¤¾à¤°à¥à¤¡", "My reports": "à¤®à¥‡à¤°à¥€ à¤¶à¤¿à¤•à¤¾à¤¯à¤¤à¥‡à¤‚", Dashboard: "à¤¡à¥ˆà¤¶à¤¬à¥‹à¤°à¥à¤¡", "Live map": "à¤²à¤¾à¤‡à¤µ à¤¨à¤•à¥à¤¶à¤¾" }, pa: { Home: "à¨¹à©‹à¨®", Report: "à¨¸à¨¼à¨¿à¨•à¨¾à¨‡à¨¤", Track: "à¨Ÿà©à¨°à©ˆà¨•", Map: "à¨¨à¨•à¨¸à¨¼à¨¾", Wards: "à¨µà¨¾à¨°à¨¡", "My reports": "à¨®à©‡à¨°à©€à¨†à¨‚ à¨¸à¨¼à¨¿à¨•à¨¾à¨‡à¨¤à¨¾à¨‚", Dashboard: "à¨¡à©ˆà¨¸à¨¼à¨¬à©‹à¨°à¨¡", "Live map": "à¨²à¨¾à¨ˆà¨µ à¨¨à¨•à¨¸à¨¼à¨¾" } };
const animOn = () => { document.body.classList.add("anim"); clearTimeout(animOn.t); animOn.t = setTimeout(() => document.body.classList.remove("anim"), 1700) };
function seed() {
    const d = [["roads", 12, "Pothole on main road", 120, 90, -50, 1, 2], ["water", 7, "Water pipe leak", 300, 150, 3, 1, 0], ["garbage", 3, "Garbage not collected", 450, 90, 26, 0, 0], ["lights", 9, "Street light off", 180, 260, 50, 0, 0], ["drain", 12, "Blocked drain", 130, 110, -3, 3, 1], ["roads", 5, "Broken footpath", 480, 280, -1, 3, 0], ["power", 8, "Loose wire", 350, 300, -20, 1, 1], ["garbage", 12, "Overflowing bin", 250, 220, 0, 3, 0], ["parks", 2, "Broken bench", 520, 170, 30, 0, 0], ["water", 4, "No water supply", 90, 300, 8, 1, 0], ["lights", 6, "Dark lane", 400, 200, -6, 3, 0], ["roads", 9, "Road cave-in", 220, 330, 20, 1, 0]];
    d.forEach((x, i) => {
        const t = { id: 48872 - i * 2, c: x[0], ward: x[1], title: x[2], x: x[3], y: x[4], st: x[6], lv: x[7], plus: 1 + i % 4, dl: Date.now() + x[5] * H, ev: [] }; if (x[6] == 3) t.dl = Date.now() - 5 * H;
        t.ev.push([Date.now() - 60 * H, "Reported by citizen"], [Date.now() - 59 * H, "Assigned to " + cat(x[0])[3]]); if (x[6] >= 1) t.ev.push([Date.now() - 56 * H, "Work in progress"]); for (let k = 1; k <= t.lv; k++)t.ev.push([Date.now() - (30 - k * 5) * H, "âš ï¸ Escalated to " + LV[k]]); if (x[6] == 3) t.ev.push([Date.now() - 5 * H, "âœ… Resolved with proof photo"]); T.push(t)
    }); T[4].lv = 1; T[0].mine = 1;
}
const left = t => t.dl - now(), fmt = ms => { const a = Math.abs(ms), d = Math.floor(a / 24 / H), h = Math.floor(a / H % 24), m = Math.floor(a / 6e4 % 60); return (d ? d + "d " : "") + h + "h" + (d ? "" : " " + m + "m") };
const stName = t => ["Registered", "In progress", "Escalated", "Resolved"][t.st >= 3 ? 3 : t.st == 2 || t.lv > 0 && t.st < 3 ? 2 : t.st];
const col = t => t.st >= 3 ? "var(--green)" : left(t) < 0 ? "#EF4444" : "#F59E0B";
const stTag = t => { const k = t.st >= 3 ? 3 : (t.lv > 0 ? 2 : t.st); return `<span class="tag s${k}">${["Registered", "In progress", "Escalated", "Resolved"][k]}</span>` };
const dueTxt = t => t.st >= 3 ? "Done" : left(t) < 0 ? `<span class="od">Overdue ${fmt(left(t))}</span>` : "Due in " + fmt(left(t));
function tick() { let ch = 0; T.forEach(t => { if (t.st < 3 && left(t) < 0 && t.lv < 3) { t.lv++; t.dl = now() + SLA[t.lv] * H; t.ev.push([now(), "âš ï¸ Deadline missed â†’ escalated to " + LV[t.lv] + " (alert sent)"]); ch = 1; toast("Ticket #" + t.id + " auto-escalated to " + LV[t.lv]); notify("ðŸš¨ #" + t.id + " escalated to " + LV[t.lv], t.id) } }); if (ch || true) paint() }
function paint() { const v = view; if (v == "home") { renderSavedMap("home"); renderSavedMap("explore") } if (v == "map") { renderSavedMap("main"); requestAnimationFrame(() => maps.main?.invalidateSize()) } if (v == "ward") wards(); if (v == "mine") mine(); if (v == "dash") loadOfficerDashboard(); if (v == "track" && cur) showT(cur, 1) }
/* NAV */
function nav() {
    const citizen = [["home", "Home"], ["report", "Report"], ["track", "Track"], ["map", "Map"], ["ward", "Wards"], ["mine", "My reports"]];
    const staff = [["dash", "Dashboard"], ["map", "Live map"], ["ward", "Wards"]];
    const links = ["officer", "administrator"].includes(currentUser?.role) ? staff : citizen;
    $("#nav").innerHTML = links.map(x => `<button data-v="${x[0]}" class="${x[0] == view ? "on" : ""}">${window.civicI18n?.translate(x[1]) || (NV[LG] || {})[x[1]] || x[1]}</button>`).join("");
    $$("#nav button").forEach(b => b.onclick = () => go(b.dataset.v));
}
function updateSession() {
    role = ["officer", "administrator"].includes(currentUser?.role) ? "dept" : "cit";
    document.body.classList.toggle("dept", role === "dept");
    $("#brandT").textContent = currentUser?.department?.name || (currentUser?.role === "administrator" ? "Administrator" : "CivicTrack");
    $("#sessionLabel").textContent = currentUser ? `${currentUser.name} · ${currentUser.role}` : "Not signed in";
    $("#authOpen").hidden = Boolean(currentUser); $("#logout").hidden = !currentUser; nav();
}
function go(v) {
    if (v === "report" && currentUser?.role !== "citizen") { toast("Sign in with a citizen account to submit a report"); v = "auth"; }
    if ((v === "dash" || v === "mine") && !currentUser) { toast("Sign in to view this page"); v = "auth"; }
    if (v === "dash" && !["officer", "administrator"].includes(currentUser?.role)) { toast("This page is for department staff"); v = "home"; }
    if (v === "mine" && currentUser?.role !== "citizen") v = "home";
    view = v; document.body.classList.toggle("landing-active", v === "home"); $$(".view").forEach(e => e.classList.toggle("on", e.id == "v-" + v)); nav(); if (v == "report") wiz(1); animOn(); paint(); reveal(); scrollTo(0, 0); window.civicI18n?.localize(document.getElementById("v-" + v) || document.body); requestAnimationFrame(() => { ["home", "explore"].forEach(name => { if (v === "home") maps[name]?.invalidateSize(); }); maps[v === "report" ? "pick" : v === "map" ? "main" : ""]?.invalidateSize(); });
}
window.go = go;
$("#authOpen").onclick = () => go("auth");
$("#logout").onclick = async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); currentUser = null; updateSession(); toast("Signed out"); go("home"); };
async function loadSession() { try { const response = await fetch("/api/auth/me"); if (!response.ok) throw new Error(); currentUser = (await response.json()).user; } catch { currentUser = null; } updateSession(); }
async function submitAuth(form, endpoint) {
    const fields = Object.fromEntries(new FormData(form)); const message = form.id === "registerForm" ? $("#registerMessage") : $("#authMessage"); message.textContent = "";
    try {
        const response = await fetch(`/api/auth/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const contentType = response.headers.get("content-type") || "unknown response type";
            throw new Error(payload.error?.message || `Account request failed (HTTP ${response.status}; ${contentType}).`);
        }
        currentUser = payload.user; updateSession(); form.reset(); toast(window.civicI18n?.translate("Signed in successfully") || "Signed in successfully");
        go(["officer", "administrator"].includes(currentUser.role) ? "dash" : "home");
    } catch (error) { message.textContent = error.message; }
}
$("#loginForm").onsubmit = event => { event.preventDefault(); submitAuth(event.currentTarget, "login"); };
$("#registerForm").onsubmit = event => { event.preventDefault(); submitAuth(event.currentTarget, "register"); };
$("#openRegister").onclick = () => go("register");
$("#openLogin").onclick = () => go("auth");
$$('footer [data-view]').forEach(link => link.addEventListener("click", event => { event.preventDefault(); go(link.dataset.view); }));
window.refreshLocalizedUI = () => {
    LG = window.CIVIC_LANGUAGE || "en";
    nav();
    renderCats();
    if (view === "home") {
        if (maps.home) renderSavedMap("home");
        if (maps.explore) renderSavedMap("explore");
        loadPublicMetrics();
    }
    if (view === "report") {
        wiz(R.step);
    }
    if (view === "map" && maps.main) renderSavedMap("main");
    window.civicI18n?.localize(document.body);
};
$("#lang").onchange = event => window.civicI18n?.setLanguage(event.currentTarget.value);
const supportEmail = document.querySelector('meta[name="support-email"]')?.content.trim() || "";
if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(supportEmail)) {
    $("#contactStatus").hidden = true; $("#contactEmailRow").hidden = false;
    $("#contactEmail").href = `mailto:${supportEmail}`; $("#contactEmail").textContent = supportEmail;
}
/* HOME */
$("#cats").innerHTML = CATS.map(c => `<div class="card cat" data-c="${c[0]}">${catIcon(c[0])}<span class="cat-label">${c[2]}</span></div>`).join("");
$$("#cats .cat").forEach(e => e.onclick = () => { R.cat = e.dataset.c; go("report") });
$("#q").onkeydown = e => { if (e.key == "Enter") { R.cat = guess($("#q").value); $("#desc").value = $("#q").value; go("report") } };
/* REPORT */
let R = { step: 1, cat: "roads", latitude: null, longitude: null }; const guess = s => { s = s.toLowerCase(); for (const k in KEYS) if (KEYS[k].split(" ").some(w => s.includes(w))) return k; return "roads" };

const MAP_CENTER = [22.5726, 88.3639];
function mapError(id, message) { const el = $(id); if (el) el.innerHTML = '<div class="map-fallback" role="status">' + esc(message) + '</div>'; }
function makeLeafletMap(id, zoom) {
    const element = $(id); if (!element) return null;
    if (!window.L) { mapError(id, "The map library could not load. Use manual coordinates for reporting or a ticket ID to track."); const message = $(id === "#homeMap" ? "#homeMapMessage" : id === "#exploreMap" ? "#exploreMapMessage" : "#mapMessage"); if (message) message.textContent = "The interactive map could not be initialized."; const manual = $("#manualLocation"); if (manual) manual.hidden = false; return null; }
    const map = window.L.map(element, { scrollWheelZoom: false, preferCanvas: true }).setView(MAP_CENTER, zoom);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' }).addTo(map);
    map.on("tileerror", () => { const status = $(id === "#homeMap" ? "#homeMapMessage" : id === "#exploreMap" ? "#exploreMapMessage" : "#mapMessage"); if (status) status.textContent = "Map tiles are unavailable. Public report data may still be loaded."; });
    return map;
}
function initializeMaps() {
    if (!maps.home) maps.home = makeLeafletMap("#homeMap", 12);
    if (!maps.explore) maps.explore = makeLeafletMap("#exploreMap", 12);
    if (!maps.main) maps.main = makeLeafletMap("#mainMap", 12);
    if (maps.pick) return;
    $("#pickMap").onclick = null;
    maps.pick = makeLeafletMap("#pickMap", 14);
    if (!maps.pick) return;
    maps.pick.on("click", e => setReportLocation(e.latlng.lat, e.latlng.lng));
    maps.pick.on("tileerror", () => { $("#manualLocation").hidden = false; $("#locationStatus").textContent = "Map tiles are unavailable. Enter coordinates below."; });
    if (R.latitude !== null && R.longitude !== null) setReportLocation(R.latitude, R.longitude, false);
}
function setReportLocation(latitude, longitude, search = true) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return toast("Enter valid latitude and longitude.");
    R.latitude = latitude; R.longitude = longitude;
    if (maps.pick && window.L) {
        const point = [latitude, longitude];
        if (selectedMarker) selectedMarker.setLatLng(point); else selectedMarker = window.L.marker(point, { draggable: true }).addTo(maps.pick);
        selectedMarker.off("dragend").on("dragend", () => { const p = selectedMarker.getLatLng(); setReportLocation(p.lat, p.lng); });
        maps.pick.setView(point, Math.max(maps.pick.getZoom(), 15));
    }
    $("#manualLat").value = latitude.toFixed(6); $("#manualLng").value = longitude.toFixed(6);
    $("#locationStatus").textContent = "Selected location " + latitude.toFixed(5) + ", " + longitude.toFixed(5) + ".";
    if (search) dupCheck();
}
function drawMap(id, pick) {
    if (id === "#pickMap") { initializeMaps(); requestAnimationFrame(() => maps.pick && maps.pick.invalidateSize()); }
    else if (id === "#homeMap") { initializeMaps(); renderSavedMap("home"); renderSavedMap("explore"); }
    else if (id === "#exploreMap") { initializeMaps(); renderSavedMap("explore"); }
    else if (id === "#mainMap") { initializeMaps(); renderSavedMap("main"); }
}
function mapUI() {
    $("#mapCategory").innerHTML = '<option value="all">All categories</option>' + CATS.map(c => '<option value="' + esc(c[0]) + '">' + esc(c[2]) + '</option>').join("");
    $("#mapCategory").onchange = () => renderSavedMap("main");
    $("#mapStatus").onchange = () => renderSavedMap("main");
    $("#mapRefresh").onclick = () => renderSavedMap("main");
}
function markerColor(report) { return report.isEscalated ? "#9333ea" : report.isOverdue ? "#dc2626" : report.status === "closed" ? "#059669" : report.status === "reopened" ? "#ea580c" : report.status === "resolution_pending_confirmation" ? "#2563eb" : report.status === "in_progress" ? "#d97706" : "#475569"; }
function publicStatusName(status) { return ({ assigned: "Assigned", in_progress: "In progress", resolution_pending_confirmation: "Awaiting citizen", reopened: "Reopened", closed: "Closed" })[status] || "Registered"; }
function showMapReport(report, which = "main") {
    const target = which === "home" || which === "explore" ? $(which === "home" ? "#homeMapDetail" : "#exploreMapDetail") : $("#popup");
    if (!target) return;
    target.replaceChildren();
    const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "PUBLIC TICKET";
    const title = document.createElement("h3"); title.textContent = report.ticketId;
    const summary = document.createElement("p"), category = document.createElement("b"); category.textContent = report.category?.label || "Issue";
    const statusName = publicStatusName(report.status);
    summary.append(category, document.createTextNode(" · " + (window.civicI18n?.translate(statusName) || statusName)));
    const privacy = document.createElement("p"); privacy.className = "mut"; privacy.textContent = "Approximate map location; no reporter details are public.";
    const track = document.createElement("button"); track.type = "button"; track.className = "btn rust"; track.textContent = "Open ticket timeline"; track.addEventListener("click", () => trackSavedComplaint(report.ticketId));
    target.append(eyebrow, title, summary, privacy, track); target.hidden = false;
    window.civicI18n?.localize(target);
}
function refreshSavedMaps() { mapDataCache.clear(); loadPublicMetrics(); if (maps.home) renderSavedMap("home"); if (maps.main) renderSavedMap("main"); }
const mapDataCache = new Map();
async function publicMapData(category, status) {
    const key = category + ":" + status, now = Date.now(), cached = mapDataCache.get(key);
    if (cached?.expires > now) return cached.promise;
    const promise = fetch("/api/complaints/map?category=" + encodeURIComponent(category) + "&status=" + encodeURIComponent(status)).then(async response => {
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Public reports could not be loaded."); return payload;
    });
    mapDataCache.set(key, { expires: now + 30000, promise });
    try { return await promise; } catch (error) { mapDataCache.delete(key); throw error; }
}
async function renderSavedMap(which) {
    const map = maps[which]; if (!map) return;
    const statusNode = $(which === "home" ? "#homeMapMessage" : which === "explore" ? "#exploreMapMessage" : "#mapMessage");
    if (statusNode) statusNode.textContent = "Loading public reportsâ€¦";
    try {
        const category = which === "main" ? $("#mapCategory").value : "all";
        const status = which === "main" ? $("#mapStatus").value : "all";
        const payload = await publicMapData(category, status);
        const groupName = which + "Markers";
        if (!maps[groupName]) maps[groupName] = window.L.layerGroup().addTo(map); else maps[groupName].clearLayers();
        const reports = payload.reports || [];
        if (statusNode) {
            if (!reports.length && which === "main") statusNode.textContent = "No saved complaints with locations match these filters. Reports without a pin do not appear.";
            else if (!reports.length) statusNode.textContent = "No public reports with mapped locations are available yet.";
            else statusNode.textContent = (window.civicI18n?.translate("{{count}} public mapped reports shown. Citizen details and staff notes are omitted.") || "{{count}} public mapped reports shown. Citizen details and staff notes are omitted.").replace("{{count}}", String(reports.length));
        }
        const locations = new Map();
        reports.forEach(report => {
            const key = report.latitude + "," + report.longitude;
            if (!locations.has(key)) locations.set(key, []);
            locations.get(key).push(report);
        });
        let markerIndex = 0, activeMarker = null;
        for (const reportsAtLocation of locations.values()) reportsAtLocation.forEach(report => {
            let point = [report.latitude, report.longitude];
            if (reportsAtLocation.length > 1) {
                const center = map.latLngToLayerPoint(point), angle = index * 2 * Math.PI / reportsAtLocation.length;
                const spread = Math.min(24, 12 + reportsAtLocation.length * 2);
                point = map.layerPointToLatLng([center.x + Math.cos(angle) * spread, center.y + Math.sin(angle) * spread]);
            }
            const marker = window.L.circleMarker(point, { radius: 8, color: "#fff", weight: 2, fillColor: markerColor(report), fillOpacity: .92 });
            const activate = () => { if (activeMarker) { activeMarker.setStyle({ radius: 8, weight: 2 }); activeMarker.getElement()?.classList.remove("is-selected"); } activeMarker = marker; marker.setStyle({ radius: 11, weight: 3 }); marker.getElement()?.classList.add("is-selected"); showMapReport(report, which); };
            marker.on("click", activate).on("add", () => {
                const path = marker.getElement(); if (!path) return;
                path.setAttribute("tabindex", "0"); path.setAttribute("role", "button"); path.setAttribute("aria-label", [report.ticketId, window.civicI18n?.translate(report.category?.label || "Issue") || report.category?.label || "Issue", window.civicI18n?.translate(publicStatusName(report.status)) || publicStatusName(report.status), window.civicI18n?.translate("Approximate public location.") || "Approximate public location."].join(" · "));
                path.style.setProperty("--marker-delay", Math.min(markerIndex++ * 24, 650) + "ms");
                path.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
                path.addEventListener("focus", activate); path.addEventListener("mouseenter", activate);
            });
            marker.addTo(maps[groupName]);
        });
        if (reports.length && !maps[which + "HasFit"]) { map.fitBounds(window.L.latLngBounds(reports.map(report => [report.latitude, report.longitude])).pad(.15), { maxZoom: 14 }); maps[which + "HasFit"] = true; }
    } catch (error) { if (statusNode) statusNode.textContent = window.civicI18n?.translate(error.message) || error.message; }
}
const ST = ["Add a photo", "Pin the location", "Confirm category", "Done!"];
function wiz(n) {
    R.step = n; $("#steps").innerHTML = [1, 2, 3].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join(""); $("#stepT").textContent = n < 4 ? `Step ${n} of 3 · ${ST[n - 1]}` : "Ticket created";[1, 2, 3, 4].forEach(i => $("#s" + i).hidden = i != n); $("#wizBtns").style.display = n == 4 ? "none" : "flex"; $("#back").style.visibility = n == 1 ? "hidden" : "visible"; $("#next").textContent = n == 3 ? "Submit" : "Next";
    if (n == 2) { drawMap("#pickMap", 1); dupCheck() } if (n == 3) { catPick(); $("#sugg").textContent = "Suggested: " + cat(R.cat)[2] + " (you can change it)" }
}
async function dupCheck() {
    const request = ++suggestionRequest;
    if (R.latitude === null || R.longitude === null) { $("#dupBox").innerHTML = '<p class="mut">Choose a map location to check nearby reports. You may still submit a separate issue.</p>'; return; }
    $("#dupBox").innerHTML = '<p class="mut" role="status">Checking recent reports in this categoryâ€¦</p>';
    try {
        const response = await fetch("/api/complaints/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: R.cat, location: { latitude: R.latitude, longitude: R.longitude } }) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error && payload.error.message || "Nearby reports could not be checked.");
        if (request !== suggestionRequest) return;
        const suggestions = payload.suggestions || [];
        if (!suggestions.length) { $("#dupBox").innerHTML = '<p class="mut">No recent open ' + esc(cat(R.cat)[2]) + ' reports found within ' + payload.radiusMeters + ' m. You can continue with a separate report.</p>'; return; }
        let html = '<div class="duplicate-box"><h4>Similar nearby reports</h4><p class="mut">Same category, within ' + payload.radiusMeters + ' m and the previous ' + payload.lookbackDays + ' days. Suggestions never merge reports.</p>';
        suggestions.forEach(item => { const distance = item.distanceMeters < 1000 ? item.distanceMeters + " m" : (item.distanceMeters / 1000).toFixed(1) + " km"; html += '<div class="duplicate-row"><b>' + esc(item.ticketId) + '</b><span>' + esc(item.category.label) + ' · ' + esc(item.status.replaceAll("_", " ")) + '</span><span>About ' + distance + ' away</span><button class="btn line duplicate-open" data-ticket="' + esc(item.ticketId) + '">View public ticket</button></div>'; });
        $("#dupBox").innerHTML = html + '<p class="mut">Still reporting a separate issue? Continue below; nothing will be merged.</p></div>';
        $$(".duplicate-open").forEach(button => button.onclick = () => trackSavedComplaint(button.dataset.ticket));
    } catch (error) { if (request === suggestionRequest) $("#dupBox").innerHTML = '<p class="form-error" role="alert">' + esc(error.message) + ' You can continue reporting.</p>'; }
}
$("#catPick").addEventListener("click", event => { if (event.target.closest(".cat")) setTimeout(dupCheck, 0); });
$("#manualLocationUse").onclick = () => {
    if (!$("#manualLat").value.trim() || !$("#manualLng").value.trim()) return toast("Enter both latitude and longitude.");
    setReportLocation(Number($("#manualLat").value), Number($("#manualLng").value));
};
function plus(id) { const t = T.find(x => x.id == id); t.plus++; t.ev.push([now(), "Another citizen reported the same issue (+1)"]); toast("Merged into #" + id); openT(id) }
function catPick() {
    $("#catPick").innerHTML = CATS.map(c => {
        const localizedLabel = window.civicI18n ? window.civicI18n.translate(c[2]) : c[2];
        return `<div class="card cat ${c[0] == R.cat ? "on" : ""}" data-c="${c[0]}">${catIcon(c[0])}<span class="cat-label">${localizedLabel}</span></div>`;
    }).join("");
    $$("#catPick .cat").forEach(e => e.onclick = () => { R.cat = e.dataset.c; catPick() });
}
$("#file").onchange = e => { const f = e.target.files[0]; if (f) $("#drop").innerHTML = `<img src="${URL.createObjectURL(f)}"><input type="file" accept="image/*" hidden id="file">` };
$("#desc").oninput = e => { R.cat = guess(e.target.value); if (R.step === 3) { catPick(); dupCheck(); } };
$("#mic").onclick = () => { const S = window.SpeechRecognition || window.webkitSpeechRecognition; if (!S) return toast("Voice input not supported in this browser"); const r = new S(); r.onresult = e => { $("#desc").value = e.results[0][0].transcript; R.cat = guess($("#desc").value) }; r.start(); toast("Listeningâ€¦") };
$("#back").onclick = () => wiz(R.step - 1);
let savingComplaint = false;
$("#next").onclick = async () => {
    if (R.step == 2 && (R.latitude === null || R.longitude === null)) return toast("Select the issue location on the map or enter coordinates");
    if (R.step < 3) return wiz(R.step + 1);
    if (savingComplaint) return;

    const submitButton = $("#next");
    const formError = $("#formError");
    const c = cat(R.cat);
    savingComplaint = true;
    submitButton.disabled = true;
    submitButton.textContent = "Savingâ€¦";
    formError.textContent = "";
    try {
        const response = await fetch("/api/complaints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: $("#title").value.trim(),
                description: $("#desc").value.trim(),
                category: R.cat,
                location: { latitude: R.latitude, longitude: R.longitude }
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error?.message || "The complaint could not be saved.");
        if (!payload.complaint?.ticketId) throw new Error("The server response did not include a ticket ID.");

        const complaint = payload.complaint;
        $("#tkId").textContent = complaint.ticketId;
        $("#tkDue").textContent = `Assigned to ${complaint.department.name} · Due ${new Date(complaint.dueAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} (demo SLA)`;
        $("#tkStatus").textContent = `Status: ${complaint.status.replaceAll("_", " ")}`;
        $("#tkGo").onclick = () => trackSavedComplaint(complaint.ticketId);
        mkQR(complaint.ticketId);
        R = { step: 1, cat: "roads", latitude: null, longitude: null };
        if (selectedMarker && maps.pick) maps.pick.removeLayer(selectedMarker);
        selectedMarker = null;
        $("#title").value = "";
        $("#desc").value = "";
        wiz(4);
        toast("Complaint saved");
        refreshSavedMaps();
        notify(`âœ… ${complaint.ticketId} saved · assigned to ${complaint.department.name}`, complaint.ticketId);
    } catch (error) {
        formError.textContent = error.message.includes("Failed to fetch")
            ? "The complaint service is unavailable. Check that the server and database are running, then try again."
            : error.message;
    } finally {
        savingComplaint = false;
        submitButton.disabled = false;
        submitButton.textContent = "Submit";
    }
};
/* TRACK */
let cur = null; function openT(id) { go("track"); $("#tid").value = id; showT(id) }
function showT(id, quiet) {
    const t = T.find(x => x.id == id); cur = id; if (!t) return $("#tview").innerHTML = '<p class="card" style="max-width:640px;margin:14px auto">Ticket not found.</p>';
    const pend = t.st < 3 ? `<div class="pend">${t.lv < 3 ? "Escalation if overdue" : "Public critical flag"}</div><div class="pend">Resolved + proof</div>` : "";
    $("#tview").innerHTML = `<p class="mut">Illustrative browser-only demo ticket; this record is not saved in PostgreSQL.</p><div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">#${t.id} · ${cat(t.c)[1]} ${t.title} · Ward ${t.ward}</h3><div>${stTag(t)} <b>${dueTxt(t)}</b></div></div></div>
 <div class="two" style="margin-top:14px"><div class="card"><h3>Timeline</h3><div class="tl">${t.ev.map(e => `<div class="${e[1].includes("âš ï¸") ? "bad" : ""}"><b>${e[1]}</b><br><span class="mut">${new Date(e[0]).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span></div>`).join("")}${pend}</div></div>
 <div class="card"><h3>Responsible officer</h3><p><b>${LV[t.lv]}</b> · ${cat(t.c)[3]}</p><h3>Escalation ladder</h3><div class="lad">${LV.map((l, i) => `<span class="${i == t.lv && t.st < 3 ? "on" : i < t.lv || t.st >= 3 ? "done" : ""}">L${i}</span>`).join("")}</div><p class="mut">Now: ${LV[t.lv]} · next: ${LV[t.lv + 1] || "Public flag"}</p><h3>Photos</h3><div class="row" style="flex-wrap:nowrap"><div style="flex:1">${ph(t.c, 0)}</div><div style="flex:1">${t.st >= 3 ? ph(t.c, 1) : '<div class="mut" style="height:100%;min-height:80px;border-radius:10px;background:var(--line);display:grid;place-items:center">After: pending</div>'}</div></div>
 ${t.st >= 3 && !t.ok ? `<h3>Is this fixed?</h3><div class="row"><button class="btn grn" onclick="confirmT(${t.id})">Yes, confirm</button><button class="btn rust" onclick="reopen(${t.id})">Reopen</button></div>` : t.ok ? "<p>âœ… Closed â€” thank you!</p>" : ""}</div></div>`
}
function renderSavedComplaint(complaint) {
    cur = null;
    const status = String(complaint.status).replaceAll("_", " ");
    const events = complaint.events.map(event => `<div><b>${esc(event.note || event.eventType.replaceAll("_", " "))}</b><br><span class="mut">${new Date(event.createdAt).toLocaleString("en-IN")}</span><br><span class="mut">${esc(event.previousStatus ? `${event.previousStatus.replaceAll("_", " ")} â†’ ` : "")}${esc(event.newStatus?.replaceAll("_", " ") || "")}</span></div>`).join("");
    const location = complaint.location?.latitude != null
        ? "Geographic location saved"
        : !complaint.location || complaint.location.mapX === null
            ? "No location pin saved"
            : `Illustrative map position (${Math.round(complaint.location.mapX)}, ${Math.round(complaint.location.mapY)})`;
    const gps = complaint.location?.latitude == null
        ? ""
        : `<p class="mut">GPS: ${esc(complaint.location.latitude)}, ${esc(complaint.location.longitude)}</p>`;

    const description = complaint.description ? `<p>${esc(complaint.description)}</p>` : "";
    const due = complaint.dueAt ? `<p><b>Target deadline:</b> ${new Date(complaint.dueAt).toLocaleString("en-IN")} <span class="mut">(demonstration SLA)</span></p>` : "";
    const displayTitle = complaint.title || "Private complaint details";
    const state = complaint.isEscalated ? '<p class="od">SLA escalation recorded. Workflow status remains unchanged.</p>' : complaint.isOverdue ? '<p class="od">This complaint is overdue and awaiting department action.</p>' : '';
    const evidence = (complaint.evidence || []).map(item => `<a href="/api/evidence/${encodeURIComponent(item.id)}" target="_blank" rel="noopener"><img class="evidence-thumb" src="/api/evidence/${encodeURIComponent(item.id)}" alt="Resolution evidence"></a>`).join("");
    const responseControls = complaint.viewerIsOwner && complaint.status === "resolution_pending_confirmation" ? `<div class="row"><button class="btn grn" onclick="respondToResolution('${esc(complaint.ticketId)}','confirm')">Confirm resolution</button><button class="btn rust" onclick="respondToResolution('${esc(complaint.ticketId)}','reject')">Reject and reopen</button></div><p class="mut">Review the department evidence before responding.</p>` : complaint.viewerIsOwner && complaint.status === "closed" ? '<p>âœ… You confirmed this resolution.</p>' : '';
    $("#tview").innerHTML = `<div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(complaint.ticketId)} · ${esc(displayTitle)}</h3><span class="tag s0">${esc(status)}</span></div>${state}${description}<p><b>Category:</b> ${esc(complaint.category.label)} · <b>Department:</b> ${esc(complaint.department.name)}</p>${due}<p class="mut">${esc(location)}</p>${gps}<p class="mut">Created ${new Date(complaint.createdAt).toLocaleString("en-IN")}</p>${evidence ? `<h3>Resolution evidence</h3><div class="evidence-gallery">${evidence}</div>` : ''}${responseControls}</div><div class="two" style="margin-top:14px"><div class="card"><h3>Saved activity history</h3><div class="tl">${events || '<p class="mut">No events recorded.</p>'}</div></div><div class="card"><h3>What happens next?</h3><p class="mut">${complaint.status === 'resolution_pending_confirmation' ? 'Review the attached evidence and confirm the work, or reject it to reopen the report.' : complaint.status === 'closed' ? 'This complaint is closed.' : 'The assigned department will update this saved complaint through its work queue.'}</p></div></div>`;
}
async function respondToResolution(ticketId, decision) {
    const promptNote = decision === "reject" ? window.prompt("What remains unresolved? (optional)") : "";
    if (decision === "reject" && promptNote === null) return;
    try {
        const response = await fetch(`/api/complaints/${encodeURIComponent(ticketId)}/confirmation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note: promptNote || "" }) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Could not save your response.");
        toast(decision === "confirm" ? "Resolution confirmed. Complaint closed." : "Complaint reopened for more work."); await trackTicket(ticketId);
    } catch (error) { toast(error.message); }
}
async function trackTicket(ticketId = $("#tid").value.trim()) {
    const requestedId = String(ticketId || "").trim();
    $("#tid").value = requestedId;
    if (!requestedId) {
        $("#tview").innerHTML = '<p class="card" style="max-width:640px;margin:14px auto">Enter a ticket ID to track a complaint.</p>';
        return;
    }

    const demo = T.find(t => String(t.id) === requestedId);
    if (demo) return showT(demo.id);

    $("#tview").innerHTML = '<p class="card" style="max-width:640px;margin:14px auto">Loading saved complaintâ€¦</p>';
    try {
        const response = await fetch(`/api/complaints/${encodeURIComponent(requestedId)}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error?.message || "The complaint could not be loaded.");
        renderSavedComplaint(payload.complaint);
    } catch (error) {
        $("#tview").innerHTML = `<p class="card" style="max-width:640px;margin:14px auto" role="alert">${esc(error.message.includes("Failed to fetch") ? "The complaint service is unavailable. Check that the server and database are running." : error.message)}</p>`;
    }
}
function trackSavedComplaint(ticketId) { cur = null; go("track"); return trackTicket(ticketId) }
$("#tgo").onclick = () => trackTicket();
$("#tid").onkeydown = e => { if (e.key === "Enter") trackTicket() };
$("#try").onclick = e => { e.preventDefault(); openT(48872) };
const confirmT = id => { const t = T.find(x => x.id == id); t.ok = 1; t.ev.push([now(), "Citizen confirmed â€” closed"]); showT(id); conf(); toast("Ticket closed") };
const reopen = id => { const t = T.find(x => x.id == id); t.st = 1; t.lv = 0; t.dl = now() + 24 * H; t.ev.push([now(), "ðŸ” Citizen reopened â€” back in progress"]); showT(id); toast("Reopened") };
/* WARDS */
async function mine() {
    $("#mine").innerHTML = '<div class="card">Loading your saved reportsâ€¦</div>';
    try {
        const response = await fetch("/api/complaints/mine"); const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || "Could not load your reports.");
        const complaints = payload.complaints || [];
        $("#mine").innerHTML = complaints.length ? complaints.map(c => `<div class="card" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><b>${esc(c.ticketId)} · ${esc(c.title)}</b><span>${esc(c.status.replaceAll("_", " "))}</span></div><p class="mut">${esc(c.category.label)} · ${esc(c.department.name)}</p><button class="btn line" onclick="trackSavedComplaint('${esc(c.ticketId)}')">View status</button></div>`).join("") : '<div class="card" style="text-align:center;padding:40px"><div style="font-size:46px">ðŸ“­</div><p class="mut">No reports yet.</p><button class="btn rust" onclick="go(\'report\')">Report a problem</button></div>';
    } catch (error) { $("#mine").innerHTML = `<p class="card" role="alert">${esc(error.message)}</p>`; }
}
function wards() { const w = []; for (let i = 1; i <= 12; i++) { const a = T.filter(t => t.ward == i); const od = a.filter(t => t.st < 3 && left(t) < 0).length; w.push([i, a.length ? Math.round(100 - od / a.length * 100) : 100, a.length]) } w.sort((a, b) => b[1] - a[1]); $("#wards").innerHTML = w.map((x, i) => `<div style="margin:10px 0"><div class="row" style="justify-content:space-between"><b>${["ðŸ¥‡", "ðŸ¥ˆ", "ðŸ¥‰"][i] || i + 1 + "."} Ward ${x[0]}</b><span>${x[1]}% on time · ${x[2]} issues</span></div><div class="meter"><i style="width:${x[1]}%;background:${x[1] > 80 ? "var(--green)" : x[1] > 50 ? "var(--amber)" : "var(--red)"}"></i></div></div>`).join("") }
/* DEPT */
async function loadOfficerDashboard() {
    $("#v-dash > .row h2").textContent = currentUser?.role === "administrator" ? "Administration and accountability" : "Department work queue";
    $("#queue").innerHTML = '<tr><td colspan="6">Loading work queueâ€¦</td></tr>';
    try {
        const [queueResponse, countsResponse] = await Promise.all([fetch("/api/officer/queue"), fetch("/api/officer/counts")]);
        const queuePayload = await queueResponse.json(); const countsPayload = await countsResponse.json();
        if (!queueResponse.ok) throw new Error(queuePayload.error?.message || "Could not load the department queue.");
        if (!countsResponse.ok) throw new Error(countsPayload.error?.message || "Could not load department counts.");
        const counts = countsPayload.counts || {}; const open = Object.entries(counts).filter(([s]) => s !== "closed").reduce((n, [,v]) => n + v, 0);
        if (currentUser?.role === "administrator") {
            const overviewResponse = await fetch("/api/admin/overview"); const op = await overviewResponse.json(); if (!overviewResponse.ok) throw new Error(op.error?.message || "Could not load accountability metrics.");
            const m = op.overview; $("#kpi").innerHTML = [["Total complaints",m.totalComplaints],["Open",m.openComplaints],["Overdue",m.overdueComplaints],["Escalated",m.escalatedComplaints],["Closed",m.closedComplaints],["Within SLA",m.resolvedWithinSlaPercent == null ? "â€”" : `${m.resolvedWithinSlaPercent}%`],["Avg resolution",m.averageResolutionHours == null ? "â€”" : `${m.averageResolutionHours} h`],["Citizen confirmed",m.citizenConfirmedClosures],["Reopened",m.reopenedComplaints]].map(k => `<div class="card stat"><b>${esc(k[1])}</b>${k[0]}</div>`).join("");
        } else $("#kpi").innerHTML = [["Open", open], ["Assigned", counts.assigned || 0], ["In progress", counts.in_progress || 0], ["Awaiting confirmation", counts.resolution_pending_confirmation || 0], ["Reopened", counts.reopened || 0]].map(k => `<div class="card stat"><b>${k[1]}</b>${k[0]}</div>`).join("");
        const queue = queuePayload.queue || [];
        $("#queue").innerHTML = queue.length ? queue.map(c => `<tr><td>${esc(c.ticketId)}</td><td>${esc(c.category.label)} · ${esc(c.title)}</td><td>${esc(c.department.name)}</td><td>${new Date(c.dueAt).toLocaleString("en-IN")}</td><td>${esc(c.status.replaceAll("_", " "))}${c.isEscalated ? ' · <b class="od">Escalated</b>' : c.isOverdue ? ' · <b class="od">Overdue</b>' : ''}</td><td><button class="btn line" onclick="dOpen('${esc(c.ticketId)}')">Open</button></td></tr>`).join("") : '<tr><td colspan="6">No complaints in this queue.</td></tr>';
    } catch (error) { $("#queue").innerHTML = `<tr><td colspan="6" role="alert">${esc(error.message)}</td></tr>`; }
}
async function dOpen(ticketId) {
    $("#dBody").innerHTML = '<p>Loading complaintâ€¦</p>'; $("#drawer").classList.add("on");
    try {
        const response = await fetch(`/api/officer/complaints/${encodeURIComponent(ticketId)}`); const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || "Could not load complaint details.");
        const c = payload.complaint; const status = c.status; const canStart = status === "assigned" || status === "reopened"; const canComplete = status === "in_progress";
        const events = (c.events || []).map(event => `<div><b>${esc(event.note || event.eventType)}</b><br><span class="mut">${new Date(event.createdAt).toLocaleString("en-IN")}</span></div>`).join("");
        const location = c.location?.latitude != null
            ? `GPS ${esc(c.location.latitude)}, ${esc(c.location.longitude)}`
            : c.location?.mapX != null ? `Schematic map position ${Math.round(c.location.mapX)}, ${Math.round(c.location.mapY)}` : "No location details saved";
        const images = (c.evidence || []).map(item => `<a href="/api/evidence/${encodeURIComponent(item.id)}" target="_blank" rel="noopener"><img class="evidence-thumb" src="/api/evidence/${encodeURIComponent(item.id)}" alt="Uploaded resolution evidence"></a>`).join("");
        $("#dBody").innerHTML = `<div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(c.ticketId)} · ${esc(c.title)}</h3><button class="btn line" onclick="dClose()">Close</button></div><p><b>${esc(c.category.label)}</b> · ${esc(c.department.name)} · ${esc(status.replaceAll("_", " "))}</p>${c.isEscalated ? '<p class="od">SLA escalation recorded. Workflow status remains unchanged.</p>' : c.isOverdue ? '<p class="od">Overdue · escalation check pending.</p>' : ''}<p>${esc(c.description || "No additional description.")}</p><p><b>Reported location:</b> ${location}</p><p>Target deadline: ${new Date(c.dueAt).toLocaleString("en-IN")} (demonstration SLA)</p><h4>Resolution evidence</h4><div class="evidence-gallery">${images || '<p class="mut">No evidence uploaded.</p>'}</div>${canComplete ? `<label class="btn line" for="evidenceFile">Upload evidence</label><input id="evidenceFile" type="file" accept="image/jpeg,image/png,image/webp" hidden onchange="uploadEvidence('${esc(c.ticketId)}',this)"><p class="mut">JPEG, PNG or WebP; maximum 5 MB.</p>` : ''}<div class="tl" style="margin-top:16px">${events}</div>${canStart ? `<button class="btn rust" onclick="act('${esc(c.ticketId)}','in_progress')">${status === 'reopened' ? 'Resume work' : 'Start work'}</button>` : ""}${canComplete ? `<button class="btn grn" onclick="act('${esc(c.ticketId)}','resolution_pending_confirmation')">Submit for citizen confirmation</button>` : ""}`;
    } catch (error) { $("#dBody").innerHTML = `<p role="alert">${esc(error.message)}</p><button class="btn line" onclick="dClose()">Close</button>`; }
}
async function uploadEvidence(ticketId, input) {
    const file = input.files?.[0]; if (!file) return;
    const button = input.previousElementSibling; if (button) button.textContent = "Uploadingâ€¦";
    try {
        const form = new FormData(); form.append("file", file);
        const response = await fetch(`/api/officer/complaints/${encodeURIComponent(ticketId)}/evidence`, { method: "POST", body: form });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Evidence upload failed.");
        toast("Evidence uploaded privately"); await dOpen(ticketId);
    } catch (error) { toast(error.message); if (button) button.textContent = "Upload evidence"; }
}
const dClose = () => $("#drawer").classList.remove("on"); $("#drawer").onclick = e => { if (e.target.id == "drawer") dClose() };
async function act(ticketId, status) {
    try {
        const response = await fetch(`/api/officer/complaints/${encodeURIComponent(ticketId)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Status update failed.");
        toast("Complaint status updated"); await dOpen(ticketId); await loadOfficerDashboard();
    } catch (error) { toast(error.message); }
}
$("#queueRefresh").onclick = () => loadOfficerDashboard();
$("#landingSearchAction").onclick = () => { const issue = $("#q").value.trim(); if (!issue) { $("#q").focus(); return; } R.cat = guess(issue); $("#desc").value = issue; go("report"); };
const categoryNavBtn = $("#landing-category-action") || $("#landing-explore-action");
if (categoryNavBtn) {
    categoryNavBtn.onclick = () => {
        const shortcutsSec = $("#landing-shortcuts") || $("#cats");
        if (shortcutsSec) {
            shortcutsSec.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                block: "start"
            });
        }
    };
}
$$('.chips span').forEach(c => c.onclick = () => { $("#q").value = c.textContent; R.cat = guess(c.textContent); $("#desc").value = c.textContent; go("report") }); seed(); document.body.classList.toggle("landing-active", view === "home"); nav(); mapUI(); drawMap("#homeMap"); animOn(); loadSession().then(() => { if (["officer", "administrator"].includes(currentUser?.role)) go("dash"); });
addEventListener("scroll", () => { const h = document.documentElement; $("#prog").style.width = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) * 100 + "%" });
addEventListener("mousemove", e => { const c = e.target.closest && e.target.closest(".card"); if (c) { const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px") } });
function releaseLandingIntro() { requestAnimationFrame(() => $("#v-home .landing-hero")?.classList.add("landing-ready")); }
const splash = $("#splash"), reduceStartupMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (splash) {
    setTimeout(() => {
        splash.classList.add("out");
        setTimeout(() => { splash.remove(); releaseLandingIntro(); }, reduceStartupMotion ? 0 : 360);
    }, reduceStartupMotion ? 0 : 90);
} else releaseLandingIntro();
const mkQR = id => { const q = $("#qr"); q.innerHTML = ""; if (window.QRCode) new QRCode(q, { text: "LOGICLOOPS-TICKET-" + id, width: 120, height: 120 }); else q.textContent = "Ticket " + id; $("#prt").onclick = () => print() };
const N = [{ txt: "ðŸ‘‹ Welcome! Updates on your reports appear here.", t: Date.now() }]; let unread = 1;
const bnUpd = () => { const b = $("#bn"); b.textContent = unread; b.classList.toggle("z", !unread) };
const notify = (txt, id) => { N.unshift({ txt, id, t: now() }); unread++; bnUpd(); const b = $("#bell"); b.classList.remove("ring"); void b.offsetWidth; b.classList.add("ring") };
$("#bellB").onclick = e => { e.stopPropagation(); const p = $("#bellP"); p.innerHTML = N.slice(0, 12).map((n, i) => `<div data-n="${i}">${n.txt}<small>${fmt(now() - n.t)} ago</small></div>`).join(""); p.classList.toggle("on"); unread = 0; bnUpd() };
$("#bellP").onclick = e => { const d = e.target.closest("[data-n]"); if (d && N[d.dataset.n].id) { $("#bellP").classList.remove("on"); const id = N[d.dataset.n].id; if (String(id).startsWith("CIV-")) trackSavedComplaint(id); else openT(id) } };
addEventListener("click", () => $("#bellP").classList.remove("on")); bnUpd();

/* ── PUBLIC METRICS AGGREGATION & ANIMATION ── */
let metricsLoadedData = null;
let metricsAnimated = false;

async function loadPublicMetrics() {
    const totalEl = $("#metricTotal");
    const openEl = $("#metricOpen");
    const overdueEl = $("#metricOverdue");
    const closedEl = $("#metricClosed");
    const statusEl = $("#metricStatus");
    if (!totalEl) return;
    try {
        const payload = await publicMapData("all", "all");
        const reports = payload.reports || [];
        const total = reports.length;
        const open = reports.filter(r => r.status !== "closed").length;
        const overdue = reports.filter(r => r.isOverdue).length;
        const closed = reports.filter(r => r.status === "closed").length;

        metricsLoadedData = { total, open, overdue, closed };

        if (metricsAnimated) {
            animateMetricCounter(totalEl, total);
            animateMetricCounter(openEl, open);
            animateMetricCounter(overdueEl, overdue);
            animateMetricCounter(closedEl, closed);
        } else {
            totalEl.textContent = String(total);
            openEl.textContent = String(open);
            overdueEl.textContent = String(overdue);
            closedEl.textContent = String(closed);
        }

        if (statusEl) {
            statusEl.textContent = total > 0
                ? (window.civicI18n?.translate("{{count}} public mapped reports recorded in database.") || "{{count}} public mapped reports recorded in database.").replace("{{count}}", String(total))
                : (window.civicI18n?.translate("No public reports recorded yet in database.") || "No public reports recorded yet in database.");
        }
    } catch {
        if (statusEl) statusEl.textContent = window.civicI18n?.translate("Platform metrics currently unavailable.") || "Platform metrics currently unavailable.";
    }
}

function triggerMetricsAnimation() {
    if (metricsAnimated || !metricsLoadedData) return;
    metricsAnimated = true;
    animateMetricCounter($("#metricTotal"), metricsLoadedData.total);
    animateMetricCounter($("#metricOpen"), metricsLoadedData.open);
    animateMetricCounter($("#metricOverdue"), metricsLoadedData.overdue);
    animateMetricCounter($("#metricClosed"), metricsLoadedData.closed);
}

function animateMetricCounter(el, target) {
    if (!el) return;
    const targetNum = parseInt(target, 10);
    if (isNaN(targetNum) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        el.textContent = String(target);
        return;
    }
    const duration = 1200;
    const startTime = performance.now();
    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = String(Math.round(targetNum * ease));
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = String(targetNum);
    }
    requestAnimationFrame(step);
}

function initLandingExperience() {
    const landing = $("#v-home"), hero = landing?.querySelector(".landing-hero"); if (!landing || !hero) return;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) hero.classList.add("landing-intro");
    if (!reduceMotion && "IntersectionObserver" in window) {
        const observer = new IntersectionObserver(entries => entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible"); observer.unobserve(entry.target);
        }), { threshold: .14, rootMargin: "0px 0px -4% 0px" });
        const targets = landing.querySelectorAll(".landing-problem .landing-eyebrow, .landing-problem h2, .landing-problem .problem-copy, .landing-metrics .metrics-head > *, .metric-card, .landing-workflow .landing-eyebrow, .landing-workflow h2, .workflow-step, .landing-proof .proof-layout > *, .landing-shortcuts .landing-eyebrow, .landing-shortcuts h2, .landing-search, .landing-shortcuts .chips, .landing-shortcuts h3, #cats > *, .landing-final .landing-section-inner > *");
        targets.forEach((element, index) => { element.classList.add("landing-reveal"); element.style.setProperty("--reveal-delay", Math.min(index % 5, 4) * 90 + "ms"); observer.observe(element); });
        const workflow = landing.querySelector(".workflow-line");
        if (workflow) { const workflowObserver = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { workflow.classList.add("workflow-active"); workflowObserver.disconnect(); } }, { threshold: .25 }); workflowObserver.observe(workflow); }

        const metricsSection = landing.querySelector(".landing-metrics");
        if (metricsSection) {
            const metricsObserver = new IntersectionObserver(entries => {
                if (entries.some(entry => entry.isIntersecting)) {
                    triggerMetricsAnimation();
                    metricsObserver.disconnect();
                }
            }, { threshold: .2 });
            metricsObserver.observe(metricsSection);
        }
    }

    const frame = $("#heroMapFrame"), depth = $("#heroMapDepth");
    if (!reduceMotion && matchMedia("(pointer: fine)").matches && frame) {
        let raf = 0;
        frame.addEventListener("pointermove", event => {
            const bounds = frame.getBoundingClientRect();
            const nx = (event.clientX - bounds.left) / bounds.width - .5;
            const ny = (event.clientY - bounds.top) / bounds.height - .5;
            const tiltX = ny * -12;
            const tiltY = nx * 14;

            if (!raf) raf = requestAnimationFrame(() => {
                frame.style.setProperty("--map-tilt-x", tiltX.toFixed(2) + "deg");
                frame.style.setProperty("--map-tilt-y", tiltY.toFixed(2) + "deg");
                frame.style.setProperty("--map-scale", "1.02");
                frame.style.setProperty("--mouse-x", ((nx + 0.5) * 100).toFixed(1) + "%");
                frame.style.setProperty("--mouse-y", ((ny + 0.5) * 100).toFixed(1) + "%");
                if (depth) {
                    depth.style.setProperty("--pointer-offset-x", (nx * 20).toFixed(1) + "px");
                    depth.style.setProperty("--pointer-offset-y", (ny * 15).toFixed(1) + "px");
                }
                raf = 0;
            });
        });
        frame.addEventListener("pointerleave", () => {
            cancelAnimationFrame(raf); raf = 0;
            frame.style.setProperty("--map-tilt-x", "0deg");
            frame.style.setProperty("--map-tilt-y", "0deg");
            frame.style.setProperty("--map-scale", "1");
            if (depth) {
                depth.style.setProperty("--pointer-offset-x", "0px");
                depth.style.setProperty("--pointer-offset-y", "0px");
            }
        });
    }

    if (!reduceMotion && frame) {
        let scrollRaf = 0;
        const updateScrollMotion = () => {
            scrollRaf = 0; const bounds = hero.getBoundingClientRect();
            const progress = Math.max(0, Math.min(1, -bounds.top / Math.max(1, bounds.height)));
            frame.style.setProperty("--scroll-shift", (progress * 54).toFixed(1) + "px");
            frame.style.setProperty("--scroll-scale", (1 - progress * .075).toFixed(3));
            frame.style.setProperty("--scroll-tilt", (progress * 2.5).toFixed(2) + "deg");
        };
        addEventListener("scroll", () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(updateScrollMotion); }, { passive: true });
        updateScrollMotion();
    }
}
initLandingExperience();
loadPublicMetrics();
reveal(); window.civicI18n?.setLanguage(LG); setInterval(tick, 5000);

/* ============================================================
   CivicTrack · Animation Enhancement Pack (JS)
   All code appended after existing script.js
   ============================================================ */

(function () {
    'use strict';
    const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* â”€â”€ Utility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function onReady(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }

    /* â”€â”€ 1. Particle / Star Field Canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function initParticleCanvas() {
        if (reduceMotion()) return;
        const hero = document.querySelector('.landing-hero');
        if (!hero) return;

        const canvas = document.createElement('canvas');
        canvas.id = 'particleCanvas';
        hero.insertBefore(canvas, hero.firstChild);

        const ctx = canvas.getContext('2d');
        let W, H, particles, raf;

        const ORANGE = '#f0a36c';
        const BLUE   = '#06B6D4';
        const WHITE  = '#c8d6e0';
        const PARTICLE_COUNT = 140;

        function resize() {
            W = canvas.width  = hero.offsetWidth;
            H = canvas.height = hero.offsetHeight;
        }

        function randomParticle() {
            const isPulse  = Math.random() < 0.12;
            const isOrange = Math.random() < 0.18;
            const isBlue   = !isOrange && Math.random() < 0.10;
            return {
                x:     Math.random() * (W || 800),
                y:     Math.random() * (H || 600),
                r:     isPulse ? (1.5 + Math.random() * 2.2) : (0.4 + Math.random() * 1.2),
                vx:    (Math.random() - 0.5) * 0.22,
                vy:    (Math.random() - 0.5) * 0.18,
                color: isPulse ? ORANGE : isOrange ? ORANGE : isBlue ? BLUE : WHITE,
                alpha: 0.25 + Math.random() * 0.65,
                twinkleSpeed: 0.008 + Math.random() * 0.018,
                twinklePhase: Math.random() * Math.PI * 2,
                isPulse,
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 0.018 + Math.random() * 0.022,
                baseR: 0,
            };
        }

        function initParticles() {
            resize();
            particles = [];
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const p = randomParticle();
                p.baseR = p.r;
                particles.push(p);
            }
        }

        let t = 0;
        function draw() {
            if (!document.getElementById('particleCanvas')) return;
            raf = requestAnimationFrame(draw);
            ctx.clearRect(0, 0, W, H);
            t += 1;

            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < -4) p.x = W + 4;
                if (p.x > W + 4) p.x = -4;
                if (p.y < -4) p.y = H + 4;
                if (p.y > H + 4) p.y = -4;

                // twinkle
                const twinkle = Math.sin(t * p.twinkleSpeed + p.twinklePhase);
                const alpha = Math.max(0.05, p.alpha + twinkle * 0.28);

                // pulse radius for orange pulser
                if (p.isPulse) {
                    p.r = p.baseR + Math.sin(t * p.pulseSpeed + p.pulsePhase) * p.baseR * 0.8;
                    // outer glow ring
                    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4.5);
                    grd.addColorStop(0, `rgba(240,163,108,${(alpha * 0.45).toFixed(3)})`);
                    grd.addColorStop(1, 'rgba(240,163,108,0)');
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r * 4.5, 0, Math.PI * 2);
                    ctx.fillStyle = grd;
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.3, p.r), 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = alpha;
                ctx.fill();
                ctx.globalAlpha = 1;
            });
        }

        initParticles();
        draw();

        const resizeObserver = new ResizeObserver(() => {
            resize();
            // redistribute particles proportionally
            if (particles && W && H) {
                particles.forEach(p => {
                    p.x = Math.random() * W;
                    p.y = Math.random() * H;
                });
            }
        });
        resizeObserver.observe(hero);

        // Pause when tab hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) cancelAnimationFrame(raf);
            else draw();
        });
    }

    /* â”€â”€ 2. Animated Counter Numbers (.stat b) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function initStatCounters() {
        if (reduceMotion()) return;
        function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

        function animateCounter(el) {
            const raw = el.textContent.trim();
            const isPercent = raw.endsWith('%');
            const target = parseFloat(raw.replace(/[^0-9.]/g, ''));
            if (isNaN(target) || target === 0) return;
            const duration = Math.min(1800, 600 + target * 4);
            const start = performance.now();
            function frame(now) {
                const progress = Math.min(1, (now - start) / duration);
                const value = Math.round(easeOut(progress) * target);
                el.textContent = value + (isPercent ? '%' : '');
                if (progress < 1) requestAnimationFrame(frame);
                else el.textContent = raw;
            }
            requestAnimationFrame(frame);
        }

        const statObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounter(entry.target);
                    statObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });

        function observeStats() {
            document.querySelectorAll('.stat b').forEach(el => {
                if (!el.dataset.counterWatched) {
                    el.dataset.counterWatched = '1';
                    statObserver.observe(el);
                }
            });
        }

        // Re-observe when dashboard is populated
        const dashObs = new MutationObserver(observeStats);
        const kpi = document.getElementById('kpi');
        if (kpi) dashObs.observe(kpi, { childList: true });
        observeStats();
    }

    /* â”€â”€ 3. Magnetic Hover Effect on Buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function initMagneticButtons() {
        if (reduceMotion()) return;
        if (!matchMedia('(pointer: fine)').matches) return;

        function attachMagnetic(el) {
            if (el.dataset.magneticAttached) return;
            el.dataset.magneticAttached = '1';
            let raf = 0;

            el.addEventListener('mousemove', e => {
                if (raf) return;
                raf = requestAnimationFrame(() => {
                    const r = el.getBoundingClientRect();
                    const cx = r.left + r.width / 2;
                    const cy = r.top + r.height / 2;
                    const dx = (e.clientX - cx) / (r.width / 2);
                    const dy = (e.clientY - cy) / (r.height / 2);
                    el.style.transform = `translate(${dx * 7}px, ${dy * 5}px) translateY(-2px)`;
                    raf = 0;
                });
            });
            el.addEventListener('mouseleave', () => {
                cancelAnimationFrame(raf);
                raf = 0;
                el.style.transform = '';
            });
        }

        function attachAll() {
            document.querySelectorAll('.btn.rust, .landing-primary').forEach(attachMagnetic);
        }

        attachAll();
        // Re-attach when nav or views update
        const bodyObs = new MutationObserver(attachAll);
        bodyObs.observe(document.body, { childList: true, subtree: true });
    }

    /* â”€â”€ 4. Glitch Text on #landing-title â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function initGlitch() {
        if (reduceMotion()) return;
        const title = document.getElementById('landing-title');
        if (!title) return;
        title.setAttribute('data-text', title.textContent);

        function triggerGlitch() {
            if (document.hidden) return;
            title.classList.remove('glitch-active');
            void title.offsetWidth; // reflow
            title.classList.add('glitch-active');
            setTimeout(() => title.classList.remove('glitch-active'), 260);
        }

        // Trigger every 4â€“8 seconds
        function scheduleGlitch() {
            const delay = 4000 + Math.random() * 4000;
            setTimeout(() => {
                triggerGlitch();
                scheduleGlitch();
            }, delay);
        }
        scheduleGlitch();
    }

    /* â”€â”€ 5. Morphing Blobs injected into landing hero â”€â”€â”€â”€â”€â”€ */
    function initBlobs() {
        if (reduceMotion()) return;
        const hero = document.querySelector('.landing-hero');
        if (!hero || hero.querySelector('.landing-blob')) return;
        ['landing-blob landing-blob-1',
         'landing-blob landing-blob-2',
         'landing-blob landing-blob-3'].forEach(cls => {
            const div = document.createElement('div');
            div.className = cls;
            hero.appendChild(div);
        });
    }

    /* â”€â”€ 6. Scroll-Triggered Parallax on Landing Sections â”€â”€ */
    function initParallax() {
        if (reduceMotion()) return;
        let rafP = 0;

        const problemH2 = document.querySelector('.landing-problem h2');
        const proofMark = document.querySelector('.landing-proof .proof-mark');

        function updateParallax() {
            rafP = 0;
            if (problemH2) {
                const r = problemH2.getBoundingClientRect();
                const progress = (window.innerHeight - r.top) / (window.innerHeight + r.height);
                const shift = Math.min(40, Math.max(-40, (progress - 0.5) * -45));
                problemH2.style.transform = `translateY(${shift.toFixed(1)}px)`;
            }
            if (proofMark) {
                const r = proofMark.getBoundingClientRect();
                const progress = (window.innerHeight - r.top) / (window.innerHeight + r.height);
                const shift = Math.min(28, Math.max(-28, (progress - 0.5) * -32));
                proofMark.style.transform = `translateY(${shift.toFixed(1)}px)`;
            }
        }

        window.addEventListener('scroll', () => {
            if (!rafP) rafP = requestAnimationFrame(updateParallax);
        }, { passive: true });

        updateParallax();
    }

    /* â”€â”€ 7. Character Reveal on Section Headings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function initCharReveal() {
        if (reduceMotion()) return;

        const headings = [
            '.landing-problem h2',
            '.landing-workflow h2',
            '.landing-shortcuts h2',
            '.landing-final h2',
        ];

        function splitChars(el) {
            if (el.dataset.charSplit) return;
            el.dataset.charSplit = '1';
            const raw = (el.getAttribute('data-raw-title') || el.textContent).trim();
            el.setAttribute('data-raw-title', raw);
            el.textContent = '';
            el.classList.add('char-reveal');

            // Split into words by whitespace so individual words never break mid-word
            const words = raw.split(/\s+/);
            let charIndex = 0;

            words.forEach((wordText, wIdx) => {
                const wordWrap = document.createElement('span');
                wordWrap.className = 'char-word';

                for (const ch of wordText) {
                    const span = document.createElement('span');
                    span.className = 'char';
                    span.textContent = ch;
                    span.dataset.ci = String(charIndex++);
                    wordWrap.appendChild(span);
                }

                el.appendChild(wordWrap);

                // Insert standard breakable whitespace between words
                if (wIdx < words.length - 1) {
                    el.appendChild(document.createTextNode(' '));
                }
            });
        }

        function revealChars(el) {
            splitChars(el);
            el.querySelectorAll('.char').forEach((span) => {
                const idx = parseInt(span.dataset.ci || '0', 10);
                span.style.animationDelay = (idx * 28) + 'ms';
                span.style.animationPlayState = 'running';
            });
        }

        const charObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    revealChars(entry.target);
                    charObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.25 });

        headings.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) {
                splitChars(el);
                el.querySelectorAll('.char').forEach(s => {
                    s.style.animationPlayState = 'paused';
                });
                charObserver.observe(el);
            }
        });
    }

    /* â”€â”€ 8. Ripple Effect on .btn clicks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function initRipple() {
        function addRipple(e) {
            const btn = e.currentTarget;
            const r = btn.getBoundingClientRect();
            const size = Math.max(r.width, r.height) * 1.4;
            const x = e.clientX - r.left - size / 2;
            const y = e.clientY - r.top  - size / 2;
            const ripple = document.createElement('span');
            ripple.className = 'ripple-wave';
            ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
            btn.appendChild(ripple);
            ripple.addEventListener('animationend', () => ripple.remove());
        }

        function attachRipple(btn) {
            if (!btn.dataset.rippleAttached) {
                btn.dataset.rippleAttached = '1';
                btn.addEventListener('click', addRipple);
            }
        }

        function attachAll() {
            document.querySelectorAll('.btn').forEach(attachRipple);
        }
        attachAll();
        const bodyObs = new MutationObserver(attachAll);
        bodyObs.observe(document.body, { childList: true, subtree: true });
    }

    /* â”€â”€ 9. Enhanced Page Transition Wipe â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function initPageWipe() {
        if (reduceMotion()) return;

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'page-wipe-overlay';
        document.body.appendChild(overlay);

        // Intercept the go() function
        const originalGo = window.go;
        if (typeof originalGo !== 'function') return;

        window.go = function (v) {
            if (reduceMotion()) return originalGo(v);

            overlay.classList.remove('wipe-in', 'wipe-out');
            void overlay.offsetWidth;
            overlay.classList.add('wipe-in');

            const duration = 200;
            setTimeout(() => {
                originalGo(v);
                overlay.classList.remove('wipe-in');
                overlay.classList.add('wipe-out');
                overlay.addEventListener('animationend', () => {
                    overlay.classList.remove('wipe-out');
                }, { once: true });
            }, duration);
        };
    }

    /* â”€â”€ 11. Animated Progress Bar showProg â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function initProg() {
        const prog = document.getElementById('prog');
        if (!prog) return;

        window.showProg = function () {
            if (reduceMotion()) return;
            prog.style.transition = 'none';
            prog.style.width = '0%';
            prog.style.opacity = '1';
            void prog.offsetWidth;
            prog.classList.add('prog-animating');
            prog.style.width = '100%';
            setTimeout(() => {
                prog.style.opacity = '0';
                setTimeout(() => {
                    prog.style.transition = 'none';
                    prog.style.width = '0%';
                    prog.style.opacity = '1';
                    prog.classList.remove('prog-animating');
                }, 400);
            }, 640);
        };

        // Hook into go() to call showProg
        const goAfterWipe = window.go;
        const goRef = typeof window._origGoForProg === 'function' ? window._origGoForProg : window.go;
        // We hook the scroll-based progress separately; showProg is separate UX
        // Wire it: when any nav button / go() is called, fire showProg
        document.getElementById('nav')?.addEventListener('click', () => {
            if (!reduceMotion()) window.showProg?.();
        });
    }

    /* â”€â”€ 12. Card 3D Tilt Effect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function initCardTilt() {
        if (reduceMotion()) return;
        if (!matchMedia('(pointer: fine)').matches) return;

        const TILT = 10; // max degrees

        function attachTilt(el) {
            if (el.dataset.tiltAttached) return;
            el.dataset.tiltAttached = '1';
            let raf = 0;

            el.addEventListener('mousemove', e => {
                if (raf) return;
                raf = requestAnimationFrame(() => {
                    const r = el.getBoundingClientRect();
                    const nx = (e.clientX - r.left) / r.width  - 0.5;
                    const ny = (e.clientY - r.top)  / r.height - 0.5;
                    const rx =  ny * TILT;
                    const ry = -nx * TILT;
                    el.style.transform = `perspective(700px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-3px) scale(1.015)`;
                    el.style.boxShadow = `0 18px 40px rgba(79,70,229,${(0.08 + Math.abs(nx) * 0.12).toFixed(3)})`;
                    raf = 0;
                });
            });
            el.addEventListener('mouseleave', () => {
                cancelAnimationFrame(raf); raf = 0;
                el.style.transform = '';
                el.style.boxShadow = '';
            });
        }

        function attachAll() {
            document.querySelectorAll('.feat .card, .card.cat, .strip > div').forEach(attachTilt);
        }

        attachAll();
        const obs = new MutationObserver(attachAll);
        obs.observe(document.body, { childList: true, subtree: true });
    }

    /* â”€â”€ 13. Tick SVG Glow Pulse + Particle Burst â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function initTickEffect() {
        const svgObs = new MutationObserver(() => {
            const tick = document.querySelector('#s4 .tick');
            if (!tick || tick.dataset.glowDone) return;
            const s4 = document.getElementById('s4');
            if (!s4 || s4.hidden) return;
            tick.dataset.glowDone = '1';

            if (reduceMotion()) return;

            tick.classList.add('tick-glow-pulse');

            // Particle burst
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:relative;display:inline-block;';
            tick.parentNode.insertBefore(wrap, tick);
            wrap.appendChild(tick);

            const burst = document.createElement('div');
            burst.className = 'tick-burst';
            burst.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
            wrap.appendChild(burst);

            const COLORS = ['#10B981','#34D399','#f0a36c','#06B6D4','#a7f3d0'];
            for (let i = 0; i < 18; i++) {
                const angle = (i / 18) * Math.PI * 2;
                const dist  = 55 + Math.random() * 45;
                const bx = Math.cos(angle) * dist;
                const by = Math.sin(angle) * dist;
                const sp = document.createElement('span');
                sp.style.cssText = `
                    left:50%; top:50%;
                    width:${5 + Math.random() * 6}px;
                    height:${5 + Math.random() * 6}px;
                    background:${COLORS[i % COLORS.length]};
                    animation-delay:${(Math.random() * 120).toFixed(0)}ms;
                `;
                sp.style.setProperty('--bx', bx + 'px');
                sp.style.setProperty('--by', by + 'px');
                burst.appendChild(sp);
            }
            setTimeout(() => burst.remove(), 900);
        });

        const s4 = document.getElementById('s4');
        if (s4) svgObs.observe(s4, { attributes: true, attributeFilter: ['hidden'] });
    }

    /* â”€â”€ 15. Staggered List Animations for queue/mine/wards â”€ */
    function initStaggeredLists() {
        function applyStagger(container) {
            if (!container) return;
            const children = [...container.children];
            children.forEach((child, i) => {
                child.classList.remove('stagger-in');
                void child.offsetWidth;
                child.classList.add('stagger-in');
                child.style.animationDelay = (i * 55) + 'ms';
            });
        }

        ['queue', 'mine', 'wards'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const obs = new MutationObserver(() => {
                if (reduceMotion()) return;
                applyStagger(el);
            });
            obs.observe(el, { childList: true });
        });
    }

    /* â”€â”€ Boot all enhancements â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    onReady(function () {
        initBlobs();
        initParticleCanvas();
        initGlitch();
        initCharReveal();
        initParallax();
        initRipple();
        initPageWipe();
        initProg();
        initMagneticButtons();
        initCardTilt();
        initStatCounters();
        initTickEffect();
        initStaggeredLists();
    });

})();


