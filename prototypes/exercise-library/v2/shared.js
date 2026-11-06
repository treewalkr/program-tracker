/* Exercise library prototypes — shared mock data, labels, store and form.
   Every figure here is illustrative. Library = WGER seed (read-only body,
   taggable); Mine = trainer custom (fully editable). */

const MUSCLES = {
  back: "Back", biceps: "Biceps", chest: "Chest", core: "Core", full_body: "Full body",
  glutes: "Glutes", hamstrings: "Hamstrings", quads: "Quads", shoulders: "Shoulders",
  traps: "Traps", triceps: "Triceps", calves: "Calves",
};
const EQUIPMENT = {
  barbell: "Barbell", dumbbell: "Dumbbell", kettlebell: "Kettlebell", cable: "Cable",
  machine: "Machine", bodyweight: "Bodyweight", band: "Band", other: "Other",
};
const PATTERNS = {
  vertical_push: { label: "v push", name: "Vertical push", group: "Upper" },
  vertical_pull: { label: "v pull", name: "Vertical pull", group: "Upper" },
  horizontal_push: { label: "h push", name: "Horizontal push", group: "Upper" },
  horizontal_pull: { label: "h pull", name: "Horizontal pull", group: "Upper" },
  knee_dominant: { label: "knee", name: "Knee dominant", group: "Lower" },
  hip_dominant: { label: "hip", name: "Hip dominant", group: "Lower" },
  rotation: { label: "rot", name: "Rotation", group: "Core" },
  anti_rotation: { label: "anti-rot", name: "Anti-rotation", group: "Core" },
  lateral_flexion: { label: "lat flex", name: "Lateral flexion", group: "Core" },
  anti_lateral_flexion: { label: "anti-lat", name: "Anti-lateral flexion", group: "Core" },
  trunk_flexion: { label: "trunk flex", name: "Trunk flexion", group: "Core" },
  anti_trunk_flexion: { label: "anti-trunk", name: "Anti-trunk flexion", group: "Core" },
};
const FUNCTIONAL = {
  push: "Push", pull: "Pull", bend_lift: "Bend & lift", squat: "Squat",
  single_leg: "Single leg", rotation: "Rotation", locomotion: "Locomotion",
};

