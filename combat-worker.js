import { calculateMonster } from './combat.js';
let data, monsters, request = 0;
self.onmessage = async ({ data: message }) => {
  if (message.type === 'init') { data = message.catalog; monsters = new Map(message.monsters.map(m => [m.id, { ...m, ...data.monsters[m.id] }])); return; }
  if (message.type !== 'calculate' || !data) return;
  const token = ++request;
  const ids = message.ids;
  for (let i = 0; i < ids.length; i += 5) {
    if (token !== request) return;
    const results = ids.slice(i, i + 5).map(id => {
      try { return { id, result: calculateMonster(data, message.profile, monsters.get(id)) }; }
      catch { return { id, result: { error: 'Could not calculate this monster', plans: [] } }; }
    });
    self.postMessage({ type: 'results', requestId: message.requestId, results, done: i + 5 >= ids.length });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (!ids.length) self.postMessage({ type: 'results', requestId: message.requestId, results: [], done: true });
};
