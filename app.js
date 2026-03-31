const state = {
  data: null,
  foods: [],
  filteredFoods: [],
  calculated: false,
  calculatedFoods: [],
  currentPreset: null,
  activeAutocomplete: { slot: null, index: -1, items: [] },
};

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

const benchFilterEl = document.getElementById("benchFilter");
const sortFoodsEl = document.getElementById("sortFoods");
const rankingLimitEl = document.getElementById("rankingLimit");
const hideZeroBuffsEl = document.getElementById("hideZeroBuffs");
const sortBuffsEl = document.getElementById("sortBuffs");
const calculateBtn = document.getElementById("calculateBtn");
const clearBtn = document.getElementById("clearBtn");
const randomBuildBtn = document.getElementById("randomBuildBtn");
const optimalBuildBtn = document.getElementById("optimalBuildBtn");
const copySummaryBtn = document.getElementById("copySummaryBtn");
const copyShoppingBtn = document.getElementById("copyShoppingBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const downloadSummaryBtn = document.getElementById("downloadSummaryBtn");
const downloadShoppingBtn = document.getElementById("downloadShoppingBtn");
const exportPngBtn = document.getElementById("exportPngBtn");
const strictModeEl = document.getElementById("strictMode");
const carnivoreToggleEl = document.getElementById("carnivoreToggle");
const ignoreConsumeStatsEl = document.getElementById("ignoreConsumeStats");

const CATEGORY_WEIGHTS = {
  survival: {
    "Max health": 1,
    "Health regen %": 3,
    "Max stamina": 0.55,
    "Stamina regen %": 1.8,
    "Exposure resistance %": 2.2,
    "Water consumption %": 1.0,
    "Food consumption %": 1.0,
    "Oxygen consumption %": 1.1,
    "Cave sickness resist %": 1.8,
    "Bacterial affliction duration %": 1.4,
    "Parasitic affliction duration %": 1.4,
    "Water on consume": 0.3,
    "Food effects duration %": 0.5,
    "Temperature °C": 0.3,
  },
  melee: {
    "Melee damage %": 3.2,
    "Melee attack speed %": 2.8,
    "Return melee damage %": 1.7,
    "Return melee damage chance %": 1.2,
    "Perceived threat %": 0.2,
    "Health regen %": 0.4,
    "Max health": 0.25,
  },
  ranged: {
    "Projectile damage %": 3.2,
    "Reload speed %": 2.2,
    "Charge speed %": 2.2,
    "Critical damage %": 2.4,
    "Max stamina": 0.2,
    "Stamina regen %": 0.4,
  },
  exploration: {
    "Movement speed %": 2.2,
    "Over-encumbrance penalty %": 1.7,
    "Oxygen consumption %": 1.7,
    "Water consumption %": 1.6,
    "Food consumption %": 1.3,
    "Cave sickness resist %": 1.5,
    "Exposure resistance %": 1.2,
    "Foraging yield %": 0.9,
    "Extra stone chance %": 0.8,
    "Butchering yield %": 0.8,
    "Temperature °C": 0.6,
    "Perceived threat %": 0.4,
  },
  xp_support: {
    "XP gained %": 2.2,
    "Shared XP gained %": 2.6,
    "Tamed creature XP %": 1.8,
  },
  utility: {
    "Crafting speed %": 2.2,
    "Stamina used by actions %": 1.8,
    "Stamina regen delay %": 1.5,
    "Food effects duration %": 1.2,
    "Water on consume": 0.2,
    "Extra stone chance %": 0.8,
    "Foraging yield %": 0.8,
    "Butchering yield %": 0.8,
  }
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
    .replace(/[\u0300-\u036f]/g, "")
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
      <img src="assets/${type}/${slug}.png" alt="${name}" onerror="this.remove()">
      <span class="icon-fallback">${initials(name)}</span>
    </div>
  `;
}

function negativeIsGood(label) {
  return ["Food consumption %", "Water consumption %", "Oxygen consumption %", "Stamina used by actions %", "Stamina regen delay %", "Over-encumbrance penalty %", "Bacterial affliction duration %", "Parasitic affliction duration %"].includes(label);
}

function adjustedBuffValue(label, value, options = {}) {
  let v = Number(value || 0);
  if (negativeIsGood(label)) v = -v;
  if (options.ignoreConsume && ["Food on consume", "Water on consume"].includes(label)) return 0;
  return v;
}

function getFoodBuffEntries(food, options = {}) {
  const mult = options.carnivore && food.bench === "Smoker" ? 1.3 : 1;
  return Object.entries(food.buffs || {}).map(([key, meta]) => ({
    key,
    label: meta.label || key,
    rawValue: Number(meta.value || 0),
    value: Number(meta.value || 0) * mult,
  }));
}

function deriveScores(food, options = {}) {
  const buffEntries = getFoodBuffEntries(food, options);
  const totals = {
    survival: 0,
    melee: 0,
    ranged: 0,
    exploration: 0,
    xp_support: 0,
    utility: 0,
  };

  for (const [bucket, weights] of Object.entries(CATEGORY_WEIGHTS)) {
    for (const buff of buffEntries) {
      if (weights[buff.label]) {
        totals[bucket] += adjustedBuffValue(buff.label, buff.value, options) * weights[buff.label];
      }
    }
  }

  totals.overall =
    totals.survival * 0.95 +
    totals.melee * 0.95 +
    totals.ranged * 0.95 +
    totals.exploration * 0.8 +
    totals.xp_support * 0.65 +
    totals.utility * 0.6;

  const complexity = Math.max(1, Number(food.ingredient_count || (food.ingredients || []).length || 1));
  totals.efficiency = totals.overall / (complexity + 1.5);

  return totals;
}

function withDerivedScores(food, options = {}) {
  return {
    ...food,
    derivedScores: deriveScores(food, options),
    adjustedBuffs: getFoodBuffEntries(food, options),
  };
}

function currentOptions() {
  return {
    carnivore: carnivoreToggleEl.value === "on",
    strict: strictModeEl.checked,
    ignoreConsume: ignoreConsumeStatsEl.checked,
  };
}

function refreshDerivedFoods() {
  const opts = currentOptions();
  state.foods = state.data.foods.map(food => withDerivedScores(food, opts));
}

function bySelectedSort(a, b, mode) {
  if (mode === "name") return a.name.localeCompare(b.name);
  return (b.derivedScores?.[mode] || 0) - (a.derivedScores?.[mode] || 0) || a.name.localeCompare(b.name);
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

function getActiveFoods(selectedFoods) {
  if (!currentOptions().strict) return selectedFoods;
  const seen = new Set();
  const active = [];
  for (const food of selectedFoods) {
    const family = String(food.modifier || food.name).toLowerCase();
    if (seen.has(family)) continue;
    seen.add(family);
    active.push(food);
  }
  return active;
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

function getAllBuffKeys(selectedFoods) {
  const map = new Map();
  selectedFoods.forEach(food => {
    (food.adjustedBuffs || []).forEach(buff => map.set(buff.key, buff.label));
  });
  return [...map.entries()].map(([key, label]) => ({ key, label }));
}

function sumBuffs(selectedFoods) {
  const totals = {};
  selectedFoods.forEach(food => {
    (food.adjustedBuffs || []).forEach(buff => {
      totals[buff.key] = (totals[buff.key] || 0) + Number(buff.value || 0);
    });
  });
  return totals;
}

function findStrictDuplicates(selectedFoods) {
  const families = {};
  selectedFoods.forEach(food => {
    const family = String(food.modifier || food.name);
    families[family] ||= [];
    families[family].push(food.name);
  });
  return Object.entries(families).filter(([, names]) => names.length > 1).map(([family, names]) => ({ family, names }));
}

function presetsForFoods(foods) {
  const topBy = (key, limit = 5) => [...foods].sort((a, b) => (b.derivedScores?.[key] || 0) - (a.derivedScores?.[key] || 0)).slice(0, limit).map(f => f.name);
  return [
    { id: "allround", label: "All-round", names: topBy("overall") },
    { id: "survival", label: "Survival Tank", names: topBy("survival") },
    { id: "melee", label: "Melee Focus", names: topBy("melee") },
    { id: "ranged", label: "Ranged Focus", names: topBy("ranged") },
    { id: "explore", label: "Exploration Rush", names: topBy("exploration") },
    { id: "xpsupport", label: "XP / Support", names: topBy("xp_support") },
    { id: "efficiency", label: "Efficiency", names: topBy("efficiency") },
  ];
}

function renderKPIs() {
  const meta = state.data.meta;
  const bestOverall = [...state.foods].sort((a,b)=>b.derivedScores.overall-a.derivedScores.overall)[0];
  const kpis = [
    { label: "Total recipes", value: fmtNumber(meta.total_recipes), sub: "Complete dataset loaded" },
    { label: "Ingredient rows", value: fmtNumber(meta.total_ingredient_rows), sub: "Shopping list ready" },
    { label: "Best overall", value: bestOverall?.name || "—", sub: bestOverall ? `${fmtMaybe(bestOverall.derivedScores.overall)} • ${bestOverall.bench}` : "" },
    { label: "Smoker recipes", value: fmtNumber(meta.benches?.Smoker || 0), sub: currentOptions().carnivore ? "Carnivore bonuses active" : "Carnivore bonuses inactive" },
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

function autocompleteItemMarkup(food) {
  return `
    <div class="autocomplete-item" data-name="${food.name}">
      ${iconMarkup(food.name, "recipes", "ingredient-mini")}
      <div class="autocomplete-main">
        <div class="autocomplete-name">${food.name}</div>
        <div class="autocomplete-meta">${food.bench}</div>
      </div>
      <div class="autocomplete-score">
        <div><span class="badge tier-${food.tier || 'none'}">${food.tier || '—'} Tier</span></div>
        <div style="margin-top:6px">Overall ${fmtMaybe(food.derivedScores?.overall)}</div>
      </div>
    </div>
  `;
}

function openAutocomplete(slotIndex) {
  document.querySelectorAll('.autocomplete-list').forEach((el, idx) => {
    if (idx !== slotIndex) el.classList.add('hidden');
  });
  const listEl = document.getElementById(`autocomplete-${slotIndex}`);
  if (listEl) listEl.classList.remove('hidden');
}

function closeAutocomplete(slotIndex) {
  const listEl = document.getElementById(`autocomplete-${slotIndex}`);
  if (listEl) listEl.classList.add('hidden');
  if (state.activeAutocomplete.slot === slotIndex) {
    state.activeAutocomplete = { slot: null, index: -1, items: [] };
  }
}

function renderAutocompleteList(slotIndex, items) {
  const listEl = document.getElementById(`autocomplete-${slotIndex}`);
  if (!listEl) return;
  state.activeAutocomplete = { slot: slotIndex, index: items.length ? 0 : -1, items };
  listEl.innerHTML = items.length
    ? items.map(food => autocompleteItemMarkup(food)).join('')
    : '<div class="autocomplete-item"><div class="autocomplete-main"><div class="autocomplete-name">No matches</div></div></div>';
  listEl.querySelectorAll('.autocomplete-item[data-name]').forEach((itemEl, itemIndex) => {
    if (itemIndex === state.activeAutocomplete.index) itemEl.classList.add('active');
    itemEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectFood(slotIndex, itemEl.dataset.name);
    });
  });
}

function moveAutocompleteIndex(direction) {
  const ac = state.activeAutocomplete;
  if (ac.slot == null || !ac.items.length) return;
  ac.index = (ac.index + direction + ac.items.length) % ac.items.length;
  const listEl = document.getElementById(`autocomplete-${ac.slot}`);
  if (!listEl) return;
  [...listEl.querySelectorAll('.autocomplete-item[data-name]')].forEach((el, idx) => {
    el.classList.toggle('active', idx === ac.index);
  });
  listEl.querySelectorAll('.autocomplete-item[data-name]')[ac.index]?.scrollIntoView({ block: 'nearest' });
}

function selectFood(slotIndex, foodName) {
  const input = document.getElementById(`slot-${slotIndex}`);
  if (input) input.value = foodName;
  closeAutocomplete(slotIndex);
}

function wireAutocomplete(slotIndex) {
  const wrap = document.getElementById(`autocomplete-wrap-${slotIndex}`);
  const input = document.getElementById(`slot-${slotIndex}`);
  if (!wrap || !input) return;

  input.addEventListener('focus', () => {
    applyFoodFilter();
    renderAutocompleteList(slotIndex, state.filteredFoods);
    openAutocomplete(slotIndex);
  });

  input.addEventListener('input', () => {
    applyFoodFilter();
    const term = input.value.trim().toLowerCase();
    const matches = state.filteredFoods.filter(food => food.name.toLowerCase().includes(term));
    renderAutocompleteList(slotIndex, matches);
    openAutocomplete(slotIndex);
  });

  input.addEventListener('keydown', (e) => {
    if (state.activeAutocomplete.slot !== slotIndex) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveAutocompleteIndex(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveAutocompleteIndex(-1);
    } else if (e.key === 'Enter') {
      const ac = state.activeAutocomplete;
      if (ac.items.length && ac.index >= 0) {
        e.preventDefault();
        selectFood(slotIndex, ac.items[ac.index].name);
      }
    } else if (e.key === 'Escape') {
      closeAutocomplete(slotIndex);
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) closeAutocomplete(slotIndex);
  });
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
          <div class="autocomplete-wrap" id="autocomplete-wrap-${i}">
            <input class="wide-input" id="slot-${i}" placeholder="Click or type to browse recipes..." value="${current.replace(/"/g, '&quot;')}">
            <div class="autocomplete-list hidden" id="autocomplete-${i}"></div>
          </div>
          <label>
            <span>Craft qty</span>
            <input class="slot-qty-input" type="number" id="slot-qty-${i}" min="1" step="1" value="${qty}">
          </label>
        </div>
      </div>
    `);
  }
  for (let i = 0; i < 5; i++) wireAutocomplete(i);
}

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

