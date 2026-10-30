import { matchesTrait, traitLabel, traitOptions } from './traits.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const palette = ['#d9bb70', '#91b79b', '#8eade0', '#c29edb', '#dfb188', '#9ac5bf', '#dba1aa', '#ea986f', '#b3c47d', '#b5b3e4', '#dab976', '#7eb5ca'];
const color = level => palette[(level - 1) % palette.length];
const canvas = $('#map');
const ctx = canvas.getContext('2d');
const stage = $('#map-stage');
const params = new URLSearchParams(location.search);
const state = { levels: new Set(params.has('levels') ? params.get('levels').split(',').filter(Boolean).map(Number) : [8]), map: params.get('map') === 'elmore' ? 'elmore' : 'aden', search: params.get('q') ?? '', aggro: ['passive', 'aggressive'].includes(params.get('aggro')) ? params.get('aggro') : 'all' };
state.weakness = params.get('weakness') ?? 'all';
state.resistance = params.get('resistance') ?? 'all';
let data, map, visible = [], selected = [], shapes = [], imageCache = new Map();
let width = 0, height = 0, view = { scale: 1, x: 0, y: 0 }, minScale = .1;
let hoverId = null, focusedId = null, pinned = false, drag = null, frame = null, toastTimer;

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 2800);
}
function saveUrl() {
  const query = new URLSearchParams();
  query.set('levels', [...state.levels].sort((a, b) => a - b).join(','));
  if (state.map !== 'aden') query.set('map', state.map);
  if (state.search) query.set('q', state.search);
  if (state.aggro !== 'all') query.set('aggro', state.aggro);
  for (const kind of ['weakness', 'resistance']) if (state[kind] !== 'all') query.set(kind, state[kind]);
  history.replaceState(null, '', `${location.pathname}?${query}`);
}
function pixel(point, target = map) { return { x: target.zeroX + point.x * target.scale, y: target.zeroY + point.y * target.scale }; }
function inMap(point, target = map) { const p = pixel(point, target); return p.x >= 0 && p.x <= target.width && p.y >= 0 && p.y <= target.height; }
function mapSpawns(monster, target = map) { return monster.spawns.filter(spawn => spawn.pos.some(point => inMap(point, target))); }
function currentMonsters() { return visible.filter(monster => monster.maps.includes(state.map)); }
function project(point) { return { x: view.x + point.x * view.scale, y: view.y + point.y * view.scale }; }
function toImage(x, y) { return { x: (x - view.x) / view.scale, y: (y - view.y) / view.scale }; }
function closeTooltip() { pinned = false; $('#map-tooltip').hidden = true; }

function renderLevels() {
  const counts = new Map();
  data.monsters.forEach(monster => counts.set(monster.level, (counts.get(monster.level) ?? 0) + 1));
  $('#levels').innerHTML = [...counts].sort((a, b) => a[0] - b[0]).map(([level, count]) => `<div class="level-row ${state.levels.has(level) ? 'selected' : ''}" style="--level-color:${color(level)}" data-level="${level}"><input class="level-check" type="checkbox" aria-label="Include level ${level}" data-level="${level}" ${state.levels.has(level) ? 'checked' : ''}><button class="level-button" data-level="${level}" aria-label="Show only level ${level}" aria-pressed="${state.levels.has(level)}"><span>Level <span class="level-number">${level}</span></span><span class="level-swatch"></span><span class="level-mobs">${count}</span></button></div>`).join('');
  const count = state.levels.size;
  $('#selected-level-count').textContent = `${count} level${count === 1 ? '' : 's'} selected`;
  $('#clear-levels').disabled = !count;
}

function renderTraits(monster) {
  return '<span class="monster-traits">' + (monster.traitModifiers ?? []).map(trait => `<span class="trait-badge ${trait.kind}" title="${escapeHtml(traitLabel(trait.name))} ${trait.kind}: ${trait.value}%"><span>${trait.kind === 'weakness' ? 'Weak' : 'Resist'}</span> ${escapeHtml(traitLabel(trait.name))} ${trait.value}%</span>`).join('') + '</span>';
}

