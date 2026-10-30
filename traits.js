export const traitLabel = name => name.replace(/[_-]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

export function matchesTrait(monster, kind, selection) {
  const traits = (monster.traitModifiers ?? []).filter(trait => trait.kind === kind);
  if (selection === 'all') return true;
  if (selection === 'any') return traits.length > 0;
  if (selection === 'none') return traits.length === 0;
  return traits.some(trait => trait.name === selection);
}

export function traitOptions(monsters, kind) {
  return [...new Set(monsters.flatMap(monster => (monster.traitModifiers ?? []).filter(trait => trait.kind === kind).map(trait => trait.name)))].sort();
}