function renderSelectedCards(selectedFoods, activeFoods) {
  selectionCardsEl.innerHTML = selectedFoods.map(food => {
    const active = activeFoods.some(x => x.name === food.name && x.modifier === food.modifier);
    return `
    <article class="recipe-card">
      <div class="recipe-top">
        ${iconMarkup(food.name, 'recipes')}
        <div>
          <div class="recipe-name">${food.name}</div>
          <div class="meta-row">
            <span class="badge tier-${food.tier || 'none'}">${food.tier || '—'} Tier</span>
            <span class="badge">${food.bench}</span>
            <span class="badge">${fmtMaybe(food.duration_s)}s</span>
            ${!active && currentOptions().strict ? `<span class="badge">Refreshed only</span>` : ``}
          </div>
        </div>
      </div>
      <div class="small-muted">Overall ${fmtMaybe(food.derivedScores?.overall)} • Efficiency ${fmtMaybe(food.derivedScores?.efficiency)}</div>
      <div class="recipe-qty">Craft quantity: x${fmtMaybe(food.craftQty)}</div>
      <div class="small-muted">Modifier / effect family: ${food.modifier || food.name}</div>
      ${food.notes ? `<div class="small-muted">${food.notes}</div>` : ``}
      <div class="buff-list">
        ${(food.adjustedBuffs || []).map(buff => `<div class="buff-line"><strong>${buff.label}:</strong> ${fmtMaybe(buff.value)}</div>`).join("")}
      </div>
    </article>`;
  }).join("");

  const duplicates = findStrictDuplicates(selectedFoods);
  if (duplicates.length && currentOptions().strict) {
    buffWarningEl.hidden = false;
    buffWarningEl.innerHTML = `<strong>Strict mode:</strong> duplicate effect families refresh instead of stacking. Ignored for active build: ${duplicates.map(d => `${d.family} (${d.names.length} selected)`).join(" • ")}`;
  } else {
    buffWarningEl.hidden = true;
  }
}

