import { defaultState } from "./data.js";
import { loadState, saveState } from "./storage.js";
import { getCloudSyncStatus } from "./cloud-sync.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = value => JSON.parse(JSON.stringify(value));
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const dateLabel = value => new Date(value + "T12:00:00").toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit", year:"numeric" });
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));
const number = value => Number(String(value ?? "").replace(",", ".")) || 0;
const fmt = value => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value);
let state = await loadState() || clone(defaultState);
let currentPage = "dashboard";
let selectedDay = new Date().getDay();
let nutritionDate = todayKey();
let timerInterval = null;
let timerRemaining = 0;
let timerRunning = false;
let toastTimer = null;

function ensureState() {
  state.profile ||= clone(defaultState.profile);
  state.profile.homeEquipmentName ??= "";
  state.profile.homeEquipment ??= "";
  state.profile.homeEquipmentImageDataUrl ??= "";
  state.plans ||= clone(defaultState.plans);
  state.homeExercises ||= clone(defaultState.homeExercises);
  state.workouts ||= [];
  state.bodyEntries ||= [];
  state.nutrition ||= clone(defaultState.nutrition);
  state.martial ||= clone(defaultState.martial);
  state.settings ||= clone(defaultState.settings);
  state.drafts ||= {};
  state.notes ||= [];
}
ensureState();

async function persist(message = "") {
  state.updatedAt = new Date().toISOString();
  const ok = await saveState(state);
  if (message) showToast(ok ? message : "Speichern fehlgeschlagen – bitte Backup exportieren.");
  return ok;
}
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function setPage(page) {
  currentPage = page;
  $$(".nav-link,.mobile-link").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  const titles = {dashboard:"Dashboard",training:"Gym-Training",home:"Home Workout",nutrition:"Ernährung",fight:"Martial Arts",progress:"Fortschritt",calendar:"Kalender",settings:"Einstellungen"};
  $("#top-title").textContent = titles[page] || "KRAFTWERK 24";
  $("#top-date").textContent = new Date().toLocaleDateString("de-DE", { weekday:"long", day:"numeric", month:"long" }).toUpperCase();
  render();
  window.scrollTo({top:0,behavior:"smooth"});
}
function card(title, body, extra = "") {
  return `<section class="card ${extra}"><h3>${title}</h3>${body}</section>`;
}
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}
function isSameWeek(dateString, start) {
  const d = new Date(dateString + "T12:00:00");
  return d >= start && d < new Date(start.getTime() + 7*86400000);
}
function currentWeekWorkouts() {
  const start = getWeekStart();
  return state.workouts.filter(item => isSameWeek(item.date, start));
}
function currentWeekFight() {
  const start = getWeekStart();
  return state.martial.sessions.filter(item => isSameWeek(item.date, start));
}
function activeWeekStreak() {
  let count = 0;
  const current = getWeekStart();
  for (let i=0;i<52;i++) {
    const start = new Date(current.getTime() - i*7*86400000);
    const found = [...state.workouts, ...state.martial.sessions].some(item => isSameWeek(item.date, start));
    if (!found) break;
    count++;
  }
  return count;
}
function dailyNutrition(date = nutritionDate) {
  return state.nutrition.entries.filter(entry => entry.date === date);
}
function sumNutrition(entries) {
  return entries.reduce((sum, item) => {
    sum.kcal += number(item.kcal); sum.protein += number(item.protein);
    sum.carbs += number(item.carbs); sum.fat += number(item.fat);
    return sum;
  }, {kcal:0,protein:0,carbs:0,fat:0});
}
function dayName(date) {
  return new Date(date + "T12:00:00").toLocaleDateString("de-DE", {weekday:"long"});
}
function renderDashboard() {
  const week = currentWeekWorkouts();
  const fights = currentWeekFight();
  const total = state.workouts.length;
  const target = 5;
  const adherence = Math.min(100, Math.round((week.length / target) * 100));
  const todayEntries = sumNutrition(dailyNutrition(todayKey()));
  const nextPlan = state.plans.find(plan => plan.weekday === new Date().getDay());
  const nextTitle = nextPlan ? `${nextPlan.title} · ${nextPlan.focus}` : "Regeneration / frei planbar";
  const weekdays = ["SO","MO","DI","MI","DO","FR","SA"];
  const strip = weekdays.map((label, i) => {
    const done = week.some(session => new Date(session.date + "T12:00:00").getDay() === i);
    const rest = i === 5 || i === 6;
    const plan = state.plans.find(item => item.weekday === i);
    return `<div class="week-day ${done ? "done" : ""} ${rest ? "rest" : ""}">
      <strong>${label}</strong><small>${done ? "✓ erledigt" : plan ? plan.title : "Pause"}</small>
    </div>`;
  }).join("");
  const recent = [...state.workouts].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,4);
  const recentHtml = recent.length ? recent.map(item => `<div class="history-item"><div><strong>${esc(item.title)}</strong><small>${dateLabel(item.date)} · ${item.mode === "home" ? "Home" : "Gym"} · ${item.exercises.length} Übungen</small></div><span class="pill green">Gespeichert</span></div>`).join("") : `<div class="empty-state">Noch keine Trainingseinheit gespeichert.<br>Starte dein erstes Training im Bereich Gym oder Home Workout.</div>`;
  return `
    <div class="hero-card">
      <div><div class="hero-kicker">DEIN PERSÖNLICHES FITNESS SYSTEM</div><h2>Konstanz schlägt Perfektion.</h2><p>Dein Training, deine Ernährung und deine Entwicklung an einem Ort. Starte mit einem kleinen, sauberen Schritt.</p></div>
      <div class="hero-actions"><button class="btn btn-primary" data-page="training">Training öffnen ↗</button><button class="btn btn-secondary" data-page="nutrition">Ernährung öffnen</button></div>
    </div>
    <div class="grid grid-4" style="margin-top:16px">
      <div class="card metric-card"><span class="metric-icon">▣</span><div class="metric-label">Einheiten gesamt</div><div class="metric-value">${total}</div><div class="metric-foot">Krafttraining gespeichert</div></div>
      <div class="card metric-card"><span class="metric-icon">↗</span><div class="metric-label">Diese Woche</div><div class="metric-value">${week.length + fights.length}</div><div class="metric-foot">${week.length} Kraft · ${fights.length} Kampfsport</div></div>
      <div class="card metric-card"><span class="metric-icon">🔥</span><div class="metric-label">Aktive Wochen</div><div class="metric-value">${activeWeekStreak()}</div><div class="metric-foot">Wochen mit mindestens einer Einheit</div></div>
      <div class="card metric-card"><span class="metric-icon">◉</span><div class="metric-label">Wochenziel Gym</div><div class="metric-value">${adherence}%</div><div class="metric-foot">${week.length} von ${target} geplanten Einheiten</div></div>
    </div>
    <div class="section-row"><h3>Deine Trainingswoche</h3><span>Erledigte Tage werden markiert</span></div>
    <div class="week-strip">${strip}</div>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card">
        <div class="eyebrow-label">HEUTE IM PLAN</div><h3 style="font-size:20px;margin-bottom:6px">${esc(nextTitle)}</h3>
        <p class="card-subtitle">${nextPlan ? `${nextPlan.exercises.length} Übungen · Zielbereich ${nextPlan.title}` : "Erholung, lockere Bewegung oder eine betreute Kampfsporteinheit."}</p>
        <button class="btn btn-primary" data-page="${nextPlan ? "training" : "fight"}">${nextPlan ? "Heutiges Training öffnen" : "Kampfsport protokollieren"}</button>
      </section>
      <section class="card">
        <div class="eyebrow-label">ERNÄHRUNG HEUTE</div>
        <div class="metric-value" style="margin-top:0">${fmt(todayEntries.kcal)} <span style="font-size:12px;color:var(--muted)">kcal erfasst</span></div>
        <div class="macro-row"><span>Protein</span><div class="macro-bar"><i style="width:${state.nutrition.targets.protein ? Math.min(100,todayEntries.protein/number(state.nutrition.targets.protein)*100) : 0}%"></i></div><strong>${fmt(todayEntries.protein)} g</strong></div>
        <button class="btn btn-secondary btn-small" data-page="nutrition">Mahlzeiten eintragen</button>
      </section>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card"><div class="section-row" style="margin:0 0 10px"><h3>Letzte Trainings</h3><button class="btn btn-ghost btn-small" data-page="progress">Verlauf</button></div>${recentHtml}</section>
      <section class="card"><div class="eyebrow-label">DEIN PROFIL</div><h3 style="font-size:19px">${esc(state.profile.goal || "Ziel noch nicht festgelegt")}</h3><div class="mini-stat"><span>Größe</span><strong>${state.profile.heightCm ? `${esc(state.profile.heightCm)} cm` : "Nicht hinterlegt"}</strong></div><div class="mini-stat"><span>Aktuelles Gewicht</span><strong>${state.profile.weightKg ? `${esc(state.profile.weightKg)} kg` : "Nicht hinterlegt"}</strong></div><div class="mini-stat"><span>Kampfsport</span><strong>Individuell festlegen</strong></div><div class="mini-stat"><span>Speicherung</span><strong>Lokale IndexedDB</strong></div><button class="btn btn-ghost btn-small" style="margin-top:12px" data-page="settings">Profil bearbeiten</button></section>
    </div>
  `;
}

