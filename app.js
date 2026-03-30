
const state = {
  data: null,
  foods: [],
  filteredFoods: [],
};

const selectorsEl = document.getElementById("selectors");
const selectionCardsEl = document.getElementById("selectionCards");
const buffWarningEl = document.getElementById("buffWarning");
const buffsTableWrapEl = document.getElementById("buffsTableWrap");
const buffChipsEl = document.getElementById("buffChips");
const shoppingWrapEl = document.getElementById("shoppingWrap");
const scoreCardsEl = document.getElementById("scoreCards");
const buildInsightsEl = document.getElementById("buildInsights");
const rankingsWrapEl = document.getElementById("rankingsWrap");
const kpiGridEl = document.getElementById("kpiGrid");

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
  return Math.abs(value % 1) < 0.001 ? fmtNumber(value, 0) : fmtNumber(value, 2);
}

function benchClass(value){
  return String(value || "").replace(/\s+/g, "-").toLowerCase();
}

function tierClass(value){
  return `tier-${value || "none"}`;
}

function bySelectedSort(a, b, mode) {
  if (mode === "name") return a.name.localeCompare(b.name);
  return (b.scores?.[mode] || 0) - (a.scores?.[mode] || 0) || a.name.localeCompare(b.name);
}

function getSelectedFoods() {
  const foods = [];
  for (let i = 0; i < 5; i++) {
    const select = document.getElementById(`slot-${i}`);
    const qtyInput = document.getElementById(`slot-qty-${i}`);
    const value = select?.value;
    if (!value) continue;
    const food = state.foods.find(f => f.name === value);
    const qty = Math.max(1, Number(qtyInput?.value || 1));
    if (food) foods.push({ ...food, craftQty: qty });
  }
  return foods;
}

function getAllBuffKeys(selectedFoods) {
  const map = new Map();
  selectedFoods.forEach(food => {
    Object.entries(food.buffs || {}).forEach(([key, meta]) => {
      map.set(key, meta.label || key);
    });
  });
  return [...map.entries()].map(([key, label]) => ({ key, label }));
}

