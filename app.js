
const state = {
  data: null,
  foods: [],
  filteredFoods: [],
  calculated: false,
  calculatedFoods: [],
  currentPreset: null,
  activeAutocompleteIndex: null,
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
const strictModeEl = document.getElementById("strictMode");
const ignoreConsumeStatsEl = document.getElementById("ignoreConsumeStats");
const calculateBtn = document.getElementById("calculateBtn");
const clearBtn = document.getElementById("clearBtn");
const randomBuildBtn = document.getElementById("randomBuildBtn");
const copySummaryBtn = document.getElementById("copySummaryBtn");
const copyShoppingBtn = document.getElementById("copyShoppingBtn");

const SCORE_DIMS = [
  ["survival", "Survival"],
  ["melee", "Melee"],
  ["ranged", "Ranged"],
  ["exploration", "Exploration"],
  ["support", "Support"],
  ["utility", "Utility"],
  ["overall", "Overall"],
  ["efficiency", "Efficiency"],
];

const IGNORE_FOR_SCORING = new Set(["Food_On_Consume", "Water_On_Consume"]);

const CATEGORY_WEIGHTS = {
  survival: [
    [/Max_Health/i, 1],
    [/Health_Regen/i, 1.8],
    [/Max_Stamina/i, 0.45],
    [/Stamina_Regen/i, 0.6],
    [/Exposure_Resistance/i, 1.4],
    [/Cold_Resistance|Heat_Resistance/i, 1.1],
    [/Food_Consumption|Water_Consumption|Oxygen_Consumption/i, 0.9],
    [/Melee_Resistance/i, 1.2],
    [/Food_Effects_Duration/i, 0.5],
    [/Temperature/i, 0.2],
  ],
  melee: [
    [/Melee_Damage/i, 2.2],
    [/Melee_Attack_Speed/i, 2],
    [/Return_Melee_Damage_pct/i, 0.9],
    [/Return_Melee_Damage_Chance_pct/i, 0.8],
    [/Melee_Resistance/i, 1.3],
  ],
  ranged: [
    [/Projectile_Damage/i, 2.2],
    [/Charge_Speed/i, 1.6],
    [/Reload_Speed/i, 1.6],
    [/Crit_Damage/i, 1.6],
  ],
  exploration: [
    [/Oxygen_Consumption/i, 1.8],
    [/Water_Consumption/i, 1.4],
    [/Exposure_Resistance/i, 1.2],
    [/Resist_Cave_Sickness/i, 1.7],
    [/Yield_Foraging/i, 1.1],
    [/Extra_Stone_Chance/i, 0.6],
    [/Nearby_Juveniles_Tame_Faster/i, 1.2],
    [/Temperature/i, 0.35],
  ],
  support: [
    [/XP_Gained/i, 1.7],
    [/Shared_XP_Gained/i, 2.1],
    [/Tamed_Creature_XP/i, 1.4],
  ],
  utility: [
    [/Crafting_Speed/i, 2.2],
    [/Stamina_Used_By|Stamina_Consumed_By/i, 1.8],
    [/Food_Effects_Duration/i, 1.5],
    [/Yield_Butchering/i, 1.1],
    [/Perceived_Threat/i, 0.5],
    [/Food_Consumption/i, 0.8],
  ],
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
      <img src="assets/${type}/${slug}.png" alt="${name}" onerror="this.remove()">
      <span class="icon-fallback">${initials(name)}</span>
    </div>
  `;
}

function scoreFood(food) {
  const dims = { survival: 0, melee: 0, ranged: 0, exploration: 0, support: 0, utility: 0 };
  for (const [key, meta] of Object.entries(food.buffs || {})) {
    if (ignoreConsumeStatsEl.checked && IGNORE_FOR_SCORING.has(key)) continue;
    const value = Number(meta.value || 0);
    for (const [dim, rules] of Object.entries(CATEGORY_WEIGHTS)) {
      for (const [regex, weight] of rules) {
        if (regex.test(key)) dims[dim] += Math.abs(value) * weight;
      }
    }
  }
  dims.overall = dims.survival + dims.melee + dims.ranged + dims.exploration + dims.support + dims.utility;
  const ingredientCount = Math.max(1, Number(food.ingredient_count || (food.ingredients || []).length || 1));
  dims.efficiency = dims.overall / ingredientCount;
  return dims;
}

function deriveScoredFood(food) {
  return { ...food, derivedScores: scoreFood(food) };
}

function bySelectedSort(a, b, mode) {
  if (mode === "name") return a.name.localeCompare(b.name);
  const aScore = (a.derivedScores || {})[mode] || 0;
  const bScore = (b.derivedScores || {})[mode] || 0;
  return bScore - aScore || a.name.localeCompare(b.name);
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

function duplicateModifiers(selectedFoods) {
  const owners = {};
  selectedFoods.forEach(food => {
    const key = String(food.modifier || food.name || "").trim().toLowerCase();
    owners[key] ||= [];
    owners[key].push(food.name);
  });
  return Object.entries(owners)
    .filter(([, names]) => names.length > 1)
    .map(([modifier, names]) => ({ modifier, names }));
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
  const topBy = (key, limit = 5) => [...foods].sort((a, b) => (b.derivedScores?.[key] || 0) - (a.derivedScores?.[key] || 0)).slice(0, limit).map(f => f.name);
  return [
    { id: "allround", label: "All-round", names: topBy("overall") },
    { id: "survival", label: "Survival Tank", names: topBy("survival") },
    { id: "melee", label: "Melee Focus", names: topBy("melee") },
    { id: "ranged", label: "Ranged Focus", names: topBy("ranged") },
    { id: "explore", label: "Exploration Rush", names: topBy("exploration") },
    { id: "support", label: "XP / Support", names: topBy("support") },
    { id: "efficiency", label: "Efficiency", names: topBy("efficiency") },
  ];
}

function renderKPIs() {
  const meta = state.data.meta;
  const top = [...state.foods].sort((a,b)=>(b.derivedScores?.overall||0)-(a.derivedScores?.overall||0))[0];
  const kpis = [
    { label: "Total recipes", value: fmtNumber(meta.total_recipes), sub: "Complete dataset loaded" },
    { label: "Ingredient rows", value: fmtNumber(meta.total_ingredient_rows), sub: "Shopping list ready" },
    { label: "Best overall", value: top?.name || "—", sub: top ? `${fmtMaybe(top.derivedScores?.overall)} • ${top.bench}` : "" },
    { label: "Smoker recipes", value: fmtNumber(meta.benches?.Smoker || 0), sub: "Transparent scoring enabled" },
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
    <div class="autocomplete-item" data-name="${food.name.replace(/"/g, '&quot;')}">
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

function closeAllAutocompletes() {
  document.querySelectorAll('.autocomplete-list').forEach(el => el.classList.add('hidden'));
  state.activeAutocompleteIndex = null;
}

function renderAutocompleteList(index, foods, activeIdx = -1) {
  const listEl = document.getElementById(`autocomplete-${index}`);
  if (!listEl) return;
  if (!foods.length) {
    listEl.innerHTML = `<div class="autocomplete-item"><div class="autocomplete-main"><div class="autocomplete-name">No matches</div></div></div>`;
    listEl.classList.remove('hidden');
    return;
  }
  listEl.innerHTML = foods.slice(0, 40).map((food, i) => `<div class="${i===activeIdx?'autocomplete-item active':'autocomplete-item'}" data-name="${food.name.replace(/"/g, '&quot;')}">${autocompleteItemMarkup(food).replace('<div class="autocomplete-item" data-name="'+food.name.replace(/"/g,'&quot;')+'">','').replace(/<\/div>$/,'')}</div>`).join('');
  listEl.classList.remove('hidden');
  listEl.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectAutocomplete(index, item.dataset.name);
    });
  });
}

