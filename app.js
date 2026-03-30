
const state = {
  data: null,
  foods: [],
  filteredFoods: [],
  calculated: false,
  calculatedFoods: [],
  currentPreset: null,
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

const benchFilterEl = document.getElementById("benchFilter");
const sortFoodsEl = document.getElementById("sortFoods");
const rankingLimitEl = document.getElementById("rankingLimit");
const hideZeroBuffsEl = document.getElementById("hideZeroBuffs");
const sortBuffsEl = document.getElementById("sortBuffs");
const calculateBtn = document.getElementById("calculateBtn");
const clearBtn = document.getElementById("clearBtn");
const randomBuildBtn = document.getElementById("randomBuildBtn");
const copySummaryBtn = document.getElementById("copySummaryBtn");
const copyShoppingBtn = document.getElementById("copyShoppingBtn");

const BUFF_DIMS = [
  ["survival", "Survival"],
  ["combat", "Combat"],
  ["exploration", "Exploration"],
  ["xp_support", "XP / Support"],
  ["utility", "Utility"],
  ["overall", "Overall"],
  ["efficiency", "Efficiency"],
];

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
      <img src="assets/${type}/${slug}.png" alt="${name}" onerror="this.remove()">
      <span class="icon-fallback">${initials(name)}</span>
    </div>
  `;
}

function bySelectedSort(a, b, mode) {
  if (mode === "name") return a.name.localeCompare(b.name);
  return (b.scores?.[mode] || 0) - (a.scores?.[mode] || 0) || a.name.localeCompare(b.name);
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

function getAllBuffKeys(selectedFoods) {
  const map = new Map();
  selectedFoods.forEach(food => {
    Object.entries(food.buffs || {}).forEach(([key, meta]) => map.set(key, meta.label || key));
  });
  return [...map.entries()].map(([key, label]) => ({ key, label }));
}

function sumBuffs(selectedFoods) {
  const totals = {};
  selectedFoods.forEach(food => {
    Object.entries(food.buffs || {}).forEach(([key, meta]) => {
      totals[key] = (totals[key] || 0) + Number(meta.value || 0);
    });
  });
  return totals;
}

function detectDuplicateBuffs(selectedFoods) {
  const owners = {};
  selectedFoods.forEach(food => {
    Object.keys(food.buffs || {}).forEach(key => {
      owners[key] ||= [];
      owners[key].push(food.name);
    });
  });
  return Object.entries(owners).filter(([, names]) => names.length > 1).map(([key, names]) => ({ key, names }));
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

function presetsForFoods(foods) {
  const topBy = (key, limit = 5) => [...foods].sort((a, b) => (b.scores?.[key] || 0) - (a.scores?.[key] || 0)).slice(0, limit).map(f => f.name);
  return [
    { id: "allround", label: "All-round", names: (state.data.meta.top_overall || []).slice(0, 5).map(x => x.name) },
    { id: "survival", label: "Survival Tank", names: topBy("survival") },
    { id: "combat", label: "Combat Focus", names: topBy("combat") },
    { id: "explore", label: "Exploration Rush", names: topBy("exploration") },
    { id: "xpsupport", label: "XP / Support", names: topBy("xp_support") },
    { id: "efficiency", label: "Efficiency", names: topBy("efficiency") },
  ];
}

function renderKPIs() {
  const meta = state.data.meta;
  const top = meta.top_overall?.[0];
  const kpis = [
    { label: "Total recipes", value: fmtNumber(meta.total_recipes), sub: "Complete dataset loaded" },
    { label: "Ingredient rows", value: fmtNumber(meta.total_ingredient_rows), sub: "Shopping list ready" },
    { label: "Best overall", value: top?.name || "—", sub: top ? `${fmtMaybe(top.score)} • ${top.bench}` : "" },
    { label: "Smoker recipes", value: fmtNumber(meta.benches?.Smoker || 0), sub: "Carnivore-aware foods included" },
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

function dataListMarkup(slotIndex) {
  const options = state.filteredFoods.map(food => `<option value="${food.name}"></option>`).join("");
  return `<datalist id="foods-list-${slotIndex}">${options}</datalist>`;
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
          <div>
            <input class="wide-input" id="slot-${i}" list="foods-list-${i}" placeholder="Type to search a recipe..." value="${current.replace(/"/g, '&quot;')}">
            ${dataListMarkup(i)}
          </div>
          <label>
            <span>Craft qty</span>
            <input class="slot-qty-input" type="number" id="slot-qty-${i}" min="1" step="1" value="${qty}">
          </label>
        </div>
      </div>
    `);
  }
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

