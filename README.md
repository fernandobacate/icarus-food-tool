# Icarus Food Calculator V27

Static GitHub Pages tool for the Icarus community.

## Included features
- empty planner on first load
- local autocomplete per slot
- archetype-based build generator
- three distinct build suggestions per archetype:
  - Budget / early game
  - Practical / mid game
  - Premium / endgame
- stomach-slot selector (3, 4, 5, or 6)
- Carnivore toggle
- Cullinex Backpack toggle
- strict in-game mode
- grouped combined buffs
- shopping list
- shareable build links
- PNG export

## V27 notes
- Added Cullinex Backpack support. When enabled, cooked-food modifiers gain +25% effectiveness and recipe duration is increased by +25% for supported cooked foods.
- Quick presets now respect the current stomach-slot count.
- Share links preserve the Cullinex state as well.
- Offensive build generation now enforces core archetype foods more aggressively.
- Premium builds no longer sacrifice top archetype-defining foods just to stay visually different from Budget/Practical builds.
- Ranged and Melee generator weights now favor signature damage stats more heavily.

## Assets
Place your images here:

- `assets/bg/hero.png`
- `assets/bg/page-bg.jpg`
- `assets/recipes/*.png`
- `assets/ingredients/*.png`

Recommended icon size: `128x128` PNG with transparent background.
Recommended hero size: `1920x720`
Recommended page background size: `1920x1080`

## Optional category icon support
Drop PNG files into `assets/categories/` using these names:
- `survival.png`
- `melee.png`
- `ranged.png`
- `exploration.png`
- `xp_support.png`
- `utility.png`
- `overall.png`
- `efficiency.png`

Recommended size: 64x64 PNG with transparent background.

- Archetype build generation now gives substantially more weight to signature offensive stats, especially for Ranged and Melee builds.
- Ranged and Melee suggested builds now seed key signature foods earlier so core archetype-defining recipes are less likely to be pushed out by generic high-overall foods.