// [name, primary, secondary, equipment, pattern, functional, source, uses]
const RAW = [
  ["Bent Over Row", "back", ["shoulders", "biceps"], "barbell", "horizontal_pull", "pull", "library", 4],
  ["Pendlay Row", "back", ["biceps"], "barbell", "horizontal_pull", "pull", "library", 2],
  ["Chest-Supported DB Row", "back", ["biceps"], "dumbbell", "horizontal_pull", "pull", "custom", 6],
  ["Seated Cable Row", "back", ["biceps"], "cable", "horizontal_pull", null, "library", 3],
  ["Shotgun Row", "back", [], "machine", "horizontal_pull", "pull", "library", 0],
  ["Lat Pulldown", "back", ["biceps"], "cable", "vertical_pull", "pull", "library", 5],
  ["Pull-up", "back", ["biceps", "shoulders"], "bodyweight", "vertical_pull", "pull", "library", 7],
  ["Chin-up", "back", ["biceps"], "bodyweight", "vertical_pull", null, "library", 1],
  ["Band-Assisted Pull-up", "back", ["biceps"], "band", "vertical_pull", "pull", "custom", 2],
  ["Straight-Arm Pulldown", "back", [], "cable", null, null, "library", 0],
  ["Meadows Row", "back", ["biceps"], "barbell", null, null, "library", 0],
  ["Inverted Row", "back", ["biceps"], "bodyweight", "horizontal_pull", null, "library", 1],
  ["Bench Press", "chest", ["triceps", "shoulders"], "barbell", "horizontal_push", "push", "library", 9],
  ["Incline DB Press", "chest", ["shoulders", "triceps"], "dumbbell", "horizontal_push", "push", "library", 5],
  ["Push-up", "chest", ["triceps", "core"], "bodyweight", "horizontal_push", "push", "library", 4],
  ["Cable Fly", "chest", [], "cable", null, null, "library", 1],
  ["Pec Deck", "chest", [], "machine", null, null, "library", 0],
  ["Deficit Push-up", "chest", ["triceps"], "bodyweight", "horizontal_push", "push", "custom", 1],
  ["Landmine Press", "shoulders", ["chest", "triceps"], "barbell", "vertical_push", "push", "custom", 3],
  ["Overhead Press", "shoulders", ["triceps"], "barbell", "vertical_push", "push", "library", 6],
  ["Seated DB Shoulder Press", "shoulders", ["triceps"], "dumbbell", "vertical_push", "push", "library", 2],
  ["Lateral Raise", "shoulders", [], "dumbbell", null, null, "library", 4],
  ["Face Pull", "shoulders", ["traps"], "cable", "horizontal_pull", null, "library", 5],
  ["Half-Kneeling KB Press", "shoulders", ["core"], "kettlebell", "vertical_push", "push", "custom", 2],
  ["Back Squat", "quads", ["glutes", "hamstrings"], "barbell", "knee_dominant", "squat", "library", 8],
  ["Front Squat", "quads", ["glutes", "core"], "barbell", "knee_dominant", "squat", "library", 3],
  ["Goblet Squat", "quads", ["glutes"], "kettlebell", "knee_dominant", "squat", "library", 4],
  ["Bulgarian Split Squat", "quads", ["glutes"], "dumbbell", "knee_dominant", "single_leg", "library", 6],
  ["Leg Press", "quads", ["glutes"], "machine", "knee_dominant", null, "library", 2],
  ["Leg Extension", "quads", [], "machine", null, null, "library", 1],
  ["Heel-Elevated Goblet Squat", "quads", ["glutes"], "dumbbell", "knee_dominant", "squat", "custom", 3],
  ["Step-up", "quads", ["glutes"], "dumbbell", null, "single_leg", "library", 0],
  ["Walking Lunge", "quads", ["glutes"], "dumbbell", null, null, "library", 1],
  ["Conventional Deadlift", "hamstrings", ["glutes", "back"], "barbell", "hip_dominant", "bend_lift", "library", 6],
  ["Romanian Deadlift", "hamstrings", ["glutes"], "barbell", "hip_dominant", "bend_lift", "library", 7],
  ["Single-Leg RDL", "hamstrings", ["glutes", "core"], "dumbbell", "hip_dominant", "single_leg", "library", 2],
  ["Nordic Curl", "hamstrings", [], "bodyweight", null, null, "library", 1],
  ["Lying Leg Curl", "hamstrings", [], "machine", null, null, "library", 2],
  ["Trap Bar Deadlift", "hamstrings", ["glutes", "quads"], "other", "hip_dominant", "bend_lift", "custom", 4],
  ["Hip Thrust", "glutes", ["hamstrings"], "barbell", "hip_dominant", null, "library", 5],
  ["KB Swing", "glutes", ["hamstrings", "core"], "kettlebell", "hip_dominant", "bend_lift", "library", 3],
  ["Cable Pull-Through", "glutes", ["hamstrings"], "cable", null, null, "library", 0],
  ["Glute Bridge", "glutes", [], "bodyweight", "hip_dominant", null, "library", 1],
  ["Pallof Press", "core", [], "cable", "anti_rotation", "rotation", "library", 5],
  ["Dead Bug", "core", [], "bodyweight", "anti_trunk_flexion", null, "library", 4],
  ["Side Plank", "core", [], "bodyweight", "anti_lateral_flexion", null, "library", 3],
  ["Suitcase Carry", "core", ["traps"], "dumbbell", "anti_lateral_flexion", "locomotion", "custom", 2],
  ["Cable Woodchop", "core", ["shoulders"], "cable", "rotation", "rotation", "library", 1],
  ["Hanging Knee Raise", "core", [], "bodyweight", null, null, "library", 1],
  ["Ab Wheel Rollout", "core", ["shoulders"], "other", "anti_trunk_flexion", null, "library", 2],
  ["Russian Twist", "core", [], "bodyweight", null, null, "library", 0],
  ["Barbell Curl", "biceps", [], "barbell", null, null, "library", 3],
  ["Hammer Curl", "biceps", [], "dumbbell", null, null, "library", 2],
  ["Incline DB Curl", "biceps", [], "dumbbell", null, null, "library", 0],
  ["Triceps Pushdown", "triceps", [], "cable", null, null, "library", 3],
  ["Skull Crusher", "triceps", [], "barbell", null, null, "library", 1],
  ["Close-Grip Bench Press", "triceps", ["chest"], "barbell", "horizontal_push", "push", "library", 1],
  ["Barbell Shrug", "traps", [], "barbell", null, null, "library", 0],
  ["Farmer's Carry", "full_body", ["traps", "core"], "dumbbell", null, "locomotion", "library", 3],
  ["Power Clean", "full_body", ["quads", "traps"], "barbell", "hip_dominant", "bend_lift", "library", 2],
  ["Sled Push", "full_body", ["quads"], "other", null, "locomotion", "custom", 2],
  ["Standing Calf Raise", "calves", [], "machine", null, null, "library", 1],
  ["Croci su panca piana", "chest", [], "dumbbell", null, null, "library", 0],
  ["Klimmzüge an der Stange", "back", ["biceps"], "bodyweight", null, null, "library", 0],
];