function getPlanById(id, mode) {
  return mode === "home" ? state.homeExercises.find(item => item.id === id) : state.plans.flatMap(p=>p.exercises).find(item=>item.id===id);
}
function getDraft(exercise, mode) {
  const key = `${mode}:${exercise.id}`;
  if (!state.drafts[key]) {
    state.drafts[key] = Array.from({length:Number(exercise.sets)||3}, () => ({weight: exercise.startWeight ?? "", reps:""}));
  }
  const sets = Number(exercise.sets)||3;
  while (state.drafts[key].length < sets) state.drafts[key].push({weight:exercise.startWeight ?? "",reps:""});
  if (state.drafts[key].length > sets) state.drafts[key] = state.drafts[key].slice(0,sets);
  return state.drafts[key];
}
function renderExercise(exercise, mode, dayId = "") {
  const draft = getDraft(exercise, mode);
  const photo = exercise.imageDataUrl ? `<div class="photo-box"><img src="${exercise.imageDataUrl}" alt="Eigenes Gerätefoto"></div>` : `<div class="photo-box">⚙</div>`;
  const brand = exercise.manufacturer || "Zuordnen";
  const setRows = draft.map((set, index) => `<div class="set-row"><span>Satz ${index+1}</span><input inputmode="decimal" aria-label="Gewicht Satz ${index+1}" placeholder="kg" value="${esc(set.weight)}" data-set-field="weight" data-mode="${mode}" data-ex="${exercise.id}" data-index="${index}"><input inputmode="numeric" aria-label="Wiederholungen Satz ${index+1}" placeholder="Wdh." value="${esc(set.reps)}" data-set-field="reps" data-mode="${mode}" data-ex="${exercise.id}" data-index="${index}"></div>`).join("");
  return `<article class="exercise-card" data-ex-card="${exercise.id}">
    <div class="exercise-main">
      <div class="exercise-title-row"><h4>${esc(exercise.name)}</h4><span class="pill">${esc(exercise.sets)} × ${esc(exercise.reps)}</span></div>
      <div class="exercise-meta"><span class="pill gray">${esc(exercise.equipment || "Freie Übung")}</span><span class="pill ${brand === "gym80" ? "red" : brand === "DHZ" ? "yellow" : "gray"}">${esc(brand)}</span></div>
      <div class="exercise-note"><strong>Ausgangswert:</strong> ${esc(exercise.startLabel || "Noch nicht festgelegt")}<br>${esc(exercise.note || "")}</div>
      <div class="set-table"><div class="set-row"><span></span><span class="field-label">GEWICHT (KG)</span><span class="field-label">WIEDERHOLUNGEN</span></div>${setRows}</div>
      <div class="exercise-edit">
        <div class="field"><label>Hersteller</label><select data-ex-field="manufacturer" data-mode="${mode}" data-ex="${exercise.id}">${["Zuordnen","gym80","DHZ","Freihantel","Andere"].map(x=>`<option ${brand===x?"selected":""}>${x}</option>`).join("")}</select></div>
        <div class="field"><label>Modell / Gerätenummer</label><input data-ex-field="model" data-mode="${mode}" data-ex="${exercise.id}" value="${esc(exercise.model||"")}" placeholder="z. B. Modell"></div>
        <div class="field"><label>Sätze</label><input type="number" min="1" max="10" data-ex-field="sets" data-mode="${mode}" data-ex="${exercise.id}" value="${esc(exercise.sets)}"></div>
        <div class="field"><label>Wdh.-Bereich</label><input data-ex-field="reps" data-mode="${mode}" data-ex="${exercise.id}" value="${esc(exercise.reps)}"></div>
      </div>
      <div class="form-actions"><label class="btn btn-ghost btn-small">＋ Gerätefoto hinzufügen<input type="file" accept="image/*" hidden data-photo-ex="${exercise.id}" data-mode="${mode}"></label><button class="btn btn-ghost btn-small" data-action="add-set" data-ex="${exercise.id}" data-mode="${mode}">＋ Satz</button>${mode==="gym"?`<button class="btn btn-danger btn-small" data-action="delete-exercise" data-ex="${exercise.id}" data-mode="${mode}" data-day="${dayId}">Übung löschen</button>`:`<button class="btn btn-danger btn-small" data-action="delete-exercise" data-ex="${exercise.id}" data-mode="${mode}">Löschen</button>`}</div>
    </div>
    <div class="exercise-actions">${photo}<span class="small-muted">Foto optional</span></div>
  </article>`;
}
function renderTraining() {
  const plan = state.plans.find(item => item.weekday === selectedDay) || state.plans[0];
  const tabs = state.plans.map(item=>`<button class="day-tab ${item.id===plan.id?"active":""}" data-weekday="${item.weekday}">${item.day.slice(0,2).toUpperCase()} · ${item.title}</button>`).join("");
  return `<div class="page-heading"><div><div class="eyebrow-label">KRAFTTRAINING · INDIVIDUELL</div><h2>Gym-Training</h2><p>Plane deine Trainingstage, ordne Geräte zu und protokolliere Gewicht und Wiederholungen.</p></div><span class="pill green">Lokaler Trainingslog</span></div>
    <div class="notice info" style="margin-bottom:16px"><strong>Geräte-Zuordnung:</strong> gym80 und DHZ stehen als Herstelleroptionen zur Verfügung. Prüfe das konkrete Modell anhand des Typenschilds oder eines eigenen Gerätefotos, bevor du es zuordnest.</div>
    <div class="day-tabs">${tabs}</div>
    <div class="hero-card" style="min-height:120px;margin-bottom:16px"><div><div class="hero-kicker">${esc(plan.day.toUpperCase())}</div><h2>${esc(plan.title)}</h2><p>${esc(plan.focus)} · ${plan.exercises.length} Übungen</p></div><span class="pill">Ziel: saubere Technik</span></div>
    <div class="exercise-list">${plan.exercises.map((ex,i)=>renderExercise(ex,"gym",plan.id)).join("")}</div>
    <div class="card" style="margin-top:15px"><h3>Training abschließen</h3><div class="field"><label>NOTIZEN ZUR EINHEIT</label><textarea class="control" rows="2" id="gym-session-notes" placeholder="Tagesform, Technik, Besonderheiten ..."></textarea></div><div class="form-actions"><button class="btn btn-primary" data-action="save-gym-session" data-plan-id="${plan.id}">✓ Training speichern</button><button class="btn btn-secondary" data-action="clear-draft" data-mode="gym">Eingaben zurücksetzen</button></div></div>
    <div class="small-muted" style="margin-top:12px">Lege Startgewichte selbst fest. Wähle Belastung und Wiederholungszahl so, dass die Technik kontrolliert bleibt.</div>
    <div class="card" style="margin-top:16px"><h3>Neue Übung hinzufügen</h3><form id="add-gym-exercise" class="form-grid"><div class="field"><label>ÜBUNGSNAME</label><input name="name" required placeholder="z. B. Kabel-Flys"></div><div class="field"><label>GERÄT / EQUIPMENT</label><input name="equipment" placeholder="z. B. Kabelzug"></div><div class="field"><label>SÄTZE</label><input name="sets" type="number" min="1" max="10" value="3"></div><div class="field"><label>WIEDERHOLUNGEN</label><input name="reps" value="8–12"></div><div class="field"><label>STARTGEWICHT (OPTIONAL)</label><input name="startLabel" placeholder="Noch nicht getestet"></div><div class="field"><label>HERSTELLER</label><select name="manufacturer"><option>Zuordnen</option><option>gym80</option><option>DHZ</option><option>Freihantel</option><option>Andere</option></select></div><div class="form-actions"><button class="btn btn-secondary" type="submit">＋ Zur Einheit hinzufügen</button></div></form></div>`;
}
function renderHome() {
  const equipmentName = state.profile.homeEquipmentName || "Eigene Ausstattung";
  const equipmentDescription = state.profile.homeEquipment || "Noch kein Equipment hinterlegt. Du kannst deine Ausstattung in den Einstellungen eintragen.";
  const equipmentPhoto = state.profile.homeEquipmentImageDataUrl
    ? `<img src="${esc(state.profile.homeEquipmentImageDataUrl)}" alt="Eigenes Equipment">`
    : `<div class="photo-box">⚙</div>`;
  return `<div class="page-heading"><div><div class="eyebrow-label">TRAINING ZU HAUSE</div><h2>Home Workout</h2><p>Übungen mit Kurzhanteln und Körpergewicht – passe das Training an deine vorhandene Ausstattung an.</p></div><span class="pill green">Individuell anpassbar</span></div>
    <section class="card home-gear"><div>${equipmentPhoto}</div><div><div class="eyebrow-label">DEIN EQUIPMENT</div><h3 style="font-size:19px;margin:0 0 7px">${esc(equipmentName)}</h3><p class="card-subtitle">${esc(equipmentDescription)}</p><div class="form-actions"><label class="btn btn-ghost btn-small">＋ Equipment-Foto hinzufügen<input type="file" accept="image/*" hidden data-home-photo></label><button class="btn btn-ghost btn-small" data-page="settings">Equipment bearbeiten</button></div></div></section>
    <div class="notice info" style="margin:15px 0">Verwende nur sicher montierte und unbeschädigte Hanteln. Prüfe Verschlüsse und Verbindungen vor jeder Einheit. Erhöhe das Gewicht schrittweise und kontrolliert.</div>
    <div class="section-row"><h3>Übungen für zu Hause</h3><span>${state.homeExercises.length} Übungen · Gewichte frei eintragbar</span></div>
    <div class="exercise-list">${state.homeExercises.map(ex=>renderExercise(ex,"home")).join("")}</div>
    <div class="card" style="margin-top:15px"><h3>Home-Workout speichern</h3><div class="field"><label>NOTIZEN</label><textarea class="control" id="home-session-notes" rows="2" placeholder="Wie lief das Training?"></textarea></div><div class="form-actions"><button class="btn btn-primary" data-action="save-home-session">✓ Home-Workout speichern</button><button class="btn btn-secondary" data-action="clear-draft" data-mode="home">Eingaben zurücksetzen</button></div></div>
    <div class="card" style="margin-top:15px"><h3>Eigene Home-Übung hinzufügen</h3><form id="add-home-exercise" class="form-grid"><div class="field"><label>ÜBUNGSNAME</label><input name="name" required placeholder="Übungsname"></div><div class="field"><label>EQUIPMENT</label><input name="equipment" placeholder="z. B. Kurzhantel"></div><div class="field"><label>SÄTZE</label><input name="sets" type="number" min="1" max="10" value="3"></div><div class="field"><label>WIEDERHOLUNGEN</label><input name="reps" value="8–12"></div><div class="form-actions"><button class="btn btn-secondary" type="submit">＋ Übung hinzufügen</button></div></form></div>`;
}
function renderNutrition() {
  const entries = dailyNutrition();
  const totals = sumNutrition(entries);
  const targets = state.nutrition.targets;
  const maxKcal = number(targets.calories);
  const kcalPercent = maxKcal ? Math.min(100,totals.kcal/maxKcal*100) : 0;
  const macro = (label, key, colorLabel) => {
    const target = number(targets[key]);
    const value = totals[key];
    const pct = target ? Math.min(100,value/target*100) : 0;
    return `<div class="macro-row"><span>${label}</span><div class="macro-bar"><i style="width:${pct}%"></i></div><strong>${fmt(value)} / ${target ? fmt(target)+" g" : "—"}</strong></div>`;
  };
  const entriesHtml = entries.length ? entries.map(item=>`<div class="food-item"><div><strong>${esc(item.name)}</strong><small>${esc(item.meal)} · ${fmt(item.kcal)} kcal · P ${fmt(item.protein)} g · KH ${fmt(item.carbs)} g · F ${fmt(item.fat)} g</small></div><button class="btn btn-danger btn-small" data-action="delete-food" data-id="${item.id}">Entfernen</button></div>`).join("") : `<div class="empty-state">Für diesen Tag sind noch keine Mahlzeiten eingetragen.</div>`;
  const recipes = state.nutrition.recipes.map(item=>`<div class="recipe-item"><div><strong>${esc(item.name)}</strong><small>${esc(item.ingredients)}${item.kcal ? ` · ${esc(item.kcal)} kcal` : " · Nährwerte noch offen"}</small></div><div class="form-actions"><button class="btn btn-ghost btn-small" data-action="recipe-to-diary" data-id="${item.id}">Eintragen</button><button class="btn btn-danger btn-small" data-action="delete-recipe" data-id="${item.id}">×</button></div></div>`).join("");
  const weekday = new Date(nutritionDate+"T12:00:00").getDay();
  const plan = state.nutrition.mealPlan[weekday] || {breakfast:"",lunch:"",dinner:"",snacks:""};
  const shopping = state.nutrition.shopping.map((item,i)=>`<div class="food-item"><strong>${esc(item)}</strong><button class="btn btn-danger btn-small" data-action="delete-shopping" data-index="${i}">Entfernen</button></div>`).join("");
  return `<div class="page-heading"><div><div class="eyebrow-label">ERNÄHRUNG · DOKUMENTATION</div><h2>Ernährung</h2><p>Mahlzeiten protokollieren, Rezepte speichern und deine Wochenplanung organisieren.</p></div><span class="pill">Manuelle Ziele</span></div>
    <div class="notice warning" style="margin-bottom:16px"><strong>Hinweis:</strong> Ernährungseinträge und Makroangaben dienen der persönlichen Dokumentation. Lege Energie- und Nährstoffziele passend zu deiner Situation fest; bei Unsicherheit nutze qualifizierte Ernährungs- oder medizinische Beratung. Die App ersetzt keine fachliche Beratung.</div>
    <div class="grid grid-2">
      <section class="card"><div class="section-row" style="margin:0 0 15px"><h3>Tagesübersicht</h3><input type="date" class="control" id="nutrition-date" value="${nutritionDate}" style="max-width:150px"></div><div style="display:flex;align-items:center;gap:22px;flex-wrap:wrap"><div class="kcal-ring" style="background:conic-gradient(#b85e73 ${kcalPercent*3.6}deg,#303039 0deg)"><div><strong>${fmt(totals.kcal)}</strong><small>kcal erfasst</small></div></div><div style="flex:1;min-width:160px"><div class="metric-label">Kalorienziel</div><div class="metric-value" style="font-size:22px">${maxKcal ? fmt(maxKcal)+" kcal" : "Nicht festgelegt"}</div><div class="metric-foot">${maxKcal ? fmt(Math.max(0,maxKcal-totals.kcal))+" kcal verbleibend (rechnerisch)" : "Du kannst ein abgestimmtes Ziel eintragen."}</div></div></div><hr class="divider">${macro("Protein","protein")}${macro("Kohlenhydrate","carbs")}${macro("Fett","fat")}</section>
      <section class="card"><h3>Deine Tagesziele bearbeiten</h3><p class="card-subtitle">Nur Ziele eintragen, die du mit einer geeigneten Fachperson abgestimmt hast.</p><form id="nutrition-target-form" class="form-grid"><div class="field"><label>KALORIEN (KCAL)</label><input name="calories" type="number" min="0" value="${esc(targets.calories)}" placeholder="Optional"></div><div class="field"><label>PROTEIN (G)</label><input name="protein" type="number" min="0" value="${esc(targets.protein)}" placeholder="Optional"></div><div class="field"><label>KOHLENHYDRATE (G)</label><input name="carbs" type="number" min="0" value="${esc(targets.carbs)}" placeholder="Optional"></div><div class="field"><label>FETT (G)</label><input name="fat" type="number" min="0" value="${esc(targets.fat)}" placeholder="Optional"></div><div class="form-actions"><button class="btn btn-secondary" type="submit">Ziele speichern</button></div></form></section>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card"><h3>Mahlzeit eintragen</h3><form id="food-form" class="form-grid"><div class="field"><label>MAHLZEIT</label><select name="meal"><option>Frühstück</option><option>Mittagessen</option><option>Abendessen</option><option>Snack</option></select></div><div class="field"><label>LEBENSMITTEL / GERICHT</label><input name="name" required placeholder="z. B. Skyr mit Haferflocken"></div><div class="field"><label>KALORIEN (KCAL)</label><input name="kcal" type="number" min="0" step="1" placeholder="Optional"></div><div class="field"><label>PROTEIN (G)</label><input name="protein" type="number" min="0" step=".1" placeholder="Optional"></div><div class="field"><label>KOHLENHYDRATE (G)</label><input name="carbs" type="number" min="0" step=".1" placeholder="Optional"></div><div class="field"><label>FETT (G)</label><input name="fat" type="number" min="0" step=".1" placeholder="Optional"></div><div class="form-actions"><button class="btn btn-primary" type="submit">＋ Mahlzeit speichern</button></div></form></section>
      <section class="card"><h3>Heute gegessen</h3><p class="card-subtitle">${dateLabel(nutritionDate)}</p>${entriesHtml}</section>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card"><h3>Rezept-Sammlung</h3><p class="card-subtitle">Nährwerte pro Portion selbst ergänzen oder aus den Produktangaben übernehmen.</p>${recipes}<hr class="divider"><form id="recipe-form" class="form-grid"><div class="field"><label>REZEPTNAME</label><input name="name" required placeholder="z. B. Protein-Porridge"></div><div class="field"><label>ZUTATEN</label><input name="ingredients" placeholder="Zutaten / Portionsgröße"></div><div class="field"><label>KCAL (OPTIONAL)</label><input name="kcal" type="number" min="0"></div><div class="field"><label>PROTEIN (G)</label><input name="protein" type="number" min="0"></div><div class="field"><label>KOHLENHYDRATE (G)</label><input name="carbs" type="number" min="0"></div><div class="field"><label>FETT (G)</label><input name="fat" type="number" min="0"></div><div class="form-actions"><button class="btn btn-secondary" type="submit">＋ Rezept speichern</button></div></form></section>
      <section class="card"><h3>Wochen-Essensplan</h3><div class="field"><label>TAG</label><select id="meal-plan-day">${["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"].map((name,i)=>`<option value="${i}" ${weekday===i?"selected":""}>${name}</option>`).join("")}</select></div><form id="meal-plan-form" class="form-grid" style="margin-top:10px"><div class="field"><label>FRÜHSTÜCK</label><textarea name="breakfast" rows="2">${esc(plan.breakfast)}</textarea></div><div class="field"><label>MITTAGESSEN</label><textarea name="lunch" rows="2">${esc(plan.lunch)}</textarea></div><div class="field"><label>ABENDESSEN</label><textarea name="dinner" rows="2">${esc(plan.dinner)}</textarea></div><div class="field"><label>SNACKS</label><textarea name="snacks" rows="2">${esc(plan.snacks)}</textarea></div><div class="form-actions"><button class="btn btn-secondary" type="submit">Essensplan speichern</button></div></form><hr class="divider"><h3>Einkaufsliste</h3><form id="shopping-form" class="inline-form"><div class="field" style="grid-column:span 3"><label>ARTIKEL</label><input name="item" placeholder="z. B. Haferflocken"></div><button class="btn btn-secondary" type="submit">Hinzufügen</button></form>${shopping}</section>
    </div>`;
}

