
const foods = [
{name:"Chocolate Cake", bench:"Electric Stove", modifier:"health", buffs:{health:100}},
{name:"Stringy Jerky", bench:"Smoker", modifier:"melee", buffs:{melee:15}},
{name:"Cooked Meat", bench:"Campfire", modifier:"health", buffs:{health:50}}
];

let selected = [];

const search = document.getElementById("search");
const dropdown = document.getElementById("dropdown");
const selectedDiv = document.getElementById("selected");
const results = document.getElementById("results");

search.addEventListener("focus", renderDropdown);
search.addEventListener("input", filterDropdown);

function renderDropdown(){
dropdown.innerHTML = foods.map(f=>`<div>${f.name}</div>`).join("");
dropdown.classList.remove("hidden");
}

function filterDropdown(){
const term = search.value.toLowerCase();
const list = foods.filter(f=>f.name.toLowerCase().includes(term));
dropdown.innerHTML = list.map(f=>`<div>${f.name}</div>`).join("");
dropdown.classList.remove("hidden");
}

dropdown.onclick = e=>{
if(e.target.tagName==="DIV"){
const food = foods.find(f=>f.name===e.target.innerText);
selected.push(food);
dropdown.classList.add("hidden");
renderSelected();
calculate();
}
}

function renderSelected(){
selectedDiv.innerHTML = selected.map(f=>`<div>${f.name}</div>`).join("");
}

function calculate(){
const carnivore = document.getElementById("carnivore").value==="on";
const strict = document.getElementById("strict").checked;

let applied = {};
let total = {health:0, melee:0};

selected.forEach(f=>{
if(strict && applied[f.modifier]) return;
applied[f.modifier] = true;

let buffs = {...f.buffs};

if(carnivore && f.bench==="Smoker"){
for(let k in buffs) buffs[k]*=1.3;
}

for(let k in buffs){
total[k] = (total[k]||0)+buffs[k];
}
});

results.innerHTML = "<h3>Result</h3><pre>"+JSON.stringify(total,null,2)+"</pre>";
}