const NOTES = {
  "Chest-Supported DB Row": "Chest on a 30° bench. Pause one count at the top.",
  "Landmine Press": "Half-kneeling for shoulder-sensitive clients.",
  "Trap Bar Deadlift": "High handles for the first block.",
  "Suitcase Carry": "20 m each side. Ribs stacked, no lean.",
};

let seq = 0;
const nid = () => "ex" + ++seq;
const store = {
  items: RAW.map(([name, primary, secondary, equipment, pattern, functional, source, uses]) => ({
    id: nid(), name, primary, secondary, equipment, pattern, functional, source, uses,
    archived: false, note: NOTES[name] || "",
  })),
  /** Real catalog totals the mock stands in for (illustrative). */
  totals: { library: 719, mine: 14, untagged: 300 },
};
// One archived custom exercise, still referenced by history.
store.items.push({ id: nid(), name: "Zercher Squat", primary: "quads", secondary: ["core"], equipment: "barbell",
  pattern: "knee_dominant", functional: "squat", source: "custom", uses: 1, archived: true, note: "" });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Similar names already in the library — the duplicate guard on create. */
function similar(name, exceptId) {
  const words = norm(name).split(" ").filter((w) => w.length > 2);
  if (!words.length) return [];
  return store.items
    .filter((e) => e.id !== exceptId && !e.archived)
    .map((e) => ({ e, hit: words.filter((w) => norm(e.name).includes(w)).length }))
    .filter((x) => x.hit >= Math.ceil(words.length / 2))
    .sort((a, b) => b.hit - a.hit)
    .slice(0, 3)
    .map((x) => x.e);
}

function validate(d, exceptId) {
  const errs = {};
  if (!d.name.trim()) errs.name = "Name the exercise.";
  else if (store.items.some((e) => e.id !== exceptId && !e.archived && norm(e.name) === norm(d.name)))
    errs.name = "An exercise with this name is already in the library.";
  if (!d.primary) errs.primary = "Pick the primary muscle group.";
  if (!d.equipment) errs.equipment = "Pick the equipment.";
  return errs;
}