function renderList() {
  $('#monster-count').textContent = visible.length;
  if (!visible.length) {
    $('#monster-list').innerHTML = `<div class="empty-list">${icon(state.levels.size ? 'search' : 'compass')}<strong>${state.levels.size ? 'No matching monsters' : 'Your next hunt starts here'}</strong><small>${state.levels.size ? 'Try another search or change the aggression, weakness or resistance filters.' : 'Select a level on the left to reveal its monsters and spawn areas.'}</small></div>`;
    return;
  }
  const groups = new Map();
  visible.forEach(monster => { if (!groups.has(monster.level)) groups.set(monster.level, []); groups.get(monster.level).push(monster); });
  const nameCounts = new Map();
  visible.forEach(monster => nameCounts.set(`${monster.level}:${monster.name}`, (nameCounts.get(`${monster.level}:${monster.name}`) ?? 0) + 1));
  $('#monster-list').innerHTML = [...groups].map(([level, monsters]) => `<section class="monster-group" aria-label="Level ${level} monsters"><div class="monster-group-heading"><span class="group-level" style="--level-color:${color(level)}"><span class="legend-dot"></span>LEVEL ${level}</span><span class="group-count">${monsters.length} monster${monsters.length === 1 ? '' : 's'}</span></div>${monsters.map(monster => {
    const location = monster.locations.map(loc => loc.name).join(', ') || 'Location not named';
    const duplicate = nameCounts.get(`${level}:${monster.name}`) > 1;
    return `<div class="monster-row ${monster.maps.includes(state.map) ? '' : 'other-map'}" data-id="${monster.id}"><a class="monster-link" href="https://l2hub.info/c1/npcs/${encodeURIComponent(monster.slug)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(monster.name)}, level ${level}, ${escapeHtml(location)}. Open L2Hub in a new tab."><span class="monster-name">${escapeHtml(monster.name)} <span class="monster-location">( ${escapeHtml(location)} )</span>${icon('arrow').replace('<svg', '<svg class="external-mark"')}</span><span class="monster-sub"><span class="${monster.aggressive ? 'aggressive' : 'passive'}-dot"></span>${monster.aggressive ? 'Aggressive' : 'Passive'}<span class="monster-map">${monster.maps.map(id => id === 'aden' ? 'Aden' : 'Elmore').join(' · ')}</span>${duplicate ? `<span>· ID ${monster.id}</span>` : ''}</span>${renderTraits(monster)}</a><button class="locate-button" data-locate="${monster.id}" title="Find ${escapeHtml(monster.name)} on the map" aria-label="Find ${escapeHtml(monster.name)} on the map">${icon('target')}</button></div>`;
  }).join('')}</section>`).join('');
}