function renderFight() {
  const sessions = [...state.martial.sessions].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,8);
  const history = sessions.length ? sessions.map(item=>`<div class="history-item"><div><strong>${esc(item.type)}</strong><small>${dateLabel(item.date)} · ${esc(item.minutes)} min · ${esc(item.intensity)}</small>${item.notes?`<small>${esc(item.notes)}</small>`:""}</div><span class="pill">${esc(item.rounds)} Runden</span></div>`).join("") : `<div class="empty-state">Noch keine Kampfsporteinheit protokolliert.</div>`;
  const techniques = state.martial.techniques.map(item=>`<label class="tech-item"><input type="checkbox" data-tech="${item.id}" ${state.martial.completedTechniques.includes(item.id)?"checked":""}><span><strong>${esc(item.name)}</strong><br><small style="color:var(--muted)">${esc(item.category)}</small></span></label>`).join("");
  return `<div class="page-heading"><div><div class="eyebrow-label">FIGHT CAMP · ANFÄNGER</div><h2>Martial Arts</h2><p>Muay Thai und MMA – Einheiten, Technikfortschritt und Runden protokollieren.</p></div><span class="pill yellow">Anfänger-Modus</span></div>
    <div class="notice warning" style="margin-bottom:16px"><strong>Sicherheit:</strong> Technik zuerst und unter Anleitung eines qualifizierten Trainers lernen. Kein hartes Sparring oder Kopfkontakt ohne Freigabe und passende Schutzausrüstung durch den Trainer. Bei Schmerzen, Schwindel oder Beschwerden Training abbrechen.</div>
    <div class="grid grid-2">
      <section class="card"><h3>Kampfsporteinheit speichern</h3><form id="fight-form" class="form-grid"><div class="field"><label>SPORTART</label><select name="type"><option>Muay Thai</option><option>MMA</option><option>Technik / Kondition</option></select></div><div class="field"><label>DATUM</label><input name="date" type="date" value="${todayKey()}"></div><div class="field"><label>DAUER (MINUTEN)</label><input name="minutes" type="number" min="1" max="300" value="60"></div><div class="field"><label>RUNDEN</label><input name="rounds" type="number" min="0" max="30" value="5"></div><div class="field"><label>INTENSITÄT</label><select name="intensity"><option>Leicht</option><option selected>Moderat</option><option>Intensiv</option></select></div><div class="field"><label>SPARRING</label><select name="sparring"><option>Nein</option><option>Nur technisch und freigegeben</option></select></div><div class="field" style="grid-column:1/-1"><label>NOTIZEN</label><textarea name="notes" rows="2" placeholder="Techniken, Hinweise vom Trainer, Tagesform ..."></textarea></div><div class="form-actions"><button class="btn btn-primary" type="submit">Einheit speichern</button></div></form></section>
      <section class="card"><h3>Runden-Timer</h3><p class="card-subtitle">Voreinstellung: 3 Minuten Runde, 1 Minute Pause. Passe sie an die Einheit und Traineranweisung an.</p><div class="form-grid"><div class="field"><label>RUNDE (SEK.)</label><input id="round-seconds" type="number" min="10" max="900" value="${state.settings.roundSeconds}"></div><div class="field"><label>PAUSE (SEK.)</label><input id="round-rest-seconds" type="number" min="5" max="600" value="${state.settings.roundRestSeconds}"></div></div><div class="timer-card" style="margin-top:14px"><span class="pill" id="timer-mode">BEREIT</span><div class="timer-display" id="timer-display">03:00</div><div class="timer-controls"><button class="btn btn-primary" data-action="timer-start">Start</button><button class="btn btn-secondary" data-action="timer-pause">Pause</button><button class="btn btn-ghost" data-action="timer-reset">Reset</button></div></div></section>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card"><h3>Technik-Checkliste</h3><p class="card-subtitle">${state.martial.completedTechniques.length} von ${state.martial.techniques.length} Grundlagen abgehakt. Lernfortschritt nur markieren, wenn dein Trainer die Technik mit dir geübt hat.</p><div class="tech-list">${techniques}</div></section>
      <section class="card"><h3>Letzte Einheiten</h3>${history}</section>
    </div>`;
}