function renderCombinedBuffs(activeFoods) {
  const totals = sumBuffs(activeFoods);
  let rows = getAllBuffKeys(activeFoods).map(item => ({ key: item.key, label: item.label, value: totals[item.key] || 0 }));
  if (hideZeroBuffsEl.checked) rows = rows.filter(r => r.value !== 0);
  if (sortBuffsEl.checked) rows.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.label.localeCompare(b.label));
  buffChipsEl.innerHTML = rows.slice(0, 8).map(row => `<span class="chip">${row.label}: ${fmtMaybe(row.value)}</span>`).join("");
  buffsTableWrapEl.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Buff</th><th class="number">Total</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.label}</td><td class="number">${fmtMaybe(row.value)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderScores(activeFoods) {
  const totals = Object.fromEntries(SCORE_DIMS.map(([key]) => [key, 0]));
  activeFoods.forEach(food => SCORE_DIMS.forEach(([key]) => totals[key] += Number(food.derivedScores?.[key] || 0)));
  scoreCardsEl.innerHTML = SCORE_DIMS.map(([key, label]) => `<article class="score-card"><div class="score-name">${label}</div><div class="score-value">${fmtMaybe(totals[key])}</div></article>`).join("");
  const sorted = [...SCORE_DIMS].sort((a, b) => totals[b[0]] - totals[a[0]]).map(([key, label]) => ({ key, label, value: totals[key] }));
  const topBench = Object.entries(activeFoods.reduce((acc, food) => { acc[food.bench] = (acc[food.bench] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1])[0];
  buildInsightsEl.innerHTML = `
    <div class="insight"><strong>Primary archetype:</strong> ${sorted[0].label} (${fmtMaybe(sorted[0].value)})</div>
    <div class="insight"><strong>Secondary strength:</strong> ${sorted[1].label} (${fmtMaybe(sorted[1].value)})</div>
    <div class="insight"><strong>Bench profile:</strong> ${topBench ? `${topBench[0]} heavy` : 'Mixed'} • ${activeFoods.length} active effects</div>
    <div class="insight"><strong>Scoring basis:</strong> ${currentOptions().carnivore ? 'Carnivore ON' : 'Carnivore OFF'} • ${currentOptions().ignoreConsume ? 'Consume stats ignored' : 'Consume stats counted'} • ${currentOptions().strict ? 'Strict mode active' : 'Free theorycraft mode'}</div>
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

function renderRankings() {
  const limit = Number(rankingLimitEl.value || 20);
  const rows = [...state.foods].sort((a, b) => (b.derivedScores?.overall || 0) - (a.derivedScores?.overall || 0)).slice(0, limit);
  rankingsWrapEl.innerHTML = `<div class="table-wrap rankings-table"><table><thead><tr><th>#</th><th>Recipe</th><th>Bench</th><th>Tier</th><th class="number">Overall</th><th class="number">Efficiency</th><th class="number">Survival</th><th class="number">Melee</th><th class="number">Ranged</th><th class="number">Exploration</th></tr></thead><tbody>${rows.map((food, idx) => `
    <tr>
      <td class="rank-cell">${idx + 1}</td>
      <td><div class="recipe-cell">${iconMarkup(food.name, 'recipes', 'ingredient-mini')}<span>${food.name}</span></div></td>
      <td>${food.bench}</td>
      <td><span class="badge tier-${food.tier || 'none'}">${food.tier || '—'}</span></td>
      <td class="number">${fmtMaybe(food.derivedScores?.overall)}</td>
      <td class="number">${fmtMaybe(food.derivedScores?.efficiency)}</td>
      <td class="number">${fmtMaybe(food.derivedScores?.survival)}</td>
      <td class="number">${fmtMaybe(food.derivedScores?.melee)}</td>
      <td class="number">${fmtMaybe(food.derivedScores?.ranged)}</td>
      <td class="number">${fmtMaybe(food.derivedScores?.exploration)}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function buildSummaryText(selectedFoods, activeFoods) {
  const totals = Object.fromEntries(SCORE_DIMS.map(([key]) => [key, 0]));
  activeFoods.forEach(food => SCORE_DIMS.forEach(([key]) => totals[key] += Number(food.derivedScores?.[key] || 0)));
  const archetypes = [...SCORE_DIMS].sort((a, b) => totals[b[0]] - totals[a[0]]).slice(0, 3).map(([key, label]) => `${label}: ${fmtMaybe(totals[key])}`);

  return [
    `Icarus Food Calculator — Build Summary`,
    `Created by fernandobacate`,
    `Carnivore: ${currentOptions().carnivore ? "On" : "Off"} • Strict: ${currentOptions().strict ? "On" : "Off"} • Ignore consume stats: ${currentOptions().ignoreConsume ? "On" : "Off"}`,
    "",
    ...selectedFoods.map((food, idx) => `${idx + 1}. ${food.name} x${fmtMaybe(food.craftQty)} — ${food.bench} — Overall ${fmtMaybe(food.derivedScores?.overall)} — Modifier ${food.modifier || food.name}`),
    "",
    `Active effect families counted: ${activeFoods.map(f => f.modifier || f.name).join(", ")}`,
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

async function copyText(text, successLabel, fallbackLabel) {
  try {
    await navigator.clipboard.writeText(text);
    successLabel();
  } catch {
    alert(fallbackLabel + "\n\n" + text);
  }
}

function triggerDownload(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function currentShareUrl() {
  const params = new URLSearchParams();
  params.set("carnivore", currentOptions().carnivore ? "1" : "0");
  params.set("strict", currentOptions().strict ? "1" : "0");
  params.set("ignoreConsume", currentOptions().ignoreConsume ? "1" : "0");
  const entries = [];
  for (let i = 0; i < 5; i++) {
    const input = document.getElementById(`slot-${i}`);
    const qtyInput = document.getElementById(`slot-qty-${i}`);
    const val = (input?.value || "").trim();
    if (!val) continue;
    entries.push(`${encodeURIComponent(val)}~${encodeURIComponent(qtyInput?.value || 1)}`);
  }
  if (entries.length) params.set("build", entries.join("|"));
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

function applyUrlState() {
  const params = new URLSearchParams(window.location.search);
  carnivoreToggleEl.value = params.get("carnivore") === "1" ? "on" : "off";
  strictModeEl.checked = params.get("strict") === "1";
  ignoreConsumeStatsEl.checked = params.get("ignoreConsume") !== "0";
}

function getPreserveState() {
  return Array.from({ length: 5 }, (_, i) => ({
    name: document.getElementById(`slot-${i}`)?.value || "",
    qty: Number(document.getElementById(`slot-qty-${i}`)?.value || 1)
  }));
}

function calculateAll() {
  const selectedFoods = getDraftSelection();
  if (!selectedFoods.length) {
    clearResultsOnly();
    return;
  }
  const activeFoods = getActiveFoods(selectedFoods);
  state.calculated = true;
  state.calculatedFoods = selectedFoods;
  resultsAreaEl.classList.remove("hidden");
  renderSelectedCards(selectedFoods, activeFoods);
  renderCombinedBuffs(activeFoods);
  renderScores(activeFoods);
  renderShopping(selectedFoods);
}

function clearAll() {
  state.currentPreset = null;
  renderPresets();
  renderSelectors(Array.from({ length: 5 }, () => ({ name: "", qty: 1 })));
  clearResultsOnly();
  history.replaceState({}, "", window.location.pathname);
}

function fillRandomBuild() {
  const pool = [...state.foods].sort((a, b) => (b.derivedScores?.overall || 0) - (a.derivedScores?.overall || 0)).slice(0, 25);
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
  const preserve = shuffled.map(food => ({ name: food.name, qty: 1 }));
  state.currentPreset = null;
  renderPresets();
  renderSelectors(preserve);
  calculateAll();
}

function fillOptimalBuild() {
  const pool = [...state.foods].sort((a,b)=>b.derivedScores.overall-a.derivedScores.overall);
  const picked = [];
  const seen = new Set();
  for (const food of pool) {
    const family = String(food.modifier || food.name).toLowerCase();
    if (currentOptions().strict && seen.has(family)) continue;
    picked.push(food);
    seen.add(family);
    if (picked.length >= 5) break;
  }
  const preserve = picked.map(food => ({ name: food.name, qty: 1 }));
  state.currentPreset = null;
  renderPresets();
  renderSelectors(preserve);
  calculateAll();
}

function recalcAllUi(preserve = null) {
  refreshDerivedFoods();
  renderKPIs();
  renderFilters();
  renderPresets();
  renderSelectors(preserve || getPreserveState());
  renderRankings();
  if (state.calculated) calculateAll();
  footerMetaEl.textContent = `${fmtNumber(state.data.meta.total_recipes)} recipes • ${fmtNumber(state.data.meta.total_ingredient_rows)} ingredient rows • carnivore-aware • strict in-game logic • shareable build links`;
}

async function exportBuildPng() {
  const target = document.getElementById("resultsArea");
  if (!state.calculated || !target || typeof html2canvas === "undefined") {
    alert("Calculate a build first.");
    return;
  }
  const canvas = await html2canvas(target, { backgroundColor: "#0b0f17", scale: 2 });
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "icarus-food-build.png";
  a.click();
}

async function loadFoods() {
  const response = await fetch('./foods.json');
  state.data = await response.json();
  applyUrlState();
  refreshDerivedFoods();
  renderKPIs();
  renderFilters();
  renderPresets();

  const params = new URLSearchParams(window.location.search);
  const buildParam = params.get("build");
  let preserve = Array.from({ length: 5 }, () => ({ name: "", qty: 1 }));
  if (buildParam) {
    preserve = buildParam.split("|").slice(0,5).map(chunk => {
      const [name, qty] = chunk.split("~");
      return { name: decodeURIComponent(name || ""), qty: Number(decodeURIComponent(qty || "1")) || 1 };
    });
    while (preserve.length < 5) preserve.push({ name: "", qty: 1 });
  }
  renderSelectors(preserve);
  renderRankings();
  clearResultsOnly();
  footerMetaEl.textContent = `${fmtNumber(state.data.meta.total_recipes)} recipes • ${fmtNumber(state.data.meta.total_ingredient_rows)} ingredient rows • carnivore-aware • strict in-game logic • shareable build links`;
  if (buildParam) calculateAll();
}

benchFilterEl.addEventListener('change', () => {
  renderSelectors(getPreserveState());
});
sortFoodsEl.addEventListener('change', () => {
  renderSelectors(getPreserveState());
});
rankingLimitEl.addEventListener('change', renderRankings);
hideZeroBuffsEl.addEventListener('change', () => state.calculated && renderCombinedBuffs(getActiveFoods(state.calculatedFoods)));
sortBuffsEl.addEventListener('change', () => state.calculated && renderCombinedBuffs(getActiveFoods(state.calculatedFoods)));
carnivoreToggleEl.addEventListener('change', () => recalcAllUi());
strictModeEl.addEventListener('change', () => state.calculated && calculateAll());
ignoreConsumeStatsEl.addEventListener('change', () => recalcAllUi());
calculateBtn.addEventListener('click', () => {
  calculateAll();
  history.replaceState({}, "", currentShareUrl());
});
clearBtn.addEventListener('click', clearAll);
randomBuildBtn.addEventListener('click', fillRandomBuild);
optimalBuildBtn.addEventListener('click', fillOptimalBuild);

copySummaryBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  const activeFoods = getActiveFoods(state.calculatedFoods);
  copyText(buildSummaryText(state.calculatedFoods, activeFoods), () => { copySummaryBtn.textContent = 'Summary copied'; setTimeout(() => copySummaryBtn.textContent = 'Copy build summary', 1400); }, 'Clipboard blocked. Copy manually:');
});
copyShoppingBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  copyText(shoppingText(state.calculatedFoods), () => { copyShoppingBtn.textContent = 'Shopping copied'; setTimeout(() => copyShoppingBtn.textContent = 'Copy shopping list', 1400); }, 'Clipboard blocked. Copy manually:');
});
copyLinkBtn.addEventListener('click', () => {
  const url = currentShareUrl();
  copyText(url, () => { copyLinkBtn.textContent = 'Link copied'; setTimeout(() => copyLinkBtn.textContent = 'Copy build link', 1400); }, 'Copy this link manually:');
});
downloadSummaryBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  triggerDownload('icarus-food-build-summary.txt', buildSummaryText(state.calculatedFoods, getActiveFoods(state.calculatedFoods)));
});
downloadShoppingBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  triggerDownload('icarus-food-shopping-list.txt', shoppingText(state.calculatedFoods));
});
exportPngBtn.addEventListener('click', exportBuildPng);

loadFoods();