function renderSelectedCards(selectedFoods) {
  selectionCardsEl.innerHTML = selectedFoods.map(food => `
    <article class="recipe-card">
      <div class="recipe-top">
        ${iconMarkup(food.name, 'recipes')}
        <div>
          <div class="recipe-name">${food.name}</div>
          <div class="meta-row">
            <span class="badge tier-${food.tier || 'none'}">${food.tier || '—'} Tier</span>
            <span class="badge">${food.bench}</span>
            <span class="badge">${fmtMaybe(food.duration_s)}s</span>
          </div>
        </div>
      </div>
      <div class="small-muted">Overall ${fmtMaybe(food.scores?.overall)} • Efficiency ${fmtMaybe(food.scores?.efficiency)}</div>
      <div class="recipe-qty">Craft quantity: x${fmtMaybe(food.craftQty)}</div>
      ${food.notes ? `<div class="small-muted">${food.notes}</div>` : `<div class="small-muted">Modifier: ${food.modifier || food.name}</div>`}
    </article>
  `).join("");

  const duplicates = detectDuplicateBuffs(selectedFoods);
  if (duplicates.length) {
    buffWarningEl.hidden = false;
    buffWarningEl.innerHTML = `<strong>Potential in-game overlap:</strong> ${duplicates.slice(0, 5).map(d => `${(selectedFoods[0].buffs?.[d.key]?.label || d.key)} (${d.names.length} foods)`).join(" • ")}`;
  } else {
    buffWarningEl.hidden = true;
  }
}