function render({ fit = true } = {}) {
  if (!data) return;
  selected = data.monsters.filter(monster => state.levels.has(monster.level));
  const query = state.search.trim().toLocaleLowerCase();
  visible = selected.filter(monster => (state.aggro === 'all' || monster.aggressive === (state.aggro === 'aggressive')) && matchesTrait(monster, 'weakness', state.weakness) && matchesTrait(monster, 'resistance', state.resistance) && (!query || `${monster.name} ${monster.locations.map(loc => loc.name).join(' ')}`.toLocaleLowerCase().includes(query)));
  map = data.maps.find(entry => entry.id === state.map);
  shapes = currentMonsters().flatMap(monster => mapSpawns(monster).map(spawn => ({ monster, points: spawn.pos.map(point => pixel(point)) })));
  renderLevels();
  renderList();
  $$('.map-tab').forEach(tab => { const active = tab.dataset.map === state.map; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', active); });
  stage.setAttribute('aria-labelledby', `tab-${state.map}`);
  canvas.setAttribute('aria-label', `${map.name} map with ${currentMonsters().length} selected monsters. Drag to pan, scroll or use plus and minus to zoom. Arrow keys pan. Press zero to reset.`);
  $('#map-name').textContent = map.name;
  const onMap = currentMonsters().length;
  $('#map-detail').textContent = `${onMap} monster${onMap === 1 ? '' : 's'} on this map · ${state.levels.size} level${state.levels.size === 1 ? '' : 's'} selected`;
  for (const id of ['aden', 'elmore']) $(`#count-${id}`).textContent = visible.filter(monster => monster.maps.includes(id)).length;
  $('#legend').innerHTML = [...state.levels].sort((a, b) => a - b).map(level => `<span class="legend-item" style="--level-color:${color(level)}"><span class="legend-dot"></span>Level ${level}</span>`).join('') || '<span class="legend-item">Select levels to show spawn areas</span>';
  $('#spawn-count').textContent = `${shapes.length.toLocaleString()} spawn ${shapes.length === 1 ? 'area' : 'areas'}`;
  $('#fit-map').disabled = !shapes.length;
  const message = $('#map-message');
  message.hidden = !!onMap;
  message.innerHTML = !state.levels.size ? 'A world of hunting grounds.<small>Select a monster level to begin.</small>' : !visible.length ? 'No monsters match your filters.<small>Try clearing your search or changing the aggression, weakness or resistance filters.</small>' : `No selected monsters in ${map.name}.<small>Try the ${state.map === 'aden' ? 'Elmore' : 'Aden'} tab or choose another level.</small>`;
  $$('.filter').forEach(button => { const active = state.aggro === button.dataset.aggro; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  for (const kind of ['weakness', 'resistance']) $(`#${kind}`).value = state[kind];
  $('#clear-traits').hidden = state.weakness === 'all' && state.resistance === 'all';
  closeTooltip(); hoverId = null; focusedId = null;
  saveUrl();
  if (fit) fitShapes();
  scheduleDraw();
}

function fitBounds(points) {
  if (!width || !height) return;
  minScale = Math.min(width / map.width, height / map.height) * .94;
  if (!points.length) { resetMap(); return; }
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.max(0, Math.min(...xs)), maxX = Math.min(map.width, Math.max(...xs));
  const minY = Math.max(0, Math.min(...ys)), maxY = Math.min(map.height, Math.max(...ys));
  const availableWidth = Math.max(80, width - 100), availableHeight = Math.max(80, height - 185);
  const scale = Math.max(minScale, Math.min(8, availableWidth / Math.max(25, maxX - minX), availableHeight / Math.max(25, maxY - minY)));
  view = { scale, x: width / 2 - (minX + maxX) / 2 * scale, y: height / 2 + 28 - (minY + maxY) / 2 * scale };
  clampView(); scheduleDraw();
}
function fitShapes() { fitBounds(shapes.flatMap(shape => shape.points)); }
function resetMap() {
  if (!map) return;
  minScale = Math.min(width / map.width, height / map.height) * .94;
  view = { scale: minScale, x: (width - map.width * minScale) / 2, y: (height - map.height * minScale) / 2 };
  closeTooltip(); scheduleDraw();
}
function clampView() {
  const w = map.width * view.scale, h = map.height * view.scale, margin = 70;
  view.x = w <= width ? (width - w) / 2 : Math.min(margin, Math.max(width - w - margin, view.x));
  view.y = h <= height ? (height - h) / 2 : Math.min(margin, Math.max(height - h - margin, view.y));
}
function zoom(factor, anchorX = width / 2, anchorY = height / 2) {
  if (!map) return;
  const before = toImage(anchorX, anchorY);
  view.scale = Math.max(minScale, Math.min(10, view.scale * factor));
  view.x = anchorX - before.x * view.scale; view.y = anchorY - before.y * view.scale;
  clampView(); closeTooltip(); scheduleDraw();
}
function scheduleDraw() { if (!frame) frame = requestAnimationFrame(() => { frame = null; draw(); }); }
function draw() {
  if (!map || !width || !height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const image = imageCache.get(map.id);
  if (image?.complete && image.naturalWidth) {
    ctx.save(); ctx.filter = 'brightness(0.72) saturate(0.7)';
    ctx.drawImage(image, view.x, view.y, map.width * view.scale, map.height * view.scale); ctx.restore();
  }
  // Clip all spawn graphics to the original map's bounds.
  ctx.save(); ctx.beginPath(); ctx.rect(view.x, view.y, map.width * view.scale, map.height * view.scale); ctx.clip();
  for (const shape of shapes) {
    const active = shape.monster.id === hoverId || shape.monster.id === focusedId;
    const tint = color(shape.monster.level);
    const points = shape.points.map(project);
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    if (Math.max(...xs) < -15 || Math.min(...xs) > width + 15 || Math.max(...ys) < -15 || Math.min(...ys) > height + 15) continue;
    const dimmed = (hoverId !== null || focusedId !== null) && !active;
    ctx.globalAlpha = dimmed ? .2 : 1;
    ctx.strokeStyle = active ? '#fff5d6' : tint;
    ctx.fillStyle = tint; ctx.lineWidth = active ? 2 : 1.1;
    if (points.length === 1) {
      const p = points[0], radius = active ? 6 : 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, radius + 2, 0, Math.PI * 2); ctx.fillStyle = '#11170f'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fillStyle = tint; ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); points.forEach((p, index) => index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
      ctx.globalAlpha = dimmed ? .08 : active ? .78 : .48; ctx.fill(); ctx.globalAlpha = dimmed ? .2 : .95; ctx.stroke();
    }
  }
  ctx.restore(); ctx.globalAlpha = 1;
  // A subtle edge shade keeps the map labels and controls easy to read.
  const shade = ctx.createLinearGradient(0, 0, 0, 130); shade.addColorStop(0, '#10180fc9'); shade.addColorStop(1, '#10180f00');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, width, Math.min(130, height));
}

function pointInPolygon(p, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i], b = vertices[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function hitTest(x, y) {
  const p = toImage(x, y);
  const matches = shapes.filter(shape => shape.points.length === 1 ? Math.hypot(p.x - shape.points[0].x, p.y - shape.points[0].y) < 9 / view.scale : pointInPolygon(p, shape.points));
  return [...new Map(matches.map(shape => [shape.monster.id, shape.monster])).values()];
}
function showTooltip(monsters, x, y, pin = false) {
  if (!monsters.length) { if (!pinned) $('#map-tooltip').hidden = true; return; }
  const tooltip = $('#map-tooltip');
  tooltip.innerHTML = monsters.slice(0, 8).map(monster => `<div class="tooltip-row"><a href="https://l2hub.info/c1/npcs/${encodeURIComponent(monster.slug)}" target="_blank" rel="noopener noreferrer" style="color:${color(monster.level)}">${escapeHtml(monster.name)} ↗</a><small>Level ${monster.level} · ${monster.aggressive ? 'Aggressive' : 'Passive'}${monster.locations.length ? ` · ${escapeHtml(monster.locations.map(loc => loc.name).join(', '))}` : ''}</small></div>`).join('') + (!pin ? '<div class="tooltip-row"><small>Click the map to keep this open.</small></div>' : '');
  tooltip.hidden = false; tooltip.style.pointerEvents = pin ? 'auto' : 'none';
  tooltip.style.left = `${Math.max(8, Math.min(width - tooltip.offsetWidth - 8, x + 16))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(height - tooltip.offsetHeight - 8, y + 16))}px`;
  if (pin) pinned = true;
}
function highlightList(id) {
  $$('.monster-row.highlighted').forEach(row => row.classList.remove('highlighted'));
  if (id !== null) $(`.monster-row[data-id="${id}"]`)?.classList.add('highlighted');
}
function locateMonster(id) {
  const monster = data.monsters.find(entry => entry.id === id);
  if (!monster) return;
  if (!monster.maps.includes(state.map)) { state.map = monster.maps[0]; render({ fit: false }); }
  closeTooltip(); focusedId = id; hoverId = null;
  fitBounds(mapSpawns(monster).flatMap(spawn => spawn.pos.map(point => pixel(point))));
  highlightList(id);
  notify(`${monster.name} · Level ${monster.level} · ${map.name}`);
  $('#map').focus({ preventScroll: true });
  if (matchMedia('(max-width:760px)').matches) stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#levels').addEventListener('click', event => {
  const button = event.target.closest('button[data-level]');
  if (!button) return;
  state.levels = new Set([Number(button.dataset.level)]); render();
});
$('#levels').addEventListener('change', event => {
  if (!event.target.matches('input[data-level]')) return;
  const level = Number(event.target.dataset.level);
  event.target.checked ? state.levels.add(level) : state.levels.delete(level); render();
});
$('#clear-levels').addEventListener('click', () => { state.levels.clear(); render(); });
$$('.map-tab').forEach(button => button.addEventListener('click', () => { if (state.map === button.dataset.map || !data) return; state.map = button.dataset.map; render(); }));
$$('.map-tab').forEach(button => button.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const next = button.dataset.map === 'aden' ? $('#tab-elmore') : $('#tab-aden'); next.click(); next.focus(); }));
$$('.filter').forEach(button => button.addEventListener('click', () => { state.aggro = button.dataset.aggro; render(); }));
for (const kind of ['weakness', 'resistance']) $(`#${kind}`).addEventListener('change', event => { state[kind] = event.target.value; render(); });
$('#clear-traits').addEventListener('click', () => { state.weakness = 'all'; state.resistance = 'all'; render(); });
$('#search').value = state.search;
$('#search').addEventListener('input', event => { state.search = event.target.value; render(); });
$('#monster-list').addEventListener('click', event => { const button = event.target.closest('[data-locate]'); if (button) locateMonster(Number(button.dataset.locate)); });
$('#monster-list').addEventListener('pointerover', event => { const row = event.target.closest('.monster-row'); if (row) { hoverId = Number(row.dataset.id); scheduleDraw(); } });
$('#monster-list').addEventListener('pointerleave', () => { hoverId = null; scheduleDraw(); });
$('#fit-map').addEventListener('click', () => { focusedId = null; hoverId = null; highlightList(null); closeTooltip(); fitShapes(); });
$('#zoom-in').addEventListener('click', () => zoom(1.3));
$('#zoom-out').addEventListener('click', () => zoom(1 / 1.3));
$('#reset-map').addEventListener('click', resetMap);
canvas.addEventListener('wheel', event => { if (!map) return; event.preventDefault(); const rect = canvas.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top); }, { passive: false });
canvas.addEventListener('pointerdown', event => {
  if (!map || event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  drag = { clientX: event.clientX, clientY: event.clientY, x: view.x, y: view.y, moved: false };
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', event => {
  if (!map) return;
  const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
  const point = toImage(x, y);
  $('#coordinates').textContent = `X ${Math.round((point.x - map.zeroX) / map.scale).toLocaleString()}   Y ${Math.round((point.y - map.zeroY) / map.scale).toLocaleString()}`;
  if (drag) {
    const dx = event.clientX - drag.clientX, dy = event.clientY - drag.clientY;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) { view.x = drag.x + dx; view.y = drag.y + dy; clampView(); closeTooltip(); scheduleDraw(); }
    return;
  }
  if (pinned) return;
  const matches = hitTest(x, y); hoverId = matches[0]?.id ?? null;
  canvas.style.cursor = matches.length ? 'pointer' : 'grab';
  showTooltip(matches, x, y); highlightList(hoverId); scheduleDraw();
});
canvas.addEventListener('pointerup', event => {
  const moved = drag?.moved; drag = null; canvas.classList.remove('dragging');
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (!moved && map) {
    const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    const matches = hitTest(x, y); closeTooltip();
    if (matches.length) showTooltip(matches, x, y, true);
    else { focusedId = null; hoverId = null; highlightList(null); scheduleDraw(); }
  }
});
canvas.addEventListener('pointercancel', () => { drag = null; canvas.classList.remove('dragging'); });
canvas.addEventListener('pointerleave', () => { if (!drag && !pinned) { hoverId = null; highlightList(null); closeTooltip(); scheduleDraw(); } });
canvas.addEventListener('dblclick', event => { const rect = canvas.getBoundingClientRect(); zoom(1.6, event.clientX - rect.left, event.clientY - rect.top); });
canvas.addEventListener('keydown', event => {
  if (!map) return;
  if (['+', '='].includes(event.key)) { event.preventDefault(); zoom(1.3); }
  else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.3); }
  else if (event.key === '0') { event.preventDefault(); resetMap(); }
  else if (event.key.startsWith('Arrow')) { event.preventDefault(); view.x += event.key === 'ArrowLeft' ? 45 : event.key === 'ArrowRight' ? -45 : 0; view.y += event.key === 'ArrowUp' ? 45 : event.key === 'ArrowDown' ? -45 : 0; clampView(); closeTooltip(); scheduleDraw(); }
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#search').focus(); }
  if (event.key === 'Escape') { closeTooltip(); hoverId = null; focusedId = null; highlightList(null); scheduleDraw(); }
});
new ResizeObserver(entries => {
  const { width: nextWidth, height: nextHeight } = entries[0].contentRect;
  if (!nextWidth || !nextHeight) return;
  const oldWidth = width, oldHeight = height;
  width = nextWidth; height = nextHeight;
  if (!map) return;
  if (!oldWidth || !oldHeight) fitShapes();
  else { view.x += (width - oldWidth) / 2; view.y += (height - oldHeight) / 2; minScale = Math.min(width / map.width, height / map.height) * .94; view.scale = Math.max(view.scale, minScale); clampView(); scheduleDraw(); }
}).observe(stage);

