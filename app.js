
const state = {
  data: null,
  foods: [],
  filteredFoods: [],
  calculated: false,
  calculatedFoods: [],
  currentPreset: null,
  activeInputIndex: null,
  activeAutocompleteItems: [],
  activeAutocompleteSelection: -1,
};

const kpiGridEl = document.getElementById("kpiGrid");
const selectorsEl = document.getElementById("selectors");
const resultsAreaEl = document.getElementById("resultsArea");
const selectionCardsEl = document.getElementById("selectionCards");
const buffWarningEl = document.getElementById("buffWarning");
const buffChipsEl = document.getElementById("buffChips");
const buffsTableWrapEl = document.getElementById("buffsTableWrap");
const scoreCardsEl = document.getElementById("scoreCards");
const buildInsightsEl = document.getElementById("buildInsights");
const shoppingWrapEl = document.getElementById("shoppingWrap");
const rankingsWrapEl = document.getElementById("rankingsWrap");
const footerMetaEl = document.getElementById("footerMeta");
const presetButtonsEl = document.getElementById("presetButtons");
const topBuildsWrapEl = document.getElementById("topBuildsWrap");
const scoringNotesWrapEl = document.getElementById("scoringNotesWrap");

const benchFilterEl = document.getElementById("benchFilter");
const sortFoodsEl = document.getElementById("sortFoods");
const rankingLimitEl = document.getElementById("rankingLimit");
const rankingViewModeEl = document.getElementById("rankingViewMode");
const hideZeroBuffsEl = document.getElementById("hideZeroBuffs");
const sortBuffsEl = document.getElementById("sortBuffs");
const strictModeEl = document.getElementById("strictMode");
const carnivoreModeEl = document.getElementById("carnivoreMode");
const ignoreConsumeStatsEl = document.getElementById("ignoreConsumeStats");
const calculateBtn = document.getElementById("calculateBtn");
const clearBtn = document.getElementById("clearBtn");
const randomBuildBtn = document.getElementById("randomBuildBtn");
const generateBuildsBtn = document.getElementById("generateBuildsBtn");
const copySummaryBtn = document.getElementById("copySummaryBtn");
const copyShoppingBtn = document.getElementById("copyShoppingBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const downloadSummaryBtn = document.getElementById("downloadSummaryBtn");
const downloadShoppingBtn = document.getElementById("downloadShoppingBtn");
const archetypeSelectEl = document.getElementById("archetypeSelect");

const SCORE_DIMS = [
  ["survival", "Survival"],
  ["melee", "Melee"],
  ["ranged", "Ranged"],
  ["exploration", "Exploration"],
  ["xp_support", "XP / Support"],
  ["utility", "Utility"],
  ["overall", "Overall"],
  ["efficiency", "Efficiency"],
];

const BUFF_GROUPS = [
  ["survival", "Survival"],
  ["melee", "Melee"],
  ["ranged", "Ranged"],
  ["exploration", "Exploration"],
  ["xp_support", "XP / Support"],
  ["utility", "Utility"],
  ["other", "Other"],
];

const SCORING_NOTES = {
  survival: "Health, health regen, resistances, and general sustain.",
  melee: "Melee damage, melee attack speed, return damage, and critical pressure in close combat.",
  ranged: "Projectile damage, charge speed, reload speed, and critical pressure for ranged weapons.",
  exploration: "Stamina, stamina economy, oxygen/water economy, carry comfort, and mission mobility.",
  xp_support: "XP gains, shared XP, and tamed creature / team-oriented value.",
  utility: "Crafting speed, foraging, extra stone, threat modifiers, and similar utility effects.",
  overall: "Weighted combination of the main archetype buckets for general all-round value.",
  efficiency: "How much value the food gives relative to recipe complexity / cost."
};

function fmtNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function fmtMaybe(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const num = Number(value);
  return Math.abs(num % 1) < 0.001 ? fmtNumber(num, 0) : fmtNumber(num, 2);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function initials(value) {
  const parts = String(value || "").split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() || "").join("") || "IC";
}

function iconMarkup(name, type = "recipes", className = "icon-wrap") {
  const slug = slugify(name);
  return `
    <div class="${className}">
      <img src="assets/${type}/${slug}.png" alt="${name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';">
      <span class="icon-fallback">${initials(name)}</span>
    </div>
  `;
}

function normalizeEffectFamily(food) {
  return slugify(food.modifier || food.name);
}

function bySelectedSort(a, b, mode) {
  const aScores = deriveFoodScores(a);
  const bScores = deriveFoodScores(b);
  if (mode === "name") return a.name.localeCompare(b.name);
  return (bScores[mode] || 0) - (aScores[mode] || 0) || a.name.localeCompare(b.name);
}

function isCarnivoreOn() {
  return carnivoreModeEl.value === "on";
}

function ignoreConsumeStats() {
  return !!ignoreConsumeStatsEl.checked;
}

function applyBuffValueRules(label, value) {
  let finalValue = Number(value || 0);
  return finalValue;
}

function buffCategoriesForLabel(label) {
  const lower = String(label || "").toLowerCase();
  const cats = [];
  if (lower.includes("max health") || lower.includes("health regen") || lower.includes("resist") || lower.includes("affliction")) cats.push("survival");
  if (lower.includes("melee")) cats.push("melee");
  if (lower.includes("critical damage")) { cats.push("melee"); cats.push("ranged"); }
  if (lower.includes("projectile") || lower.includes("reload") || lower.includes("charge speed")) cats.push("ranged");
  if (lower.includes("max stamina") || lower.includes("stamina regen") || lower.includes("oxygen") || lower.includes("water consumption") || lower.includes("movement speed") || lower.includes("temperature") || lower.includes("over-encumbrance")) cats.push("exploration");
  if (lower.includes("xp") || lower.includes("shared xp") || lower.includes("tamed creature")) cats.push("xp_support");
  if (lower.includes("crafting speed") || lower.includes("extra stone") || lower.includes("foraging") || lower.includes("threat") || lower.includes("butchering")) cats.push("utility");
  if (!cats.length) cats.push("other");
  return [...new Set(cats)];
}

function weightedContribution(label, value) {
  const lower = String(label || "").toLowerCase();
  const abs = Math.abs(Number(value || 0));
  let base = Number(value || 0);

  if (ignoreConsumeStats() && (lower.includes("food on consume") || lower.includes("water on consume"))) return {};

  const result = {};
  const add = (k, v) => { result[k] = (result[k] || 0) + v; };

  if (lower.includes("max health")) add("survival", abs * 1.0);
  else if (lower.includes("health regen")) add("survival", abs * 4.0);
  else if (lower.includes("exposure resistance")) add("survival", abs * 3.0);
  else if (lower.includes("cave sickness resist")) add("survival", abs * 4.0);
  else if (lower.includes("food consumption")) add("exploration", abs * 2.5);
  else if (lower.includes("water consumption")) add("exploration", abs * 3.0);
  else if (lower.includes("oxygen consumption")) add("exploration", abs * 3.0);
  else if (lower.includes("max stamina")) add("exploration", abs * 0.9);
  else if (lower.includes("stamina regen delay")) add("exploration", abs * 2.2);
  else if (lower.includes("stamina regen")) add("exploration", abs * 3.0);
  else if (lower.includes("stamina used by actions")) add("exploration", abs * 3.2);
  else if (lower.includes("movement speed")) add("exploration", abs * 5.0);
  else if (lower.includes("temperature")) add("exploration", abs * 1.3);
  else if (lower.includes("over-encumbrance")) add("exploration", abs * 2.2);
  else if (lower.includes("melee damage")) add("melee", abs * 6.0);
  else if (lower.includes("melee attack speed")) add("melee", abs * 5.0);
  else if (lower.includes("return melee damage chance")) add("melee", abs * 2.5);
  else if (lower.includes("return melee damage")) add("melee", abs * 2.5);
  else if (lower.includes("critical damage")) { add("melee", abs * 4.0); add("ranged", abs * 4.0); }
  else if (lower.includes("projectile damage")) add("ranged", abs * 6.0);
  else if (lower.includes("charge speed")) add("ranged", abs * 3.0);
  else if (lower.includes("reload speed")) add("ranged", abs * 3.0);
  else if (lower.includes("xp gained")) add("xp_support", abs * 2.2);
  else if (lower.includes("shared xp")) add("xp_support", abs * 2.4);
  else if (lower.includes("tamed creature xp")) add("xp_support", abs * 1.8);
  else if (lower.includes("crafting speed")) add("utility", abs * 5.0);
  else if (lower.includes("extra stone")) add("utility", abs * 6.0);
  else if (lower.includes("foraging yield")) add("utility", abs * 4.0);
  else if (lower.includes("butchering yield")) add("utility", abs * 4.0);
  else if (lower.includes("perceived threat")) add("utility", abs * 2.0);
  else if (lower.includes("food on consume")) add("survival", Math.min(abs, 300) * 0.05);
  else if (lower.includes("water on consume")) add("exploration", Math.min(abs, 300) * 0.05);

  return result;
}

function deriveFoodBuffs(food) {
  const out = {};
  Object.entries(food.buffs || {}).forEach(([key, meta]) => {
    const label = meta.label || key;
    let value = applyBuffValueRules(label, meta.value || 0);
    if (isCarnivoreOn() && food.bench === "Smoker") value *= 1.3;
    out[key] = { label, value };
  });
  return out;
}

function deriveFoodScores(food) {
  const totals = {survival:0, melee:0, ranged:0, exploration:0, xp_support:0, utility:0};
  const buffs = deriveFoodBuffs(food);
  Object.values(buffs).forEach(meta => {
    const contrib = weightedContribution(meta.label, meta.value);
    Object.entries(contrib).forEach(([k,v]) => { totals[k] += v; });
  });
  const overall = totals.survival * 0.30 + totals.melee * 0.18 + totals.ranged * 0.18 + totals.exploration * 0.17 + totals.xp_support * 0.07 + totals.utility * 0.10;
  const complexity = Math.max(1, Number(food.ingredient_count || (food.ingredients || []).length || 1));
  const efficiency = overall / (0.85 + complexity);
  return {
    ...totals,
    overall,
    efficiency
  };
}

function getDraftSelection() {
  const draft = [];
  for (let i = 0; i < 5; i++) {
    const input = document.getElementById(`slot-${i}`);
    const qtyInput = document.getElementById(`slot-qty-${i}`);
    const value = (input?.value || "").trim();
    const exact = state.foods.find(f => f.name.toLowerCase() === value.toLowerCase());
    if (!exact) continue;
    const qty = Math.max(1, Number(qtyInput?.value || 1));
    draft.push({ ...exact, craftQty: qty });
  }
  return draft;
}

function getEffectiveFoods(selectedFoods) {
  if (!strictModeEl.checked) return selectedFoods.map(food => ({...food, effective:true}));
  const seen = new Set();
  return selectedFoods.map(food => {
    const family = normalizeEffectFamily(food);
    const effective = !seen.has(family);
    seen.add(family);
    return { ...food, effective };
  });
}

function sumBuffs(selectedFoods) {
  const totals = {};
  selectedFoods.forEach(food => {
    if (!food.effective) return;
    const buffs = deriveFoodBuffs(food);
    Object.entries(buffs).forEach(([key, meta]) => {
      totals[key] = (totals[key] || 0) + Number(meta.value || 0);
    });
  });
  return totals;
}

function aggregateIngredients(selectedFoods) {
  const map = new Map();
  selectedFoods.forEach(food => {
    const craftQty = Number(food.craftQty || 1);
    (food.ingredients || []).forEach(ing => {
      const current = map.get(ing.name) || { qty: 0, unit: ing.unit || "item", recipes: [] };
      current.qty += Number(ing.qty || 0) * craftQty;
      current.unit = ing.unit || current.unit || "item";
      current.recipes.push(`${food.name} x${craftQty}`);
      map.set(ing.name, current);
    });
  });
  return [...map.entries()].map(([name, meta]) => ({ name, ...meta })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

function formatBuffValue(label, value) {
  const lower = String(label).toLowerCase();
  if (lower.includes("food on consume") && value > 300) return "300+ (maxed)";
  return fmtMaybe(value);
}

function presetsForFoods(foods) {
  const dims = [
    { id: "allround", label: "All-round", key: "overall" },
    { id: "survival", label: "Survival Tank", key: "survival" },
    { id: "melee", label: "Melee Focus", key: "melee" },
    { id: "ranged", label: "Ranged Focus", key: "ranged" },
    { id: "explore", label: "Exploration Rush", key: "exploration" },
    { id: "xpsupport", label: "XP / Support", key: "xp_support" },
    { id: "efficiency", label: "Efficiency", key: "efficiency" },
  ];
  return dims.map(dim => ({ id: dim.id, label: dim.label, names: buildSuggestedFoods(dim.key, "premium").map(f => f.name) }));
}

function buildSuggestedFoods(targetKey, style = "premium", limit = 5) {
  let rows = state.foods.map(food => ({ food, score: deriveFoodScores(food)[targetKey] || 0, derived: deriveFoodScores(food) }));
  if (style === "budget") rows = rows.filter(r => (r.food.ingredient_count || 0) <= 3 || ["C", "D"].includes(r.food.tier));
  if (style === "practical") rows = rows.filter(r => (r.food.ingredient_count || 0) <= 5);
  rows.sort((a,b) => (b.score - a.score) || ((b.derived.efficiency||0) - (a.derived.efficiency||0)));
  const picked = [];
  const seen = new Set();
  for (const row of rows) {
    const family = normalizeEffectFamily(row.food);
    if (seen.has(family)) continue;
    seen.add(family);
    picked.push(row.food);
    if (picked.length >= limit) break;
  }
  return picked;
}

function buildSuggestionsForArchetype(targetKey) {
  return [
    { style:"budget", label:"Budget", foods: buildSuggestedFoods(targetKey, "budget"), description:"Cheaper / lower-complexity option." },
    { style:"practical", label:"Practical", foods: buildSuggestedFoods(targetKey, "practical"), description:"Balanced real-use option." },
    { style:"premium", label:"Premium", foods: buildSuggestedFoods(targetKey, "premium"), description:"Highest-value archetype pick." },
  ];
}

function renderKPIs() {
  const topOverallRows = state.foods.map(food => ({ food, score: deriveFoodScores(food).overall })).sort((a,b)=>b.score-a.score);
  const top = topOverallRows[0];
  const kpis = [
    { label: "Total recipes", value: fmtNumber(state.data.meta.total_recipes), sub: "Complete dataset loaded" },
    { label: "Ingredient rows", value: fmtNumber(state.data.meta.total_ingredient_rows), sub: "Shopping list ready" },
    { label: "Best overall", value: top?.food.name || "—", sub: top ? `${fmtMaybe(top.score)} • ${top.food.bench}` : "" },
    { label: "Smoker recipes", value: fmtNumber(state.data.meta.benches?.Smoker || 0), sub: isCarnivoreOn() ? "Carnivore bonus active" : "Carnivore bonus off" },
  ];
  kpiGridEl.innerHTML = kpis.map(k => `<article class="kpi"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub">${k.sub}</div></article>`).join("");
}

function renderFilters() {
  const benches = ["All", ...Object.keys(state.data.meta.benches).sort()];
  benchFilterEl.innerHTML = benches.map(b => `<option value="${b}">${b}</option>`).join("");
}

function applyFoodFilter() {
  const bench = benchFilterEl.value || "All";
  const mode = sortFoodsEl.value || "name";
  state.filteredFoods = state.foods.filter(f => bench === "All" || f.bench === bench).sort((a, b) => bySelectedSort(a, b, mode));
}

function renderSelectors(preserve = []) {
  applyFoodFilter();
  selectorsEl.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    const entry = preserve[i] || {};
    const current = entry.name || "";
    const qty = entry.qty || 1;
    selectorsEl.insertAdjacentHTML("beforeend", `
      <div class="slot">
        <div class="slot-header"><strong>Slot ${i + 1}</strong><span>${current ? "Draft selected" : "Empty"}</span></div>
        <div class="slot-controls">
          <div class="autocomplete-wrap">
            <input class="wide-input autocomplete-input" id="slot-${i}" placeholder="Click or type to browse..." value="${current.replace(/"/g, '&quot;')}" autocomplete="off">
            <div id="autocomplete-${i}" class="autocomplete-dropdown hidden"></div>
          </div>
          <label>
            <span>Craft qty</span>
            <input class="slot-qty-input" type="number" id="slot-qty-${i}" min="1" step="1" value="${qty}">
          </label>
        </div>
      </div>
    `);
  }
  attachAutocomplete();
}

function attachAutocomplete() {
  for (let i = 0; i < 5; i++) {
    const input = document.getElementById(`slot-${i}`);
    if (!input) continue;
    input.addEventListener("focus", () => openAutocomplete(i, input.value));
    input.addEventListener("input", () => openAutocomplete(i, input.value));
    input.addEventListener("keydown", (e) => handleAutocompleteKeydown(e));
  }
}

function getAutocompleteDropdown(index) {
  return document.getElementById(`autocomplete-${index}`);
}

function openAutocomplete(index, term = "") {
  state.activeInputIndex = index;
  applyFoodFilter();
  const list = state.filteredFoods.filter(food => food.name.toLowerCase().includes(String(term || "").toLowerCase())).slice(0, 40);
  state.activeAutocompleteItems = list;
  state.activeAutocompleteSelection = list.length ? 0 : -1;
  closeAutocomplete(index, true);
  const dropdown = getAutocompleteDropdown(index);
  if (!dropdown) return;
  dropdown.innerHTML = list.length ? list.map((food, idx) => autocompleteItemMarkup(food, idx === state.activeAutocompleteSelection)).join("") : `<div class="autocomplete-item"><div class="autocomplete-main"><div class="autocomplete-name">No recipes found</div></div></div>`;
  dropdown.classList.remove("hidden");
  dropdown.querySelectorAll(".autocomplete-item[data-name]").forEach(el => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectAutocompleteFood(el.dataset.name);
    });
  });
}

