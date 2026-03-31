
const state = {
  data: null,
  foods: [],
  filteredFoods: [],
  calculated: false,
  calculatedFoods: [],
  currentPreset: null,
  activeAutocomplete: null,
  rankSortKey: 'overall',
  rankSortDir: 'desc',
};

const els = {
  kpiGrid: document.getElementById("kpiGrid"),
  selectors: document.getElementById("selectors"),
  resultsArea: document.getElementById("resultsArea"),
  selectionCards: document.getElementById("selectionCards"),
  buffWarning: document.getElementById("buffWarning"),
  buffCategoryWrap: document.getElementById("buffCategoryWrap"),
  scoreCards: document.getElementById("scoreCards"),
  buildInsights: document.getElementById("buildInsights"),
  shoppingWrap: document.getElementById("shoppingWrap"),
  rankingsWrap: document.getElementById("rankingsWrap"),
  footerMeta: document.getElementById("footerMeta"),
  presetButtons: document.getElementById("presetButtons"),
  benchFilter: document.getElementById("benchFilter"),
  sortFoods: document.getElementById("sortFoods"),
  rankingLimit: document.getElementById("rankingLimit"),
  hideZeroBuffs: document.getElementById("hideZeroBuffs"),
  sortBuffs: document.getElementById("sortBuffs"),
  calculateBtn: document.getElementById("calculateBtn"),
  clearBtn: document.getElementById("clearBtn"),
  randomBuildBtn: document.getElementById("randomBuildBtn"),
  copySummaryBtn: document.getElementById("copySummaryBtn"),
  copyShoppingBtn: document.getElementById("copyShoppingBtn"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  exportPngBtn: document.getElementById("exportPngBtn"),
  carnivoreToggle: document.getElementById("carnivoreToggle"),
  strictMode: document.getElementById("strictMode"),
  ignoreConsumeStats: document.getElementById("ignoreConsumeStats"),
  generatorArchetype: document.getElementById("generatorArchetype"),
  stomachSlots: document.getElementById("stomachSlots"),
  generatorWrap: document.getElementById("generatorWrap"),
};

const CATEGORY_ORDER = ["survival","melee","ranged","exploration","xp_support","utility"];
const CATEGORY_LABELS = {
  survival:"Survival", melee:"Melee", ranged:"Ranged",
  exploration:"Exploration", xp_support:"XP / Support", utility:"Utility",
  overall:"Overall", efficiency:"Efficiency"
};

const CATEGORY_COLORS = {
  survival:"survival", melee:"melee", ranged:"ranged",
  exploration:"exploration", xp_support:"xp_support", utility:"utility"
};

const CATEGORY_ICONS = {
  survival: "🛡️",
  melee: "🗡️",
  ranged: "🏹",
  exploration: "🧭",
  xp_support: "⭐",
  utility: "🧰",
  overall: "📊",
  efficiency: "⚙️"
};

function fmtNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
function fmtMaybe(value, digits=2) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const num = Number(value);
  return Math.abs(num % 1) < 0.001 ? fmtNumber(num, 0) : fmtNumber(num, digits);
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
  return String(value || "").split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]?.toUpperCase()||"").join("") || "IC";
}
function iconMarkup(name, type="recipes", className="icon-wrap") {
  const slug = slugify(name);
  return `<div class="${className}"><img src="assets/${type}/${slug}.png" alt="${name}" onerror="this.remove()"><span class="icon-fallback">${initials(name)}</span></div>`;
}
function categoryIconMarkup(cat, className="category-icon") {
  const label = CATEGORY_LABELS[cat] || cat;
  const fallback = CATEGORY_ICONS[cat] || '•';
  return `<div class="${className}"><img src="assets/categories/${cat}.png" alt="${label}" onerror="this.remove()"><span class="category-icon-fallback">${fallback}</span></div>`;
}
function benchOrder(bench) {
  return {"Kitchen Bench":1,"Electric Stove":2,"Smoker":3}[bench] || 9;
}
function effectFamily(food) {
  return slugify(food.modifier || food.name);
}
function isCarnivoreOn() {
  return els.carnivoreToggle.value === "on";
}
function currentSettingsLabel() {
  return `Carnivore ${isCarnivoreOn() ? 'ON' : 'OFF'} • ${els.ignoreConsumeStats.checked ? 'Consume stats ignored' : 'Consume stats included'} • ${els.strictMode.checked ? 'Strict in-game mode' : 'Free theorycraft mode'}`;
}
function selectedSlotCount() {
  return Number(els.stomachSlots?.value || 0);
}
function effectivePlannerSlotCount() {
  return Math.max(selectedSlotCount(), document.querySelectorAll('.slot').length || 0);
}

