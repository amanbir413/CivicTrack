const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
const tr = value => window.civicI18n?.translate(value) || value;
const PRIORITY_LABELS = { critical: "Critical", high: "High", normal: "Normal", low: "Low" };
const PRIORITY_SOURCE_LABELS = { ai: "AI suggested", rules: "Rule-based fallback", officer: "Officer set" };
const priorityLabel = level => tr(PRIORITY_LABELS[level] || "Normal");
const prioritySourceLabel = source => tr(PRIORITY_SOURCE_LABELS[source] || "Rule-based fallback");
function reportReviewPopup(approved, message) {
    const dialog = $("#contentReviewDialog"), result = $("#contentReviewResult");
    result.className = "content-review-result " + (approved ? "approved" : "needs-changes");
    $("#contentReviewTitle").textContent = approved ? "Report approved" : "Please revise your report";
    $("#contentReviewMessage").textContent = message;
    $("#contentReviewClose").textContent = approved ? "Continue" : "Review report";
    if (!dialog.open) dialog.showModal();
    return new Promise(resolve => { $("#contentReviewClose").onclick = () => { dialog.close(); resolve(); }; });
}
function priorityEventMarkup(note) {
    const value = String(note || "");
    let match = value.match(/^Priority recommendation \((ai|rules|officer)\): (critical|high|normal|low)\.\s*([\s\S]*)$/);
    if (match) return `<span>${esc(tr("Suggested priority"))}</span>: <span>${esc(priorityLabel(match[2]))}</span> · <span>${esc(prioritySourceLabel(match[1]))}</span>. ${esc(match[3])}`;
    match = value.match(/^Officer changed priority from (critical|high|normal|low) to (critical|high|normal|low)\. Reason: ([\s\S]*)$/);
    if (match) return `<span>${esc(tr("Priority changed"))}</span>: <span>${esc(priorityLabel(match[1]))}</span> → <span>${esc(priorityLabel(match[2]))}</span>. <span>${esc(tr("Reason"))}</span>: ${esc(match[3])}`;
    return null;
}
const CATS = [["roads", "🛣️", "Roads", "Roads Dept"], ["water", "💧", "Water", "Water Board"], ["power", "⚡", "Power", "Power Corp"], ["garbage", "🗑️", "Garbage", "Sanitation"], ["drain", "🌊", "Drainage", "Sanitation"], ["parks", "🌳", "Parks", "Horticulture"], ["lights", "💡", "Street lights", "Power Corp"], ["other", "📌", "Other", "General"]];
const CAT_IMAGES = {
    roads: 'https://images.unsplash.com/photo-1749407758749-88fa5e77019a?auto=format&fit=crop&w=600&h=400&q=85',
    water: 'https://images.unsplash.com/photo-1521207418485-99c705420785?auto=format&fit=crop&w=600&h=400&q=85',
    power: 'https://images.unsplash.com/photo-1664135835898-955d1e4f9800?auto=format&fit=crop&w=600&h=400&q=85',
    garbage: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=600&h=400&q=85',
    drain: 'https://images.unsplash.com/photo-1741997376476-04fb29e5af7d?auto=format&fit=crop&w=600&h=400&q=85',
    parks: 'https://images.unsplash.com/photo-1643473886441-ed3c866fffea?auto=format&fit=crop&w=600&h=400&q=85',
    lights: 'https://images.unsplash.com/photo-1505209100289-b4ba97066c6d?auto=format&fit=crop&w=600&h=400&q=85',
    other: 'https://images.unsplash.com/photo-1764463263237-8cacd4226690?auto=format&fit=crop&w=600&h=400&q=85',
};
const catIcon = id => `<div class="cat-img-wrap"><img class="cat-img" src="${CAT_IMAGES[id] || ''}" alt="${id}" onerror="this.style.display='none';this.parentNode.dataset.fallback='1'"></div>`;
const KEYS = { roads: "pothole road crack", water: "water leak pipe tap", power: "power electric wire", garbage: "garbage trash waste dump", drain: "drain sewer block", parks: "park tree bench", lights: "light lamp dark" };
const LV = ["Junior Engineer", "Executive Engineer", "Department Head", "Commissioner"], SLA = [48, 24, 24, 12];
let skew = 0, role = "cit", currentUser = null, view = "home", fil = "all", T = [], savedReports = [], maps = {}, selectedMarker = null, suggestionRequest = 0, cameraStream = null, nearbyCenter = null, reportPhoto = null, reportPhotoUrl = null; const now = () => Date.now() + skew, H = 3600e3;
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
function tick() { let ch = 0; T.forEach(t => { if (t.st < 3 && left(t) < 0 && t.lv < 3) { t.lv++; t.dl = now() + SLA[t.lv] * H; t.ev.push([now(), "âš ï¸ Deadline missed â†’ escalated to " + LV[t.lv] + " (alert sent)"]); ch = 1; toast("Ticket #" + t.id + " auto-escalated to " + LV[t.lv]); notify("● #" + t.id + " escalated to " + LV[t.lv], t.id) } }); if (ch || true) paint() }
function paint() { const v = view; if (v == "home") { renderSavedMap("home"); renderSavedMap("explore") } if (v == "map") { renderSavedMap("main"); requestAnimationFrame(() => maps.main?.invalidateSize()) } if (v == "ward") wards(); if (v == "mine") mine(); if (v == "profile") profile(); if (v == "dash") loadOfficerDashboard(); if (v == "track" && cur) showT(cur, 1) }
/* NAV */
function nav() {
    const citizen = [["home", "Home"], ["report", "Report"], ["track", "Track"], ["map", "Map"], ["ward", "Wards"], ["mine", "My reports"]];
    if (currentUser?.role === "citizen") citizen.push(["profile", "Profile"]);
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
    if ((v === "dash" || v === "mine" || v === "profile") && !currentUser) { toast("Sign in to view this page"); v = "auth"; }
    if (v === "dash" && !["officer", "administrator"].includes(currentUser?.role)) { toast("This page is for department staff"); v = "home"; }
    if (v === "mine" && currentUser?.role !== "citizen") v = "home";
    if (v === "profile" && currentUser?.role !== "citizen") v = "home";
    if (v !== "report") {
        stopCameraStream();
        if (view === "report") {
            if (reportPhotoUrl) URL.revokeObjectURL(reportPhotoUrl);
            reportPhoto = null; reportPhotoUrl = null;
            $("#photoPreview").removeAttribute("src"); $("#photoPreview").hidden = true;
            $("#cameraStart").textContent = tr("📍 Allow location & open camera");
            $("#photoNotice").textContent = tr("A live photo and your location are required to submit this report. Photos are attached privately.");
        }
    }
    view = v; document.body.classList.toggle("landing-active", v === "home"); $$(".view").forEach(e => e.classList.toggle("on", e.id == "v-" + v)); nav(); if (v == "report") wiz(1); animOn(); paint(); reveal(); scrollTo(0, 0); window.civicI18n?.localize(document.getElementById("v-" + v) || document.body); requestAnimationFrame(() => { ["home", "explore"].forEach(name => { if (v === "home") maps[name]?.invalidateSize(); }); maps[v === "report" ? "pick" : v === "map" ? "main" : ""]?.invalidateSize(); });
}
window.go = go;
$("#authOpen").onclick = () => go("auth");
$("#logout").onclick = async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => { }); currentUser = null; updateSession(); toast("Signed out"); go("home"); };
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
    if (typeof renderCats === 'function') renderCats();
    if (view === "home") {
        if (maps.home) renderSavedMap("home");
        if (maps.explore) renderSavedMap("explore");
        loadPublicMetrics();
    }
    if (view === "report") {
        wiz(R.step);
    }
    if (view === "map" && maps.main) renderSavedMap("main");
    if (view === "dash" && dashboardLoaded) { renderDashboardKpis(); renderDashboardQueue(); }
    window.civicI18n?.localize(document.body);
};
$("#lang").onchange = event => window.civicI18n?.setLanguage(event.currentTarget.value);
const welcomeSetup = $("#welcomeSetup");
const locationSetup = $("#locationSetup");
const startupSetupKey = "civic-startup-setup-v2";
if (welcomeSetup && !localStorage.getItem(startupSetupKey)) {
    $("#welcomeLanguage").value = LG;
    welcomeSetup.showModal();
}
$("#welcomeLanguageForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const selectedLanguage = $("#welcomeLanguage").value;
    window.civicI18n?.setLanguage(selectedLanguage);
    $("#lang").value = selectedLanguage;
    welcomeSetup.close("language-selected");
});
welcomeSetup?.addEventListener("close", () => {
    if (welcomeSetup.returnValue === "language-selected" && !localStorage.getItem(startupSetupKey)) {
        locationSetup?.showModal();
    }
});
$("#allowWelcomeLocation")?.addEventListener("click", async () => {
    const status = $("#welcomeLocationStatus");
    status.textContent = "Requesting location permission…";
    try {
        await requestDeviceLocation();
        localStorage.setItem(startupSetupKey, "done");
        locationSetup.close();
    } catch (error) {
        status.textContent = error.message + " You can continue without location.";
        $("#skipWelcomeLocation").focus();
    }
});
$("#skipWelcomeLocation")?.addEventListener("click", () => {
    localStorage.setItem(startupSetupKey, "done");
    locationSetup.close();
});
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
const NEARBY_RADIUS_METERS = 5000;
const REPORT_PIN_RADIUS_METERS = 50;
let deviceLocation = null, locationRequestPromise = null, reportLocationAnchor = null, reportLocationCircle = null, gpsAccuracyCircle = null, currentLocationMarker = null;
function requestDeviceLocation() {
    if (deviceLocation) return Promise.resolve(deviceLocation);
    if (locationRequestPromise) return locationRequestPromise;
    if (!navigator.geolocation) return Promise.reject(new Error("This browser does not support location access."));
    locationRequestPromise = new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            position => {
                deviceLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
                reportLocationAnchor = deviceLocation;
                syncReportLocationMap();
                resolve(deviceLocation);
            },
            error => reject(new Error(error.code === error.PERMISSION_DENIED
                ? "Location access was denied. Allow it in your browser settings to continue."
                : error.code === error.POSITION_UNAVAILABLE
                    ? "Your location is unavailable right now. Try again."
                    : "Location took too long. Try again.")),
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    }).finally(() => { locationRequestPromise = null; });
    return locationRequestPromise;
}
function showNearbyReportsAt(location) {
    nearbyCenter = location;
    const center = [location.latitude, location.longitude];
    ["home", "explore", "main"].forEach(which => { maps[which + "HasFit"] = true; });
    requestAnimationFrame(() => requestAnimationFrame(() => {
        ["home", "explore", "main"].forEach(which => {
            const map = maps[which];
            if (!map) return;
            map.invalidateSize({ pan: false });
            map.setView(center, 14, { animate: false });
        });
    }));
    const button = $("#nearbyReports");
    if (button) { button.textContent = "Show all reports"; button.setAttribute("aria-pressed", "true"); }
    const status = $("#nearbyStatus");
    if (status) status.textContent = "Finding public reports within 5 km…";
    ["home", "explore", "main"].forEach(renderSavedMap);
}
function stopCameraStream() {
    if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
    const video = $("#cameraPreview");
    if (video) { video.srcObject = null; video.hidden = true; }
    const startButton = $("#cameraStart"), captureButton = $("#capturePhoto");
    if (startButton && captureButton) { startButton.hidden = false; captureButton.hidden = true; }
}
function distanceMeters(from, to) {
    const radians = value => value * Math.PI / 180;
    const dLat = radians(to.latitude - from.latitude), dLng = radians(to.longitude - from.longitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
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
    if (!maps.pick) {
        $("#pickMap").onclick = null;
        maps.pick = makeLeafletMap("#pickMap", 18);
        if (!maps.pick) return;
        maps.pick.on("click", e => setReportLocation(e.latlng.lat, e.latlng.lng));
        maps.pick.on("tileerror", () => { $("#manualLocation").hidden = false; $("#locationStatus").textContent = "Map tiles are unavailable. Enter coordinates manually within 50 m of the GPS pin."; });
    }
    syncReportLocationMap();
    if (R.latitude !== null && R.longitude !== null) setReportLocation(R.latitude, R.longitude, false);
}
function syncReportLocationMap() {
    if (!maps.pick || !window.L || !reportLocationAnchor) return;
    const center = [reportLocationAnchor.latitude, reportLocationAnchor.longitude];
    maps.pick.setView(center, 19, { animate: false });
    if (!reportLocationCircle) reportLocationCircle = window.L.circle(center, { radius: REPORT_PIN_RADIUS_METERS, color: "#f97316", weight: 3, fillColor: "#fb923c", fillOpacity: .2 }).addTo(maps.pick);
    else reportLocationCircle.setLatLng(center);
    if (!gpsAccuracyCircle) gpsAccuracyCircle = window.L.circle(center, { radius: Math.max(1, reportLocationAnchor.accuracy || 1), color: "#2563eb", weight: 2, dashArray: "6 5", fillColor: "#3b82f6", fillOpacity: .08 }).addTo(maps.pick);
    else { gpsAccuracyCircle.setLatLng(center); gpsAccuracyCircle.setRadius(Math.max(1, reportLocationAnchor.accuracy || 1)); }
    if (!currentLocationMarker) currentLocationMarker = window.L.circleMarker(center, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).bindTooltip("Your current GPS position", { permanent: true, direction: "top" }).addTo(maps.pick);
    else currentLocationMarker.setLatLng(center);
    maps.pick.setMaxBounds(reportLocationCircle.getBounds().pad(.2));
    requestAnimationFrame(() => maps.pick?.invalidateSize({ pan: false }));
}
function setReportLocation(latitude, longitude, search = true) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return toast("Enter valid latitude and longitude.");
    if (reportLocationAnchor && distanceMeters(reportLocationAnchor, { latitude, longitude }) > REPORT_PIN_RADIUS_METERS) {
        if (selectedMarker && R.latitude !== null && R.longitude !== null) selectedMarker.setLatLng([R.latitude, R.longitude]);
        $("#locationStatus").textContent = "Choose a pin within 50 m of your current GPS location. The orange circle shows the allowed area.";
        return;
    }
    R.latitude = latitude; R.longitude = longitude;
    if (maps.pick && window.L) {
        const point = [latitude, longitude];
        if (selectedMarker) selectedMarker.setLatLng(point); else selectedMarker = window.L.marker(point, { draggable: true }).addTo(maps.pick);
        selectedMarker.off("dragend").on("dragend", () => { const p = selectedMarker.getLatLng(); setReportLocation(p.lat, p.lng); });
        maps.pick.setView(point, Math.max(maps.pick.getZoom(), 15));
    }
    $("#manualLat").value = latitude.toFixed(6); $("#manualLng").value = longitude.toFixed(6);
    $("#locationStatus").textContent = "Selected location " + latitude.toFixed(5) + ", " + longitude.toFixed(5) + ". You may adjust it within 50 m of your GPS location.";
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
    $("#mapRefresh").onclick = () => { mapDataCache.clear(); renderSavedMap("main"); };
    $("#nearbyReports").onclick = async () => {
        const button = $("#nearbyReports"), status = $("#nearbyStatus");
        if (nearbyCenter) {
            nearbyCenter = null;
            ["home", "explore", "main"].forEach(which => { maps[which + "HasFit"] = false; });
            button.textContent = "Show nearby reports"; button.setAttribute("aria-pressed", "false");
            status.textContent = "Showing all public reports.";
            return ["home", "explore", "main"].forEach(renderSavedMap);
        }
        button.disabled = true; status.textContent = "Requesting your location…";
        try {
            showNearbyReportsAt(await requestDeviceLocation());
        } catch (error) {
            status.textContent = error.message;
        } finally { button.disabled = false; }
    };
}
function markerColor(report) { return report.isEscalated ? "#9333ea" : report.isOverdue ? "#dc2626" : report.status === "closed" ? "#059669" : report.status === "reopened" ? "#ea580c" : report.status === "resolution_pending_confirmation" ? "#2563eb" : report.status === "in_progress" ? "#d97706" : "#475569"; }
function publicStatusName(status) { return ({ assigned: "Assigned", in_progress: "In progress", resolution_pending_confirmation: "Awaiting citizen", reopened: "Reopened", closed: "Closed" })[status] || "Registered"; }
function showMapReport(report, which = "main") {
    const target = which === "home" || which === "explore" ? $(which === "home" ? "#homeMapDetail" : "#exploreMapDetail") : $("#selectedMapReport") || $("#popup");
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
        const allReports = payload.reports || [];
        const isNearby = ["home", "explore", "main"].includes(which) && Boolean(nearbyCenter);
        const reports = isNearby ? allReports.filter(report => distanceMeters(nearbyCenter, report) <= NEARBY_RADIUS_METERS) : allReports;
        const nearbyLayerName = which + "NearbyLayer";
        if (isNearby) {
            if (!maps[nearbyLayerName]) maps[nearbyLayerName] = window.L.layerGroup().addTo(map);
            maps[nearbyLayerName].clearLayers();
            window.L.circle([nearbyCenter.latitude, nearbyCenter.longitude], { radius: NEARBY_RADIUS_METERS, color: "#f0a36c", weight: 1.5, fillColor: "#f0a36c", fillOpacity: .08 }).addTo(maps[nearbyLayerName]);
            window.L.circleMarker([nearbyCenter.latitude, nearbyCenter.longitude], { radius: 7, color: "#fff", weight: 2, fillColor: "#2563eb", fillOpacity: 1 }).bindTooltip("Your location").addTo(maps[nearbyLayerName]);
        } else if (maps[nearbyLayerName]) maps[nearbyLayerName].clearLayers();
        if (statusNode) {
            if (!reports.length && isNearby) statusNode.textContent = "No public reports found within 5 km. Your location is shown on the map.";
            else if (!reports.length && which === "main") statusNode.textContent = "No saved complaints with locations match these filters. Reports without a pin do not appear.";
            else if (!reports.length) statusNode.textContent = "No public reports with mapped locations are available yet.";
            else if (isNearby) statusNode.textContent = reports.length + " nearby public reports shown within 5 km. Report locations are approximate.";
            else statusNode.textContent = (window.civicI18n?.translate("{{count}} public mapped reports shown. Citizen details and staff notes are omitted.") || "{{count}} public mapped reports shown. Citizen details and staff notes are omitted.").replace("{{count}}", String(reports.length));
        }
        if (which === "main") renderPublicReportCards(reports, map);
        const locations = new Map();
        reports.forEach(report => {
            const key = report.latitude + "," + report.longitude;
            if (!locations.has(key)) locations.set(key, []);
            locations.get(key).push(report);
        });
        let markerIndex = 0, activeMarker = null;
        for (const reportsAtLocation of locations.values()) reportsAtLocation.forEach((report, locationIndex) => {
            let point = [report.latitude, report.longitude];
            if (reportsAtLocation.length > 1) {
                const center = map.latLngToLayerPoint(point), angle = locationIndex * 2 * Math.PI / reportsAtLocation.length;
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
function renderPublicReportCards(reports, map) {
    const list = $("#nearbyIssueList"); if (!list) return;
    const selected = $("#selectedMapReport"); if (selected) { selected.hidden = true; selected.replaceChildren(); }
    if (!reports.length) { list.innerHTML = '<p class="mut">No public reports match the current filters or nearby area.</p>'; return; }
    list.innerHTML = reports.slice(0, 40).map((report, i) => {
        const image = CAT_IMAGES[report.category?.slug] || CAT_IMAGES.other;
        const status = tr(publicStatusName(report.status));
        const distance = nearbyCenter ? `<span>${(distanceMeters(nearbyCenter, report) / 1000).toFixed(1)} km away</span>` : "";
        return `<button class="public-report-card" type="button" data-report-index="${i}"><img src="${esc(image)}" alt="Illustrative ${esc(report.category?.label || "civic issue")} category image" loading="lazy"><span class="public-report-copy"><strong>${esc(report.category?.label || "Civic issue")}</strong><span>${esc(report.ticketId)} · ${esc(status)}</span><span>${new Date(report.createdAt).toLocaleString("en-IN", { dateStyle: "medium" })} ${distance}</span><small>Category illustration, not the submitted report photo</small></span></button>`;
    }).join("");
    list.querySelectorAll("[data-report-index]").forEach(button => button.addEventListener("click", () => {
        const report = reports[Number(button.dataset.reportIndex)];
        if (!report) return;
        map.setView([report.latitude, report.longitude], Math.max(map.getZoom(), 16));
        showMapReport(report, "main");
    }));
}
const ST = ["Choose category", "Describe and photograph the issue", "Pin the location", "Done!"];
function wiz(n) {
    if (n !== 1) stopCameraStream();
    R.step = n; $("#steps").innerHTML = [1, 2, 3].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join(""); $("#stepT").textContent = n < 4 ? `Step ${n} of 3 · ${ST[n - 1]}` : "Ticket created";[1, 2, 3, 4].forEach(i => $("#s" + i).hidden = i != n); $("#wizBtns").style.display = n == 4 ? "none" : "flex"; $("#back").style.visibility = n == 1 ? "hidden" : "visible"; $("#next").textContent = n == 3 ? "Submit" : "Next";
    if (n == 1) catPick();
    if (n == 3) { drawMap("#pickMap", 1); dupCheck() }
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
        suggestions.forEach(item => { const distance = item.distanceMeters < 1000 ? item.distanceMeters + " m" : (item.distanceMeters / 1000).toFixed(1) + " km"; html += '<div class="duplicate-row"><b>' + esc(item.ticketId) + '</b><span>' + esc(item.category.label) + ' · ' + esc(item.status.replaceAll("_", " ")) + '</span><span>About ' + distance + ' away · ' + item.supportCount + ' support</span><button class="btn rust duplicate-support" data-ticket="' + esc(item.ticketId) + '"' + (item.supportedByMe ? ' disabled' : '') + '>' + (item.supportedByMe ? 'Supported' : '+1 Support this issue') + '</button><button class="btn line duplicate-open" data-ticket="' + esc(item.ticketId) + '">View public ticket</button></div>'; });
        $("#dupBox").innerHTML = html + '<p class="mut">Still reporting a separate issue? Continue below; nothing will be merged.</p></div>';
        $$(".duplicate-open").forEach(button => button.onclick = () => trackSavedComplaint(button.dataset.ticket));
        $$(".duplicate-support").forEach(button => button.onclick = async () => {
            button.disabled = true;
            try {
                const response = await fetch(`/api/complaints/${encodeURIComponent(button.dataset.ticket)}/support`, { method: "POST" });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error?.message || "Could not support this issue.");
                const existingTicket = payload.ticketId;
                $("#tkId").textContent = existingTicket;
                $("#tkDue").textContent = "You supported an existing public issue. No new report was created.";
                $("#tkPriority").textContent = "";
                $("#tkStatus").textContent = `Status: ${payload.status.replaceAll("_", " ")} · ${payload.supportCount} citizen support`;
                $("#tkGo").onclick = () => trackSavedComplaint(existingTicket);
                mkQR(existingTicket);
                wiz(4);
                $("#stepT").textContent = "Existing issue supported";
                toast("Support added to " + existingTicket);
            } catch (error) { button.disabled = false; toast(error.message); }
        });
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
$("#cameraStart").onclick = async () => {
    const startButton = $("#cameraStart"), captureButton = $("#capturePhoto"), video = $("#cameraPreview"), notice = $("#photoNotice");
    startButton.disabled = true; startButton.textContent = "Getting your location…"; notice.textContent = "Location is used to set the report pin. Your browser will ask before sharing it.";
    try {
        const location = await requestDeviceLocation();
        R.latitude = location.latitude; R.longitude = location.longitude;
        $("#manualLat").value = location.latitude.toFixed(6); $("#manualLng").value = location.longitude.toFixed(6);
        const accuracy = Number.isFinite(location.accuracy) ? Math.round(location.accuracy) : null;
        $("#locationStatus").textContent = `Blue dot: current GPS estimate${accuracy !== null ? `; blue circle: reported uncertainty of about ${accuracy} m` : ""}. Orange circle: the 50 m pin adjustment limit. ${accuracy !== null && accuracy > 50 ? "GPS is less precise than the allowed pin radius; enable precise location on your device for a more reliable fix." : "Adjust the pin inside the orange circle if needed."}`;
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Live camera capture requires a secure connection and a supported browser. You can continue and choose a map pin manually.");
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        video.srcObject = cameraStream; video.hidden = false; $("#photoPreview").hidden = true;
        captureButton.hidden = false; startButton.hidden = true;
        notice.textContent = "Camera ready. Take a live photo to continue. The photo will be attached privately when you submit.";
    } catch (error) {
        stopCameraStream(); notice.textContent = error.message; toast(error.message);
    } finally { startButton.disabled = false; startButton.textContent = tr("📍 Allow location & open camera"); }
};
$("#capturePhoto").onclick = () => {
    const video = $("#cameraPreview"), canvas = document.createElement("canvas");
    if (!video.videoWidth || !video.videoHeight) return toast("The camera is still starting. Try again in a moment.");
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
        if (!blob) return toast("The photo could not be captured. Try again.");
        if (reportPhotoUrl) URL.revokeObjectURL(reportPhotoUrl);
        reportPhoto = blob; reportPhotoUrl = URL.createObjectURL(blob);
        $("#photoPreview").src = reportPhotoUrl; $("#photoPreview").hidden = false;
        $("#capturePhoto").hidden = true; $("#cameraStart").hidden = false; $("#cameraStart").textContent = "📷 Retake live photo";
        $("#photoNotice").textContent = tr("Live photo captured. It will be attached privately when you submit this report.");
    }, "image/jpeg", .82);
    stopCameraStream();
};
$("#desc").oninput = () => {};
let speechRecognition = null, speechActive = false, speechText = "", speechTimer = 0, speechCountdown = 0;
function stopVoiceInput(message = "Voice input stopped.") {
    speechActive = false; clearTimeout(speechTimer); clearInterval(speechCountdown);
    try { speechRecognition?.stop(); } catch {}
    speechRecognition = null;
    const button = $("#mic"), status = $("#voiceStatus");
    button.textContent = "🎤 Start voice input"; button.setAttribute("aria-pressed", "false");
    $("#voiceContinue").hidden = true; status.hidden = false; status.textContent = message;
}
function voiceTimerReset() {
    clearTimeout(speechTimer); clearInterval(speechCountdown); $("#voiceContinue").hidden = true;
    $("#voiceStatus").textContent = "Listening. Press Stop voice input when you are finished.";
    speechTimer = setTimeout(() => {
        let seconds = 5; const continueButton = $("#voiceContinue"), status = $("#voiceStatus");
        continueButton.hidden = false; status.textContent = `Voice input will stop in ${seconds} seconds. Press Continue speaking to keep going.`;
        speechCountdown = setInterval(() => {
            seconds -= 1;
            if (seconds <= 0) stopVoiceInput("Voice input stopped after the time limit.");
            else status.textContent = `Voice input will stop in ${seconds} seconds. Press Continue speaking to keep going.`;
        }, 1000);
    }, 55000);
}
$("#mic").onclick = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { $("#voiceStatus").hidden = false; $("#voiceStatus").textContent = "Voice input is not supported in this browser. Type your description instead."; return; }
    if (speechActive) return stopVoiceInput("Voice input stopped. You can edit the text or start again.");
    speechRecognition = new Speech(); speechRecognition.continuous = true; speechRecognition.interimResults = true;
    speechRecognition.lang = ({ hi: "hi-IN", pa: "pa-IN" })[window.CIVIC_LANGUAGE] || "en-IN";
    speechText = ""; speechActive = true;
    const button = $("#mic"), status = $("#voiceStatus"); button.textContent = "■ Stop voice input"; button.setAttribute("aria-pressed", "true"); status.hidden = false;
    speechRecognition.onresult = event => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0].transcript;
            if (event.results[i].isFinal) speechText += text + " "; else interim += text;
        }
        $("#desc").value = (speechText + interim).trim(); voiceTimerReset();
    };
    speechRecognition.onerror = event => { if (event.error !== "no-speech" && event.error !== "aborted") stopVoiceInput("Voice input error: " + event.error + ". You can type your description or try again."); };
    speechRecognition.onend = () => { if (speechActive) { try { speechRecognition.start(); } catch {} } };
    try { speechRecognition.start(); voiceTimerReset(); } catch { stopVoiceInput("Could not start voice input. Check microphone permission and try again."); }
};
$("#voiceContinue").onclick = () => { if (!speechActive) return; voiceTimerReset(); try { speechRecognition?.start(); } catch {} };
$("#back").onclick = () => wiz(R.step - 1);
let savingComplaint = false;
$("#next").onclick = async () => {
    if (savingComplaint) return;
    if (R.step === 1) {
        wiz(2);
        return;
    }
    if (R.step === 2) {
        const nextButton = $("#next");
        if (!reportPhoto) { $("#photoNotice").textContent = "Take a live photo before continuing."; $("#cameraStart").focus(); return; }
        nextButton.disabled = true; nextButton.textContent = "Checking report…";
        try {
            const form = new FormData(); form.append("file", reportPhoto, "report-photo.jpg");
            const params = new URLSearchParams({ title: $("#title").value.trim(), description: $("#desc").value.trim(), category: cat(R.cat)[2] });
            const response = await fetch(`/api/complaints/validate-content?${params}`, { method: "POST", body: form });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error?.message || "Could not review this report. Try again.");
            await reportReviewPopup(true, "The selected category, description, and photo appear relevant.");
            wiz(3);
        } catch (error) {
            await reportReviewPopup(false, error.message + " Change the photo or report details, then try again.");
        } finally { nextButton.disabled = false; nextButton.textContent = "Next"; }
        return;
    }
    if (R.step == 3 && (R.latitude === null || R.longitude === null)) return toast("Allow location access to set the issue pin before continuing.");
    if (R.step === 3 && !reportPhoto) {
        $("#formError").textContent = "A live photo is required before you can submit this report.";
        toast("Take a live photo before submitting.");
        return;
    }
    if (R.step < 3) return wiz(R.step + 1);

    const submitButton = $("#next");
    const formError = $("#formError");
    const c = cat(R.cat);
    savingComplaint = true;
    submitButton.disabled = true;
    submitButton.textContent = "Savingâ€¦";
    formError.textContent = "";
    try {
        const reportTitle = $("#title").value.trim();
        const reportDescription = $("#desc").value.trim();
        const reviewForm = new FormData();
        reviewForm.append("file", reportPhoto, "report-photo.jpg");
        const reviewParams = new URLSearchParams({ title: reportTitle, description: reportDescription, category: c[2] });
        const reviewResponse = await fetch(`/api/complaints/validate-content?${reviewParams}`, { method: "POST", body: reviewForm });
        const reviewPayload = await reviewResponse.json().catch(() => ({}));
        if (!reviewResponse.ok) throw new Error(reviewPayload.error?.message || "The report could not be checked. Please try again.");
        const response = await fetch("/api/complaints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: reportTitle,
                description: reportDescription,
                category: R.cat,
                language: window.CIVIC_LANGUAGE || "en",
                location: { latitude: R.latitude, longitude: R.longitude }
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error?.message || "The complaint could not be saved.");
        if (!payload.complaint?.ticketId) throw new Error("The server response did not include a ticket ID.");

        const complaint = payload.complaint;
        if (complaint.priority) {
            const priority = complaint.priority;
            $("#tkPriority").innerHTML = `<strong><span>${esc(tr("Suggested priority"))}</span>: <span>${esc(priorityLabel(priority.level))}</span></strong> · <span>${esc(prioritySourceLabel(priority.source))}</span><br><span>${esc(priority.reason || "")}</span>`;
        } else {
            $("#tkPriority").textContent = "";
        }
        let photoMessage = "";
        if (reportPhoto) {
            try {
                const photoForm = new FormData(); photoForm.append("file", reportPhoto, "report-photo.jpg");
                const photoResponse = await fetch(`/api/complaints/${encodeURIComponent(complaint.ticketId)}/photo`, { method: "POST", body: photoForm });
                const photoPayload = await photoResponse.json().catch(() => ({}));
                if (!photoResponse.ok) throw new Error(photoPayload.error?.message || "Photo upload failed.");
                photoMessage = "Live report photo attached privately.";
            } catch (error) { photoMessage = `Report saved, but the photo could not be attached: ${error.message}`; }
        }
        $("#tkId").textContent = complaint.ticketId;
        $("#tkDue").textContent = `Assigned to ${complaint.department.name} · Due ${new Date(complaint.dueAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} (demo SLA)`;
        $("#tkStatus").textContent = `Status: ${complaint.status.replaceAll("_", " ")}` + (photoMessage ? ` · ${photoMessage}` : "");
        $("#tkGo").onclick = () => trackSavedComplaint(complaint.ticketId);
        mkQR(complaint.ticketId);
        if (reportPhotoUrl) URL.revokeObjectURL(reportPhotoUrl);
        reportPhoto = null; reportPhotoUrl = null; $("#photoPreview").removeAttribute("src"); $("#photoPreview").hidden = true; $("#cameraStart").hidden = false; $("#cameraStart").textContent = tr("📍 Allow location & open camera"); $("#capturePhoto").hidden = true; $("#photoNotice").textContent = tr("A live photo and your location are required to submit this report. Photos are attached privately.");
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
    const events = complaint.events.map(event => {
        const eventText = priorityEventMarkup(event.note) || esc(event.note || event.eventType.replaceAll("_", " "));
        return `<div><b>${eventText}</b><br><span class="mut">${new Date(event.createdAt).toLocaleString("en-IN")}</span><br><span class="mut">${esc(event.previousStatus ? `${event.previousStatus.replaceAll("_", " ")} â†’ ` : "")}${esc(event.newStatus?.replaceAll("_", " ") || "")}</span></div>`;
    }).join("");
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
    const priority = complaint.priority ? `<section class="saved-priority"><b><span>${esc(tr("Suggested priority"))}</span>: <span>${esc(priorityLabel(complaint.priority.level))}</span></b><span class="mut"> · <span>${esc(prioritySourceLabel(complaint.priority.source))}</span></span><p class="mut">${esc(complaint.priority.reason || "")}</p></section>` : "";
    const displayTitle = complaint.title || "Private complaint details";
    const state = complaint.isEscalated ? '<p class="od">SLA escalation recorded. Workflow status remains unchanged.</p>' : complaint.isOverdue ? '<p class="od">This complaint is overdue and awaiting department action.</p>' : '';
    const evidence = (complaint.evidence || []).map(item => { const label = item.kind === "report" ? "Citizen report photo" : "Resolution evidence"; return `<a href="/api/evidence/${encodeURIComponent(item.id)}" target="_blank" rel="noopener"><img class="evidence-thumb" src="/api/evidence/${encodeURIComponent(item.id)}" alt="${label}"></a>`; }).join("");
    const responseControls = complaint.viewerIsOwner && complaint.status === "resolution_pending_confirmation" ? `<div class="row"><button class="btn grn" onclick="respondToResolution('${esc(complaint.ticketId)}','confirm')">Confirm resolution</button><button class="btn rust" onclick="respondToResolution('${esc(complaint.ticketId)}','reject')">Reject and reopen</button></div><p class="mut">Review the department evidence before responding.</p>` : complaint.viewerIsOwner && complaint.status === "closed" ? '<p>âœ… You confirmed this resolution.</p>' : '';
    $("#tview").innerHTML = `<div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(complaint.ticketId)} · ${esc(displayTitle)}</h3><span class="tag s0">${esc(status)}</span></div>${state}${description}<p><b>Category:</b> ${esc(complaint.category.label)} · <b>Department:</b> ${esc(complaint.department.name)}</p>${due}${priority}<p class="mut">${esc(location)}</p>${gps}<p class="mut">Created ${new Date(complaint.createdAt).toLocaleString("en-IN")}</p>${evidence ? `<h3>Report photos and resolution evidence</h3><div class="evidence-gallery">${evidence}</div>` : ''}${responseControls}</div><div class="two" style="margin-top:14px"><div class="card"><h3>Saved activity history</h3><div class="tl">${events || '<p class="mut">No events recorded.</p>'}</div></div><div class="card"><h3>What happens next?</h3><p class="mut">${complaint.status === 'resolution_pending_confirmation' ? 'Review the attached evidence and confirm the work, or reject it to reopen the report.' : complaint.status === 'closed' ? 'This complaint is closed.' : 'The assigned department will update this saved complaint through its work queue.'}</p></div></div>`;
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

function profile() {
    if (currentUser?.role !== "citizen") return;
    $("#profileName").textContent = currentUser.name || "—";
    $("#profileEmail").textContent = currentUser.email || "—";
    $("#profileRole").textContent = "Citizen";
}
$("#profileReports").onclick = () => go("mine");

function wards() { const w = []; for (let i = 1; i <= 12; i++) { const a = T.filter(t => t.ward == i); const od = a.filter(t => t.st < 3 && left(t) < 0).length; w.push([i, a.length ? Math.round(100 - od / a.length * 100) : 100, a.length]) } w.sort((a, b) => b[1] - a[1]); $("#wards").innerHTML = w.map((x, i) => `<div style="margin:10px 0"><div class="row" style="justify-content:space-between"><b>${i + 1}. Ward ${x[0]}</b><span>${x[1]}% on time · ${x[2]} issues</span></div><div class="meter"><i style="width:${x[1]}%;background:${x[1] > 80 ? "var(--green)" : x[1] > 50 ? "var(--amber)" : "var(--red)"}"></i></div></div>`).join("") }
/* DEPARTMENT OPERATIONS DASHBOARD */
const DUE_SOON_WINDOW_MS = 4 * 60 * 60 * 1000;
const DASHBOARD_ACTIONABLE = new Set(["assigned", "in_progress", "reopened"]);
let dashboardQueue = [], dashboardCounts = {}, dashboardOverview = null;
let dashboardLoaded = false, dashboardPending = null, dashboardFilter = "all", dashboardDrawerTrigger = null;

function dashStatus(status) {
    const labels = { assigned: "Assigned", in_progress: "In progress", reopened: "Reopened", resolution_pending_confirmation: "Awaiting citizen", closed: "Closed" };
    return labels[status] || String(status || "Unknown").replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function dashDate(value) {
    if (value == null || value === "") return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}
function dashDateTime(value) {
    const date = dashDate(value);
    return date ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not available";
}
function dashDue(item, at = Date.now()) {
    const date = dashDate(item?.dueAt), actionable = DASHBOARD_ACTIONABLE.has(item?.status);
    if (!date) return { date: null, overdue: false, dueSoon: false, label: "No deadline recorded" };
    const remaining = date.getTime() - at;
    const overdue = actionable && (item.isOverdue === true || remaining < 0);
    const dueSoon = actionable && !overdue && remaining >= 0 && remaining <= DUE_SOON_WINDOW_MS;
    const minutes = Math.max(1, Math.ceil(Math.abs(remaining) / 60000));
    const amount = minutes >= 1440 ? Math.ceil(minutes / 1440) : minutes >= 60 ? Math.ceil(minutes / 60) : minutes;
    const unit = minutes >= 1440 ? (amount === 1 ? "day" : "days") : minutes >= 60 ? (amount === 1 ? "hour" : "hours") : (amount === 1 ? "minute" : "minutes");
    let label;
    if (overdue) label = "Overdue by " + amount + " " + unit;
    else if (item.status === "closed") label = "Closed";
    else if (item.status === "resolution_pending_confirmation") label = "Awaiting citizen";
    else if (remaining <= 60000) label = "Due now";
    else if (dueSoon) label = "Due in " + amount + " " + unit;
    else {
        const today = new Date(at), start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const dueStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const days = Math.round((dueStart - start) / 86400000);
        label = days === 1 ? "Due tomorrow" : days > 1 && days < 7 ? "Due in " + days + " days" : "Upcoming";
    }
    return { date, overdue, dueSoon, label };
}
function dashPriority(item) {
    return ({ critical: 0, high: 1, normal: 2, low: 3 })[item?.priority?.level] ?? 2;
}
function dashStatusRank(item) {
    if (DASHBOARD_ACTIONABLE.has(item?.status)) return 0;
    return item?.status === "resolution_pending_confirmation" ? 1 : item?.status === "closed" ? 2 : 3;
}
function compareDashboard(a, b, at) {
    const statusA = dashStatusRank(a), statusB = dashStatusRank(b);
    if (statusA !== statusB) return statusA - statusB;
    const rankA = dashPriority(a), rankB = dashPriority(b);
    if (rankA !== rankB) return rankA - rankB;
    const overdueA = dashDue(a, at).overdue, overdueB = dashDue(b, at).overdue;
    if (overdueA !== overdueB) return overdueA ? -1 : 1;
    const dueA = dashDate(a.dueAt)?.getTime() ?? Infinity, dueB = dashDate(b.dueAt)?.getTime() ?? Infinity;
    if (dueA !== dueB) return dueA - dueB;
    const createdA = dashDate(a.createdAt)?.getTime() ?? Infinity, createdB = dashDate(b.createdAt)?.getTime() ?? Infinity;
    if (statusA === 2 && createdA !== createdB) return createdB - createdA;
    return createdA - createdB || String(a.ticketId || "").localeCompare(String(b.ticketId || ""));
}
function dashMatches(item, filter, at) {
    const due = dashDue(item, at);
    if (filter === "all") return true;
    if (filter === "open") return item.status !== "closed";
    if (filter === "action_required") return due.overdue || item.status === "reopened";
    if (filter === "overdue") return due.overdue;
    if (filter === "due_soon") return due.dueSoon;
    if (filter === "escalated") return item.isEscalated === true;
    return item.status === filter;
}
function dashMetric(value) {
    if (value == null || value === "") return "--";
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat().format(number) : " ";
}
function renderDashboardKpis() {
    if (!dashboardLoaded) return;
    const admin = currentUser?.role === "administrator";
    let items;
    if (admin) {
        const data = dashboardOverview || {};
        items = [["Total complaints", data.totalComplaints, "All authorized platform records", "all"],
        ["Open", data.openComplaints, "Not yet closed", "open"], ["Overdue", data.overdueComplaints, "Open reports past deadline", "overdue"],
        ["Escalated", data.escalatedComplaints, "Recorded escalation events", "escalated"],
        ["Closed", data.closedComplaints, "Closed records", "closed"]];
    } else {
        const count = status => Number.isFinite(Number(dashboardCounts[status])) ? Number(dashboardCounts[status]) : dashboardQueue.filter(item => item.status === status).length;
        const active = dashboardQueue.filter(item => DASHBOARD_ACTIONABLE.has(item.status));
        const reopened = new Set(active.filter(item => item.status === "reopened").map(item => String(item.ticketId)));
        const overdue = new Set(active.filter(item => dashDue(item).overdue).map(item => String(item.ticketId)));
        const action = new Set([...reopened, ...overdue]), overdueOnly = [...overdue].filter(id => !reopened.has(id)).length;
        const soon = active.filter(item => dashDue(item).dueSoon).length;
        items = [["Action required", action.size, overdueOnly + " overdue; " + reopened.size + " reopened", "action_required"],
        ["Assigned to start", count("assigned"), "Awaiting an officer work update", "assigned"],
        ["In progress", count("in_progress"), "Currently being worked on", "in_progress"],
        ["Due soon", soon, "Deadline within the next 4 hours", "due_soon"],
        ["Awaiting citizen", count("resolution_pending_confirmation"), "Submitted for citizen review", "resolution_pending_confirmation"]];
    }
    $("#kpi").innerHTML = items.map(item => '<button class="card dept-kpi" type="button" data-dashboard-filter="' + esc(item[3]) +
        '" aria-pressed="' + (dashboardFilter === item[3]) + '"><span class="dept-kpi-label">' + esc(item[0]) +
        '</span><strong>' + esc(dashMetric(item[1])) + '</strong><span class="dept-kpi-detail">' + esc(item[2]) + '</span></button>').join("");
}
function renderAdminAnalytics() {
    const admin = currentUser?.role === "administrator";
    $("#adminAnalytics").hidden = !admin;
    if (!admin || !dashboardOverview) return;
    const data = dashboardOverview;
    const sla = data.resolvedWithinSlaPercent == null ? "Not available" : Number(data.resolvedWithinSlaPercent).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%";
    const average = data.averageResolutionHours == null ? "Not available" : Number(data.averageResolutionHours).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " hours";
    const metrics = [["Departments represented", data.departments], ["Citizen-confirmed closures", data.citizenConfirmedClosures],
    ["Reopened cases", data.reopenedComplaints], ["Closed within SLA", sla], ["Average resolution time", average]];
    $("#adminAnalyticsGrid").innerHTML = metrics.map(item => '<article class="dept-admin-metric"><span>' + esc(item[0]) +
        '</span><strong>' + esc(typeof item[1] === "number" ? dashMetric(item[1]) : item[1]) + '</strong></article>').join("");
    $("#adminSlaNote").textContent = data.slaNote || "Metrics reflect the authorized administrator overview.";
}
function updateDashboardHeader() {
    const admin = currentUser?.role === "administrator";
    $("#dashEyebrow").textContent = admin ? "PLATFORM ADMINISTRATION" : "DEPARTMENT OPERATIONS";
    $("#dashTitle").textContent = admin ? "Accountability overview" : (currentUser?.department?.name || "Department account");
    $("#dashIntro").textContent = admin
        ? "Monitor complaint volume, deadlines, escalation, and resolution outcomes across authorized platform records."
        : "Manage assigned complaints, monitor deadlines, and submit verified resolutions.";
}
function renderDashboardQueue() {
    if (!dashboardLoaded) return;
    const admin = currentUser?.role === "administrator", at = Date.now();
    const rawSearch = $("#queueSearch").value.trim(), query = rawSearch.toLocaleLowerCase();
    const results = dashboardQueue.filter(item => {
        const text = [item.ticketId, item.title, item.category?.label].filter(Boolean).join(" ").toLocaleLowerCase();
        return (!query || text.includes(query)) && dashMatches(item, dashboardFilter, at);
    }).sort((a, b) => compareDashboard(a, b, at));
    $("#queueHead").innerHTML = '<tr><th scope="col">Priority</th><th scope="col">Ticket and issue</th>' +
        (admin ? '<th scope="col">Department</th>' : '') + '<th scope="col">Location</th><th scope="col">Deadline</th><th scope="col">Status</th><th scope="col">Next action</th></tr>';
    $("#queueCount").textContent = dashboardFilter === "all" && !query
        ? dashboardQueue.length + (dashboardQueue.length === 1 ? " complaint in this authorized queue" : " complaints in this authorized queue")
        : "Showing " + results.length + " of " + dashboardQueue.length + " complaints" + (query ? ' matching "' + rawSearch + '"' : "");
    const cols = admin ? 7 : 6;
    if (!results.length) {
        const message = dashboardQueue.length ? "No complaints match this search and filter. Clear the search or choose All complaints." : "No complaints are available in this authorized queue.";
        $("#queue").innerHTML = '<tr class="dept-empty-row"><td colspan="' + cols + '">' + esc(message) + '</td></tr>';
        renderDashboardKpis();
        return;
    }
    $("#queue").innerHTML = results.map(item => {
        const due = dashDue(item, at), priority = priorityLabel(item.priority?.level);
        const prioritySource = prioritySourceLabel(item.priority?.source);
        const status = String(item.status || "unknown"), loc = item.location || {};
        const hasGps = loc.latitude != null && loc.longitude != null && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude));
        const location = hasGps ? Number(loc.latitude).toFixed(4) + ", " + Number(loc.longitude).toFixed(4) :
            loc.mapX != null && loc.mapY != null ? "Schematic map location" : "Not provided";
        const ticket = String(item.ticketId || "Ticket unavailable"), title = String(item.title || "Untitled complaint");
        const category = String(item.category?.label || "Uncategorized");
        const next = status === "assigned" ? "Review / start" : status === "reopened" ? "Review / resume" :
            status === "in_progress" ? "Open complaint" : status === "closed" ? "View record" : "View details";
        const urgency = ({ critical: "critical", high: "high", normal: "normal", low: "low" })[item.priority?.level] || "normal";
        const reason = String(item.priority?.reason || "");
        return '<tr class="dept-queue-row"><td data-label="Priority"><span class="dept-priority ' + urgency + '" title="' + esc(reason) + '">' + esc(priority) +
            '</span><span class="dept-priority-source">' + esc(prioritySource) + '</span>' + (item.isEscalated === true ? '<span class="dept-escalated">Escalated</span>' : '') + '</td>' +
            '<td data-label="Ticket and issue" class="dept-issue-cell"><span class="dept-ticket">' + esc(ticket) +
            '</span><span class="dept-issue-title">' + esc(title) + '</span><span class="dept-issue-category">' + esc(category) + '</span></td>' +
            (admin ? '<td data-label="Department">' + esc(item.department?.name || "Department unavailable") + '</td>' : '') +
            '<td data-label="Location">' + esc(location) + '</td><td data-label="Deadline"><span class="dept-deadline ' +
            (due.overdue ? "overdue" : due.dueSoon ? "soon" : "") + '">' + esc(due.label) + '</span><span class="dept-deadline-exact">' +
            esc(due.date ? dashDateTime(due.date) : "No deadline recorded") + '</span></td><td data-label="Status"><span class="dept-status state-' +
            esc(status.replace(/[^a-z0-9_-]/gi, "")) + '">' + esc(dashStatus(status)) +
            '</span></td><td data-label="Next action"><button type="button" class="btn line dept-open-button" data-dashboard-open="' +
            esc(ticket) + '">' + esc(next) + '</button></td></tr>';
    }).join("");
    renderDashboardKpis();
}
function dashboardLoadError(message) {
    const feedback = $("#dashboardFeedback");
    feedback.hidden = false;
    feedback.classList.add("is-error");
    feedback.textContent = dashboardLoaded ? "Refresh failed. Showing the last successful data. " + message : "Dashboard data could not be loaded. " + message;
    if (!dashboardLoaded) {
        $("#kpi").innerHTML = '<p class="dept-muted" role="status">Live metrics are unavailable until the service responds.</p>';
        $("#queue").innerHTML = '<tr class="dept-empty-row"><td colspan="7" role="alert">' + esc(message) + '</td></tr>';
        $("#queueCount").textContent = "Queue unavailable";
    }
}
async function dashboardJson(response, fallback) {
    let payload = {};
    try { payload = await response.json(); } catch { }
    if (!response.ok) throw new Error(tr(payload.error?.message || fallback));
    return payload;
}
function loadOfficerDashboard() {
    if (dashboardPending) return dashboardPending;
    updateDashboardHeader();
    const button = $("#queueRefresh"), label = button.textContent, feedback = $("#dashboardFeedback");
    button.disabled = true;
    button.textContent = dashboardLoaded ? "Refreshing..." : "Loading...";
    feedback.hidden = true;
    feedback.classList.remove("is-error");
    if (!dashboardLoaded) {
        $("#kpi").innerHTML = '<p class="dept-muted" role="status">Loading live complaint metrics...</p>';
        $("#queue").innerHTML = '<tr class="dept-empty-row"><td colspan="7" role="status">Loading authorized complaints...</td></tr>';
        $("#queueCount").textContent = "Loading authorized complaints...";
    }
    dashboardPending = (async () => {
        try {
            const responses = await Promise.all([fetch("/api/officer/queue"), fetch("/api/officer/counts")]);
            const queueData = await dashboardJson(responses[0], "Could not load the authorized complaint queue.");
            const countData = await dashboardJson(responses[1], "Could not load authorized complaint counts.");
            if (!Array.isArray(queueData.queue)) throw new Error("The queue response did not contain a valid complaint list.");
            if (!countData.counts || typeof countData.counts !== "object") throw new Error("The counts response was not valid.");
            let overview = null;
            if (currentUser?.role === "administrator") {
                const response = await fetch("/api/admin/overview"), data = await dashboardJson(response, "Could not load platform accountability metrics.");
                if (!data.overview || typeof data.overview !== "object") throw new Error("The administrator metrics response was not valid.");
                overview = data.overview;
            }
            dashboardQueue = queueData.queue.filter(item => item && typeof item === "object");
            dashboardCounts = countData.counts;
            dashboardOverview = overview;
            dashboardLoaded = true;
            renderAdminAnalytics();
            renderDashboardKpis();
            renderDashboardQueue();
            $("#lastRefreshed").textContent = "Last updated " + new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
            feedback.hidden = true;
            feedback.classList.remove("is-error");
            return true;
        } catch (error) {
            dashboardLoadError(error.message || "The dashboard refresh failed.");
            return false;
        } finally {
            button.disabled = false;
            button.textContent = label;
        }
    })().finally(() => { dashboardPending = null; });
    return dashboardPending;
}
function dashEventLabel(event) {
    if (event.note && String(event.note).trim()) return String(event.note);
    if (event.previousStatus && event.newStatus) return "Status changed from " + dashStatus(event.previousStatus) + " to " + dashStatus(event.newStatus) + ".";
    const labels = {
        submitted: "Complaint submitted", status_changed: "Workflow status updated",
        evidence_uploaded: "Resolution evidence uploaded", report_photo_uploaded: "Original report photo attached",
        citizen_confirmed: "Citizen confirmed the resolution", reopened: "Citizen reopened the complaint",
        escalated: "Escalation recorded", note_added: "Timeline note added"
    };
    return labels[event.eventType] || dashStatus(event.eventType || "Workflow event");
}
function dashboardMediaSection(title, files, emptyMessage) {
    const content = files.map(file => {
        const url = "/api/evidence/" + encodeURIComponent(file.id);
        const alt = file.kind === "report" ? "Original report photograph" : "Resolution evidence photograph";
        return '<a class="dept-evidence-item" href="' + url + '" target="_blank" rel="noopener"><img src="' + url +
            '" alt="' + esc(alt) + '" loading="lazy"><span>' + esc(dashDateTime(file.createdAt)) + '</span></a>';
    }).join("");
    return '<section class="dept-detail-section"><h3>' + esc(title) + '</h3>' +
        (content ? '<div class="dept-evidence-gallery">' + content + '</div>' : '<p class="dept-muted">' + esc(emptyMessage) + '</p>') + '</section>';
}
async function dOpen(ticketId) {
    if (!$("#drawer").classList.contains("on")) dashboardDrawerTrigger = document.activeElement;
    $("#dBody").innerHTML = '<p class="dept-muted" role="status">Loading complaint details...</p>';
    $("#drawer").classList.add("on");
    try {
        const response = await fetch("/api/officer/complaints/" + encodeURIComponent(ticketId));
        const payload = await dashboardJson(response, "Could not load complaint details."), item = payload.complaint;
        if (!item || typeof item !== "object") throw new Error("Complaint details were not available.");
        const status = String(item.status || "unknown"), canStart = status === "assigned" || status === "reopened";
        const canComplete = status === "in_progress", evidence = Array.isArray(item.evidence) ? item.evidence : [];
        const currentPriority = PRIORITY_LABELS[item.priority?.level] ? item.priority.level : "normal";
        const priorityReason = String(item.priority?.reason || "");
        const resolution = evidence.filter(file => file.kind === "resolution"), photos = evidence.filter(file => file.kind === "report");
        const due = dashDue(item), loc = item.location || {};
        const hasGps = loc.latitude != null && loc.longitude != null && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude));
        let location = '<p class="dept-muted">No reported location is available.</p>';
        if (hasGps) {
            const lat = Number(loc.latitude), lng = Number(loc.longitude);
            const href = "https://www.openstreetmap.org/?mlat=" + encodeURIComponent(lat) + "&mlon=" + encodeURIComponent(lng) + "#map=17/" + encodeURIComponent(lat) + "/" + encodeURIComponent(lng);
            location = '<p>' + esc(lat.toFixed(6) + ", " + lng.toFixed(6)) + '</p><a href="' + href + '" target="_blank" rel="noopener">Open reported location in OpenStreetMap</a>';
        } else if (loc.mapX != null && loc.mapY != null) {
            location = '<p>Schematic map position: ' + esc(Math.round(loc.mapX)) + ", " + esc(Math.round(loc.mapY)) + '</p>';
        }
        const events = Array.isArray(item.events) ? item.events.slice().sort((a, b) =>
            (dashDate(a.createdAt)?.getTime() ?? Infinity) - (dashDate(b.createdAt)?.getTime() ?? Infinity)) : [];
        const timeline = events.length ? '<ol class="dept-timeline">' + events.map(event =>
            '<li><span class="dept-timeline-title">' + (priorityEventMarkup(event.note) || esc(dashEventLabel(event))) + '</span><time datetime="' + esc(event.createdAt || "") +
            '">' + esc(dashDateTime(event.createdAt)) + '</time></li>').join("") + '</ol>' :
            '<p class="dept-muted">No workflow events are recorded for this complaint.</p>';
        const escalation = item.isEscalated === true
            ? '<p class="dept-escalation-note">An escalation event is recorded in this complaint history.</p>'
            : '<p class="dept-muted">No escalation is recorded.</p>';
        let action = '<p class="dept-muted">No officer action is available for this workflow state.</p>';
        if (canStart) action = '<button type="button" class="btn rust dept-primary-action" data-dashboard-status="in_progress" data-ticket="' +
            esc(item.ticketId) + '">' + (status === "reopened" ? "Resume work" : "Start work") + '</button>';
        else if (canComplete) action = '<div class="dept-action-stack">' +
            (resolution.length
                ? '<button type="button" class="btn rust dept-primary-action" data-dashboard-status="resolution_pending_confirmation" data-ticket="' +
                esc(item.ticketId) + '">Submit for citizen confirmation</button>'
                : '<button type="button" class="btn rust dept-primary-action" disabled aria-describedby="evidenceRequired">Upload evidence before requesting confirmation</button><p class="dept-muted" id="evidenceRequired">At least one successfully uploaded resolution photograph is required.</p>') +
            '<div class="dept-upload-control"><label class="btn line" for="evidenceFile">Upload resolution evidence</label>' +
            '<input id="evidenceFile" data-ticket="' + esc(item.ticketId) + '" type="file" accept="image/jpeg,image/png,image/webp" hidden>' +
            '<p class="dept-muted">JPEG, PNG or WebP, up to 5 MB. Uploads are private to authorized viewers.</p>' +
            '<p id="evidenceStatus" class="dept-upload-feedback" role="status" aria-live="polite"></p></div></div>';
        else if (status === "resolution_pending_confirmation") action = '<p class="dept-muted">This resolution is awaiting citizen confirmation.</p>';
        else if (status === "closed") action = '<p class="dept-muted">This complaint is closed following the citizen workflow.</p>';
        const priorityOptions = Object.keys(PRIORITY_LABELS).map(level => '<option value="' + level + '"' + (level === currentPriority ? ' selected' : '') + '>' + esc(priorityLabel(level)) + '</option>').join("");
        const prioritySection = '<section class="dept-detail-section"><h3>' + esc(tr("Priority recommendation")) + '</h3>' +
            '<p><span class="dept-priority ' + currentPriority + '">' + esc(priorityLabel(currentPriority)) + '</span> <span class="dept-priority-source">' +
            esc(prioritySourceLabel(item.priority?.source)) + '</span></p><p class="dept-muted priority-reason">' + esc(priorityReason) + '</p>' +
            '<p class="dept-muted">' + esc(tr("Priority is a recommendation. Department staff can adjust it and record a reason.")) + '</p>' +
            (DASHBOARD_ACTIONABLE.has(status) ? '<div class="priority-edit"><label for="priorityLevel">' + esc(tr("Change priority")) + '</label><select id="priorityLevel" name="priorityLevel">' + priorityOptions +
                '</select><label for="priorityReasonInput">' + esc(tr("Reason for change")) + '</label><textarea id="priorityReasonInput" name="reason" rows="3" maxlength="500" required placeholder="Explain why this priority should change"></textarea>' +
                '<button type="button" class="btn line" data-dashboard-priority="' + esc(item.ticketId) + '">' + esc(tr("Update priority")) + '</button></div>' : '') + '</section>';
        $("#dBody").innerHTML = '<div class="dept-drawer-header"><div><p class="dept-eyebrow">COMPLAINT RECORD</p><h2>' +
            esc(item.ticketId || "Ticket") + '</h2><p class="dept-drawer-title">' + esc(item.title || "Untitled complaint") +
            '</p></div><button type="button" class="btn line dept-drawer-close" data-dashboard-close aria-label="Close complaint details">Close</button></div>' +
            '<div class="dept-drawer-badges"><span class="dept-status state-' + esc(status.replace(/[^a-z0-9_-]/gi, "")) + '">' +
            esc(dashStatus(status)) + '</span><span class="dept-priority ' + currentPriority +
            '">' + esc(priorityLabel(currentPriority)) + '</span>' + (item.isEscalated === true ? '<span class="dept-escalated">Escalation recorded</span>' : '') +
            '<span class="dept-category">' + esc(item.category?.label || "Uncategorized") + '</span></div>' +
            '<section class="dept-detail-section"><h3>Issue details</h3><p class="dept-description">' + esc(item.description || "No description was provided.") +
            '</p><div class="dept-details-grid"><div><span>Department</span><strong>' + esc(item.department?.name || "Not available") +
            '</strong></div><div><span>Reported</span><strong>' + esc(dashDateTime(item.createdAt)) + '</strong></div>' +
            '<div><span>Deadline</span><strong>' + esc(due.date ? dashDateTime(due.date) : "No deadline recorded") +
            '</strong></div><div><span>Location</span><div>' + location + '</div></div></div></section>' +
            prioritySection + dashboardMediaSection("Original report photo", photos, "No original report photograph was attached.") +
            dashboardMediaSection("Resolution evidence", resolution, "No resolution evidence has been uploaded.") +
            '<section class="dept-detail-section"><h3>Deadline and accountability</h3><p class="' +
            (due.overdue ? "dept-deadline overdue" : "dept-deadline") + '">' + esc(due.label) + '</p>' + escalation +
            '</section><section class="dept-detail-section"><h3>Complaint timeline</h3>' + timeline +
            '</section><section class="dept-detail-section dept-next-action"><h3>Next action</h3>' + action + '</section>';
        requestAnimationFrame(() => $("#dBody [data-dashboard-close]")?.focus());
        return true;
    } catch (error) {
        $("#dBody").innerHTML = '<div class="dept-drawer-header"><h2>Complaint details</h2><button type="button" class="btn line" data-dashboard-close>Close</button></div><p role="alert" class="dept-dashboard-feedback is-error">' + esc(error.message) + '</p>';
        return false;
    }
}
async function uploadEvidence(ticketId, input) {
    const file = input.files?.[0];
    if (!file) return;
    const status = $("#evidenceStatus"), label = $("#dBody label[for='evidenceFile']");
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
        if (status) status.textContent = "Choose a JPEG, PNG, or WebP image.";
        input.value = "";
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        if (status) status.textContent = "This image exceeds the 5 MB limit.";
        input.value = "";
        return;
    }
    input.disabled = true;
    if (label) label.textContent = "Uploading...";
    if (status) status.textContent = "Uploading evidence securely...";
    try {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/officer/complaints/" + encodeURIComponent(ticketId) + "/evidence", { method: "POST", body: form });
        const payload = await dashboardJson(response, "Evidence upload failed.");
        if (!payload.evidence?.id) throw new Error("The server did not confirm the uploaded evidence.");
        const refreshed = await dOpen(ticketId);
        toast(refreshed ? "Resolution evidence uploaded" : "Evidence was uploaded, but refreshed case details could not be loaded.");
        await loadOfficerDashboard();
    } catch (error) {
        if (status) status.textContent = error.message;
        toast(error.message);
        input.disabled = false;
        if (label) label.textContent = "Upload resolution evidence";
    }
}
const dClose = () => {
    $("#drawer").classList.remove("on");
    const trigger = dashboardDrawerTrigger;
    dashboardDrawerTrigger = null;
    if (trigger?.isConnected) trigger.focus();
};
async function act(ticketId, status) {
    try {
        const response = await fetch("/api/officer/complaints/" + encodeURIComponent(ticketId) + "/status", {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status })
        });
        const payload = await dashboardJson(response, "The complaint could not be updated.");
        if (!payload.complaint) throw new Error("The server did not confirm the workflow update.");
        toast("Complaint status updated");
        await loadOfficerDashboard();
        await dOpen(ticketId);
    } catch (error) { toast(error.message); }
}
async function changePriority(ticketId, button) {
    const select = $("#priorityLevel"), reasonField = $("#priorityReasonInput");
    if (!select || !reasonField || !reasonField.reportValidity()) return;
    const priorityLevel = select.value, reason = reasonField.value.trim();
    if (!reason) { reasonField.focus(); return; }
    button.disabled = true;
    try {
        const response = await fetch("/api/officer/complaints/" + encodeURIComponent(ticketId) + "/priority", {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priorityLevel, reason })
        });
        const payload = await dashboardJson(response, "Priority could not be updated.");
        if (!payload.complaint) throw new Error(tr("The server did not confirm the priority update."));
        toast(tr("Priority updated"));
        await loadOfficerDashboard();
        await dOpen(ticketId);
    } catch (error) {
        toast(tr(error.message));
        button.disabled = false;
    }
}
$("#queueRefresh").onclick = () => loadOfficerDashboard();
$("#queueSearch").addEventListener("input", renderDashboardQueue);
$("#queueFilter").addEventListener("change", event => {
    dashboardFilter = event.currentTarget.value;
    renderDashboardKpis();
    renderDashboardQueue();
});
$("#kpi").addEventListener("click", event => {
    const card = event.target.closest("[data-dashboard-filter]");
    if (!card) return;
    dashboardFilter = card.dataset.dashboardFilter;
    $("#queueFilter").value = dashboardFilter;
    renderDashboardKpis();
    renderDashboardQueue();
});
$("#queue").addEventListener("click", event => {
    const button = event.target.closest("[data-dashboard-open]");
    if (button) dOpen(button.dataset.dashboardOpen);
});
$("#dBody").addEventListener("click", event => {
    if (event.target.closest("[data-dashboard-close]")) return dClose();
    const button = event.target.closest("[data-dashboard-status]");
    if (button) { button.disabled = true; act(button.dataset.ticket, button.dataset.dashboardStatus); }
    const priorityButton = event.target.closest("[data-dashboard-priority]");
    if (priorityButton) changePriority(priorityButton.dataset.dashboardPriority, priorityButton);
});
$("#dBody").addEventListener("change", event => {
    if (event.target.matches("#evidenceFile")) uploadEvidence(event.target.dataset.ticket, event.target);
});
$("#drawer").addEventListener("click", event => { if (event.target.id === "drawer") dClose(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && $("#drawer").classList.contains("on")) dClose(); });
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
$$('.chips span').forEach(c => c.onclick = () => { $("#q").value = c.textContent; R.cat = guess(c.textContent); $("#desc").value = c.textContent; go("report") }); seed(); document.body.classList.toggle("landing-active", view === "home"); nav(); mapUI(); drawMap("#homeMap"); animOn();
requestDeviceLocation().then(showNearbyReportsAt).catch(() => {
    const status = $("#homeMapMessage");
    if (status) status.textContent = "Showing public reports for the default map area. Allow location to see nearby issues.";
});
loadSession().then(() => { if (["officer", "administrator"].includes(currentUser?.role)) go("dash"); });
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
const N = [{ txt: "● Welcome! Updates on your reports appear here.", t: Date.now() }]; let unread = 1;
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
        const BLUE = '#06B6D4';
        const WHITE = '#c8d6e0';
        const PARTICLE_COUNT = 140;

        function resize() {
            W = canvas.width = hero.offsetWidth;
            H = canvas.height = hero.offsetHeight;
        }

        function randomParticle() {
            const isPulse = Math.random() < 0.12;
            const isOrange = Math.random() < 0.18;
            const isBlue = !isOrange && Math.random() < 0.10;
            return {
                x: Math.random() * (W || 800),
                y: Math.random() * (H || 600),
                r: isPulse ? (1.5 + Math.random() * 2.2) : (0.4 + Math.random() * 1.2),
                vx: (Math.random() - 0.5) * 0.22,
                vy: (Math.random() - 0.5) * 0.18,
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
            const y = e.clientY - r.top - size / 2;
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
                    const nx = (e.clientX - r.left) / r.width - 0.5;
                    const ny = (e.clientY - r.top) / r.height - 0.5;
                    const rx = ny * TILT;
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

            const COLORS = ['#10B981', '#34D399', '#f0a36c', '#06B6D4', '#a7f3d0'];
            for (let i = 0; i < 18; i++) {
                const angle = (i / 18) * Math.PI * 2;
                const dist = 55 + Math.random() * 45;
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

    /* Civic Track: Continuous background image rotation
   Only controls the seven .problem-bg-image elements.
   Existing website functionality remains unchanged. */

    function initCivicProblemBackgroundRotation() {
        const section = document.querySelector(
            '#landing-problem, .landing-problem'
        );

        if (!section || section.dataset.problemRotationStarted === 'true') {
            return;
        }

        const images = [...section.querySelectorAll('.problem-bg-image')];

        if (images.length < 2) {
            console.warn(
                `Civic Track: Expected at least two .problem-bg-image elements; found ${images.length}.`
            );
            return;
        }

        section.dataset.problemRotationStarted = 'true';

        // Request all local background files immediately. Do not wait for load events:
        // a deferred image can otherwise prevent the rotation timer from ever starting.
        images.forEach(image => {
            image.loading = 'eager';
            image.decoding = 'async';
        });

        let activeIndex = images.findIndex(image =>
            image.classList.contains('is-active')
        );

        if (activeIndex < 0) activeIndex = 0;

        images.forEach((image, index) => {
            image.classList.toggle('is-active', index === activeIndex);
        });

        window.setInterval(() => {
            images[activeIndex].classList.remove('is-active');
            activeIndex = (activeIndex + 1) % images.length;
            images[activeIndex].classList.add('is-active');
        }, 3500);
    }
    /* â”€â”€ Boot all enhancements â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    onReady(function () {
        initCivicProblemBackgroundRotation();
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


// /* Civic Track: Continuous background image rotation
//    Only controls the seven .problem-bg-image elements.
//    Existing website functionality remains unchanged. */

// (function initCivicProblemBackgroundRotation() {
//     'use strict';

//     function startProblemImageRotation() {
//         const section = document.querySelector('#landing-problem');

//         // Prevent duplicate initialization.
//         if (
//             !section ||
//             section.dataset.problemRotationStarted === 'true'
//         ) {
//             return;
//         }

//         const images = Array.from(
//             section.querySelectorAll('.problem-bg-image')
//         );

//         // At least two images are required for rotation.
//         if (images.length < 2) {
//             console.warn(
//                 'Civic Track: Background images were not found. ' +
//                 'Check the .problem-bg-image class in your HTML.'
//             );
//             return;
//         }

//         section.dataset.problemRotationStarted = 'true';

//         // Preload images to help prevent delays during transitions.
//         images.forEach(image => {
//             image.loading = 'eager';

//             if (image.complete && image.naturalWidth > 0) {
//                 return;
//             }

//             const preload = new Image();
//             preload.src = image.currentSrc || image.src;
//         });

//         // Find the currently active image.
//         let activeIndex = images.findIndex(image =>
//             image.classList.contains('is-active')
//         );

//         if (activeIndex < 0) {
//             activeIndex = 0;
//         }

//         // Ensure exactly one image is initially active.
//         images.forEach((image, index) => {
//             image.classList.toggle(
//                 'is-active',
//                 index === activeIndex
//             );
//         });

//         // Rotate every two seconds, continuously.
//         // After the last image, return to the first.
//         window.setInterval(() => {
//             const nextIndex =
//                 (activeIndex + 1) % images.length;

//             // Activate the next image.
//             images[nextIndex].classList.add('is-active');

//             // Deactivate the previous image.
//             images[activeIndex].classList.remove('is-active');

//             activeIndex = nextIndex;
//         }, 2000);
//     }

//     // Start when the document is ready.
//     if (document.readyState === 'loading') {
//         document.addEventListener(
//             'DOMContentLoaded',
//             startProblemImageRotation,
//             { once: true }
//         );
//     } else {
//         startProblemImageRotation();
//     }
// })();