function closeAutocomplete(exceptIndex = null, keepExcept = false) {
  for (let i = 0; i < 5; i++) {
    if (keepExcept && i === exceptIndex) continue;
    const dropdown = getAutocompleteDropdown(i);
    if (!dropdown) continue;
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
  }
  if (!keepExcept) {
    state.activeAutocompleteItems = [];
    state.activeAutocompleteSelection = -1;
  }
}

function autocompleteItemMarkup(food, active = false) {
  const scores = deriveFoodScores(food);
  return `
    <div class="autocomplete-item ${active ? 'active' : ''}" data-name="${food.name}">
      ${iconMarkup(food.name, "recipes", "ingredient-mini")}
      <div class="autocomplete-main">
        <div class="autocomplete-name">${food.name}</div>
        <div class="autocomplete-meta">${food.bench}</div>
      </div>
      <div class="autocomplete-score">
        <div><span class="badge tier-${food.tier || 'none'}">${food.tier || '—'} Tier</span></div>
        <div style="margin-top:6px">Overall ${fmtMaybe(scores.overall)}</div>
      </div>
    </div>
  `;
}

function selectAutocompleteFood(name) {
  if (state.activeInputIndex == null) return;
  const input = document.getElementById(`slot-${state.activeInputIndex}`);
  if (input) input.value = name;
  closeAutocomplete();
}