// ---------- Score mapping ----------
function consumeIgnored(label) {
  return els.ignoreConsumeStats.checked && /Food on consume|Water on consume/i.test(label);
}
function scoreBucketsFromBuffs(buffEntries) {
  const totals = {survival:0, melee:0, ranged:0, exploration:0, xp_support:0, utility:0};
  for (const [label, rawVal] of buffEntries) {
    if (consumeIgnored(label)) continue;
    const val = Number(rawVal || 0);
    const abs = Math.abs(val);
    const positiveReduction = val < 0 ? abs : val;
    if (/Max health/i.test(label)) totals.survival += abs * 3;
    else if (/Health regen/i.test(label)) totals.survival += abs * 4;
    else if (/Exposure resistance|Cave sickness resist|affliction duration/i.test(label)) totals.survival += abs * 2.2;
    else if (/Food effects duration/i.test(label)) totals.survival += abs * 1.5;
    else if (/Max stamina/i.test(label)) totals.exploration += abs * 2.4;
    else if (/Stamina regen/i.test(label)) totals.exploration += abs * 2.8;
    else if (/Stamina regen delay/i.test(label)) totals.exploration += positiveReduction * 2.8;
    else if (/Oxygen consumption|Water consumption|Food consumption|Over-encumbrance penalty/i.test(label)) totals.exploration += positiveReduction * 2.6;
    else if (/Movement speed/i.test(label)) totals.exploration += abs * 4.2;
    else if (/Temperature/i.test(label)) totals.exploration += abs * 1.2;
    else if (/Melee damage/i.test(label)) totals.melee += abs * 6;
    else if (/Melee attack speed/i.test(label)) totals.melee += abs * 5.2;
    else if (/Return melee damage chance|Return melee damage/i.test(label)) totals.melee += abs * 2.6;
    else if (/Projectile damage/i.test(label)) totals.ranged += abs * 6;
    else if (/Reload speed|Charge speed/i.test(label)) totals.ranged += abs * 4.5;
    else if (/Explosive damage/i.test(label)) totals.ranged += abs * 4.2;
    else if (/Critical damage/i.test(label)) { totals.melee += abs * 3.4; totals.ranged += abs * 3.4; }
    else if (/XP gained/i.test(label)) totals.xp_support += abs * 4;
    else if (/Shared XP gained/i.test(label)) totals.xp_support += abs * 5;
    else if (/Tamed creature XP/i.test(label)) totals.xp_support += abs * 2.8;
    else if (/Crafting speed/i.test(label)) totals.utility += abs * 4.2;
    else if (/Extra stone chance|Foraging yield|Butchering yield/i.test(label)) totals.utility += abs * 2.5;
    else if (/Perceived threat/i.test(label)) totals.utility += abs * 1.2;
    else totals.utility += abs * 0.5;
  }
  const overall = totals.survival + totals.melee + totals.ranged + totals.exploration + totals.xp_support + totals.utility;
  return {...totals, overall};
}
function adjustedFood(food) {
  const smokerBoost = isCarnivoreOn() && food.bench === "Smoker" ? 1.3 : 1;
  const buffEntries = Object.values(food.buffs || {}).map(meta => [meta.label, Number(meta.value || 0) * smokerBoost]);
  const buckets = scoreBucketsFromBuffs(buffEntries);
  const complexity = Math.max(1, Number(food.ingredient_count || 1));
  const efficiency = buckets.overall / (complexity + 1);
  return {
    ...food,
    adjustedBuffEntries: buffEntries,
    computedScores: {...buckets, efficiency},
  };
}
function allAdjustedFoods() {
  return state.foods.map(adjustedFood);
}
function targetScore(food, mode) {
  const s = food.computedScores || adjustedFood(food).computedScores;
  switch (mode) {
    case 'survival': return s.survival;
    case 'melee': return s.melee;
    case 'ranged': return s.ranged;
    case 'exploration': return s.exploration;
    case 'xp_support': return s.xp_support;
    case 'efficiency': return s.efficiency * 25;
    case 'allround': return s.overall;
    default: return s.overall;
  }
}
function archetypeLabel(mode) {
  return {
    allround:"All-round", survival:"Survival", melee:"Melee", ranged:"Ranged",
    exploration:"Exploration", xp_support:"XP / Support", efficiency:"Efficiency"
  }[mode] || "All-round";
}

// ---------- Filtering / presets ----------
function bySelectedSort(a, b, mode) {
  if (mode === "name") return a.name.localeCompare(b.name);
  return (targetScore(b, mode) || 0) - (targetScore(a, mode) || 0) || a.name.localeCompare(b.name);
}
function renderFilters() {
  const benches = ["All", ...Object.keys(state.data.meta.benches).sort()];
  els.benchFilter.innerHTML = benches.map(b => `<option value="${b}">${b}</option>`).join("");
}
function applyFoodFilter() {
  const bench = els.benchFilter.value || "All";
  const mode = els.sortFoods.value || "name";
  state.filteredFoods = allAdjustedFoods()
    .filter(f => bench === "All" || f.bench === bench)
    .sort((a,b)=>bySelectedSort(a,b,mode));
}
function presetsForFoods() {
  const foods = allAdjustedFoods();
  const topBy = (key, limit = 5) => [...foods].sort((a,b)=>(targetScore(b,key)||0)-(targetScore(a,key)||0)).slice(0,limit).map(f=>f.name);
  return [
    { id:"allround", label:"All-round", names: topBy("allround") },
    { id:"survival", label:"Survival Tank", names: topBy("survival") },
    { id:"melee", label:"Melee Focus", names: topBy("melee") },
    { id:"ranged", label:"Ranged Focus", names: topBy("ranged") },
    { id:"explore", label:"Exploration Rush", names: topBy("exploration") },
    { id:"xpsupport", label:"XP / Support", names: topBy("xp_support") },
    { id:"efficiency", label:"Efficiency", names: topBy("efficiency") },
  ];
}
function renderPresets() {
  const presets = presetsForFoods();
  els.presetButtons.innerHTML = presets.map(p=>`<button class="preset-btn ${state.currentPreset===p.id?'active':''}" data-preset="${p.id}">${p.label}</button>`).join("");
  els.presetButtons.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const preset = presets.find(p => p.id === btn.dataset.preset);
      if (!preset) return;
      state.currentPreset = preset.id;
      clearPlanner(false);
      preset.names.forEach((name, i) => {
        if (i<5) {
          document.getElementById(`slot-${i}`).value = name;
          document.getElementById(`slot-qty-${i}`).value = 1;
        }
      });
      renderPresets();
    });
  });
}