function sumBuffs(selectedFoods) {
  const totals = {};
  selectedFoods.forEach(food => {
    Object.entries(food.buffs || {}).forEach(([key, meta]) => {
      totals[key] = (totals[key] || 0) + (meta.value || 0);
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
  return Object.entries(owners)
    .filter(([, names]) => names.length > 1)
    .map(([key, names]) => ({ key, names }));
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
  return [...map.entries()]
    .map(([name, meta]) => ({ name, ...meta }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
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

  kpiGridEl.innerHTML = kpis.map(k => `
    <article class="kpi">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-sub">${k.sub}</div>
    </article>
  `).join("");
}

function renderFilters() {
  const benches = ["All", ...Object.keys(state.data.meta.benches).sort()];
  benchFilterEl.innerHTML = benches.map(b => `<option value="${b}">${b}</option>`).join("");
}

function applyFoodFilter() {
  const bench = benchFilterEl.value || "All";
  const mode = sortFoodsEl.value || "name";
  state.filteredFoods = state.foods
    .filter(f => bench === "All" || f.bench === bench)
    .sort((a, b) => bySelectedSort(a, b, mode));
}

function renderSelectors(preserve = []) {
  applyFoodFilter();
  selectorsEl.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    const entry = preserve[i] || {};
    const current = typeof entry === 'string' ? entry : (entry.name || "");
    const qty = typeof entry === 'string' ? 1 : (entry.qty || 1);
    const options = ['<option value="">— Choose food —</option>']
      .concat(state.filteredFoods.map(food => {
        const selected = current === food.name ? "selected" : "";
        return `<option value="${food.name}" ${selected}>${food.name}</option>`;
      })).join("");

    selectorsEl.insertAdjacentHTML("beforeend", `
      <div class="slot">
        <div class="slot-header">
          <strong>Slot ${i + 1}</strong>
          <span>${current ? "Selected" : "Empty"}</span>
        </div>
        <div class="slot-controls">
          <select id="slot-${i}" data-slot="${i}">${options}</select>
          <label class="slot-qty">
            <span>Craft qty</span>
            <input type="number" id="slot-qty-${i}" min="1" step="1" value="${qty}" ${current ? '' : 'disabled'}>
          </label>
        </div>
      </div>
    `);
  }

  selectorsEl.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", () => {
      const current = Array.from({ length: 5 }, (_, idx) => ({
        name: document.getElementById(`slot-${idx}`)?.value || "",
        qty: Number(document.getElementById(`slot-qty-${idx}`)?.value || 1),
      }));
      renderSelectors(current);
      calculateAll();
    });
  });

  selectorsEl.querySelectorAll('input[type="number"]').forEach(inp => {
    inp.addEventListener('input', () => {
      if (!inp.value || Number(inp.value) < 1) inp.value = 1;
      calculateAll();
    });
  });
}

function renderBuildPreview() {
  const selectedFoods = getSelectedFoods();
  if (!selectedFoods.length) {
    selectionCardsEl.innerHTML = `<div class="empty">Choose foods to see a live preview.</div>`;
    buffWarningEl.hidden = true;
    return;
  }

  selectionCardsEl.innerHTML = selectedFoods.map(food => `
    <article class="recipe-card">
      <div class="recipe-name">${food.name}</div>
      <div class="meta-row">
        <span class="badge ${tierClass(food.tier)}">${food.tier || "—"} Tier</span>
        <span class="badge">${food.bench}</span>
        <span class="badge">${food.duration_s}s</span>
      </div>
      <div class="small-muted">Overall ${fmtMaybe(food.scores.overall)} • Efficiency ${fmtMaybe(food.scores.efficiency, 2)}</div>
      <div class="recipe-qty">Craft quantity: x${fmtMaybe(food.craftQty)}</div>
      ${food.notes ? `<div class="small-muted" style="margin-top:8px">${food.notes}</div>` : ""}
    </article>
  `).join("");

  const duplicates = detectDuplicateBuffs(selectedFoods);
  if (duplicates.length) {
    buffWarningEl.hidden = false;
    buffWarningEl.innerHTML = `<strong>Potential in-game overlap:</strong> ${duplicates.slice(0, 4).map(d => `${d.key.replaceAll("_pct","").replaceAll("_"," ")} (${d.names.length} foods)`).join(" • ")}`;
  } else {
    buffWarningEl.hidden = true;
  }
}

function renderCombinedBuffs() {
  const selectedFoods = getSelectedFoods();
  if (!selectedFoods.length) {
    buffChipsEl.innerHTML = "";
    buffsTableWrapEl.innerHTML = `<div class="empty">No foods selected yet.</div>`;
    return;
  }

  const totals = sumBuffs(selectedFoods);
  let buffRows = getAllBuffKeys(selectedFoods).map(item => ({
    key: item.key,
    label: item.label,
    value: totals[item.key] || 0,
  }));

  if (hideZeroBuffsEl.checked) {
    buffRows = buffRows.filter(row => row.value !== 0);
  }
  if (sortBuffsEl.checked) {
    buffRows.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.label.localeCompare(b.label));
  }

  const chipRows = buffRows.slice(0, 8);
  buffChipsEl.innerHTML = chipRows.map(row => `
    <span class="chip">${row.label}: ${fmtMaybe(row.value)}</span>
  `).join("");

  buffsTableWrapEl.innerHTML = `
    <table>
      <thead><tr><th>Buff</th><th>Total</th></tr></thead>
      <tbody>
        ${buffRows.map(row => `
          <tr>
            <td>${row.label}</td>
            <td>${fmtMaybe(row.value)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderScores() {
  const selectedFoods = getSelectedFoods();
  if (!selectedFoods.length) {
    scoreCardsEl.innerHTML = "";
    buildInsightsEl.innerHTML = `<div class="empty">Build score summary appears here after selecting foods.</div>`;
    return;
  }

  const totals = Object.fromEntries(BUFF_DIMS.map(([key]) => [key, 0]));
  selectedFoods.forEach(food => {
    BUFF_DIMS.forEach(([key]) => totals[key] += Number(food.scores?.[key] || 0));
  });

  scoreCardsEl.innerHTML = BUFF_DIMS.map(([key, label]) => `
    <article class="score-card">
      <div class="score-name">${label}</div>
      <div class="score-value">${fmtMaybe(totals[key])}</div>
    </article>
  `).join("");

  const sorted = [...BUFF_DIMS]
    .sort((a, b) => totals[b[0]] - totals[a[0]])
    .map(([key, label]) => ({ key, label, value: totals[key] }));

  const topBench = Object.entries(selectedFoods.reduce((acc, food) => {
    acc[food.bench] = (acc[food.bench] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1])[0];

  buildInsightsEl.innerHTML = `
    <div class="insight"><strong>Primary archetype:</strong> ${sorted[0].label} (${fmtMaybe(sorted[0].value)})</div>
    <div class="insight"><strong>Secondary strength:</strong> ${sorted[1].label} (${fmtMaybe(sorted[1].value)})</div>
    <div class="insight"><strong>Bench loadout:</strong> ${topBench ? `${topBench[0]} heavy` : "Mixed"} • ${selectedFoods.length} foods selected</div>
  `;
}

function renderShopping() {
  const rows = aggregateIngredients(getSelectedFoods());
  if (!rows.length) {
    shoppingWrapEl.innerHTML = `<div class="empty">No ingredients to show yet.</div>`;
    return;
  }

  shoppingWrapEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Ingredient</th>
          <th>Total Qty</th>
          <th>Unit</th>
          <th>Recipe Sources</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${row.name}</td>
            <td>${fmtMaybe(row.qty)}</td>
            <td>${row.unit || "item"}</td>
            <td>${[...new Set(row.recipes)].join(", ")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderRankings() {
  const limit = Number(rankingLimitEl.value || 20);
  const bench = benchFilterEl.value || "All";
  const mode = sortFoodsEl.value || "overall";
  const rows = [...state.foods]
    .filter(f => bench === "All" || f.bench === bench)
    .sort((a, b) => bySelectedSort(a, b, mode === "name" ? "name" : mode))
    .slice(0, limit);

  rankingsWrapEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Recipe</th>
          <th>Bench</th>
          <th>Tier</th>
          <th>Overall</th>
          <th>Efficiency</th>
          <th>Survival</th>
          <th>Combat</th>
          <th>Exploration</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((food, idx) => `
          <tr>
            <td class="${idx < 3 ? "top-rank" : ""}">${idx + 1}</td>
            <td>${food.name}</td>
            <td>${food.bench}</td>
            <td><span class="badge ${tierClass(food.tier)}">${food.tier || "—"}</span></td>
            <td>${fmtMaybe(food.scores.overall)}</td>
            <td>${fmtMaybe(food.scores.efficiency)}</td>
            <td>${fmtMaybe(food.scores.survival)}</td>
            <td>${fmtMaybe(food.scores.combat)}</td>
            <td>${fmtMaybe(food.scores.exploration)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function calculateAll() {
  renderBuildPreview();
  renderCombinedBuffs();
  renderScores();
  renderShopping();
  renderRankings();
}

function clearSelections() {
  renderSelectors([{name:'',qty:1},{name:'',qty:1},{name:'',qty:1},{name:'',qty:1},{name:'',qty:1}]);
  calculateAll();
}

function applyRandomTopBuild() {
  const picks = state.data.meta.top_overall.slice(0, 5).map(x => ({ name: x.name, qty: 1 }));
  renderSelectors(picks);
  calculateAll();
}

async function copyText(text, fallbackMessage) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied.");
  } catch {
    alert(fallbackMessage);
  }
}

function summaryText() {
  const selected = getSelectedFoods();
  if (!selected.length) return "No foods selected.";
  const shopping = aggregateIngredients(selected);
  return [
    "Icarus Food Calculator summary",
    "",
    "Selected foods:",
    ...selected.map(f => `- ${f.name} (${f.bench})`),
    "",
    "Shopping list:",
    ...shopping.map(s => `- ${s.name}: ${fmtMaybe(s.qty)} ${s.unit || "item"}`),
  ].join("\n");
}

function shoppingText() {
  const shopping = aggregateIngredients(getSelectedFoods());
  if (!shopping.length) return "No ingredients selected.";
  return shopping.map(s => `${s.name}: ${fmtMaybe(s.qty)} ${s.unit || "item"}`).join("\n");
}

async function init() {
  const res = await fetch("./foods.json");
  state.data = await res.json();
  state.foods = state.data.foods || [];

  document.getElementById("footerMeta").textContent =
    `${state.data.meta.total_recipes} recipes • ${state.data.meta.total_ingredient_rows} ingredient rows • Maintained by fernandobacate`;

  renderKPIs();
  renderFilters();
  renderSelectors([
    { name: state.data.meta.top_overall?.[0]?.name || "", qty: 1 },
    { name: state.data.meta.top_overall?.[1]?.name || "", qty: 1 },
    { name: state.data.meta.top_overall?.[2]?.name || "", qty: 1 },
    { name: state.data.meta.top_overall?.[3]?.name || "", qty: 1 },
    { name: state.data.meta.top_overall?.[4]?.name || "", qty: 1 },
  ]);
  calculateAll();

  benchFilterEl.addEventListener("change", () => {
    const current = Array.from({ length: 5 }, (_, idx) => ({
      name: document.getElementById(`slot-${idx}`)?.value || "",
      qty: Number(document.getElementById(`slot-qty-${idx}`)?.value || 1),
    }));
    renderSelectors(current);
    calculateAll();
  });
  sortFoodsEl.addEventListener("change", () => {
    const current = Array.from({ length: 5 }, (_, idx) => ({
      name: document.getElementById(`slot-${idx}`)?.value || "",
      qty: Number(document.getElementById(`slot-qty-${idx}`)?.value || 1),
    }));
    renderSelectors(current);
    calculateAll();
  });
  rankingLimitEl.addEventListener("change", renderRankings);
  hideZeroBuffsEl.addEventListener("change", renderCombinedBuffs);
  sortBuffsEl.addEventListener("change", renderCombinedBuffs);
  calculateBtn.addEventListener("click", calculateAll);
  clearBtn.addEventListener("click", clearSelections);
  randomBuildBtn.addEventListener("click", applyRandomTopBuild);
  copySummaryBtn.addEventListener("click", () => copyText(summaryText(), "Copy failed. Select and copy manually."));
  copyShoppingBtn.addEventListener("click", () => copyText(shoppingText(), "Copy failed. Select and copy manually."));
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<main class="shell"><section class="panel"><h2>Failed to load dataset</h2><p>Please make sure foods.json is present in the same folder as index.html.</p></section></main>`;
});
