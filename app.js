const selectorsDiv = document.getElementById("selectors");
const buffsDiv = document.getElementById("buffs");
const shoppingDiv = document.getElementById("shopping");
const calcBtn = document.getElementById("calcBtn");
const clearBtn = document.getElementById("clearBtn");

let foods = [];

async function loadFoods() {
  const res = await fetch("./foods.json");
  foods = await res.json();
  buildSelectors();
}

function buildSelectors() {
  selectorsDiv.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    const sel = document.createElement("select");
    sel.id = `food-${i}`;
    sel.innerHTML = `<option value="">-- choose food --</option>` +
      foods.map(f => `<option value="${f.name}">${f.name}</option>`).join("");
    selectorsDiv.appendChild(sel);
  }
}

function calculate() {
  const selectedNames = [];
  for (let i = 0; i < 5; i++) {
    const val = document.getElementById(`food-${i}`).value;
    if (val) selectedNames.push(val);
  }

  const selectedFoods = selectedNames
    .map(name => foods.find(f => f.name === name))
    .filter(Boolean);

  const totals = {};
  const ingredients = {};

  for (const food of selectedFoods) {
    for (const [key, value] of Object.entries(food.buffs || {})) {
      totals[key] = (totals[key] || 0) + value;
    }

    for (const ing of food.ingredients || []) {
      ingredients[ing.name] = (ingredients[ing.name] || 0) + ing.qty;
    }
  }

  renderBuffs(totals);
  renderShopping(ingredients);
}

function renderBuffs(totals) {
  const entries = Object.entries(totals);
  if (!entries.length) {
    buffsDiv.innerHTML = "<p>No foods selected.</p>";
    return;
  }

  buffsDiv.innerHTML = `
    <table>
      <thead><tr><th>Buff</th><th>Total</th></tr></thead>
      <tbody>
        ${entries.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderShopping(ingredients) {
  const entries = Object.entries(ingredients);
  if (!entries.length) {
    shoppingDiv.innerHTML = "<p>No ingredients to show.</p>";
    return;
  }

  shoppingDiv.innerHTML = `
    <table>
      <thead><tr><th>Ingredient</th><th>Total Qty</th></tr></thead>
      <tbody>
        ${entries.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function clearAll() {
  for (let i = 0; i < 5; i++) {
    document.getElementById(`food-${i}`).value = "";
  }
  buffsDiv.innerHTML = "";
  shoppingDiv.innerHTML = "";
}

calcBtn.addEventListener("click", calculate);
clearBtn.addEventListener("click", clearAll);

loadFoods();
