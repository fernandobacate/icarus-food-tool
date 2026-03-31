const state = {
  data: null,
  foods: [],
  filteredFoods: [],
  calculated: false,
  calculatedFoods: [],
  currentPreset: null,
  activeAutocomplete: null,
  currentBuildToken: null,
};

const isEmbed = new URLSearchParams(window.location.search).has("embed");
if (isEmbed) document.body.classList.add("embed-mode");

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
const captureAreaEl = document.getElementById("captureArea");

const benchFilterEl = document.getElementById("benchFilter");
const sortFoodsEl = document.getElementById("sortFoods");
const rankingLimitEl = document.getElementById("rankingLimit");
const hideZeroBuffsEl = document.getElementById("hideZeroBuffs");
const sortBuffsEl = document.getElementById("sortBuffs");
const strictModeEl = document.getElementById("strictMode");
const calculateBtn = document.getElementById("calculateBtn");
const clearBtn = document.getElementById("clearBtn");
const randomBuildBtn = document.getElementById("randomBuildBtn");
const optimalBuildBtn = document.getElementById("optimalBuildBtn");
const copySummaryBtn = document.getElementById("copySummaryBtn");
const copyShoppingBtn = document.getElementById("copyShoppingBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const exportImageBtn = document.getElementById("exportImageBtn");

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

function getBuildQueryPayload(selectedFoods) {
  return selectedFoods.map(food => `${encodeURIComponent(food.name)}~${encodeURIComponent(String(food.craftQty || 1))}`).join("|");
}

function parseBuildQueryPayload(raw) {
  if (!raw) return [];
  return raw.split("|").map(part => {
    const [namePart, qtyPart] = part.split("~");
    return {
      name: decodeURIComponent(namePart || ""),
      qty: Math.max(1, Number(decodeURIComponent(qtyPart || "1")) || 1),
    };
  }).filter(item => item.name);
}

function updateUrlForBuild(selectedFoods) {
  const params = new URLSearchParams(window.location.search);
  if (selectedFoods?.length) params.set("build", getBuildQueryPayload(selectedFoods));
  else params.delete("build");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  history.replaceState({}, "", `${window.location.pathname}${suffix}`);
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
        <div style="margin-top:6px">Overall ${fmtMaybe(food.scores?.overall)}</div>
      </div>
    </div>
  `;
}

function closeAllAutocomplete(exceptIndex = null) {
  document.querySelectorAll('.autocomplete-list').forEach((list) => {
    const idx = Number(list.dataset.index);
    const shouldClose = exceptIndex == null || idx !== exceptIndex;
    if (shouldClose) list.classList.add('hidden');
  });
  document.querySelectorAll('.slot').forEach(slot => slot.classList.remove('active-slot'));
  if (exceptIndex == null) state.activeAutocomplete = null;
}

function renderAutocompleteList(index, matches, activeIndex = 0) {
  const listEl = document.getElementById(`autocomplete-${index}`);
  if (!listEl) return;
  if (!matches.length) {
    listEl.innerHTML = `<div class="autocomplete-item active"><div class="ingredient-mini"><span class="icon-fallback">—</span></div><div class="autocomplete-main"><div class="autocomplete-name">No matches found</div><div class="autocomplete-meta">Try another search term.</div></div><div class="autocomplete-score"></div></div>`;
    listEl.classList.remove('hidden');
    return;
  }
  listEl.innerHTML = matches.slice(0, 50).map((food, idx) => {
    const markup = autocompleteItemMarkup(food);
    return markup.replace('autocomplete-item', `autocomplete-item${idx === activeIndex ? ' active' : ''}`);
  }).join('');
  listEl.classList.remove('hidden');

  listEl.querySelectorAll('.autocomplete-item[data-name]').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectFood(index, item.dataset.name);
    });
  });
}

function openAutocomplete(index, term = "") {
  applyFoodFilter();
  const slotEl = document.getElementById(`slot-wrap-${index}`);
  const matches = term
    ? state.filteredFoods.filter(food => food.name.toLowerCase().includes(term.toLowerCase()))
    : state.filteredFoods;
  closeAllAutocomplete(index);
  slotEl?.classList.add('active-slot');
  renderAutocompleteList(index, matches, 0);
  state.activeAutocomplete = { index, matches: matches.slice(0, 50), activeIndex: 0 };
}

function moveAutocomplete(index, direction) {
  if (!state.activeAutocomplete || state.activeAutocomplete.index !== index) return;
  const max = state.activeAutocomplete.matches.length - 1;
  if (max < 0) return;
  state.activeAutocomplete.activeIndex = Math.max(0, Math.min(max, state.activeAutocomplete.activeIndex + direction));
  renderAutocompleteList(index, state.activeAutocomplete.matches, state.activeAutocomplete.activeIndex);
}

function selectFood(index, foodName) {
  const input = document.getElementById(`slot-${index}`);
  if (!input) return;
  input.value = foodName;
  closeAllAutocomplete();
}

function attachAutocompleteEvents(index) {
  const input = document.getElementById(`slot-${index}`);
  if (!input) return;
  input.addEventListener('focus', () => openAutocomplete(index, input.value.trim()));
  input.addEventListener('click', () => openAutocomplete(index, input.value.trim()));
  input.addEventListener('input', () => openAutocomplete(index, input.value.trim()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openAutocomplete(index, input.value.trim());
      moveAutocomplete(index, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openAutocomplete(index, input.value.trim());
      moveAutocomplete(index, -1);
    } else if (e.key === 'Enter') {
      if (state.activeAutocomplete && state.activeAutocomplete.index === index && state.activeAutocomplete.matches[state.activeAutocomplete.activeIndex]) {
        e.preventDefault();
        selectFood(index, state.activeAutocomplete.matches[state.activeAutocomplete.activeIndex].name);
      }
    } else if (e.key === 'Escape') {
      closeAllAutocomplete();
    }
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
      <div class="slot" id="slot-wrap-${i}">
        <div class="slot-header"><strong>Slot ${i + 1}</strong><span>${current ? "Draft selected" : "Empty"}</span></div>
        <div class="slot-controls">
          <div class="autocomplete-wrap">
            <input class="wide-input" id="slot-${i}" placeholder="Click or type to browse recipes..." autocomplete="off" value="${current.replace(/"/g, '&quot;')}">
            <div class="autocomplete-list hidden" id="autocomplete-${i}" data-index="${i}"></div>
          </div>
          <label>
            <span>Craft qty</span>
            <input class="slot-qty-input" type="number" id="slot-qty-${i}" min="1" step="1" value="${qty}">
          </label>
        </div>
      </div>
    `);
    attachAutocompleteEvents(i);
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
  updateUrlForBuild([]);
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
    buffWarningEl.innerHTML = `<strong>Potential in-game overlap:</strong> ${duplicates.slice(0, 6).map(d => `${(selectedFoods.find(f => f.buffs?.[d.key])?.buffs?.[d.key]?.label || d.key)} (${d.names.length} foods)`).join(" • ")}`;
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

function validStrictBuild(selectedFoods) {
  return detectDuplicateBuffs(selectedFoods).length === 0;
}

function calculateAll() {
  const selectedFoods = getDraftSelection();
  if (!selectedFoods.length) {
    clearResultsOnly();
    return;
  }
  if (strictModeEl.checked && !validStrictBuild(selectedFoods)) {
    alert('This build has duplicate buff categories. Disable strict in-game mode or change your selection.');
    return;
  }
  state.calculated = true;
  state.calculatedFoods = selectedFoods;
  resultsAreaEl.classList.remove("hidden");
  renderSelectedCards(selectedFoods);
  renderCombinedBuffs(selectedFoods);
  renderScores(selectedFoods);
  renderShopping(selectedFoods);
  updateUrlForBuild(selectedFoods);
}

function clearAll() {
  state.currentPreset = null;
  renderPresets();
  renderSelectors(Array.from({ length: 5 }, () => ({ name: "", qty: 1 })));
  clearResultsOnly();
  closeAllAutocomplete();
}

function fillRandomBuild() {
  const pool = [...state.foods].sort((a, b) => (b.scores?.overall || 0) - (a.scores?.overall || 0)).slice(0, 25);
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
  const preserve = shuffled.map(food => ({ name: food.name, qty: 1 }));
  state.currentPreset = null;
  renderPresets();
  renderSelectors(preserve);
  calculateAll();
}

function generateOptimalBuild() {
  const pool = [...state.foods].sort((a, b) => (b.scores?.overall || 0) - (a.scores?.overall || 0));
  const picked = [];
  for (const food of pool) {
    const candidate = [...picked, { ...food, craftQty: 1 }];
    if (!strictModeEl.checked || validStrictBuild(candidate)) picked.push(food);
    if (picked.length === 5) break;
  }
  const preserve = picked.slice(0, 5).map(food => ({ name: food.name, qty: 1 }));
  state.currentPreset = null;
  renderPresets();
  renderSelectors(preserve);
  calculateAll();
}

function generateShareURL() {
  const params = new URLSearchParams(window.location.search);
  if (!state.calculatedFoods.length) return `${window.location.origin}${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  params.set('build', getBuildQueryPayload(state.calculatedFoods));
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

async function exportCurrentBuildAsImage() {
  if (!state.calculatedFoods.length) {
    alert('Calculate a build first.');
    return;
  }
  if (typeof html2canvas === 'undefined') {
    alert('Export library failed to load.');
    return;
  }
  const canvas = await html2canvas(captureAreaEl, {
    backgroundColor: '#0a0c11',
    scale: 2,
    useCORS: true,
    logging: false,
    scrollY: -window.scrollY,
  });
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = 'icarus-food-build.png';
  link.click();
}

function restoreBuildFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const payload = parseBuildQueryPayload(params.get('build'));
  if (!payload.length) return false;
  const preserve = Array.from({ length: 5 }, (_, i) => ({ name: payload[i]?.name || '', qty: payload[i]?.qty || 1 }));
  renderSelectors(preserve);
  calculateAll();
  return true;
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
  footerMetaEl.textContent = `${fmtNumber(state.data.meta.total_recipes)} recipes • ${fmtNumber(state.data.meta.total_ingredient_rows)} ingredient rows • custom autocomplete • strict mode • shareable links`;
  restoreBuildFromUrl();
}

benchFilterEl.addEventListener('change', () => {
  const preserve = Array.from({ length: 5 }, (_, i) => ({ name: document.getElementById(`slot-${i}`)?.value || "", qty: Number(document.getElementById(`slot-qty-${i}`)?.value || 1) }));
  renderSelectors(preserve);
  closeAllAutocomplete();
});
sortFoodsEl.addEventListener('change', () => {
  const preserve = Array.from({ length: 5 }, (_, i) => ({ name: document.getElementById(`slot-${i}`)?.value || "", qty: Number(document.getElementById(`slot-qty-${i}`)?.value || 1) }));
  renderSelectors(preserve);
  closeAllAutocomplete();
});
rankingLimitEl.addEventListener('change', renderRankings);
hideZeroBuffsEl.addEventListener('change', () => state.calculated && renderCombinedBuffs(state.calculatedFoods));
sortBuffsEl.addEventListener('change', () => state.calculated && renderCombinedBuffs(state.calculatedFoods));
calculateBtn.addEventListener('click', calculateAll);
clearBtn.addEventListener('click', clearAll);
randomBuildBtn.addEventListener('click', fillRandomBuild);
optimalBuildBtn.addEventListener('click', generateOptimalBuild);
copySummaryBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  copyText(buildSummaryText(state.calculatedFoods), () => { copySummaryBtn.textContent = 'Summary copied'; setTimeout(() => copySummaryBtn.textContent = 'Copy build summary', 1400); }, 'Clipboard blocked. Copy manually:');
});
copyShoppingBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  copyText(shoppingText(state.calculatedFoods), () => { copyShoppingBtn.textContent = 'Shopping copied'; setTimeout(() => copyShoppingBtn.textContent = 'Copy shopping list', 1400); }, 'Clipboard blocked. Copy manually:');
});
copyLinkBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  copyText(generateShareURL(), () => { copyLinkBtn.textContent = 'Build link copied'; setTimeout(() => copyLinkBtn.textContent = 'Copy build link', 1400); }, 'Clipboard blocked. Copy manually:');
});
exportImageBtn.addEventListener('click', exportCurrentBuildAsImage);

document.addEventListener('click', (e) => {
  if (!e.target.closest('.autocomplete-wrap')) closeAllAutocomplete();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllAutocomplete();
});

loadFoods();