function selectAutocomplete(index, name) {
  const input = document.getElementById(`slot-${index}`);
  if (input) input.value = name;
  closeAllAutocompletes();
}

function setupAutocomplete(index) {
  const input = document.getElementById(`slot-${index}`);
  const wrap = document.getElementById(`slot-wrap-${index}`);
  let activeIdx = -1;
  let currentMatches = [];
  const refreshMatches = () => {
    const term = (input.value || '').trim().toLowerCase();
    currentMatches = state.filteredFoods.filter(food => !term || food.name.toLowerCase().includes(term));
    renderAutocompleteList(index, currentMatches, activeIdx);
  };
  input.addEventListener('focus', () => { activeIdx = -1; refreshMatches(); state.activeAutocompleteIndex = index; });
  input.addEventListener('input', () => { activeIdx = -1; refreshMatches(); state.activeAutocompleteIndex = index; });
  input.addEventListener('keydown', (e) => {
    if (!currentMatches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, currentMatches.length - 1); renderAutocompleteList(index, currentMatches, activeIdx); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderAutocompleteList(index, currentMatches, activeIdx); }
    else if (e.key === 'Enter') { if (activeIdx >= 0) { e.preventDefault(); selectAutocomplete(index, currentMatches[activeIdx].name); } }
    else if (e.key === 'Escape') { closeAllAutocompletes(); }
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
          <div class="autocomplete-wrap" id="slot-wrap-${i}">
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
    setupAutocomplete(i);
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

function buffListMarkup(food) {
  const buffs = Object.values(food.buffs || {}).map(meta => `${meta.label}: ${fmtMaybe(meta.value)}`);
  return buffs.slice(0, 8).map(x => `<span class="mini-chip">${x}</span>`).join('');
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
      <div class="small-muted">Overall ${fmtMaybe(food.derivedScores?.overall)} • Efficiency ${fmtMaybe(food.derivedScores?.efficiency)}</div>
      <div class="recipe-qty">Craft quantity: x${fmtMaybe(food.craftQty)}</div>
      ${food.notes ? `<div class="small-muted">${food.notes}</div>` : `<div class="small-muted">Modifier: ${food.modifier || food.name}</div>`}
      <div class="buff-list">${buffListMarkup(food)}</div>
    </article>
  `).join("");

  const duplicates = duplicateModifiers(selectedFoods);
  if (duplicates.length) {
    buffWarningEl.hidden = false;
    buffWarningEl.innerHTML = `<strong>Strict-mode conflict:</strong> duplicate modifier/status effect detected for ${duplicates.map(d => d.names.join(' + ')).join(' • ')}`;
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
  const totals = Object.fromEntries(SCORE_DIMS.map(([key]) => [key, 0]));
  selectedFoods.forEach(food => {
    Object.entries(food.derivedScores || {}).forEach(([key, value]) => { if (totals[key] != null) totals[key] += Number(value || 0); });
  });
  scoreCardsEl.innerHTML = SCORE_DIMS.map(([key, label]) => `<article class="score-card"><div class="score-name">${label}</div><div class="score-value">${fmtMaybe(totals[key])}</div></article>`).join("");
  const sorted = [...SCORE_DIMS].filter(([k]) => !['overall','efficiency'].includes(k)).sort((a,b)=>totals[b[0]]-totals[a[0]]).map(([key,label])=>({key,label,value:totals[key]}));
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

function buildSummaryText(selectedFoods) {
  const totals = Object.fromEntries(SCORE_DIMS.map(([key]) => [key, 0]));
  selectedFoods.forEach(food => SCORE_DIMS.forEach(([key]) => totals[key] += Number(food.derivedScores?.[key] || 0)));
  const archetypes = [...SCORE_DIMS].filter(([k]) => !['overall','efficiency'].includes(k)).sort((a, b) => totals[b[0]] - totals[a[0]]).slice(0, 3).map(([key, label]) => `${label}: ${fmtMaybe(totals[key])}`);
  return [
    `Icarus Food Calculator — Build Summary`,
    `Created by fernandobacate`,
    `Transparent scoring: Survival / Melee / Ranged / Exploration / Support / Utility`,
    "",
    ...selectedFoods.map((food, idx) => `${idx + 1}. ${food.name} x${fmtMaybe(food.craftQty)} — ${food.bench} — Overall ${fmtMaybe(food.derivedScores?.overall)}`),
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
  const dupes = duplicateModifiers(selectedFoods);
  if (strictModeEl.checked && dupes.length) {
    alert(`Strict mode: duplicate status effect/modifier found.\n\n${dupes.map(d => d.names.join(' + ')).join('\n')}`);
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
  const pool = [...state.foods].sort((a, b) => (b.derivedScores?.overall || 0) - (a.derivedScores?.overall || 0)).slice(0, 25);
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
  const preserve = shuffled.map(food => ({ name: food.name, qty: 1 }));
  state.currentPreset = null;
  renderPresets();
  renderSelectors(preserve);
  calculateAll();
}

async function loadFoods() {
  const response = await fetch('./foods.json');
  state.data = await response.json();
  state.foods = state.data.foods.map(deriveScoredFood);
  renderKPIs();
  renderFilters();
  renderPresets();
  renderSelectors(Array.from({ length: 5 }, () => ({ name: "", qty: 1 })));
  renderRankings();
  clearResultsOnly();
  footerMetaEl.textContent = `${fmtNumber(state.data.meta.total_recipes)} recipes • ${fmtNumber(state.data.meta.total_ingredient_rows)} ingredient rows • transparent scoring • melee/ranged split`; 
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
ignoreConsumeStatsEl.addEventListener('change', () => {
  state.foods = state.data.foods.map(deriveScoredFood);
  renderKPIs(); renderPresets(); renderRankings();
  if (state.calculated) {
    state.calculatedFoods = state.calculatedFoods.map(food => ({ ...state.foods.find(f => f.name === food.name), craftQty: food.craftQty }));
    renderSelectedCards(state.calculatedFoods); renderScores(state.calculatedFoods);
  }
});
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
document.addEventListener('click', (e) => { if (!e.target.closest('.autocomplete-wrap')) closeAllAutocompletes(); });

loadFoods();