function renderProgress() {
  const sessions = state.workouts.length;
  const fights = state.martial.sessions.length;
  const allExercises = state.workouts.flatMap(session=>session.exercises||[]);
  const records = {};
  allExercises.forEach(ex=>{
    (ex.sets||[]).forEach(set=>{
      const w=number(set.weight),r=number(set.reps);
      if(w>0 && r>0 && (!records[ex.name] || w>records[ex.name].weight)) records[ex.name]={weight:w,reps:r};
    });
  });
  const recordHtml = Object.entries(records).sort((a,b)=>b[1].weight-a[1].weight).slice(0,10).map(([name,data])=>`<div class="mini-stat"><span>${esc(name)}</span><strong>${fmt(data.weight)} kg · ${fmt(data.reps)} Wdh.</strong></div>`).join("") || `<div class="empty-state">Noch keine Bestleistungen. Speichere ein Training mit Gewicht und Wiederholungen.</div>`;
  const weights = [...state.bodyEntries].sort((a,b)=>a.date.localeCompare(b.date)).slice(-8);
  const maxWeight = Math.max(...weights.map(x=>number(x.weight)),1);
  const bars = weights.length ? `<div class="bar-chart">${weights.map(item=>`<div class="bar-column"><i style="height:${Math.max(5,number(item.weight)/maxWeight*100)}%"></i><small>${dateLabel(item.date).slice(0,5)}</small></div>`).join("")}</div>` : `<div class="empty-state">Noch keine Körpergewichtseinträge. Du kannst optionale Messwerte unten erfassen.</div>`;
  const achievements = [
    {n:1,t:"Erster Schritt",d:"Erste Krafttrainingseinheit"},
    {n:10,t:"Konsequent",d:"10 Krafttrainingseinheiten"},
    {n:25,t:"Routine",d:"25 Krafttrainingseinheiten"},
    {n:50,t:"Dranbleiber",d:"50 Krafttrainingseinheiten"},
    {n:100,t:"Meilenstein",d:"100 Krafttrainingseinheiten"},
    {n:0,t:"Fight Starter",d:"Erste Kampfsporteinheit",fight:true},
    {n:0,t:"Technik-Fokus",d:"5 Grundlagen gelernt",tech:true},
    {n:0,t:"Backup-Profi",d:"Erstes Backup exportiert",backup:true}
  ];
  const unlocked = a => a.fight ? fights>=1 : a.tech ? state.martial.completedTechniques.length>=5 : a.backup ? !!state.backupExported : sessions>=a.n;
  const achHtml = achievements.map(a=>`<div class="achievement ${unlocked(a)?"unlocked":""}"><b>${a.fight?"🥊":a.tech?"🎯":a.backup?"🛡️":a.n===1?"🏁":a.n===10?"⚡":a.n===25?"🔥":a.n===50?"🏆":"👑"}</b><strong>${a.t}</strong><small>${a.d}</small></div>`).join("");
  return `<div class="page-heading"><div><div class="eyebrow-label">DATEN · ENTWICKLUNG</div><h2>Fortschritt</h2><p>Deine Trainingshistorie, Bestleistungen, Körperentwicklung und freigeschalteten Erfolge.</p></div><span class="pill green">Deine Daten</span></div>
    <div class="grid grid-4"><div class="card metric-card"><div class="metric-label">Kraft-Einheiten</div><div class="metric-value">${sessions}</div><div class="metric-foot">Gespeicherte Gym- und Home-Workouts</div></div><div class="card metric-card"><div class="metric-label">Kampfsport</div><div class="metric-value">${fights}</div><div class="metric-foot">Muay Thai / MMA protokolliert</div></div><div class="card metric-card"><div class="metric-label">Techniken</div><div class="metric-value">${state.martial.completedTechniques.length}</div><div class="metric-foot">Von dir abgehakt</div></div><div class="card metric-card"><div class="metric-label">Aktive Wochen</div><div class="metric-value">${activeWeekStreak()}</div><div class="metric-foot">Mit mindestens einer Einheit</div></div></div>
    <div class="grid grid-2" style="margin-top:16px"><section class="card"><h3>Körpergewicht dokumentieren</h3><form id="body-form" class="form-grid"><div class="field"><label>DATUM</label><input name="date" type="date" value="${todayKey()}"></div><div class="field"><label>GEWICHT (KG)</label><input name="weight" type="number" min="20" max="300" step=".1" required placeholder="z. B. 70,5"></div><div class="field"><label>NOTIZ (OPTIONAL)</label><input name="note" placeholder="z. B. morgens"></div><div class="form-actions"><button class="btn btn-primary" type="submit">Gewicht speichern</button></div></form><hr class="divider"><h3>Gewichtsverlauf</h3>${bars}</section><section class="card"><h3>Deine Bestleistungen</h3><p class="card-subtitle">Höchstes gespeichertes Arbeitsgewicht je Übung. Nur aussagekräftig, wenn gleiche Maschine und gleiche Ausführung verglichen werden.</p>${recordHtml}</section></div>
    <section class="card" style="margin-top:16px"><div class="section-row" style="margin-top:0"><h3>Achievements</h3><span>Durch echte Einheiten freischalten</span></div><div class="badge-grid">${achHtml}</div></section>
    <section class="card" style="margin-top:16px"><h3>Letzte Körpergewichtseinträge</h3>${state.bodyEntries.length ? [...state.bodyEntries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8).map(item=>`<div class="mini-stat"><span>${dateLabel(item.date)} ${item.note?`· ${esc(item.note)}`:""}</span><strong>${fmt(number(item.weight))} kg</strong></div>`).join("") : `<div class="small-muted">Noch keine Einträge.</div>`}</section>`;
}

