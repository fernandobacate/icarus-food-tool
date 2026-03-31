# Icarus Food Calculator — V8

Static GitHub Pages tool for the Icarus community.

## Main changes in V8
- Carnivore toggle (Smoker foods get +30% buff values when enabled)
- Strict in-game mode based on effect family / modifier uniqueness
- Combat split into **Melee** and **Ranged**
- Custom autocomplete that opens on click and filters while typing
- Shareable build links
- Downloadable build summary and shopping list
- Export build as PNG
- Transparent scoring notes in the UI

## Asset folders

### Backgrounds
- `assets/bg/hero.png`
- `assets/bg/page-bg.jpg`

### Recipe icons
Put PNG files in:
- `assets/recipes/`

Example:
- `assets/recipes/chocolate-cake.png`

### Ingredient icons
Put PNG files in:
- `assets/ingredients/`

Example:
- `assets/ingredients/sugar-cubes.png`

## Naming rule
Use slug-style filenames:
- `Chocolate Cake` → `chocolate-cake.png`
- `Sugar Cubes` → `sugar-cubes.png`

## Recommended image sizes
- Hero banner: **1920x720**
- Page background: **1920x1080**
- Icons: **128x128 PNG** with transparent background

## Notes
Scoring remains heuristic, but it is now more transparent and easier to interrogate than the earlier black-box version.