function handleAutocompleteKeydown(e) {
  const dropdown = getAutocompleteDropdown(state.activeInputIndex);
  if (!dropdown || dropdown.classList.contains("hidden")) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!state.activeAutocompleteItems.length) return;
    state.activeAutocompleteSelection = (state.activeAutocompleteSelection + 1) % state.activeAutocompleteItems.length;
    openAutocomplete(state.activeInputIndex, document.getElementById(`slot-${state.activeInputIndex}`).value);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (!state.activeAutocompleteItems.length) return;
    state.activeAutocompleteSelection = (state.activeAutocompleteSelection - 1 + state.activeAutocompleteItems.length) % state.activeAutocompleteItems.length;
    openAutocomplete(state.activeInputIndex, document.getElementById(`slot-${state.activeInputIndex}`).value);
  } else if (e.key === "Enter") {
    if (state.activeAutocompleteSelection >= 0 && state.activeAutocompleteItems[state.activeAutocompleteSelection]) {
      e.preventDefault();
      selectAutocompleteFood(state.activeAutocompleteItems[state.activeAutocompleteSelection].name);
    }
  } else if (e.key === "Escape") {
    closeAutocomplete();
  }
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete-wrap")) closeAutocomplete();
});

function renderPresets() {
  const presets = presetsForFoods(state.foods);
  presetButtonsEl.innerHTML = presets.map(p => `<button class="preset-btn ${state.currentPreset === p.id ? 'active' : ''}" data-preset="${p.id}">${p.label}</button>`).join("");
  presetButtonsEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const preset = presets.find(p => p.id === btn.dataset.preset);
      if (!preset) return;
      state.currentPreset = preset.id;
      const preserve = Array.from({ length: 5 }, (_, i) => ({ name: preset.names[i] || "", qty: 1 }));
      renderSelectors(preserve);
      renderPresets();
      calculateAll();
    });
  });
}

