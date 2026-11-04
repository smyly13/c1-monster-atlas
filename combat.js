// Shared, browser-only estimates. Source data and assumptions are documented in calculator.html.
import { activeArmorSet } from './equipment-model.js';
export const PROFILE_KEY = 'c1-atlas-combat-v1';
export const TOGGLE_KEY = 'c1-atlas-show-kills';
export const MODES = { none: 'No shots', spirit: 'Spiritshot', blessed: 'Blessed Spiritshot', soul: 'Soulshot' };
export const defaults = () => ({ version: 1, mode: 'gear', classId: 'mage', level: 1, mAtk: 42, pAtk: 18,
  weapon: "apprentice's_wand", enchant: 0, armor: '', equipment: { weapon: "apprentice's_wand" }, int: 41, str: 22,
  mFlat: 0, pFlat: 0, mPercent: 0, pPercent: 0, passives: {}, buffs: {},
  skills: [{ id: '1177-wind-strike', level: 1 }], primary: '1177-wind-strike',
  shot: 'auto', allowed: ['none', 'spirit', 'blessed'], melee: 0, meleeShot: false,
  attackMode: 'skills', basicShot: 'none', maxBasicHits: 1000, bowMp: 1,
  maxCasts: 20, sort: 'cost', prices: { spirit: 17, blessed: 40, soul: 8, bone: 150, arrow: 2 },
  shotCount: 2, soulCount: 2, weaponType: 'blunt', dropAmount: 1, dropChance: 1, safety: 0, calibration: 100 });
