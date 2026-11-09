import { escape } from './combat-ui.js';

export const MONSTER_PINS_KEY = 'c1-atlas-monster-pins';

export function loadMonsterPins() {
  try {
    const ids = JSON.parse(localStorage.getItem(MONSTER_PINS_KEY));
    return new Set(Array.isArray(ids) ? ids.filter(id => Number.isSafeInteger(id) && id > 0) : []);
  } catch {
    return new Set();
  }
}

export function saveMonsterPins(pins) {
  try { localStorage.setItem(MONSTER_PINS_KEY, JSON.stringify([...pins])); } catch {}
}

export function pinnedMonsters(monsters, pins) {
  if (!pins.size) return [];
  const byId = new Map(monsters.map(monster => [monster.id, monster]));
  return [...pins].map(id => byId.get(id)).filter(Boolean);
}

export function monsterPinButton(monster, pinned) {
  const label = (pinned ? 'Unpin ' : 'Pin ') + monster.name;
  return `<button type="button" class="monster-pin" data-monster-pin="${monster.id}"
    aria-pressed="${pinned}" aria-label="${escape(label)}" title="${escape(label)}">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-2 2-1.5-.5-4 4 .5 3.5-1.5 1.5L6 12l1.5-1.5 3.5.5 4-4-.5-1.5zM9 15l-6 6"/></svg>
  </button>`;
}