function renderScoringNotes() {
  scoringNotesWrapEl.innerHTML = SCORE_DIMS.filter(([key]) => key !== "overall" && key !== "efficiency" ? true : true).map(([key, label]) => `
    <article class="note-card">
      <h3>${label}</h3>
      <div class="small-muted">${SCORING_NOTES[key]}</div>
    </article>
  `).join("");
}

function clearResultsOnly() {
  resultsAreaEl.classList.add("hidden");
  selectionCardsEl.innerHTML = "";
  buffWarningEl.hidden = true;
  buffChipsEl.innerHTML = "";
  buffsTableWrapEl.innerHTML = `<div class="empty">No foods selected yet.</div>`;
  scoreCardsEl.innerHTML = "";
  buildInsightsEl.innerHTML = `<div class="empty">Build score summary appears here after calculating a selection.</div>`;
  shoppingWrapEl.innerHTML = `<div class="empty">No ingredients to show yet.</div>`;
  state.calculated = false;
  state.calculatedFoods = [];
}

function renderSelectedCards(selectedFoods) {
  selectionCardsEl.innerHTML = selectedFoods.map(food => {
    const scores = deriveFoodScores(food);
    const buffs = Object.values(deriveFoodBuffs(food)).map(meta => `<div class="small-muted">• ${meta.label}: ${formatBuffValue(meta.label, meta.value)}</div>`).join("");
    return `
      <article class="recipe-card ${food.effective ? '' : 'recipe-card-muted'}">
        <div class="recipe-top">
          ${iconMarkup(food.name, 'recipes')}
          <div>
            <div class="recipe-name">${food.name}</div>
            <div class="meta-row">
              <span class="badge tier-${food.tier || 'none'}">${food.tier || '—'} Tier</span>
              <span class="badge">${food.bench}</span>
              <span class="badge">${fmtMaybe(food.duration_s)}s</span>
              ${food.effective ? '' : '<span class="badge">Refreshed only</span>'}
            </div>
          </div>
        </div>
        <div class="small-muted">Overall ${fmtMaybe(scores.overall)} • Efficiency ${fmtMaybe(scores.efficiency)}</div>
        <div class="recipe-qty">Craft quantity: x${fmtMaybe(food.craftQty)}</div>
        <div class="small-muted">Modifier / effect family: ${food.modifier || food.name}</div>
        <div class="small-muted"><strong>Key buffs</strong></div>
        ${buffs}
        ${food.notes ? `<div class="small-muted">${food.notes}</div>` : ''}
      </article>
    `;
  }).join("");

  const duplicateFamilies = selectedFoods.filter(f => !f.effective);
  if (duplicateFamilies.length) {
    buffWarningEl.hidden = false;
    buffWarningEl.innerHTML = `<strong>Strict-mode note:</strong> duplicate effect families do not stack in-game. ${duplicateFamilies.map(f => f.name).join(", ")} are treated as refresh-only in the active build score.`;
  } else {
    buffWarningEl.hidden = true;
  }
}