const number = (v, fallback, min, max) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
export function cleanProfile(value) {
  const d = defaults(), p = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = { ...d, ...p, prices: { ...d.prices, ...p.prices } };
  for (const [key, min, max] of [['level',1,80],['mAtk',0,1e7],['pAtk',0,1e7],['enchant',0,16],['int',1,99],['str',1,99],['mFlat',-1e5,1e5],['pFlat',-1e5,1e5],['mPercent',-99,1000],['pPercent',-99,1000],['melee',0,10],['maxCasts',1,20],['shotCount',0,20],['soulCount',0,20],['dropAmount',0,100],['dropChance',0,100],['safety',0,50],['calibration',1,500]]) out[key] = number(p[key] ?? d[key], d[key], min, max);
  out.maxBasicHits = number(p.maxBasicHits ?? d.maxBasicHits,d.maxBasicHits,1,100000);
  out.bowMp = number(p.bowMp ?? d.bowMp,d.bowMp,0,1000);
  for (const key of ['level','enchant','int','str','melee','maxCasts','shotCount','soulCount','maxBasicHits']) out[key] = Math.floor(out[key]);
  out.attackMode = ['skills','melee','bow'].includes(p.attackMode) ? p.attackMode : d.attackMode;
  out.basicShot = ['none','soul','compare'].includes(p.basicShot) ? p.basicShot : d.basicShot;
  for (const key of Object.keys(d.prices)) out.prices[key] = number(out.prices[key], d.prices[key], 0, 1e6);
  out.skills = Array.isArray(p.skills) ? p.skills.slice(0, 12).filter(s => s && typeof s.id === 'string').map(s => ({ id: s.id, level: Math.floor(number(s.level,1,1,100)) })) : d.skills;
  out.skills = [...new Map(out.skills.map(s => [s.id, s])).values()];
  out.allowed = Array.isArray(p.allowed) ? [...new Set(p.allowed.filter(m => Object.hasOwn(MODES,m)))] : d.allowed;
  out.mode = p.mode === 'gear' ? 'gear' : 'manual';
  out.sort = ['cost','casts','mp'].includes(p.sort) ? p.sort : d.sort;
  out.shot = (p.shot === 'auto' || Object.hasOwn(MODES, p.shot)) ? p.shot : d.shot;
  out.meleeShot = !!p.meleeShot;
  out.equipment = Object.fromEntries(['weapon','chest','head','offhand','legs','gloves','feet','earLeft','earRight','ringLeft','ringRight','neck','underwear','back'].filter(key => typeof p.equipment?.[key] === 'string' && p.equipment[key].length < 150).map(key => [key,p.equipment[key]]));
  for (const key of ['passives','buffs']) out[key] = p[key] && typeof p[key] === 'object' && !Array.isArray(p[key]) ? Object.fromEntries(Object.entries(p[key]).slice(0,100).filter(([k,v]) => typeof k === 'string' && Number.isInteger(v) && v > 0 && v < 100)) : d[key];
  return out;
}
export function loadProfile(storage) { try { return cleanProfile(JSON.parse((storage ?? globalThis.localStorage).getItem(PROFILE_KEY))); } catch { return defaults(); } }
export function saveProfile(profile, storage) { try { (storage ?? globalThis.localStorage).setItem(PROFILE_KEY, JSON.stringify(cleanProfile(profile))); return true; } catch { return false; } }
export function classChain(data, slug) {
  const result = [], seen = new Set();
  while (slug && !seen.has(slug)) { seen.add(slug); const c = data.classes.find(c => c.slug === slug); if (!c) break; result.unshift(c); slug = c.parent; }
  return result;
}
export function learnedSkills(data, profile) {
  const learns = new Map();
  for (const c of classChain(data,profile.classId)) for (const s of c.learns) if (s.at <= profile.level) {
    if (!learns.has(s.card)) learns.set(s.card, new Set()); learns.get(s.card).add(s.level);
  }
  return data.skills.filter(s => learns.has(s.slug)).map(s => ({ ...s, levels: s.levels.filter(l => learns.get(s.slug).has(l.level)) })).filter(s => s.levels.length);
}
const surrenderOpeners = {
  '1083-surrender-to-fire': 'fire',
  '1074-surrender-to-wind': 'wind',
  '1071-surrender-to-water': 'water',
};
export function skillKind(skill) {
  if (Object.hasOwn(surrenderOpeners, skill.slug)) return 'surrender';
  const rules = skill.levels?.[0]?.rules ?? skill.rules ?? [];
  if (rules.some(r => ['i_m_attack','i_hp_drain'].includes(r.name)) && !rules.some(r => ['consume_body','i_consume_body'].includes(r.name))) return 'magic';
  if (rules.some(r => ['i_p_attack','i_p_attack_over_hit'].includes(r.name))) return 'physical';
  return null;
}
export function statSkill(skill) {
  return !skillKind(skill) && skill.levels[0].type !== 'T' && !/servitor|cubic/i.test(skill.slug) && !skill.levels[0].rules.some(r => r.scope === 'operate_condition') && skill.levels[0].rules.some(r => ['p_magical_attack','p_physical_attack'].includes(r.name) && Number(r.args[1]) > 0);
}
export function selectedSkills(data, profile) {
  const learned = learnedSkills(data, profile);
  return profile.skills.map(chosen => {
    const card = learned.find(s => s.slug === chosen.id), level = card?.levels.find(s => s.level === chosen.level);
    return card && level && skillKind(card) ? { ...level, id: card.slug, label: card.name, image: card.image, kind: skillKind(card) } : null;
  }).filter(Boolean);
}
export function baseStats(data, slug) {
  const root = classChain(data, slug)[0]?.slug;
  return ({ mage: [22,41], fighter: [40,21], elven_mage: [21,37], elven_fighter: [36,23], dark_mage: [23,44], dark_fighter: [41,25], orc_mage: [27,31], orc_fighter: [40,18], dwarven_fighter: [39,20] })[root] ?? [23,44];
}
function ruleApplies(rule, weapon, armor) {
  const list = rule.args[0];
  return Array.isArray(list) && (list.includes('all') || list.includes(weapon.weaponType) || list.includes('armor_' + (armor?.armorType ?? 'none')));
}
export function partyBuffs(data) {
  const ids = ['1068-might', '1059-empower', '1062-berserker-spirit'];
  return ids.map(id => data.skills.find(card => card.slug === id)).filter(Boolean);
}
function buffMultipliers(data, profile) {
  const factors = { m: 1, p: 1 };
  for (const card of partyBuffs(data)) {
    const rank = card.levels.find(row => row.level === profile.buffs[card.slug]);
    for (const rule of rank?.rules ?? []) {
      const stat = rule.name === 'p_magical_attack' ? 'm' : rule.name === 'p_physical_attack' ? 'p' : null;
      if (stat && rule.args[2] === 'per') factors[stat] *= 1 + Number(rule.args[1]) / 100;
    }
  }
  return factors;
}
export function characterStats(data, input) {
  const p = cleanProfile(input), weapon = data.weapons.find(w => w.slug === p.weapon), armor = data.armor.find(a => a.slug === p.armor);
  const buffs = buffMultipliers(data, p);
  if (p.mode === 'manual') return { mAtk: p.mAtk * buffs.m, pAtk: p.pAtk * buffs.p, weapon, armor, warnings: [] };
  if (!weapon) return { mAtk: 0, pAtk: 0, warnings: ['Choose a weapon.'] };
  const warnings = ['Gear stats are estimates. Compare them with your character window; use Manual stats for Reborn-specific bonuses.'];
  const enchanted = weapon.enchants?.find(e => e.level === p.enchant);
  if (p.enchant && !enchanted) warnings.push('This weapon has no published enchant table. Using its unenchanted attack values.');
  const levelMod = (p.level + 89) / 100;
  const armorSet = activeArmorSet(p);
  const int = p.int + (armorSet?.int ?? 0);
  const str = p.str + (armorSet?.str ?? 0);
  const intBonus = Math.round(1.02 ** (int - 31.375) * 100) / 100;
  const strBonus = Math.round(1.036 ** (str - 34.845) * 100) / 100;
  let mAtk = (enchanted?.mAtk ?? weapon.mAtk) * levelMod ** 2 * intBonus ** 2;
  let pAtk = (enchanted?.pAtk ?? weapon.pAtk) * levelMod * strBonus;
  const learned = learnedSkills(data, p), multipliers = buffs, flats = { m: 0, p: 0 };
  for (const [id, level] of Object.entries(p.passives)) {
    const card = learned.find(s => s.slug === id), row = card?.levels.find(s => s.level === level);
    if (!card || !row || !statSkill(card) || row.type !== 'P') continue;
    for (const rule of row.rules) {
      const stat = rule.name === 'p_magical_attack' ? 'm' : rule.name === 'p_physical_attack' ? 'p' : null;
      if (!stat || !ruleApplies(rule,weapon,armor)) continue;
      if (rule.args[2] === 'diff') flats[stat] += Number(rule.args[1]);
      if (rule.args[2] === 'per') multipliers[stat] *= 1 + Number(rule.args[1]) / 100;
    }
  }
  mAtk = Math.max(0,(mAtk + flats.m) * multipliers.m * (armorSet?.mAtk ?? 1));
  pAtk = Math.max(0,(pAtk + flats.p) * multipliers.p);
  return { mAtk, pAtk, weapon, armor, armorSet, warnings };
}
const elements = { 1177:'wind',1178:'wind',1176:'wind',1239:'wind',1184:'water',105:'water',1236:'water',1237:'water',1175:'water',1174:'water',1235:'water',1181:'fire',1220:'fire',1230:'fire',1171:'fire',1147:'dark',1234:'dark',1090:'dark',1245:'dark',70:'dark',289:'dark',1148:'dark',1028:'holy',1031:'holy',49:'holy' };
export function traitFactor(monster, name) {
  if (!name) return 1;
  return (monster.traitModifiers ?? []).filter(t => t.name === name).reduce((factor,t) => factor * Math.max(0,1 + (t.kind === 'weakness' ? 1 : -1) * t.value / 100),1);
}
export function expectedAdena(monster, profile) {
  if (!monster?.adena) return null;
  return monster.adena.reduce((sum, d) => sum + (d.min + d.max) / 2 * Math.min(1,d.chance / 100 * profile.dropChance) * profile.dropAmount,0);
}
function eligible(skill, monster, weaponType) {
  return skill.rules.filter(r => r.scope === 'operate_condition').every(r => r.name === 'equip_weapon' ? r.args[0]?.includes(weaponType) : r.name === 'target_race' ? r.args[0] === 'race_' + monster.race : false);
}
export const SURRENDER_SKILLS = { earth:1223, water:1071, wind:1074, fire:1083 };
function surrenderBonus(data, selection) {
  const [element, rank] = String(selection ?? '').split('-');
  if (!Object.hasOwn(SURRENDER_SKILLS,element) || !['1','2'].includes(rank)) return null;
  const card = data.skills.find(skill => skill.slug === SURRENDER_SKILLS[element]+'-surrender-to-'+element);
  const rule = card?.levels.find(row => row.level === Number(rank))?.rules.find(rule =>
    rule.name === 'p_defence_attribute' && rule.args[0] === 'attr_'+element);
  return rule ? { element, factor:1+Number(rule.args[1])/100 } : null;
}
export function attackActions(data, profile, monster, skills = selectedSkills(data, profile)) {
  const p = cleanProfile(profile), stats = characterStats(data,p);
  const weaponType = p.mode === 'gear' ? stats.weapon?.weaponType : p.weaponType;
  const spiritCount = p.mode === 'gear' ? stats.weapon?.spiritshots ?? 0 : p.shotCount;
  const actions = [];
  const surrender = surrenderBonus(data,p.surrender);
  for (const skill of skills) {
    if (skill.kind === 'surrender' || !eligible(skill,monster,weaponType)) continue;
    const rule = skill.rules.find(r => ['i_m_attack','i_hp_drain','i_p_attack','i_p_attack_over_hit'].includes(r.name));
    const power = Number(rule.args[0]);
    for (const mode of p.allowed) {
      if (skill.kind === 'magic' ? !['none','spirit','blessed'].includes(mode) : mode !== 'none') continue;
      const count = skill.kind === 'magic' ? spiritCount : 0;
      if (mode !== 'none' && count <= 0) continue;
      const shot = ({ none:1, spirit:2, blessed:4 })[mode];
      const element = skill.kind === 'magic' ? elements[Number(skill.id.split('-')[0])] : null;
      const factor = traitFactor(monster,skill.kind === 'magic' ? element : weaponType)
        * (surrender && surrender.element === element ? surrender.factor : 1);
      const raw = skill.kind === 'magic' ? 91 * power * Math.sqrt(stats.mAtk * shot) / monster.mDef : 70 * (stats.pAtk + power) / monster.pDef;
      const damage = Math.floor(raw * factor * p.calibration / 100);
      if (!Number.isFinite(damage) || damage <= 0) continue;
      const bone = skill.id === '1148-death-spike' ? 1 : 0;
      const arrow = skill.kind === 'physical' && weaponType === 'bow' ? 1 : 0;
      actions.push({ id: `${skill.id}:${mode}`, skillId: skill.id, name: skill.label, image: skill.image, level: skill.level, mode, kind: skill.kind,
        damage, mp: skill.mp, hp: skill.hp, shots: mode === 'none' ? 0 : count, bone, arrow,
        cost: (mode === 'none' ? 0 : count * p.prices[mode]) + bone * p.prices.bone + arrow * p.prices.arrow });
    }
  }
  return actions;
}
const empty = () => ({ damage:0, cost:0, mp:0, hp:0, casts:0, melee:0, steps:[] });
function extend(plan, action) { return { ...plan, damage: plan.damage + action.damage, cost: plan.cost + action.cost, mp: plan.mp + action.mp, hp: plan.hp + action.hp, casts: plan.casts + 1, steps:[...plan.steps,action] }; }
const signature = p => p.steps.map(a => a.id).sort().join('|') + '|' + p.melee;
function comparator(sort) {
  const keys = sort === 'casts' ? ['casts','melee','cost','mp','damage'] : sort === 'mp' ? ['mp','cost','casts','melee','damage'] : ['cost','casts','melee','mp','damage'];
  return (a,b) => { for (const key of keys) { const diff = a[key] - b[key]; if (Math.abs(diff) > 1e-8) return diff; } return 0; };
}
// For fixed cast count, discard only states with less damage and no lower
// objective cost. Running cost and MP frontiers separately preserves each optimum.
function frontier(plans, objective) {
  const other = objective === 'cost' ? 'mp' : 'cost';
  plans.sort((a,b) => b.damage - a.damage || a[objective] - b[objective] || a[other] - b[other]);
  const result = []; let best = Infinity;
  for (const p of plans) if (p[objective] < best - 1e-8) { result.push(p); best = p[objective]; }
  return result;
}
function calculateBasic(data,p,monster) {
  const stats=characterStats(data,p),weaponType=p.mode==='gear'?stats.weapon?.weaponType:p.weaponType;
  const bow=weaponType==='bow',target=Math.ceil(monster.hp*(1+p.safety/100)),revenue=expectedAdena(monster,p);
  const base={basicOnly:true,basicType:bow?'bow':'melee',baseline:null,best:null,plans:[],singlePlans:[],actions:[],revenue,target};
  if(p.mode==='gear'&&!stats.weapon)return {...base,error:'Choose a weapon in Gear estimate.'};
  if(p.attackMode==='bow'&&!bow)return {...base,error:'Choose a bow in Gear estimate, or select Bow as the weapon type in Manual stats.'};
  if(p.attackMode==='melee'&&bow)return {...base,error:'Choose a melee weapon, or switch to Bow basic attacks only.'};
  const soulCount=p.mode==='gear'?stats.weapon?.soulshots??0:p.soulCount;
  const mpPerHit=bow?(p.mode==='gear'?stats.weapon?.mpCost??0:p.bowMp):0;
  const modes=p.basicShot==='compare'?['none','soul']:[p.basicShot],plans=[];
  if(p.basicShot==='soul'&&soulCount<=0)return {...base,error:'This weapon cannot use Soulshots. Choose No shots or another weapon.'};
  for(const mode of modes){
    if(mode==='soul'&&soulCount<=0)continue;
    const damage=Math.floor(70*stats.pAtk*(mode==='soul'?2:1)/monster.pDef*traitFactor(monster,weaponType)*p.calibration/100);
    if(!Number.isFinite(damage)||damage<=0)continue;
    const hits=Math.ceil(target/damage);if(hits>p.maxBasicHits)continue;
    const shots=mode==='soul'?hits*soulCount:0,arrows=bow?hits:0,cost=shots*p.prices.soul+arrows*p.prices.arrow;
    plans.push({...empty(),basicHits:hits,basicType:bow?'bow':'melee',basicShot:mode,basicShots:shots,arrows,damagePerHit:damage,
      damage:hits*damage,cost,mp:hits*mpPerHit,revenue,profit:revenue===null?null:revenue-cost,margin:hits*damage-monster.hp});
  }
  plans.sort((a,b)=>{const keys=p.sort==='casts'?['basicHits','cost','mp']:p.sort==='mp'?['mp','cost','basicHits']:['cost','basicHits','mp'];for(const k of keys){if(a[k]!==b[k])return a[k]-b[k];}return 0;});
  return {...base,baseline:plans[0]??null,best:plans[0]??null,plans,error:plans.length?null:`No kill within ${p.maxBasicHits} successful basic attacks. Increase P. Atk. or the hit limit.`};
}
export function calculateMonster(data, input, monster) {
  const withOpener = calculateKill(data, input, monster);
  if (!withOpener.hasSurrender) return withOpener;

  const withoutOpener = calculateKill(data, input, monster, true);
  const compare = comparator(cleanProfile(input).sort);
  const runs = [withOpener, withoutOpener].filter(run => run.best);
  if (!runs.length) return withOpener;

  const preferred = runs.sort((a, b) => compare(a.best, b.best))[0];
  const plans = runs.flatMap(run => run.plans).sort(compare);
  const singlePlans = runs.flatMap(run => run.singlePlans).sort(compare);
  const baseline = runs.map(run => run.baseline).filter(Boolean).sort(compare)[0] ?? null;
  return { ...preferred, plans, singlePlans, baseline };
}