const opt = (map, sel, blank) =>
  (blank ? `<option value="">${blank}</option>` : "") +
  Object.entries(map).map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${esc(typeof v === "string" ? v : v.name)}</option>`).join("");

/** The exercise form. Library entries lock name/muscles/equipment and say why. */
function formHTML(ex, { compact = false } = {}) {
  const e = ex || { name: "", primary: "", secondary: [], equipment: "", pattern: null, functional: null, note: "", source: "custom" };
  const locked = e.source === "library";
  const dis = locked ? " disabled" : "";
  const secChips = Object.entries(MUSCLES)
    .filter(([k]) => k !== e.primary)
    .map(([k, v]) => `<button type="button" class="tchip${e.secondary.includes(k) ? " on" : ""}" data-sec="${k}" aria-pressed="${e.secondary.includes(k)}"${dis}>${v}</button>`)
    .join("");
  const eqChips = Object.entries(EQUIPMENT)
    .map(([k, v]) => `<button type="button" class="tchip${e.equipment === k ? " on" : ""}" data-eq="${k}" aria-pressed="${e.equipment === k}"${dis}>${v}</button>`)
    .join("");
  return `
  <div class="xform${compact ? " compact" : ""}">
    ${locked ? `<p class="lockline"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>WGER library entry. You can tag its pattern and add a note. To change the name, muscles or equipment, duplicate it into your exercises.</p>` : ""}
    <div class="f f-name">
      <label class="label" for="f-name">Name</label>
      <input class="input" id="f-name" name="name" value="${esc(e.name)}" maxlength="160" autocomplete="off" placeholder="e.g. Chest-Supported DB Row"${dis}>
      <p class="err" data-err="name"></p>
      <div class="dupe" hidden></div>
    </div>
    <div class="f f-primary">
      <label class="label" for="f-primary">Primary muscle</label>
      <select class="select" id="f-primary" name="primary"${dis}>${opt(MUSCLES, e.primary, "Choose…")}</select>
      <p class="err" data-err="primary"></p>
    </div>
    <div class="f f-sec">
      <span class="label">Secondary <span class="hint-inline">up to 4</span></span>
      <div class="chips" data-group="sec">${secChips}</div>
    </div>
    <div class="f f-eq">
      <span class="label">Equipment</span>
      <div class="chips" data-group="eq">${eqChips}</div>
      <p class="err" data-err="equipment"></p>
    </div>
    <div class="f f-pattern">
      <label class="label" for="f-pattern">Movement pattern</label>
      <select class="select" id="f-pattern" name="pattern">${patternOptions(e.pattern)}</select>
    </div>
    <div class="f f-func">
      <label class="label" for="f-func">Functional movement</label>
      <select class="select" id="f-func" name="functional">${opt(FUNCTIONAL, e.functional, "Untagged")}</select>
    </div>
    <div class="f f-note">
      <label class="label" for="f-note">Coaching note <span class="hint-inline">shown in programs and to the AI</span></label>
      <textarea class="textarea" id="f-note" name="note" rows="2" maxlength="280" placeholder="Setup, cues, regressions…">${esc(e.note)}</textarea>
    </div>
  </div>`;
}

function patternOptions(sel) {
  const groups = {};
  for (const [k, v] of Object.entries(PATTERNS)) (groups[v.group] ||= []).push([k, v]);
  return `<option value="">Untagged</option>` + Object.entries(groups).map(([g, list]) =>
    `<optgroup label="${g}">${list.map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${v.name}</option>`).join("")}</optgroup>`).join("");
}

/** Wire chip toggles + duplicate guard. onDupePick(id) swaps to the existing exercise. */
function wireForm(root, { exceptId, onDupePick } = {}) {
  root.querySelectorAll("[data-sec]").forEach((b) => b.addEventListener("click", () => {
    const on = root.querySelectorAll("[data-sec].on").length;
    if (!b.classList.contains("on") && on >= 4) return;
    b.classList.toggle("on"); b.setAttribute("aria-pressed", b.classList.contains("on"));
  }));
  root.querySelectorAll("[data-eq]").forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll("[data-eq]").forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
    b.classList.add("on"); b.setAttribute("aria-pressed", "true");
  }));
  const primary = root.querySelector("[name=primary]");
  primary?.addEventListener("change", () => {
    root.querySelectorAll("[data-sec]").forEach((b) => (b.hidden = b.dataset.sec === primary.value));
  });
  const name = root.querySelector("[name=name]");
  const dupe = root.querySelector(".dupe");
  if (name && !name.disabled && onDupePick) {
    name.addEventListener("input", () => {
      const hits = similar(name.value, exceptId);
      dupe.hidden = !hits.length;
      dupe.innerHTML = hits.length ? `<span>Already in the library:</span> ` + hits.map((h) =>
        `<button type="button" class="linkbtn" data-dupe="${h.id}">${esc(h.name)}</button> <span class="faint">${EQUIPMENT[h.equipment].toLowerCase()}</span>`).join(" · ") : "";
      dupe.querySelectorAll("[data-dupe]").forEach((b) => b.addEventListener("click", () => onDupePick(b.dataset.dupe)));
    });
  }
}