// ---------- Planner + autocomplete ----------
function preserveDraft() {
  const count = effectivePlannerSlotCount();
  return Array.from({length:count}, (_,i)=>({
    name: document.getElementById(`slot-${i}`)?.value || "",
    qty: Number(document.getElementById(`slot-qty-${i}`)?.value || 1)
  }));
}
function renderSelectors(preserve = []) {
  applyFoodFilter();
  const count = selectedSlotCount();
  els.selectors.innerHTML = "";
  const slotPrompt = document.getElementById('slotPrompt');
  if (!count) {
    if (slotPrompt) slotPrompt.classList.remove('hidden');
    return;
  }
  if (slotPrompt) slotPrompt.classList.add('hidden');
  for (let i=0;i<count;i++) {
    const entry = preserve[i] || {name:"", qty:1};
    els.selectors.insertAdjacentHTML("beforeend", `
      <div class="slot" id="slot-wrap-${i}">
        <div class="slot-header"><strong>Slot ${i+1}</strong><span>${entry.name ? "Draft selected" : "Empty"}</span></div>
        <div class="slot-controls">
          <div class="slot-input-wrap">
            <input class="wide-input" id="slot-${i}" placeholder="Click or type to browse..." autocomplete="off" value="${(entry.name||'').replace(/"/g,'&quot;')}">
            <div id="auto-${i}" class="auto-list hidden"></div>
          </div>
          <label><span>Craft qty</span><input class="slot-qty-input" type="number" id="slot-qty-${i}" min="1" step="1" value="${entry.qty || 1}"></label>
        </div>
      </div>
    `);
  }
  for (let i=0;i<count;i++) setupAutocomplete(i);
}
function setupAutocomplete(index) {
  const input = document.getElementById(`slot-${index}`);
  const wrap = document.getElementById(`slot-wrap-${index}`);
  const list = document.getElementById(`auto-${index}`);
  let activeIndex = -1;

  function openWith(items) {
    document.querySelectorAll('.slot.open').forEach(el => { if (el !== wrap) el.classList.remove('open'); });
    wrap.classList.add('open');
    state.activeAutocomplete = index;
    list.innerHTML = items.map((food, idx)=>`
      <div class="auto-item ${idx===activeIndex?'active':''}" data-name="${food.name}">
        ${iconMarkup(food.name,'recipes','ingredient-mini')}
        <div class="auto-main">
          <div class="auto-name">${food.name}</div>
          <div class="auto-meta">${food.bench}</div>
        </div>
        <div class="auto-score">
          <div><span class="badge tier-${food.tier || 'D'}">${food.tier || '—'} Tier</span></div>
          <div style="margin-top:6px">Overall ${fmtMaybe(food.computedScores.overall)}</div>
        </div>
      </div>`).join("");
    list.classList.remove('hidden');
    list.querySelectorAll('.auto-item').forEach(el => {
      el.addEventListener('mousedown', ev => {
        ev.preventDefault();
        input.value = el.dataset.name;
        close();
      });
    });
  }
  function close() {
    list.classList.add('hidden');
    wrap.classList.remove('open');
    activeIndex = -1;
    if (state.activeAutocomplete === index) state.activeAutocomplete = null;
  }
  function visibleItems() {
    const term = input.value.trim().toLowerCase();
    let items = state.filteredFoods;
    if (term) items = items.filter(f=>f.name.toLowerCase().includes(term));
    return items.slice(0, 80);
  }
  input.addEventListener('focus', () => { activeIndex = -1; openWith(visibleItems()); });
  input.addEventListener('input', () => { activeIndex = -1; openWith(visibleItems()); });
  input.addEventListener('keydown', (e) => {
    const items = visibleItems();
    if (list.classList.contains('hidden') && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      openWith(items);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(items.length-1, activeIndex+1);
      openWith(items);
      const node = list.querySelectorAll('.auto-item')[activeIndex];
      node?.scrollIntoView({block:'nearest'});
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex-1);
      openWith(items);
      const node = list.querySelectorAll('.auto-item')[activeIndex];
      node?.scrollIntoView({block:'nearest'});
    } else if (e.key === 'Enter') {
      const items = visibleItems();
      if (items.length) {
        e.preventDefault();
        const selected = items[Math.max(0, activeIndex)];
        if (selected) input.value = selected.name;
        close();
      }
    } else if (e.key === 'Escape') close();
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });
}

function getDraftSelection() {
  const draft = [];
  const lookup = new Map(allAdjustedFoods().map(f => [f.name.toLowerCase(), f]));
  const count = effectivePlannerSlotCount();
  for (let i=0;i<count;i++) {
    const input = document.getElementById(`slot-${i}`);
    const qtyInput = document.getElementById(`slot-qty-${i}`);
    const value = (input?.value || "").trim().toLowerCase();
    const exact = lookup.get(value);
    if (!exact) continue;
    draft.push({...exact, craftQty: Math.max(1, Number(qtyInput?.value || 1))});
  }
  return draft;
}

// ---------- Results ----------
function aggregateEffectFoods(selectedFoods) {
  const seenNames = new Set();
  const seenFamilies = new Set();
  const result = [];
  for (const food of selectedFoods) {
    const recipeKey = slugify(food.name);
    if (seenNames.has(recipeKey)) continue;
    const fam = effectFamily(food);
    if (els.strictMode.checked && seenFamilies.has(fam)) continue;
    seenNames.add(recipeKey);
    seenFamilies.add(fam);
    result.push(food);
  }
  return result;
}
function sumBuffs(selectedFoods) {
  const totals = {};
  for (const food of selectedFoods) {
    for (const [label, val] of food.adjustedBuffEntries) {
      if (consumeIgnored(label)) continue;
      totals[label] = (totals[label] || 0) + Number(val || 0);
    }
  }
  return totals;
}
function categorizeBuffLabel(label) {
  if (/Max health|Health regen|Exposure resistance|Cave sickness resist|affliction duration|Food effects duration/i.test(label)) return 'survival';
  if (/Melee damage|Melee attack speed|Return melee damage|Critical damage/i.test(label)) return 'melee';
  if (/Projectile damage|Reload speed|Charge speed|Explosive damage|Critical damage/i.test(label)) return 'ranged';
  if (/Max stamina|Stamina regen|Stamina regen delay|Oxygen consumption|Water consumption|Food consumption|Over-encumbrance penalty|Movement speed|Temperature/i.test(label)) return 'exploration';
  if (/XP gained|Shared XP gained|Tamed creature XP/i.test(label)) return 'xp_support';
  return 'utility';
}
function foodOnConsumeDisplay(total) {
  if (total > 300) return '300+ (maxed)';
  return fmtMaybe(total);
}