function renderCalendar() {
  const current = state.calendarMonth ? new Date(state.calendarMonth+"-01T12:00:00") : new Date();
  const year=current.getFullYear(), month=current.getMonth();
  const first=new Date(year,month,1);
  const offset=(first.getDay()+6)%7;
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let i=0;i<offset;i++) cells.push(`<div class="calendar-cell muted"></div>`);
  for(let day=1;day<=daysInMonth;day++){
    const date=new Date(year,month,day);
    const key=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const gym=state.workouts.some(item=>item.date===key);
    const fight=state.martial.sessions.some(item=>item.date===key);
    const isToday=key===todayKey();
    cells.push(`<div class="calendar-cell ${isToday?"today":""}"><strong>${day}</strong><div class="calendar-dots">${gym?'<i title="Krafttraining"></i>':""}${fight?'<i class="fight" title="Kampfsport"></i>':""}</div></div>`);
  }
  while(cells.length%7) cells.push(`<div class="calendar-cell muted"></div>`);
  const weekdayNames = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];
  const restDays = weekdayNames.filter((_, index) => !state.plans.some(plan => plan.weekday === index));
  return `<div class="page-heading"><div><div class="eyebrow-label">PLANUNG</div><h2>Trainingskalender</h2><p>Markierungen zeigen gespeicherte Kraft- und Kampfsporteinheiten.</p></div><span class="pill">Monatsansicht</span></div>
    <section class="card"><div class="section-row" style="margin-top:0"><button class="btn btn-secondary btn-small" data-action="calendar-prev">← Vorheriger</button><h3>${current.toLocaleDateString("de-DE",{month:"long",year:"numeric"})}</h3><button class="btn btn-secondary btn-small" data-action="calendar-next">Nächster →</button></div><div class="calendar-grid">${["MO","DI","MI","DO","FR","SA","SO"].map(x=>`<div class="field-label" style="text-align:center;padding:6px">${x}</div>`).join("")}${cells.join("")}</div><div class="form-actions"><span class="pill"><i style="width:6px;height:6px;background:#d07b8e;border-radius:50%;display:inline-block"></i> Krafttraining</span><span class="pill yellow">Kampfsport</span></div></section>
    <div class="grid grid-2" style="margin-top:16px"><section class="card"><h3>Dein Wochenrhythmus</h3>${state.plans.map(p=>`<div class="mini-stat"><span>${p.day}</span><strong>${esc(p.title)}</strong></div>`).join("")}${restDays.length ? `<div class="mini-stat"><span>${restDays.join(" / ")}</span><strong>Regeneration / flexibel</strong></div>` : ""}</section><section class="card"><h3>Hinweis zur Belastung</h3><p class="card-subtitle">Kampfsport kann zusätzliche Belastung bringen. Plane Einheiten mit Trainer und ausreichend Erholung. Die App markiert Trainingstage, ersetzt aber keine individuelle Belastungssteuerung.</p></section></div>`;
}