function buildGroupedBuffRows(selectedFoods) {
  const totals = sumBuffs(selectedFoods);
  let rows = getAllBuffKeys(selectedFoods).map(item => ({ key: item.key, label: item.label, value: totals[item.key] || 0 }));
  if (hideZeroBuffsEl.checked) rows = rows.filter(r => r.value !== 0);
  if (sortBuffsEl.checked) rows.sort((a,b)=>Math.abs(b.value)-Math.abs(a.value) || a.label.localeCompare(b.label));
  const groups = {};
  BUFF_GROUPS.forEach(([key,label]) => groups[key] = { label, rows: [] });
  rows.forEach(row => {
    const cats = buffCategoriesForLabel(row.label);
    const cat = cats[0] || "other";
    groups[cat].rows.push(row);
  });
  return groups;
}

function getAllBuffKeys(selectedFoods) {
  const map = new Map();
  selectedFoods.forEach(food => {
    if (!food.effective) return;
    Object.entries(deriveFoodBuffs(food)).forEach(([key, meta]) => map.set(key, meta.label || key));
  });
  return [...map.entries()].map(([key, label]) => ({ key, label }));
}

function renderCombinedBuffs(selectedFoods) {
  const groups = buildGroupedBuffRows(selectedFoods);
  const chipRows = [];
  Object.values(groups).forEach(group => group.rows.slice(0, 3).forEach(r => chipRows.push(r)));
  buffChipsEl.innerHTML = chipRows.slice(0, 10).map(row => `<span class="chip">${row.label}: ${formatBuffValue(row.label, row.value)}</span>`).join("");
  buffsTableWrapEl.innerHTML = `
    <div class="combined-groups">
      ${Object.entries(groups).map(([key, group]) => {
        if (!group.rows.length) return '';
        return `
          <section class="buff-group">
            <div class="buff-group-header"><h3>${group.label}</h3><span class="badge">${group.rows.length} stats</span></div>
            <div class="buff-group-body">
              <div class="buff-list">
                ${group.rows.map(row => `<div>${row.label}</div><div class="number">${formatBuffValue(row.label, row.value)}</div>`).join("")}
              </div>
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function buildScoresForSelection(selectedFoods) {
  const totals = Object.fromEntries(SCORE_DIMS.map(([key]) => [key, 0]));
  selectedFoods.forEach(food => {
    if (!food.effective) return;
    const scores = deriveFoodScores(food);
    ["survival","melee","ranged","exploration","xp_support","utility"].forEach(key => { totals[key] += Number(scores[key] || 0); });
  });
  totals.overall = totals.survival * 0.30 + totals.melee * 0.18 + totals.ranged * 0.18 + totals.exploration * 0.17 + totals.xp_support * 0.07 + totals.utility * 0.10;
  totals.efficiency = totals.overall / Math.max(1, selectedFoods.filter(f => f.effective).reduce((acc,f)=>acc + Number(f.ingredient_count || (f.ingredients||[]).length || 1), 0) / Math.max(1, selectedFoods.filter(f=>f.effective).length));
  return totals;
}

function renderScores(selectedFoods) {
  const totals = buildScoresForSelection(selectedFoods);
  scoreCardsEl.innerHTML = SCORE_DIMS.map(([key, label]) => `<article class="score-card"><div class="score-name">${label}</div><div class="score-value">${fmtMaybe(totals[key])}</div></article>`).join("");
  const sorted = [...SCORE_DIMS].filter(([k]) => !["overall","efficiency"].includes(k)).sort((a, b) => totals[b[0]] - totals[a[0]]).map(([key, label]) => ({ key, label, value: totals[key] }));
  const topBench = Object.entries(selectedFoods.filter(f=>f.effective).reduce((acc, food) => { acc[food.bench] = (acc[food.bench] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1])[0];
  buildInsightsEl.innerHTML = `
    <div class="insight"><strong>Primary archetype:</strong> ${sorted[0].label} (${fmtMaybe(sorted[0].value)})</div>
    <div class="insight"><strong>Secondary strength:</strong> ${sorted[1].label} (${fmtMaybe(sorted[1].value)})</div>
    <div class="insight"><strong>Bench profile:</strong> ${topBench ? `${topBench[0]} heavy` : 'Mixed'} • ${selectedFoods.filter(f=>f.effective).length} active effects</div>
    <div class="insight"><strong>Scoring basis:</strong> Carnivore ${isCarnivoreOn() ? 'ON' : 'OFF'} • Consume stats ${ignoreConsumeStats() ? 'ignored' : 'included'} • ${strictModeEl.checked ? 'Strict in-game mode' : 'Free theorycraft mode'}</div>
  `;
}

function renderShopping(selectedFoods) {
  const rows = aggregateIngredients(selectedFoods);
  shoppingWrapEl.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Ingredient</th><th class="number">Total Qty</th><th>Unit</th><th>Used by</th></tr></thead><tbody>${rows.map(row => `
      <tr>
        <td><div class="ingredient-cell">${iconMarkup(row.name, 'ingredients', 'ingredient-mini')}<span>${row.name}</span></div></td>
        <td class="number">${fmtMaybe(row.qty)}</td>
        <td>${row.unit || 'item'}</td>
        <td>${[...new Set(row.recipes)].join(', ')}</td>
      </tr>`).join("")}</tbody></table></div>`;
}

function renderTopBuilds(targetKey = archetypeSelectEl.value) {
  const builds = buildSuggestionsForArchetype(targetKey);
  topBuildsWrapEl.innerHTML = `<div class="top-builds-grid">${builds.map((build, buildIndex) => {
    const foods = build.foods.map(f => ({...f, craftQty:1, effective:true}));
    const scores = buildScoresForSelection(foods);
    const primary = targetKey === 'overall' ? 'overall' : targetKey;
    return `
      <article class="build-suggestion">
        <h3>${build.label} ${targetKey === 'overall' ? 'All-round' : titleize(targetKey)} Build</h3>
        <div class="build-tags"><span class="badge">${build.description}</span><span class="badge">Overall ${fmtMaybe(scores.overall)}</span><span class="badge">${titleize(primary)} ${fmtMaybe(scores[primary] || 0)}</span></div>
        <div class="build-recipes">
          ${build.foods.map(food => `<div class="build-food-pill">${iconMarkup(food.name, 'recipes', 'ingredient-mini')}<span>${food.name}</span></div>`).join('')}
        </div>
        <div class="build-score-grid">
          <div class="build-score-mini"><div class="mini-label">Survival</div><div class="mini-value">${fmtMaybe(scores.survival)}</div></div>
          <div class="build-score-mini"><div class="mini-label">Melee</div><div class="mini-value">${fmtMaybe(scores.melee)}</div></div>
          <div class="build-score-mini"><div class="mini-label">Ranged</div><div class="mini-value">${fmtMaybe(scores.ranged)}</div></div>
        </div>
        <div class="build-footer">
          <div class="small-muted">Apply this build to the planner, adjust craft quantities, then calculate the final shopping list.</div>
          <button class="use-build-btn" data-build-index="${buildIndex}" data-target-key="${targetKey}">Use this build</button>
        </div>
      </article>
    `;
  }).join("")}</div>`;

  topBuildsWrapEl.querySelectorAll('.use-build-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.buildIndex || 0);
      const selectedBuild = builds[idx];
      if (!selectedBuild) return;
      const preserve = Array.from({ length: 5 }, (_, i) => ({ name: selectedBuild.foods[i]?.name || '', qty: 1 }));
      state.currentPreset = null;
      renderPresets();
      renderSelectors(preserve);
      clearResultsOnly();
      const planner = document.querySelector('.controls-panel');
      if (planner) planner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function titleize(key) {
  const map = {xp_support:"XP / Support"};
  return map[key] || String(key).replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

function renderRankings() {
  const limit = Number(rankingLimitEl.value || 20);
  if (rankingViewModeEl.value === "builds") {
    const archetypes = ["overall","survival","melee","ranged","exploration","xp_support","efficiency"];
    rankingsWrapEl.innerHTML = archetypes.map(key => {
      const builds = buildSuggestionsForArchetype(key);
      return `
        <section class="buff-group" style="margin-bottom:14px">
          <div class="buff-group-header"><h3>${key === "overall" ? "All-round" : titleize(key)} top builds</h3></div>
          <div class="buff-group-body">
            ${builds.slice(0,3).map(build => `<div class="small-muted" style="margin-bottom:10px"><strong>${build.label}:</strong> ${build.foods.map(f => f.name).join(" • ")}</div>`).join("")}
          </div>
        </section>`;
    }).join("");
    return;
  }

  const rows = [...state.foods].map(food => ({ food, scores: deriveFoodScores(food) })).sort((a, b) => (b.scores?.overall || 0) - (a.scores?.overall || 0)).slice(0, limit);
  rankingsWrapEl.innerHTML = `<div class="table-wrap rankings-table"><table><thead><tr><th>#</th><th>Recipe</th><th>Bench</th><th>Tier</th><th class="number">Overall</th><th class="number">Efficiency</th><th class="number">Survival</th><th class="number">Melee</th><th class="number">Ranged</th><th class="number">Exploration</th></tr></thead><tbody>${rows.map((row, idx) => `
    <tr>
      <td class="rank-cell">${idx + 1}</td>
      <td><div class="recipe-cell">${iconMarkup(row.food.name, 'recipes', 'ingredient-mini')}<span>${row.food.name}</span></div></td>
      <td>${row.food.bench}</td>
      <td><span class="badge tier-${row.food.tier || 'none'}">${row.food.tier || '—'}</span></td>
      <td class="number">${fmtMaybe(row.scores.overall)}</td>
      <td class="number">${fmtMaybe(row.scores.efficiency)}</td>
      <td class="number">${fmtMaybe(row.scores.survival)}</td>
      <td class="number">${fmtMaybe(row.scores.melee)}</td>
      <td class="number">${fmtMaybe(row.scores.ranged)}</td>
      <td class="number">${fmtMaybe(row.scores.exploration)}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function buildSummaryText(selectedFoods) {
  const activeFoods = selectedFoods.filter(f=>f.effective);
  const totals = buildScoresForSelection(selectedFoods);
  const archetypes = ["survival","melee","ranged","exploration","xp_support","utility"].sort((a,b)=>totals[b]-totals[a]).slice(0,3).map(key => `${titleize(key)}: ${fmtMaybe(totals[key])}`);
  return [
    `Icarus Food Calculator — Build Summary`,
    `Created by fernandobacate`,
    "",
    `Carnivore: ${isCarnivoreOn() ? 'On' : 'Off'}`,
    `Strict mode: ${strictModeEl.checked ? 'On' : 'Off'}`,
    "",
    ...selectedFoods.map((food, idx) => `${idx + 1}. ${food.name} x${fmtMaybe(food.craftQty)} — ${food.bench}${food.effective ? '' : ' (refresh only in strict mode)'}`),
    "",
    `Top dimensions: ${archetypes.join(' • ')}`
  ].join("\n");
}

function shoppingText(selectedFoods) {
  const rows = aggregateIngredients(selectedFoods);
  return [
    `Icarus Food Calculator — Shopping List`,
    `Created by fernandobacate`,
    "",
    ...rows.map(row => `- ${row.name}: ${fmtMaybe(row.qty)} ${row.unit || 'item'}`)
  ].join("\n");
}

function currentShareURL() {
  const parts = [];
  parts.push(`c=${isCarnivoreOn() ? '1' : '0'}`);
  parts.push(`s=${strictModeEl.checked ? '1' : '0'}`);
  parts.push(`i=${ignoreConsumeStats() ? '1' : '0'}`);
  const build = getDraftSelection().map(food => {
    const qty = document.getElementById(`slot-qty-${getDraftSelection().findIndex(f=>f.name===food.name)}`)?.value || 1;
    return `${encodeURIComponent(food.name)}~${qty}`;
  }).join("|");
  parts.push(`build=${build}`);
  return `${location.origin}${location.pathname}?${parts.join("&")}`;
}

async function copyText(text, successLabel, fallbackLabel) {
  try {
    await navigator.clipboard.writeText(text);
    successLabel();
  } catch {
    alert(fallbackLabel + "\n\n" + text);
  }
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], {type:"text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function calculateAll() {
  const selectedFoods = getDraftSelection();
  if (!selectedFoods.length) {
    clearResultsOnly();
    return;
  }
  const effectiveFoods = getEffectiveFoods(selectedFoods);
  state.calculated = true;
  state.calculatedFoods = effectiveFoods;
  resultsAreaEl.classList.remove("hidden");
  renderSelectedCards(effectiveFoods);
  renderCombinedBuffs(effectiveFoods);
  renderScores(effectiveFoods);
  renderShopping(selectedFoods);
}

function clearAll() {
  state.currentPreset = null;
  renderPresets();
  renderSelectors(Array.from({ length: 5 }, () => ({ name: "", qty: 1 })));
  clearResultsOnly();
  closeAutocomplete();
}

function fillRandomBuild() {
  const pool = buildSuggestedFoods(archetypeSelectEl.value || "overall", "premium", 5);
  const preserve = pool.map(food => ({ name: food.name, qty: 1 }));
  state.currentPreset = null;
  renderPresets();
  renderSelectors(preserve);
  calculateAll();
}

function loadFromURL() {
  const params = new URLSearchParams(location.search);
  carnivoreModeEl.value = params.get("c") === "1" ? "on" : "off";
  strictModeEl.checked = params.get("s") === "1";
  ignoreConsumeStatsEl.checked = params.get("i") !== "0";
  const build = params.get("build");
  if (!build) return Array.from({length:5},()=>({name:"",qty:1}));
  const parts = build.split("|").filter(Boolean).slice(0,5);
  const preserve = parts.map(part => {
    const [encodedName, qty] = part.split("~");
    return { name: decodeURIComponent(encodedName || ""), qty: Number(qty || 1) || 1 };
  });
  while (preserve.length < 5) preserve.push({name:"", qty:1});
  return preserve;
}

async function loadFoods() {
  const response = await fetch('./foods.json');
  state.data = await response.json();
  state.foods = state.data.foods;
  renderFilters();
  renderScoringNotes();
  renderKPIs();
  renderPresets();
  const preserve = loadFromURL();
  renderSelectors(preserve);
  renderTopBuilds();
  renderRankings();
  clearResultsOnly();
  // shared build links can prefill the planner, but the user still decides when to calculate.
  footerMetaEl.textContent = `${fmtNumber(state.data.meta.total_recipes)} recipes • ${fmtNumber(state.data.meta.total_ingredient_rows)} ingredient rows • archetype-aware planner and build explorer`;
}

benchFilterEl.addEventListener('change', () => {
  const preserve = Array.from({ length: 5 }, (_, i) => ({ name: document.getElementById(`slot-${i}`)?.value || "", qty: Number(document.getElementById(`slot-qty-${i}`)?.value || 1) }));
  renderSelectors(preserve);
});
sortFoodsEl.addEventListener('change', () => {
  const preserve = Array.from({ length: 5 }, (_, i) => ({ name: document.getElementById(`slot-${i}`)?.value || "", qty: Number(document.getElementById(`slot-qty-${i}`)?.value || 1) }));
  renderSelectors(preserve);
});
carnivoreModeEl.addEventListener('change', () => { renderKPIs(); renderPresets(); renderTopBuilds(); renderRankings(); if (state.calculated) calculateAll(); });
ignoreConsumeStatsEl.addEventListener('change', () => { renderPresets(); renderTopBuilds(); renderRankings(); if (state.calculated) calculateAll(); });
strictModeEl.addEventListener('change', () => { if (state.calculated) calculateAll(); });
rankingLimitEl.addEventListener('change', renderRankings);
rankingViewModeEl.addEventListener('change', renderRankings);
hideZeroBuffsEl.addEventListener('change', () => state.calculated && renderCombinedBuffs(state.calculatedFoods));
sortBuffsEl.addEventListener('change', () => state.calculated && renderCombinedBuffs(state.calculatedFoods));
calculateBtn.addEventListener('click', calculateAll);
clearBtn.addEventListener('click', clearAll);
randomBuildBtn.addEventListener('click', fillRandomBuild);
generateBuildsBtn.addEventListener('click', renderTopBuilds);
archetypeSelectEl.addEventListener('change', renderTopBuilds);

copySummaryBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  copyText(buildSummaryText(state.calculatedFoods), () => { copySummaryBtn.textContent = 'Summary copied'; setTimeout(() => copySummaryBtn.textContent = 'Copy build summary', 1400); }, 'Clipboard blocked. Copy manually:');
});
copyShoppingBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  copyText(shoppingText(getDraftSelection()), () => { copyShoppingBtn.textContent = 'Shopping copied'; setTimeout(() => copyShoppingBtn.textContent = 'Copy shopping list', 1400); }, 'Clipboard blocked. Copy manually:');
});
copyLinkBtn.addEventListener('click', () => {
  copyText(currentShareURL(), () => { copyLinkBtn.textContent = 'Link copied'; setTimeout(() => copyLinkBtn.textContent = 'Copy build link', 1400); }, 'Clipboard blocked. Copy manually:');
});
downloadSummaryBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  downloadTextFile('icarus-build-summary.txt', buildSummaryText(state.calculatedFoods));
});
downloadShoppingBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  downloadTextFile('icarus-shopping-list.txt', shoppingText(getDraftSelection()));
});

loadFoods();