function renderCombinedBuffs(activeFoods) {
  const totals = sumBuffs(activeFoods);
  let rows = Object.entries(totals).map(([label, value]) => ({label, value, cat: categorizeBuffLabel(label)}));
  if (els.hideZeroBuffs.checked) rows = rows.filter(r => r.value !== 0);
  if (els.sortBuffs.checked) rows.sort((a,b)=>a.cat.localeCompare(b.cat)||Math.abs(b.value)-Math.abs(a.value)||a.label.localeCompare(b.label));

  const grouped = {};
  CATEGORY_ORDER.forEach(cat=>grouped[cat]=[]);
  rows.forEach(r => grouped[r.cat].push(r));

  els.buffCategoryWrap.innerHTML = CATEGORY_ORDER.map(cat => {
    const list = grouped[cat];
    if (!list.length) return '';
    const tableRows = list.map(row => {
      const valueText = /Food on consume/i.test(row.label) ? foodOnConsumeDisplay(row.value) : fmtMaybe(row.value);
      return `<tr><td>${row.label}</td><td class="number">${valueText}</td></tr>`;
    }).join('');
    return `<section class="buff-category ${CATEGORY_COLORS[cat]}">
      <div class="category-head">
        ${categoryIconMarkup(cat, "category-icon")}
        <div>
          <h3>${CATEGORY_LABELS[cat]}</h3>
          <div class="category-sub">${list.length} active buff${list.length === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Buff</th><th class="number">Total</th></tr></thead><tbody>${tableRows}</tbody></table></div>
    </section>`;
  }).join('');
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
  return [...map.entries()].map(([name, meta]) => ({ name, ...meta })).sort((a,b)=>b.qty-a.qty || a.name.localeCompare(b.name));
}
function renderShopping(selectedFoods) {
  const rows = aggregateIngredients(selectedFoods);
  els.shoppingWrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Ingredient</th><th class="number">Total Qty</th><th>Unit</th><th>Used by</th></tr></thead><tbody>${rows.map(row=>`
  <tr><td><div class="ingredient-cell">${iconMarkup(row.name,'ingredients','ingredient-mini')}<span>${row.name}</span></div></td>
  <td class="number">${fmtMaybe(row.qty)}</td><td>${row.unit || 'item'}</td><td>${[...new Set(row.recipes)].join(', ')}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderSelectedCards(selectedFoods, activeFoods) {
  const activeFamilies = new Set(activeFoods.map(effectFamily));
  els.selectionCards.innerHTML = selectedFoods.map(food => {
    const buffList = food.adjustedBuffEntries.slice(0, 8).map(([label, value])=>`<span class="food-buff">${label}: ${/Food on consume/i.test(label)?foodOnConsumeDisplay(value):fmtMaybe(value)}</span>`).join('');
    const inactive = els.strictMode.checked && !activeFamilies.has(effectFamily(food)) ? `<div class="small-muted">Inactive in strict mode: duplicate effect family.</div>` : '';
    return `<article class="recipe-card">
      <div class="recipe-top">
        ${iconMarkup(food.name,'recipes')}
        <div>
          <div class="recipe-name">${food.name}</div>
          <div class="meta-row">
            <span class="badge tier-${food.tier || 'D'}">${food.tier || '—'} Tier</span>
            <span class="badge">${food.bench}</span>
            <span class="badge">${fmtMaybe(food.duration_s)}s</span>
          </div>
        </div>
      </div>
      <div class="small-muted">Overall ${fmtMaybe(food.computedScores.overall)} • Efficiency ${fmtMaybe(food.computedScores.efficiency)}</div>
      <div class="recipe-qty">Craft quantity: x${fmtMaybe(food.craftQty)}</div>
      <div class="food-buff-list">${buffList}</div>
      ${food.notes ? `<div class="small-muted">${food.notes}</div>` : `<div class="small-muted">Modifier: ${food.modifier || food.name}</div>`}
      ${inactive}
    </article>`;
  }).join('');
  const duplicates = {};
  selectedFoods.forEach(food => {
    const fam = effectFamily(food);
    duplicates[fam] ||= [];
    duplicates[fam].push(food.name);
  });
  const duplicateEntries = Object.entries(duplicates).filter(([,list])=>list.length > 1);
  if (els.strictMode.checked && duplicateEntries.length) {
    els.buffWarning.hidden = false;
    els.buffWarning.innerHTML = `<strong>Strict mode:</strong> repeated effect families do not stack. Duplicate groups: ${duplicateEntries.map(([,list])=>list.join(' / ')).join(' • ')}`;
  } else {
    els.buffWarning.hidden = true;
  }
}

function renderScores(activeFoods) {
  const totals = {survival:0, melee:0, ranged:0, exploration:0, xp_support:0, utility:0, overall:0, efficiency:0};
  activeFoods.forEach(food => {
    for (const key of Object.keys(totals)) totals[key] += Number(food.computedScores[key] || 0);
  });
  els.scoreCards.innerHTML = ["survival","melee","ranged","exploration","xp_support","utility","overall","efficiency"].map(key=>`
    <article class="score-card ${key}">
      <div class="score-top">
        ${categoryIconMarkup(key, "score-icon")}
        <div class="score-name">${CATEGORY_LABELS[key]}</div>
      </div>
      <div class="score-value">${fmtMaybe(totals[key])}</div>
    </article>`).join('');
  const topTwo = Object.entries(totals).filter(([k])=>!['overall','efficiency'].includes(k)).sort((a,b)=>b[1]-a[1]).slice(0,2);
  const benchCounts = activeFoods.reduce((acc,f)=>{acc[f.bench]=(acc[f.bench]||0)+1; return acc;},{});
  const topBench = Object.entries(benchCounts).sort((a,b)=>b[1]-a[1])[0];
  els.buildInsights.innerHTML = `
    <div class="insight"><strong>Primary archetype:</strong> ${CATEGORY_LABELS[topTwo[0][0]]} (${fmtMaybe(topTwo[0][1])})</div>
    <div class="insight"><strong>Secondary strength:</strong> ${CATEGORY_LABELS[topTwo[1][0]]} (${fmtMaybe(topTwo[1][1])})</div>
    <div class="insight"><strong>Bench profile:</strong> ${topBench ? `${topBench[0]} heavy` : 'Mixed'} • ${activeFoods.length} active effects</div>
    <div class="insight"><strong>Scoring basis:</strong> ${currentSettingsLabel()}</div>`;
}
function clearResultsOnly() {
  els.resultsArea.classList.add('hidden');
  els.selectionCards.innerHTML = '';
  els.buffWarning.hidden = true;
  els.buffCategoryWrap.innerHTML = '';
  els.scoreCards.innerHTML = '';
  els.buildInsights.innerHTML = '';
  els.shoppingWrap.innerHTML = '';
  state.calculated = false;
  state.calculatedFoods = [];
}

function calculateAll() {
  const selectedFoods = getDraftSelection();
  if (!selectedFoods.length) { clearResultsOnly(); return; }
  const activeFoods = aggregateEffectFoods(selectedFoods);
  state.calculated = true;
  state.calculatedFoods = selectedFoods;
  els.resultsArea.classList.remove('hidden');
  renderSelectedCards(selectedFoods, activeFoods);
  renderCombinedBuffs(activeFoods);
  renderScores(activeFoods);
  renderShopping(selectedFoods);
  document.getElementById('selectedFoodsPanel')?.scrollIntoView({behavior:'smooth', block:'start'});
}

// ---------- KPIs / rankings ----------
function renderKPIs() {
  const foods = allAdjustedFoods();
  const topOverall = [...foods].sort((a,b)=>b.computedScores.overall - a.computedScores.overall)[0];
  const kpis = [
    { label:"Total recipes", value: fmtNumber(state.data.meta.total_recipes), sub:"Complete dataset loaded" },
    { label:"Ingredient rows", value: fmtNumber(state.data.meta.total_ingredient_rows), sub:"Shopping list ready" },
    { label:"Best overall", value: topOverall?.name || "—", sub: topOverall ? `${fmtMaybe(topOverall.computedScores.overall)} • ${topOverall.bench}` : "" },
    { label:"Smoker recipes", value: fmtNumber(state.data.meta.benches?.Smoker || 0), sub: isCarnivoreOn() ? "Carnivore ON" : "Carnivore OFF" }
  ];
  els.kpiGrid.innerHTML = kpis.map(k=>`<article class="kpi"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub">${k.sub}</div></article>`).join('');
}

function rankValue(food, key) {
  if (key === 'name') return food.name;
  if (key === 'bench') return food.bench;
  if (key === 'tier') return food.tier || '';
  return food.computedScores?.[key] ?? 0;
}
function sortRankRows(rows) {
  const key = state.rankSortKey || 'overall';
  const dir = state.rankSortDir || 'desc';
  return rows.sort((a,b) => {
    const va = rankValue(a, key);
    const vb = rankValue(b, key);
    let cmp = 0;
    if (typeof va === 'string' || typeof vb === 'string') cmp = String(va).localeCompare(String(vb));
    else cmp = Number(va) - Number(vb);
    if (cmp === 0) cmp = a.name.localeCompare(b.name);
    return dir === 'asc' ? cmp : -cmp;
  });
}
function rankHeader(label, key, numeric=false) {
  const active = state.rankSortKey === key;
  const arrow = active ? (state.rankSortDir === 'asc' ? ' ▲' : ' ▼') : '';
  return `<th class="${numeric ? 'number' : ''}"><button class="rank-sort-btn ${active ? 'active' : ''}" data-sort="${key}">${label}${arrow}</button></th>`;
}
function renderRankings() {
  const limit = Number(els.rankingLimit.value || 20);
  const rows = sortRankRows([...allAdjustedFoods()]).slice(0, limit);
  els.rankingsWrap.innerHTML = `<div class="table-wrap rankings-table"><table><thead><tr>
    ${rankHeader('#','rank',true)}
    ${rankHeader('Recipe','name')}
    ${rankHeader('Bench','bench')}
    ${rankHeader('Tier','tier')}
    ${rankHeader('Overall','overall',true)}
    ${rankHeader('Efficiency','efficiency',true)}
    ${rankHeader('Survival','survival',true)}
    ${rankHeader('Melee','melee',true)}
    ${rankHeader('Ranged','ranged',true)}
    ${rankHeader('Exploration','exploration',true)}
  </tr></thead><tbody>${rows.map((food, idx)=>`
    <tr><td class="rank-cell">${idx+1}</td>
    <td><div class="recipe-cell">${iconMarkup(food.name,'recipes','ingredient-mini')}<span>${food.name}</span></div></td>
    <td>${food.bench}</td>
    <td><span class="badge tier-${food.tier || 'D'}">${food.tier || '—'}</span></td>
    <td class="number">${fmtMaybe(food.computedScores.overall)}</td>
    <td class="number">${fmtMaybe(food.computedScores.efficiency)}</td>
    <td class="number">${fmtMaybe(food.computedScores.survival)}</td>
    <td class="number">${fmtMaybe(food.computedScores.melee)}</td>
    <td class="number">${fmtMaybe(food.computedScores.ranged)}</td>
    <td class="number">${fmtMaybe(food.computedScores.exploration)}</td>
    </tr>`).join('')}</tbody></table></div>`;
  els.rankingsWrap.querySelectorAll('.rank-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      if (key === 'rank') {
        state.rankSortKey = 'overall';
        state.rankSortDir = 'desc';
      } else if (state.rankSortKey === key) {
        state.rankSortDir = state.rankSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.rankSortKey = key;
        state.rankSortDir = ['name','bench','tier'].includes(key) ? 'asc' : 'desc';
      }
      renderRankings();
    });
  });
}