function readForm(root) {
  return {
    name: root.querySelector("[name=name]").value.trim(),
    primary: root.querySelector("[name=primary]").value,
    secondary: [...root.querySelectorAll("[data-sec].on")].map((b) => b.dataset.sec),
    equipment: root.querySelector("[data-eq].on")?.dataset.eq || "",
    pattern: root.querySelector("[name=pattern]").value || null,
    functional: root.querySelector("[name=functional]").value || null,
    note: root.querySelector("[name=note]").value.trim(),
  };
}

function showErrors(root, errs) {
  root.querySelectorAll("[data-err]").forEach((p) => (p.textContent = errs[p.dataset.err] || ""));
  const first = Object.keys(errs)[0];
  if (first) root.querySelector(`[name=${first}], [data-group=${first === "equipment" ? "eq" : first}] button`)?.focus();
}

/** Save from a form: library rows only take tags + note. Returns the item, or null on error. */
function saveFrom(root, existing) {
  const d = readForm(root);
  if (existing?.source === "library") {
    Object.assign(existing, { pattern: d.pattern, functional: d.functional, note: d.note });
    return existing;
  }
  const errs = validate(d, existing?.id);
  showErrors(root, errs);
  if (Object.keys(errs).length) return null;
  if (existing) return Object.assign(existing, d);
  const item = { id: nid(), ...d, source: "custom", uses: 0, archived: false };
  store.items.unshift(item);
  return item;
}

function duplicate(ex) {
  const copy = { ...ex, id: nid(), name: ex.name + " (copy)", source: "custom", uses: 0, archived: false, secondary: [...ex.secondary] };
  store.items.splice(store.items.indexOf(ex) + 1, 0, copy);
  return copy;
}

/** Delete is only for unused custom exercises; anything in a program archives instead. */
function removeAction(ex) {
  if (ex.source === "library") return { kind: "hide", label: "Hide from library", why: "Hidden entries stay out of search and the AI's choices. You can unhide them later." };
  if (ex.uses > 0) return { kind: "archive", label: "Archive", why: `Used in ${ex.uses} program${ex.uses > 1 ? "s" : ""}. Archiving hides it from pickers and the AI; those programs and their logs keep it.` };
  return { kind: "delete", label: "Delete", why: "Not used in any program. Deleting removes it for good." };
}

const patternPill = (p) => p ? `<span class="pill neutral" title="${PATTERNS[p].name}">${PATTERNS[p].label}</span>` : `<span class="untag">untagged</span>`;
const sourceTag = (e) => e.source === "custom" ? `<span class="src mine">Mine</span>` : "";
const usesText = (e) => e.uses ? `${e.uses} program${e.uses > 1 ? "s" : ""}` : "unused";

/** Flash note with optional Undo, bottom-left of the main column. */
function flash(msg, undo) {
  let el = document.getElementById("flash");
  if (!el) { el = document.createElement("div"); el.id = "flash"; el.setAttribute("role", "status"); document.body.append(el); }
  el.innerHTML = `<span>${msg}</span>${undo ? `<button class="btn small" type="button">Undo</button>` : ""}`;
  el.className = "show";
  clearTimeout(flash.t);
  if (undo) el.querySelector("button").onclick = () => { undo(); el.className = ""; };
  flash.t = setTimeout(() => (el.className = ""), 6000);
}

/** App shell: sidebar + prototype ribbon. */
function shell(direction) {
  const icon = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const I = {
    grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    layers: '<path d="M12 3 3 7l9 4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  };
  const item = (ic, label, on, extra = "") => `<a class="nav${on ? " on" : ""}" href="#">${icon(I[ic])}<span>${label}</span>${extra}</a>`;
  document.body.insertAdjacentHTML("afterbegin", `
  <div class="ribbon"><a href="../v1/index.html">← v1 directions</a><span>Prototype · ${direction} · mock data</span></div>
  <div class="shell">
    <aside class="side">
      <div class="brand"><span class="mark">PT</span><div><b>Program Tracker</b><small>Trainer · live data</small></div></div>
      <p class="grp">Workspace</p>
      ${item("grid", "Overview")}${item("users", "Clients", false, '<span class="counter">1</span>')}${item("gear", "Settings")}
      <p class="grp">Library</p>
      ${item("spark", "Exercise library", true)}${item("layers", "Templates")}${item("layers", "Examples")}
    </aside>
    <main class="main" id="main"></main>
  </div>`);
  return document.getElementById("main");
}