function renderSettings() {
  const p=state.profile;
  return `<div class="page-heading"><div><div class="eyebrow-label">KONFIGURATION · DATEN</div><h2>Einstellungen</h2><p>Profil, lokale Speicherung, Backups und Gerätezuordnung verwalten.</p></div><span class="pill green">IndexedDB aktiv</span></div>
    <div class="grid grid-2">
      <section class="card"><h3>Dein Profil</h3><form id="profile-form" class="form-grid"><div class="field"><label>NAME / PROFIL</label><input name="name" value="${esc(p.name)}"></div><div class="field"><label>ALTER</label><input name="age" type="number" min="13" max="100" value="${esc(p.age)}"></div><div class="field"><label>GRÖSSE (CM)</label><input name="heightCm" type="number" min="100" max="230" value="${esc(p.heightCm)}"></div><div class="field"><label>GEWICHT (KG)</label><input name="weightKg" type="number" min="30" max="300" step=".1" value="${esc(p.weightKg)}"></div><div class="field"><label>HAUPTZIEL</label><input name="goal" value="${esc(p.goal)}"></div><div class="field"><label>FITNESSSTUDIO (OPTIONAL)</label><input name="gym" value="${esc(p.gym)}" placeholder="Optional"></div><div class="field"><label>EQUIPMENT-BEZEICHNUNG</label><input name="homeEquipmentName" value="${esc(p.homeEquipmentName||"")}" placeholder="z. B. Kurzhantelset"></div><div class="field" style="grid-column:1/-1"><label>EQUIPMENT-BESCHREIBUNG</label><textarea name="homeEquipment" rows="2" placeholder="Deine Ausstattung und Gesamtgewicht">${esc(p.homeEquipment||"")}</textarea></div><div class="form-actions"><button class="btn btn-primary" type="submit">Profil speichern</button></div></form></section>
      <section class="card"><h3>Backup & Wiederherstellung</h3><p class="card-subtitle">Exportiere regelmäßig eine vollständige JSON-Kopie deiner lokalen Daten. Bewahre sie an einem sicheren Ort auf.</p><div class="notice info">Die App speichert aktuell auf diesem Browser und Gerät. <strong>${esc(getCloudSyncStatus().label)}</strong> Ein Backup wird nicht automatisch in eine Cloud hochgeladen.</div><div class="form-actions"><button class="btn btn-primary" data-action="export-backup">↓ Backup exportieren</button><button class="btn btn-secondary" data-action="import-backup">↑ Backup importieren</button></div><div class="small-muted" style="margin-top:10px">Letzte lokale Änderung: ${state.updatedAt ? new Date(state.updatedAt).toLocaleString("de-DE") : "Noch nicht verfügbar"}</div></section>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card"><h3>Geräte-Lexikon</h3><p class="card-subtitle">Herstelleroptionen zur Gerätezuordnung. Prüfe das konkrete Modell anhand eines Typenschilds oder eines eigenen Fotos.</p><div class="mini-stat"><span>Hersteller 1</span><strong>gym80</strong></div><div class="mini-stat"><span>Hersteller 2</span><strong>DHZ</strong></div><div class="form-actions"><a class="btn btn-ghost btn-small" href="https://gym80.de/produkte/" target="_blank" rel="noopener">gym80 Produktübersicht ↗</a><a class="btn btn-ghost btn-small" href="https://dhz-fitness.com/" target="_blank" rel="noopener">DHZ Website ↗</a></div><div class="small-muted" style="margin-top:10px">Herstellerkataloge und Produktbilder sind urheberrechtlich geschützt. Die App verwendet keine nicht zugeordneten Bilder als angeblich exakte Studiomodelle.</div></section>
      <section class="card"><h3>Lokale Daten</h3><div class="mini-stat"><span>Krafttraining</span><strong>${state.workouts.length} Einheiten</strong></div><div class="mini-stat"><span>Kampfsport</span><strong>${state.martial.sessions.length} Einheiten</strong></div><div class="mini-stat"><span>Mahlzeiten</span><strong>${state.nutrition.entries.length} Einträge</strong></div><div class="mini-stat"><span>Körperdaten</span><strong>${state.bodyEntries.length} Einträge</strong></div><div class="notice warning" style="margin-top:12px">„Alle lokalen Daten löschen“ ist endgültig. Exportiere vorher ein Backup.</div><button class="btn btn-danger" style="margin-top:12px" data-action="reset-data">Alle lokalen Daten löschen</button></section>
    </div>
    <section class="card" style="margin-top:16px"><h3>Installieren & Offline nutzen</h3><p class="card-subtitle">Die App benötigt für Service Worker und Offline-Cache localhost oder HTTPS. Auf dem iPhone in Safari öffnen und über „Teilen“ zum Home-Bildschirm hinzufügen.</p><div class="notice info">Die Cloud-Anbindung ist in Version 1.0 noch nicht aktiv. Wenn du später mehrere Geräte synchronisieren möchtest, wird ein Backend mit Authentifizierung und einer Datenbank benötigt.</div></section>`;
}

