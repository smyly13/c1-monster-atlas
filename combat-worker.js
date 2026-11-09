import { calculateMonster } from './combat.js';
let data, monsters, request = 0;
self.onmessage = async ({ data: message }) => {
  if (message.type === 'init') { data = message.catalog; monsters = new Map(message.monsters.map(m => [m.id, { ...m, ...data.monsters[m.id] }])); return; }
  if (message.type !== 'calculate' || !data) return;
  const token = ++request;
  const pinnedProfile = { ...message.profile, sort: message.pinnedSort };
  const targets = [
    ...message.ids.map(id => ({ id, pinned:false })),
    ...(message.pinnedIds ?? []).map(id => ({ id, pinned:true })),
  ];
  for (let i = 0; i < targets.length; i += 5) {
    if (token !== request) return;
    const results = targets.slice(i, i + 5).map(({id, pinned}) => {
      try { return { id, pinned, result: calculateMonster(data, pinned ? pinnedProfile : message.profile, monsters.get(id)) }; }
      catch { return { id, pinned, result: { error: 'Could not calculate this monster', plans: [] } }; }
    });
    self.postMessage({ type: 'results', requestId: message.requestId, results, done: i + 5 >= targets.length });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (!targets.length) self.postMessage({ type: 'results', requestId: message.requestId, results: [], done: true });
};