function calculateKill(data, input, monster, skipSurrender = false) {
  const p = cleanProfile(input);
  if (!(p.attackMode==='skills'?[monster?.hp,monster?.mDef,monster?.pDef]:[monster?.hp,monster?.pDef]).every(n => Number.isFinite(n) && n > 0)) return { error:'Combat stats unavailable', plans:[] };
  if(p.attackMode!=='skills')return calculateBasic(data,p,monster);
  const stats = characterStats(data,p);
  const skills = selectedSkills(data,p);
  const opener = skipSurrender ? null : skills.find(skill => skill.kind === 'surrender');
  let openingPlan = empty();
  if (opener) {
    openingPlan = extend(openingPlan, {
      id: opener.id+':none', skillId:opener.id, name:opener.label, image:opener.image,
      level:opener.level, kind:opener.kind, mode:'none', damage:0, mp:opener.mp, hp:opener.hp,
      shots:0, bone:0, arrow:0, cost:0,
    });
    p.surrender = surrenderOpeners[opener.id]+'-'+opener.level;
  }
  const actions = attackActions(data,p,monster,skills);
  const attackLimit = p.maxCasts - openingPlan.casts;
  const weaponType = p.mode === 'gear' ? stats.weapon?.weaponType : p.weaponType;
  const soulCount = p.mode === 'gear' ? stats.weapon?.soulshots ?? 0 : p.soulCount;
  const meleeDamage = Math.floor(70 * stats.pAtk * (p.meleeShot && soulCount > 0 ? 2 : 1) / monster.pDef * traitFactor(monster,weaponType) * p.calibration / 100);
  const meleeCost = (p.meleeShot && soulCount > 0 ? soulCount * p.prices.soul : 0) + (weaponType === 'bow' ? p.prices.arrow : 0);
  const target = Math.ceil(monster.hp * (1 + p.safety / 100)), candidates = [], singlePlans = [];
  const finish = plan => {
    const missing = target - plan.damage;
    const hits = missing <= 0 ? 0 : meleeDamage > 0 ? Math.ceil(missing / meleeDamage) : Infinity;
    if (hits > p.melee) return null;
    return { ...plan, damage: plan.damage + hits * meleeDamage, melee: hits, cost: plan.cost + hits * meleeCost };
  };
  const meleeOnly = finish(openingPlan); if (meleeOnly) candidates.push(meleeOnly);
  for (const action of actions) { let plan=openingPlan; for (let n=1;n<=attackLimit;n++) { plan=extend(plan,action); const done=finish(plan); if (done) { candidates.push(done); singlePlans.push(done); break; } } }
  const baseline = singlePlans.filter(plan =>
    plan.steps[openingPlan.casts].skillId === p.primary && (p.shot === 'auto' || plan.steps[openingPlan.casts].mode === p.shot)
  ).sort(comparator(p.sort))[0] ?? null;
  for (const objective of ['cost','mp']) {
    let states = [openingPlan];
    for (let count=1;count<=attackLimit && states.length;count++) {
      const next=[];
      for (const plan of states) for (const action of actions) {
        const child=extend(plan,action), done=finish(child);
        if (done) candidates.push(done);
        if (child.damage < target) next.push(child);
      }
      states=frontier(next,objective);
    }
  }
  const revenue=expectedAdena(monster,p);
  const unique=[...new Map(candidates.map(plan=>[signature(plan),plan])).values()];
  unique.sort(comparator(p.sort));
  const annotate=plan=>plan ? { ...plan, revenue, profit: revenue === null ? null : revenue-plan.cost, margin:plan.damage-monster.hp } : null;
  const best=unique[0]??null;
  const pareto=unique.filter(plan=>!unique.some(other=>other!==plan && ['cost','casts','melee','mp'].every(k=>other[k]<=plan[k]) && ['cost','casts','melee','mp'].some(k=>other[k]<plan[k])));
  const resources = new Set();
  const distinct=pareto.filter(plan=>{const key=[plan.cost,plan.casts,plan.melee,plan.mp].join(':');if(resources.has(key))return false;resources.add(key);return true;});
  const highlights = best ? [best, ...['cost','casts','mp'].map(sort=>[...unique].sort(comparator(sort))[0]), ...distinct, ...(baseline?[baseline]:[])] : [];
  const plans=[...new Map(highlights.map(plan=>[signature(plan),plan])).values()].slice(0,12).sort(comparator(p.sort)).map(annotate);
  return { hasSurrender:!!opener, baseline:annotate(baseline), plans, singlePlans:singlePlans.sort(comparator(p.sort)).map(annotate), best:annotate(best), actions, finishingShotsPerHit:p.meleeShot?soulCount:0, meleeDamage, revenue, target,
    error: best ? null : actions.length || p.melee ? `No kill within ${p.maxCasts} casts and ${p.melee} melee hits` : 'Select a usable attack skill or allow melee hits' };
}
export function planLabel(plan, formatAction = (count, label) => `${count}× ${label}`) {
  if (!plan) return 'No kill plan';
  if(plan.basicHits)return formatAction(plan.basicHits, `${plan.basicType==='bow'?'bow basic attack':'melee auto attack'}${plan.basicHits===1?'':'s'} (${MODES[plan.basicShot]})`, {basicType:plan.basicType});
  const groups=new Map();
  for(const step of plan.steps) { const key=step.id; if(!groups.has(key))groups.set(key,{...step,count:0}); groups.get(key).count++; }
  const labels=[...groups.values()].map(a=>formatAction(a.count, `${a.name} Lv.${a.level} (${MODES[a.mode]})`, a));
  if(plan.melee)labels.push(formatAction(plan.melee, 'melee', {basicType:'melee'}));
  return labels.join(' + ');
}
export function hitCountLabel(plan) {
  if(!plan)return 'Over your limit';
  if(plan.basicHits)return `${plan.basicHits} ${plan.basicType==='bow'?'bow shot':'melee hit'}${plan.basicHits===1?'':'s'}`;
  return `${plan.casts} cast${plan.casts===1?'':'s'}${plan.melee?` + ${plan.melee} basic hit${plan.melee===1?'':'s'}`:''}`;
}