// ---------- Generator ----------
function buildStyleMeta(style, archLabel) {
  if (style === 'budget') return {title:`Budget ${archLabel} Build`, subtitle:"Accessible early-game option with simpler ingredients and benches."};
  if (style === 'practical') return {title:`Practical ${archLabel} Build`, subtitle:"Balanced mid-game option with stronger output and manageable complexity."};
  return {title:`Premium ${archLabel} Build`, subtitle:"Best endgame-focused option prioritizing performance over cost."};
}
function candidatePool(foods, style) {
  if (style === 'budget') return foods.filter(f => (f.ingredient_count || 0) <= 4 || ['C','D','B'].includes(f.tier));
  if (style === 'practical') return foods.filter(f => (f.ingredient_count || 0) <= 6);
  return foods;
}
function styleScore(food, archetype, style) {
  const target = targetScore(food, archetype);
  const complexity = Number(food.ingredient_count || 1);
  if (style === 'budget') return target * 0.8 + food.computedScores.efficiency * 18 - complexity * 14 - benchOrder(food.bench) * 8;
  if (style === 'practical') return target + food.computedScores.efficiency * 10 - complexity * 5 - benchOrder(food.bench) * 2;
  return target * 1.15 + food.computedScores.overall * 0.18 - complexity * 1.5;
}
function generateBuild(style, archetype, priorBuilds=[]) {
  const slotCap = Math.max(1, selectedSlotCount() || 5);
  const foods = candidatePool(allAdjustedFoods(), style);
  const previousNames = new Set(priorBuilds.flat().map(f=>f.name));
  const previousFamilies = new Set(priorBuilds.flat().map(effectFamily));
  const sorted = [...foods].sort((a,b)=>styleScore(b, archetype, style)-styleScore(a, archetype, style));
  const build = [];
  const usedFamilies = new Set();
  const usedNames = new Set();

  for (const food of sorted) {
    const fam = effectFamily(food);
    if (usedFamilies.has(fam) || usedNames.has(food.name)) continue;
    const shouldAvoid = previousFamilies.has(fam) || previousNames.has(food.name);
    if (shouldAvoid) continue;
    build.push(food); usedFamilies.add(fam); usedNames.add(food.name);
    if (build.length === slotCap) break;
  }
  for (const food of sorted) {
    const fam = effectFamily(food);
    if (usedFamilies.has(fam) || usedNames.has(food.name)) continue;
    build.push(food); usedFamilies.add(fam); usedNames.add(food.name);
    if (build.length === slotCap) break;
  }
  return build.slice(0, slotCap);
}
function buildSummaryMetrics(build) {
  const total = {survival:0, melee:0, ranged:0, overall:0};
  build.forEach(f => {
    total.survival += f.computedScores.survival;
    total.melee += f.computedScores.melee;
    total.ranged += f.computedScores.ranged;
    total.overall += f.computedScores.overall;
  });
  return total;
}
function renderGenerator() {
  const archetype = els.generatorArchetype.value;
  const slotCap = selectedSlotCount();
  if (!slotCap) {
    els.generatorWrap.innerHTML = `<div class="empty big-empty">Choose your stomach-slot count first to unlock suggested builds.</div>`;
    return;
  }
  if (!archetype) {
    els.generatorWrap.innerHTML = `<div class="empty big-empty">Choose an archetype first to generate suggested builds.</div>`;
    return;
  }
  const archLabel = archetypeLabel(archetype);
  const budget = generateBuild('budget', archetype, []);
  const practical = generateBuild('practical', archetype, [budget]);
  const premium = generateBuild('premium', archetype, [budget, practical]);
  const builds = [
    {style:'budget', foods: budget},
    {style:'practical', foods: practical},
    {style:'premium', foods: premium},
  ];
  els.generatorWrap.innerHTML = builds.map((item, idx) => {
    const meta = buildStyleMeta(item.style, archLabel);
    item.foods = item.foods.slice(0, slotCap);
    const metrics = buildSummaryMetrics(item.foods);
    return `<article class="build-card">
      <div class="build-title">${meta.title}</div>
      <div class="build-subtitle">${meta.subtitle}</div>
      <div class="build-badges">
        <span class="build-badge">${item.style === 'budget' ? 'Early game / lower cost' : item.style === 'practical' ? 'Mid game / balanced' : 'Endgame / best possible'}</span>
        <span class="build-badge">${slotCap} slots</span><span class="build-badge">Overall ${fmtMaybe(metrics.overall)}</span>
      </div>
      <div class="build-foods">${item.foods.slice(0, slotCap).map(food => `<div class="build-food-chip">${iconMarkup(food.name,'recipes','ingredient-mini')}<span>${food.name}</span></div>`).join('')}</div>
      <div class="build-metrics">
        <div class="build-metric"><div class="build-metric-label">Survival</div><div class="build-metric-value">${fmtMaybe(metrics.survival)}</div></div>
        <div class="build-metric"><div class="build-metric-label">Melee</div><div class="build-metric-value">${fmtMaybe(metrics.melee)}</div></div>
        <div class="build-metric"><div class="build-metric-label">Ranged</div><div class="build-metric-value">${fmtMaybe(metrics.ranged)}</div></div>
      </div>
      <div class="small-muted">Use this build, then set craft quantities in the planner before calculating the final shopping list.</div>
      <button class="use-build-btn" data-build="${idx}">Use this build</button>
    </article>`;
  }).join('');
  els.generatorWrap.querySelectorAll('.use-build-btn').forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      clearPlanner(false);
      builds[idx].foods.slice(0, selectedSlotCount() || 5).forEach((food, i) => {
        document.getElementById(`slot-${i}`).value = food.name;
        document.getElementById(`slot-qty-${i}`).value = 1;
      });
      window.scrollTo({top: document.getElementById('plannerPanel').offsetTop - 20, behavior:'smooth'});
    });
  });
}