function render() {
  const view=$("#view");
  const renderers={dashboard:renderDashboard,training:renderTraining,home:renderHome,nutrition:renderNutrition,fight:renderFight,progress:renderProgress,calendar:renderCalendar,settings:renderSettings};
  view.innerHTML=(renderers[currentPage]||renderDashboard)();
  updateTimerDisplay();
}

function makeSession(mode, title, exercises, notes) {
  const savedExercises = exercises.map(ex=>{
    const draft=getDraft(ex,mode);
    return {id:ex.id,name:ex.name,sets:draft.map(s=>({weight:String(s.weight??""),reps:String(s.reps??"")})).filter(s=>s.reps.trim()!=="")};
  }).filter(ex=>ex.sets.length);
  if(!savedExercises.length){showToast("Trage mindestens einen Satz ein, bevor du speicherst.");return;}
  state.workouts.push({id:crypto.randomUUID?.()||String(Date.now()),date:todayKey(),createdAt:new Date().toISOString(),mode,title,exercises:savedExercises,notes:notes||""});
  savedExercises.forEach(ex=>{const key=`${mode}:${ex.id}`;const last=ex.sets.filter(s=>number(s.weight)>0).at(-1);if(last){const target=getPlanById(ex.id,mode);if(target){target.lastWeight=last.weight;}}});
  Object.keys(state.drafts).filter(key=>key.startsWith(mode+":")).forEach(key=>delete state.drafts[key]);
  persist("Trainingseinheit gespeichert.");
  setPage("progress");
}
function updateDraftFromInput(input) {
  const mode=input.dataset.mode, id=input.dataset.ex, index=Number(input.dataset.index), field=input.dataset.setField;
  const ex=getPlanById(id,mode); if(!ex)return;
  const draft=getDraft(ex,mode);
  if(!draft[index])draft[index]={weight:"",reps:""};
  draft[index][field]=input.value;
  persist();
}
function updateExerciseField(input) {
  const mode=input.dataset.mode,id=input.dataset.ex,field=input.dataset.exField;
  const ex=getPlanById(id,mode); if(!ex)return;
  ex[field]=input.value;
  if(field==="sets"){
    ex.sets=Math.max(1,Math.min(10,Number(input.value)||1));
    getDraft(ex,mode);
  }
  persist();
}
function clearDraft(mode) {
  Object.keys(state.drafts).filter(key=>key.startsWith(mode+":")).forEach(key=>delete state.drafts[key]);
  persist("Eingaben zurückgesetzt.");render();
}
function addFood(form) {
  const data=new FormData(form);
  state.nutrition.entries.push({id:crypto.randomUUID?.()||String(Date.now()),date:nutritionDate,meal:data.get("meal"),name:data.get("name"),kcal:data.get("kcal"),protein:data.get("protein"),carbs:data.get("carbs"),fat:data.get("fat")});
  persist("Mahlzeit gespeichert.");render();
}
function fileToDataURL(file) {
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
}
function downloadJSON(data, filename) {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function exportBackup() {
  state.backupExported=true;
  const date=todayKey();
  downloadJSON({app:"KRAFTWERK 24",version:1,exportedAt:new Date().toISOString(),data:state},`KRAFTWERK24_BACKUP_${date}.json`);
  persist("Backup exportiert.");
  if(currentPage==="progress")render();
}
async function importBackup(file) {
  try{
    const parsed=JSON.parse(await file.text());
    const incoming=parsed.data||parsed;
    if(!incoming || !Array.isArray(incoming.plans) || !incoming.profile) throw new Error("Das ist kein gültiges KRAFTWERK-24-Backup.");
    if(!confirm("Das Backup ersetzt deine aktuellen lokalen Daten. Vorher bitte ein Backup exportieren. Fortfahren?"))return;
    state=incoming;ensureState();await persist("Backup wiederhergestellt.");setPage("dashboard");
  }catch(error){showToast("Import fehlgeschlagen: "+error.message);}
}
function updateTimerDisplay() {
  const display=$("#timer-display");if(!display)return;
  const seconds=Math.max(0,timerRemaining);
  display.textContent=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  const mode=$("#timer-mode");if(mode)mode.textContent=timerRunning?"LÄUFT":seconds===0?"FERTIG":"BEREIT";
}
function startTimer() {
  const round=Math.max(10,Number($("#round-seconds")?.value)||180);
  const rest=Math.max(5,Number($("#round-rest-seconds")?.value)||60);
  state.settings.roundSeconds=round;state.settings.roundRestSeconds=rest;
  if(!timerRemaining)timerRemaining=round;
  if(timerRunning)return;
  timerRunning=true;
  timerInterval=setInterval(()=>{
    timerRemaining--;
    if(timerRemaining<=0){timerRemaining=0;clearInterval(timerInterval);timerRunning=false;showToast("Runde beendet – Pause oder nächste Runde starten.");}
    updateTimerDisplay();
  },1000);
  updateTimerDisplay();persist();
}
function pauseTimer(){timerRunning=false;clearInterval(timerInterval);updateTimerDisplay();}
function resetTimer(){pauseTimer();timerRemaining=Number($("#round-seconds")?.value)||state.settings.roundSeconds||180;updateTimerDisplay();}
function moveCalendar(delta) {
  const current=state.calendarMonth?new Date(state.calendarMonth+"-01T12:00:00"):new Date();
  current.setMonth(current.getMonth()+delta);
  state.calendarMonth=`${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,"0")}`;
  persist();render();
}

document.addEventListener("click", async event=>{
  const pageButton=event.target.closest("[data-page]");
  if(pageButton){event.preventDefault();setPage(pageButton.dataset.page);return;}
  const dayButton=event.target.closest("[data-weekday]");
  if(dayButton){selectedDay=Number(dayButton.dataset.weekday);render();return;}
  const actionButton=event.target.closest("[data-action]");
  if(!actionButton)return;
  const action=actionButton.dataset.action;
  if(action==="save-gym-session"){
    const plan=state.plans.find(item=>item.id===actionButton.dataset.planId);
    makeSession("gym",plan?.title||"Gym-Training",plan?.exercises||[],$("#gym-session-notes")?.value||"");
  }
  if(action==="save-home-session")makeSession("home","Home Workout",state.homeExercises,$("#home-session-notes")?.value||"");
  if(action==="clear-draft")clearDraft(actionButton.dataset.mode);
  if(action==="add-set"){
    const ex=getPlanById(actionButton.dataset.ex,actionButton.dataset.mode);if(ex){getDraft(ex,actionButton.dataset.mode).push({weight:ex.startWeight??"",reps:""});persist();render();}
  }
  if(action==="delete-exercise"){
    if(!confirm("Diese Übung wirklich löschen?"))return;
    const id=actionButton.dataset.ex;
    if(actionButton.dataset.mode==="home")state.homeExercises=state.homeExercises.filter(x=>x.id!==id);
    else{const plan=state.plans.find(x=>x.id===actionButton.dataset.day)||state.plans.find(p=>p.exercises.some(x=>x.id===id));if(plan)plan.exercises=plan.exercises.filter(x=>x.id!==id);}
    persist("Übung gelöscht.");render();
  }
  if(action==="delete-food"){state.nutrition.entries=state.nutrition.entries.filter(x=>x.id!==actionButton.dataset.id);persist("Mahlzeit entfernt.");render();}
  if(action==="delete-recipe"){state.nutrition.recipes=state.nutrition.recipes.filter(x=>x.id!==actionButton.dataset.id);persist("Rezept entfernt.");render();}
  if(action==="recipe-to-diary"){
    const recipe=state.nutrition.recipes.find(x=>x.id===actionButton.dataset.id);if(!recipe)return;
    state.nutrition.entries.push({id:crypto.randomUUID?.()||String(Date.now()),date:nutritionDate,meal:"Snack",name:recipe.name,kcal:recipe.kcal,protein:recipe.protein,carbs:recipe.carbs,fat:recipe.fat});
    persist("Rezept als Mahlzeit eingetragen.");render();
  }
  if(action==="delete-shopping"){state.nutrition.shopping.splice(Number(actionButton.dataset.index),1);persist();render();}
  if(action==="calendar-prev")moveCalendar(-1);
  if(action==="calendar-next")moveCalendar(1);
  if(action==="timer-start")startTimer();
  if(action==="timer-pause")pauseTimer();
  if(action==="timer-reset")resetTimer();
  if(action==="export-backup")exportBackup();
  if(action==="import-backup")$("#import-file").click();
  if(action==="reset-data"){
    if(!confirm("ACHTUNG: Alle lokalen Trainings-, Ernährungs- und Profildaten werden gelöscht. Hast du ein Backup?"))return;
    state=clone(defaultState);ensureState();await persist("Lokale Daten zurückgesetzt.");setPage("dashboard");
  }
});

document.addEventListener("change", async event=>{
  const input=event.target;
  if(input.matches("[data-set-field]")){updateDraftFromInput(input);return;}
  if(input.matches("[data-ex-field]")){updateExerciseField(input);return;}
  if(input.matches("[data-home-photo]") && input.files?.[0]){
    try{state.profile.homeEquipmentImageDataUrl=await fileToDataURL(input.files[0]);await persist("Equipment-Foto hinzugefügt.");render();}catch{showToast("Foto konnte nicht geladen werden.");}
  }
  if(input.matches("[data-photo-ex]") && input.files?.[0]){
    const ex=getPlanById(input.dataset.ex,input.dataset.mode);if(!ex)return;
    try{ex.imageDataUrl=await fileToDataURL(input.files[0]);await persist("Gerätefoto hinzugefügt.");render();}catch{showToast("Foto konnte nicht geladen werden.");}
  }
  if(input.matches("[data-tech]")){
    const id=input.dataset.tech;
    state.martial.completedTechniques=input.checked?[...new Set([...state.martial.completedTechniques,id])]:state.martial.completedTechniques.filter(x=>x!==id);
    persist("Technikfortschritt gespeichert.");render();
  }
  if(input.id==="nutrition-date"){nutritionDate=input.value||todayKey();render();}
  if(input.id==="meal-plan-day"){render();}
  if(input.id==="import-file" && input.files?.[0]){await importBackup(input.files[0]);input.value="";}
});

document.addEventListener("submit", async event=>{
  event.preventDefault();
  const form=event.target;const data=new FormData(form);
  if(form.id==="add-gym-exercise"){
    const plan=state.plans.find(x=>x.weekday===selectedDay)||state.plans[0];
    plan.exercises.push({id:"g-custom-"+Date.now(),name:data.get("name"),sets:Number(data.get("sets"))||3,reps:data.get("reps")||"8–12",startLabel:data.get("startLabel")||"Noch nicht getestet",startWeight:"",equipment:data.get("equipment")||"Freie Übung",manufacturer:data.get("manufacturer")||"Zuordnen",model:"",note:""});
    await persist("Übung hinzugefügt.");render();
  }
  if(form.id==="add-home-exercise"){
    state.homeExercises.push({id:"h-custom-"+Date.now(),name:data.get("name"),sets:Number(data.get("sets"))||3,reps:data.get("reps")||"8–12",equipment:data.get("equipment")||"Hantel",note:"Eigene Übung"});
    await persist("Home-Übung hinzugefügt.");render();
  }
  if(form.id==="food-form"){addFood(form);}
  if(form.id==="nutrition-target-form"){
    state.nutrition.targets={calories:data.get("calories"),protein:data.get("protein"),carbs:data.get("carbs"),fat:data.get("fat")};
    await persist("Ernährungsziele gespeichert.");render();
  }
  if(form.id==="recipe-form"){
    state.nutrition.recipes.push({id:"r-"+Date.now(),name:data.get("name"),ingredients:data.get("ingredients"),kcal:data.get("kcal"),protein:data.get("protein"),carbs:data.get("carbs"),fat:data.get("fat"),note:""});
    await persist("Rezept gespeichert.");render();
  }
  if(form.id==="meal-plan-form"){
    const day=Number($("#meal-plan-day").value);
    state.nutrition.mealPlan[day]={breakfast:data.get("breakfast"),lunch:data.get("lunch"),dinner:data.get("dinner"),snacks:data.get("snacks")};
    await persist("Wochen-Essensplan gespeichert.");render();
  }
  if(form.id==="shopping-form"){
    const item=String(data.get("item")||"").trim();if(item)state.nutrition.shopping.push(item);
    await persist("Einkaufsliste aktualisiert.");render();
  }
  if(form.id==="fight-form"){
    state.martial.sessions.push({id:"f-"+Date.now(),date:data.get("date")||todayKey(),createdAt:new Date().toISOString(),type:data.get("type"),minutes:data.get("minutes"),rounds:data.get("rounds"),intensity:data.get("intensity"),sparring:data.get("sparring"),notes:data.get("notes")});
    await persist("Kampfsporteinheit gespeichert.");render();
  }
  if(form.id==="body-form"){
    state.bodyEntries.push({id:"b-"+Date.now(),date:data.get("date")||todayKey(),weight:data.get("weight"),note:data.get("note")});
    state.profile.weightKg=data.get("weight");
    await persist("Körpergewicht gespeichert.");render();
  }
  if(form.id==="profile-form"){
    state.profile={...state.profile,name:data.get("name"),age:data.get("age"),heightCm:data.get("heightCm"),weightKg:data.get("weightKg"),goal:data.get("goal"),gym:data.get("gym"),homeEquipmentName:data.get("homeEquipmentName"),homeEquipment:data.get("homeEquipment")};
    await persist("Profil gespeichert.");render();
  }
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(error => console.warn("Service Worker:", error)));
}

render();