async function init() {
  try {
    const response = await fetch('data/monsters.json');
    if (!response.ok) throw new Error(`Monster data returned ${response.status}`);
    data = await response.json();
    for (const kind of ['weakness', 'resistance']) {
      const options = traitOptions(data.monsters, kind);
      if (!['all', 'any', 'none', ...options].includes(state[kind])) state[kind] = 'all';
      $(`#${kind}`).innerHTML = `<option value="all">All monsters</option><option value="any">Any ${kind}</option><option value="none">No listed ${kind}</option>` + options.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(traitLabel(name))}</option>`).join('');
      $(`#${kind}`).disabled = false;
    }
    const available = new Set(data.monsters.map(monster => monster.level));
    state.levels = new Set([...state.levels].filter(level => available.has(level)));
    map = data.maps.find(entry => entry.id === state.map);
    await Promise.all(data.maps.map(entry => new Promise((resolve, reject) => {
      const image = new Image(); imageCache.set(entry.id, image);
      image.onload = resolve; image.onerror = () => reject(new Error(`Could not load ${entry.name} map`)); image.src = entry.image;
    })));
    $('#map-loading').hidden = true;
    $('#dataset-summary').textContent = `${data.monsters.length.toLocaleString()} monsters · ${data.metadata.spawnGroups.toLocaleString()} spawn areas · C1 only`;
    const collected = new Date(data.metadata.collectedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    $('#dataset-summary').title = `Complete C1 index checked against the L2Hub sitemap. Collected ${collected}. Only monsters with explicit Passive/Aggressive values and map coordinates are included.`;
    render();
    if (matchMedia('(max-width:760px)').matches) {
      const selectedRow = $('.level-row.selected');
      if (selectedRow) $('#levels').scrollLeft = selectedRow.offsetLeft - $('#levels').offsetLeft - 14;
    }
    requestAnimationFrame(() => { fitShapes(); scheduleDraw(); });
  } catch (error) {
    console.error(error);
    $('#map-loading').hidden = true;
    $('#map-message').hidden = false;
    $('#map-message').innerHTML = 'The atlas could not be loaded.<small>Please check your connection and <a class="error-retry" href="">try again</a>.</small>';
    $('#levels').innerHTML = '<div class="loading-text">Data unavailable</div>';
    $('#monster-list').innerHTML = '<div class="empty-list">Please reload to try again.</div>';
    $('#dataset-summary').textContent = 'Atlas unavailable';
  }
}
init();