function renderCombinedBuffs(selectedFoods) {
  const totals = sumBuffs(selectedFoods);
  let rows = getAllBuffKeys(selectedFoods).map(item => ({ key: item.key, label: item.label, value: totals[item.key] || 0 }));
  if (hideZeroBuffsEl.checked) rows = rows.filter(r => r.value !== 0);
  if (sortBuffsEl.checked) rows.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.label.localeCompare(b.label));
  buffChipsEl.innerHTML = rows.slice(0, 8).map(row => `<span class="chip">${row.label}: ${fmtMaybe(row.value)}</span>`).join("");
  buffsTableWrapEl.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Buff</th><th class="number">Total</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.label}</td><td class="number">${fmtMaybe(row.value)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderScores(selectedFoods) {
  const totals = Object.fromEntries(BUFF_DIMS.map(([key]) => [key, 0]));
  selectedFoods.forEach(food => BUFF_DIMS.forEach(([key]) => totals[key] += Number(food.scores?.[key] || 0)));
  scoreCardsEl.innerHTML = BUFF_DIMS.map(([key, label]) => `<article class="score-card"><div class="score-name">${label}</div><div class="score-value">${fmtMaybe(totals[key])}</div></article>`).join("");
  const sorted = [...BUFF_DIMS].sort((a, b) => totals[b[0]] - totals[a[0]]).map(([key, label]) => ({ key, label, value: totals[key] }));
  const topBench = Object.entries(selectedFoods.reduce((acc, food) => { acc[food.bench] = (acc[food.bench] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1])[0];
  buildInsightsEl.innerHTML = `
    <div class="insight"><strong>Primary archetype:</strong> ${sorted[0].label} (${fmtMaybe(sorted[0].value)})</div>
    <div class="insight"><strong>Secondary strength:</strong> ${sorted[1].label} (${fmtMaybe(sorted[1].value)})</div>
    <div class="insight"><strong>Bench profile:</strong> ${topBench ? `${topBench[0]} heavy` : 'Mixed'} • ${selectedFoods.length} foods selected</div>
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
  const rows = [...state.foods].sort((a, b) => (b.scores?.overall || 0) - (a.scores?.overall || 0)).slice(0, limit);
  rankingsWrapEl.innerHTML = `<div class="table-wrap rankings-table"><table><thead><tr><th>#</th><th>Recipe</th><th>Bench</th><th>Tier</th><th class="number">Overall</th><th class="number">Efficiency</th><th class="number">Survival</th><th class="number">Combat</th><th class="number">Exploration</th></tr></thead><tbody>${rows.map((food, idx) => `
    <tr>
      <td class="rank-cell">${idx + 1}</td>
      <td><div class="recipe-cell">${iconMarkup(food.name, 'recipes', 'ingredient-mini')}<span>${food.name}</span></div></td>
      <td>${food.bench}</td>
      <td><span class="badge tier-${food.tier || 'none'}">${food.tier || '—'}</span></td>
      <td class="number">${fmtMaybe(food.scores?.overall)}</td>
      <td class="number">${fmtMaybe(food.scores?.efficiency)}</td>
      <td class="number">${fmtMaybe(food.scores?.survival)}</td>
      <td class="number">${fmtMaybe(food.scores?.combat)}</td>
      <td class="number">${fmtMaybe(food.scores?.exploration)}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function buildSummaryText(selectedFoods) {
  const totals = Object.fromEntries(BUFF_DIMS.map(([key]) => [key, 0]));
  selectedFoods.forEach(food => BUFF_DIMS.forEach(([key]) => totals[key] += Number(food.scores?.[key] || 0)));
  const archetypes = [...BUFF_DIMS]
    .sort((a, b) => totals[b[0]] - totals[a[0]])
    .slice(0, 3)
    .map(([key, label]) => `${label}: ${fmtMaybe(totals[key])}`);

  return [
    `Icarus Food Calculator — Build Summary`,
    `Created by fernandobacate`,
    "",
    ...selectedFoods.map((food, idx) => `${idx + 1}. ${food.name} x${fmtMaybe(food.craftQty)} — ${food.bench} — Overall ${fmtMaybe(food.scores?.overall)}`),
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

async function copyText(text, successLabel, fallbackLabel) {
  try {
    await navigator.clipboard.writeText(text);
    successLabel();
  } catch {
    alert(fallbackLabel + "\n\n" + text);
  }
}

function calculateAll() {
  const selectedFoods = getDraftSelection();
  if (!selectedFoods.length) {
    clearResultsOnly();
    return;
  }
  state.calculated = true;
  state.calculatedFoods = selectedFoods;
  resultsAreaEl.classList.remove("hidden");
  renderSelectedCards(selectedFoods);
  renderCombinedBuffs(selectedFoods);
  renderScores(selectedFoods);
  renderShopping(selectedFoods);
}

function clearAll() {
  state.currentPreset = null;
  renderPresets();
  renderSelectors(Array.from({ length: 5 }, () => ({ name: "", qty: 1 })));
  clearResultsOnly();
}

function fillRandomBuild() {
  const pool = [...state.foods].sort((a, b) => (b.scores?.overall || 0) - (a.scores?.overall || 0)).slice(0, 25);
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 5);
  const preserve = shuffled.map(food => ({ name: food.name, qty: 1 }));
  state.currentPreset = null;
  renderPresets();
  renderSelectors(preserve);
  calculateAll();
}

async function loadFoods() {
  const response = await fetch('./foods.json');
  state.data = await response.json();
  state.foods = state.data.foods;
  renderKPIs();
  renderFilters();
  renderPresets();
  renderSelectors(Array.from({ length: 5 }, () => ({ name: "", qty: 1 })));
  renderRankings();
  clearResultsOnly();
  footerMetaEl.textContent = `${fmtNumber(state.data.meta.total_recipes)} recipes • ${fmtNumber(state.data.meta.total_ingredient_rows)} ingredient rows • searchable planner, presets, export-ready summary`;
}

benchFilterEl.addEventListener('change', () => {
  const preserve = Array.from({ length: 5 }, (_, i) => ({ name: document.getElementById(`slot-${i}`)?.value || "", qty: Number(document.getElementById(`slot-qty-${i}`)?.value || 1) }));
  renderSelectors(preserve);
});
sortFoodsEl.addEventListener('change', () => {
  const preserve = Array.from({ length: 5 }, (_, i) => ({ name: document.getElementById(`slot-${i}`)?.value || "", qty: Number(document.getElementById(`slot-qty-${i}`)?.value || 1) }));
  renderSelectors(preserve);
});
rankingLimitEl.addEventListener('change', renderRankings);
hideZeroBuffsEl.addEventListener('change', () => state.calculated && renderCombinedBuffs(state.calculatedFoods));
sortBuffsEl.addEventListener('change', () => state.calculated && renderCombinedBuffs(state.calculatedFoods));
calculateBtn.addEventListener('click', calculateAll);
clearBtn.addEventListener('click', clearAll);
randomBuildBtn.addEventListener('click', fillRandomBuild);
copySummaryBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  copyText(buildSummaryText(state.calculatedFoods), () => { copySummaryBtn.textContent = 'Summary copied'; setTimeout(() => copySummaryBtn.textContent = 'Copy build summary', 1400); }, 'Clipboard blocked. Copy manually:');
});
copyShoppingBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  copyText(shoppingText(state.calculatedFoods), () => { copyShoppingBtn.textContent = 'Shopping copied'; setTimeout(() => copyShoppingBtn.textContent = 'Copy shopping list', 1400); }, 'Clipboard blocked. Copy manually:');
});

loadFoods();