// ---------- Export helpers ----------
function buildSummaryText(selectedFoods) {
  const activeFoods = aggregateEffectFoods(selectedFoods);
  return [
    `Icarus Food Calculator — Build Summary`,
    `Created by fernandobacate`,
    `Settings: ${currentSettingsLabel()}`,
    "",
    ...selectedFoods.map((food, idx) => `${idx+1}. ${food.name} x${fmtMaybe(food.craftQty)} — ${food.bench}`),
    "",
    `Active effects counted: ${activeFoods.length}`,
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
async function copyText(text, onDone) {
  try {
    await navigator.clipboard.writeText(text);
    onDone?.();
  } catch {
    alert(text);
  }
}
function encodeBuildState() {
  const selected = preserveDraft().filter(x => x.name);
  const payload = {
    c: els.carnivoreToggle.value,
    s: els.strictMode.checked ? 1 : 0,
    i: els.ignoreConsumeStats.checked ? 1 : 0,
    slots: selectedSlotCount(),
    foods: selected
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}
function decodeBuildState(str) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(str))));
  } catch { return null; }
}
function applyBuildState(payload) {
  if (!payload) return;
  if (payload.c) els.carnivoreToggle.value = payload.c;
  if (payload.slots) els.stomachSlots.value = String(payload.slots);
  els.strictMode.checked = !!payload.s;
  els.ignoreConsumeStats.checked = !!payload.i;
  clearPlanner(false);
  (payload.foods || []).slice(0, selectedSlotCount() || 5).forEach((item, i) => {
    document.getElementById(`slot-${i}`).value = item.name || "";
    document.getElementById(`slot-qty-${i}`).value = item.qty || 1;
  });
}
async function loadImageSafe(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
function roundRect(ctx, x, y, w, h, r=18) {
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}
function fillRoundRect(ctx, x, y, w, h, r, fill, stroke=null) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function drawText(ctx, text, x, y, options={}) {
  ctx.fillStyle = options.color || '#f3f6fb';
  ctx.font = options.font || '24px Inter, Arial, sans-serif';
  ctx.textBaseline = options.baseline || 'alphabetic';
  ctx.fillText(text, x, y);
}
function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, options={}) {
  const lines = wrapLines(ctx, text, maxWidth);
  lines.forEach((line, i) => drawText(ctx, line, x, y + i*lineHeight, options));
  return y + lines.length*lineHeight;
}
function drawChip(ctx, text, x, y, bg='rgba(255,255,255,.06)', fg='#dfe4ea', border='rgba(255,255,255,.10)') {
  ctx.font = '20px Inter, Arial, sans-serif';
  const padX = 14, h = 36;
  const w = ctx.measureText(text).width + padX*2;
  fillRoundRect(ctx, x, y, w, h, 18, bg, border);
  drawText(ctx, text, x+padX, y+24, {font:'20px Inter, Arial, sans-serif', color:fg});
  return w;
}
function categoryAccent(cat) {
  return {
    survival:'#4dd29b',
    melee:'#ff9f80',
    ranged:'#7bc4ff',
    exploration:'#d3c17a',
    xp_support:'#d497ff',
    utility:'#c1cad9',
  }[cat] || '#dfe4ea';
}
async function drawIconOrFallback(ctx, name, type, x, y, size=38) {
  const slug = slugify(name);
  const img = await loadImageSafe(`assets/${type}/${slug}.png`);
  if (img) {
    fillRoundRect(ctx, x, y, size, size, 10, 'rgba(255,255,255,.04)', 'rgba(255,255,255,.08)');
    ctx.save();
    roundRect(ctx, x, y, size, size, 10);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } else {
    fillRoundRect(ctx, x, y, size, size, 10, 'rgba(199,155,57,.14)', 'rgba(199,155,57,.24)');
    drawText(ctx, initials(name), x+size/2-10, y+24, {font:'bold 18px Inter, Arial, sans-serif', color:'#f2ddb0'});
  }
}
async function drawCategoryIconOrFallback(ctx, cat, x, y, size=34) {
  const img = await loadImageSafe(`assets/categories/${cat}.png`);
  const fallback = CATEGORY_ICONS[cat] || '•';
  fillRoundRect(ctx, x, y, size, size, 10, 'rgba(255,255,255,.05)', 'rgba(255,255,255,.08)');
  if (img) {
    ctx.save();
    roundRect(ctx, x, y, size, size, 10);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } else {
    drawText(ctx, fallback, x + 9, y + 23, {font:'20px Inter, Arial, sans-serif', color:'#f2ddb0'});
  }
}
async function exportBuildAsPng() {
  if (!state.calculatedFoods.length) { alert("Calculate a build first."); return; }
  const selectedFoods = state.calculatedFoods;
  const activeFoods = aggregateEffectFoods(selectedFoods);
  const shopping = aggregateIngredients(selectedFoods).slice(0, 16);
  const buffTotals = sumBuffs(activeFoods);
  const categorized = {};
  CATEGORY_ORDER.forEach(cat => categorized[cat] = []);
  Object.entries(buffTotals).forEach(([label, value]) => {
    const cat = categorizeBuffLabel(label);
    if (!categorized[cat]) categorized[cat] = [];
    categorized[cat].push({label, value});
  });
  const metrics = activeFoods.reduce((acc, food) => {
    Object.entries(food.computedScores || {}).forEach(([k,v]) => { acc[k] = (acc[k] || 0) + Number(v || 0); });
    return acc;
  }, {survival:0, melee:0, ranged:0, exploration:0, xp_support:0, utility:0, overall:0, efficiency:0});

  const canvas = document.createElement('canvas');
  canvas.width = 1800; canvas.height = 1600;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  const bgImg = await loadImageSafe('assets/bg/page-bg.jpg');
  if (bgImg) {
    ctx.globalAlpha = 0.22;
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = 'rgba(7,9,15,.84)';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // Hero card
  fillRoundRect(ctx, 40, 36, 1720, 180, 28, 'rgba(20,24,34,.92)', 'rgba(199,155,57,.25)');
  const heroImg = await loadImageSafe('assets/bg/hero.png');
  if (heroImg) {
    ctx.save();
    roundRect(ctx, 40, 36, 1720, 180, 28);
    ctx.clip();
    ctx.globalAlpha = 0.32;
    ctx.drawImage(heroImg, 40, 36, 1720, 180);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  drawText(ctx, 'ICARUS • COMMUNITY TOOL', 70, 72, {font:'bold 18px Inter, Arial, sans-serif', color:'#c79b39'});
  drawText(ctx, 'Icarus Food Calculator — Build Snapshot', 70, 126, {font:'bold 54px Inter, Arial, sans-serif'});
  drawText(ctx, currentSettingsLabel(), 70, 170, {font:'22px Inter, Arial, sans-serif', color:'#e0c480'});
  drawText(ctx, `Stomach slots: ${selectedSlotCount() || selectedFoods.length} • Active effects: ${activeFoods.length}`, 70, 198, {font:'18px Inter, Arial, sans-serif', color:'#dfe4ea'});

  // Left column build
  fillRoundRect(ctx, 40, 250, 860, 1310, 24, 'rgba(20,24,34,.88)', 'rgba(43,51,72,.9)');
  drawText(ctx, 'Selected Recipes', 70, 300, {font:'bold 40px Inter, Arial, sans-serif'});
  drawText(ctx, `${activeFoods.length} active effects • ${selectedFoods.length} crafted selections`, 70, 336, {font:'22px Inter, Arial, sans-serif', color:'#aab3c4'});
  let y = 380;
  for (let i=0; i<selectedFoods.length; i++) {
    const food = selectedFoods[i];
    fillRoundRect(ctx, 65, y, 810, 82, 18, 'rgba(255,255,255,.03)', 'rgba(255,255,255,.08)');
    await drawIconOrFallback(ctx, food.name, 'recipes', 82, y+20, 42);
    drawText(ctx, `${i+1}. ${food.name}`, 138, y+36, {font:'bold 28px Inter, Arial, sans-serif'});
    drawText(ctx, `${food.bench} • x${food.craftQty} craft`, 138, y+64, {font:'20px Inter, Arial, sans-serif', color:'#aab3c4'});
    const fam = effectFamily(food);
    const active = activeFoods.find(f=>effectFamily(f)===fam && f.name===food.name);
    const note = active ? 'Active effect' : 'Strict-mode refresh / duplicate';
    drawText(ctx, note, 650, y+50, {font:'18px Inter, Arial, sans-serif', color: active ? '#54d69a' : '#ffb5b5'});
    y += 96;
    if (y > 820) break;
  }

  // Build score
  fillRoundRect(ctx, 65, 860, 810, 220, 20, 'rgba(255,255,255,.025)', 'rgba(255,255,255,.08)');
  drawText(ctx, 'Build Score Snapshot', 88, 905, {font:'bold 34px Inter, Arial, sans-serif'});
  const scoreBoxes = [
    ['survival','Survival', metrics.survival], ['melee','Melee', metrics.melee], ['ranged','Ranged', metrics.ranged],
    ['exploration','Exploration', metrics.exploration], ['xp_support','XP / Support', metrics.xp_support], ['utility','Utility', metrics.utility],
    ['overall','Overall', metrics.overall], ['efficiency','Efficiency', metrics.efficiency]
  ];
  let sx=88, sy=935;
  scoreBoxes.forEach(async (item, idx) => {
    const bw=180, bh=58;
    fillRoundRect(ctx, sx, sy, bw, bh, 16, 'rgba(20,24,34,.94)', 'rgba(43,51,72,.9)');
    await drawCategoryIconOrFallback(ctx, item[0], sx+12, sy+12, 28);
    drawText(ctx, item[1], sx+48, sy+22, {font:'18px Inter, Arial, sans-serif', color:'#aab3c4'});
    drawText(ctx, fmtMaybe(item[2]), sx+14, sy+48, {font:'bold 28px Inter, Arial, sans-serif'});
    sx += bw + 12;
    if ((idx+1)%4===0) { sx=88; sy += bh + 12; }
  });

  // Shopping list
  fillRoundRect(ctx, 65, 1105, 810, 430, 20, 'rgba(255,255,255,.025)', 'rgba(255,255,255,.08)');
  drawText(ctx, 'Shopping List', 88, 1148, {font:'bold 34px Inter, Arial, sans-serif'});
  let iy = 1188;
  for (const row of shopping) {
    await drawIconOrFallback(ctx, row.name, 'ingredients', 88, iy-10, 34);
    drawText(ctx, row.name, 134, iy+13, {font:'24px Inter, Arial, sans-serif'});
    drawText(ctx, `${fmtMaybe(row.qty)} ${row.unit || 'item'}`, 660, iy+13, {font:'24px Inter, Arial, sans-serif', color:'#f0ddb0'});
    iy += 44;
    if (iy > 1510) break;
  }

  // Right column buffs
  fillRoundRect(ctx, 930, 250, 830, 1310, 24, 'rgba(20,24,34,.88)', 'rgba(43,51,72,.9)');
  drawText(ctx, 'Combined Buffs', 960, 300, {font:'bold 40px Inter, Arial, sans-serif'});
  drawText(ctx, 'Grouped by gameplay category for faster reading.', 960, 336, {font:'22px Inter, Arial, sans-serif', color:'#aab3c4'});

  let cy = 380;
  for (const cat of CATEGORY_ORDER) {
    const list = (categorized[cat] || []).filter(r => !(els.hideZeroBuffs.checked && Number(r.value)===0));
    if (!list.length) continue;
    fillRoundRect(ctx, 955, cy, 780, 150, 18, 'rgba(255,255,255,.025)', 'rgba(255,255,255,.08)');
    await drawCategoryIconOrFallback(ctx, cat, 978, cy+8, 30);
    drawText(ctx, CATEGORY_LABELS[cat], 1018, cy+34, {font:'bold 28px Inter, Arial, sans-serif', color:categoryAccent(cat)});
    let chipX = 978, chipY = cy+54;
    for (const row of list.slice(0, 6)) {
      const valText = /Food on consume/i.test(row.label) ? foodOnConsumeDisplay(row.value) : fmtMaybe(row.value);
      const w = drawChip(ctx, `${row.label}: ${valText}`, chipX, chipY, 'rgba(255,255,255,.04)', '#dfe4ea', 'rgba(255,255,255,.08)');
      chipX += w + 8;
      if (chipX > 1600) { chipX = 978; chipY += 46; }
    }
    cy += 166;
    if (cy > 1380) break;
  }

  drawText(ctx, 'Created with Icarus Food Calculator • fernandobacate', 1110, 1532, {font:'20px Inter, Arial, sans-serif', color:'#aab3c4'});

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = 'icarus-build.png';
  link.click();
}

// ---------- Clear / random / init ----------
// ---------- Clear / random / init ----------
function clearPlanner(clearPreset=true) {
  if (clearPreset) state.currentPreset = null;
  renderPresets();
  renderSelectors(Array.from({length:selectedSlotCount()||0},()=>({name:"", qty:1})));
  clearResultsOnly();
}
function fillRandomBuild() {
  const pool = [...allAdjustedFoods()].sort((a,b)=>b.computedScores.overall-a.computedScores.overall).slice(0, 30);
  const picked = [];
  const used = new Set();
  for (const food of pool.sort(()=>Math.random()-0.5)) {
    const fam = effectFamily(food);
    if (used.has(fam)) continue;
    picked.push(food); used.add(fam);
    if (picked.length === (selectedSlotCount() || 5)) break;
  }
  clearPlanner(false);
  picked.forEach((food,i)=> {
    document.getElementById(`slot-${i}`).value = food.name;
    document.getElementById(`slot-qty-${i}`).value = 1;
  });
}
function refreshDataViews() {
  renderKPIs();
  renderPresets();
  renderSelectors(preserveDraft());
  renderRankings();
  renderGenerator();
  if (state.calculated) calculateAll();
}
async function loadFoods() {
  const response = await fetch('./foods.json');
  state.data = await response.json();
  state.foods = state.data.foods;
  renderFilters();
  renderKPIs();
  renderPresets();
  renderSelectors(Array.from({length:selectedSlotCount()||0},()=>({name:"", qty:1})));
  renderRankings();
  renderGenerator();
  clearResultsOnly();
  els.footerMeta.textContent = `${fmtNumber(state.data.meta.total_recipes)} recipes • ${fmtNumber(state.data.meta.total_ingredient_rows)} ingredient rows • archetype-aware planner`;

  const params = new URLSearchParams(location.search);
  const build = params.get('build');
  if (build) {
    const decoded = decodeBuildState(build);
    if (decoded) {
      applyBuildState(decoded);
      calculateAll();
    }
  }
}

els.benchFilter.addEventListener('change', () => renderSelectors(preserveDraft()));
els.sortFoods.addEventListener('change', () => renderSelectors(preserveDraft()));
els.rankingLimit.addEventListener('change', renderRankings);
els.hideZeroBuffs.addEventListener('change', () => state.calculated && calculateAll());
els.sortBuffs.addEventListener('change', () => state.calculated && calculateAll());
els.stomachSlots.addEventListener('change', () => { clearPlanner(false); renderGenerator(); renderPresets(); });
els.carnivoreToggle.addEventListener('change', refreshDataViews);
els.ignoreConsumeStats.addEventListener('change', refreshDataViews);
els.strictMode.addEventListener('change', () => state.calculated && calculateAll());
els.calculateBtn.addEventListener('click', calculateAll);
els.clearBtn.addEventListener('click', () => clearPlanner(true));
els.randomBuildBtn.addEventListener('click', fillRandomBuild);
els.copySummaryBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  copyText(buildSummaryText(state.calculatedFoods), () => {
    const old = els.copySummaryBtn.textContent; els.copySummaryBtn.textContent = 'Summary copied'; setTimeout(()=>els.copySummaryBtn.textContent = old, 1400);
  });
});
els.copyShoppingBtn.addEventListener('click', () => {
  if (!state.calculatedFoods.length) return alert('Calculate a build first.');
  copyText(shoppingText(state.calculatedFoods), () => {
    const old = els.copyShoppingBtn.textContent; els.copyShoppingBtn.textContent = 'Shopping copied'; setTimeout(()=>els.copyShoppingBtn.textContent = old, 1400);
  });
});
els.copyLinkBtn.addEventListener('click', () => {
  const build = encodeBuildState();
  const url = `${location.origin}${location.pathname}?build=${encodeURIComponent(build)}`;
  copyText(url, () => {
    const old = els.copyLinkBtn.textContent; els.copyLinkBtn.textContent = 'Link copied'; setTimeout(()=>els.copyLinkBtn.textContent = old, 1400);
  });
});
els.exportPngBtn.addEventListener('click', exportBuildAsPng);
els.generatorArchetype.addEventListener('change', renderGenerator);

loadFoods();