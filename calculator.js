import { MONSTER_PINS_KEY, loadMonsterPins, saveMonsterPins, pinnedMonsters, monsterPinButton } from './monster-pins.js';
import { defaults, cleanProfile, loadProfile, saveProfile, learnedSkills, selectedSkills, skillKind, statSkill, partyBuffs, classChain, baseStats, characterStats, planLabel, MODES, PROFILE_KEY } from './combat.js';
import { escape, amount, profitLabel, killCard } from './combat-ui.js';
import { createEquipmentPicker } from './equipment.js';
import { normalizeEquipment, activeArmorSet } from './equipment-model.js';
import { hitCountLabel } from './combat.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let catalog, atlas, equipmentData, equipmentPicker, profile=loadProfile(), worker, requestId=0, timer, targetId;
const pendingSkillLevels = new Map();
const options = rows => rows.map(([value,label])=>`<option value="${escape(value)}">${escape(label)}</option>`).join('');
function repairProfile(reset=false) {
  profile.shot='auto';
  profile.allowed=profile.allowed.filter(mode=>mode!=='soul');
  profile.dropAmount=profile.dropChance=1;
  if(!catalog.classes.some(c=>c.slug===profile.classId))profile.classId=defaults().classId;
  const learned=learnedSkills(catalog,profile), attacks=learned.filter(skillKind);
  profile.skills=reset ? attacks.filter(card=>skillKind(card)!=='surrender').slice(0,2).map(s=>({id:s.slug,level:s.levels.at(-1).level})) : profile.skills.flatMap(s=>{
    const card=attacks.find(c=>c.slug===s.id); if(!card)return [];
    return [{id:s.id,level:card.levels.find(l=>l.level===s.level)?.level??card.levels.at(-1).level}];
  });
  profile.passives=Object.fromEntries(Object.entries(profile.passives).flatMap(([id,level])=>{
    const card=learned.find(c=>c.slug===id && c.levels[0].type==='P' && statSkill(c));
    return card?[[id,card.levels.find(l=>l.level===level)?.level??card.levels.at(-1).level]]:[];
  }));
  if(reset)profile.passives=Object.fromEntries(learned.filter(s=>statSkill(s)&&s.levels[0].type==='P').map(s=>[s.slug,s.levels.at(-1).level]));
}
function enchantRanks() {
  const weapon=catalog.weapons.find(w=>w.slug===profile.weapon);
  return [...new Set([0,...(weapon?.enchants??[]).map(row=>row.level)])].sort((a,b)=>a-b);
}
function renderWeapons() {
  if(!enchantRanks().includes(profile.enchant)) profile.enchant=0;
  equipmentPicker?.render();
}
function classLabel(card) {
  const icon=escape(card.slug);
  return '<img src="assets/classes/'+icon+'.png" width="24" height="24" alt="">'+escape(card.name);
}
function renderClassTree() {
  const branch = parent => {
    const children=catalog.classes.filter(card=>(card.parent||null)===parent);
    if(!children.length)return '';
    return '<ul>'+children.map(card=>{
      const selected=card.slug===profile.classId;
      return '<li><button type="button" data-class-choice="'+escape(card.slug)+'" aria-pressed="'+selected+'">'+classLabel(card)+'</button>'+branch(card.slug)+'</li>';
    }).join('')+'</ul>';
  };
  $('#current-class').innerHTML=classLabel(catalog.classes.find(card=>card.slug===profile.classId));
  $('#class-tree').innerHTML=branch(null);
}
function skillRanks(card,group) {
  const levels=card.levels.map(l=>l.level).sort((a,b)=>a-b);
  return group==='attack'?levels:[0,...levels];
}
function skillLevel(card,group) {
  const levels=skillRanks(card,group);
  const selected=group==='attack'?profile.skills.find(s=>s.id===card.slug)?.level??pendingSkillLevels.get(card.slug)??levels.at(-1):profile[group][card.slug]??0;
  return levels.includes(selected)?selected:group==='attack'?levels.at(-1):0;
}
function skillInfo(card,group,level) {
  const rank=card.levels.find(l=>l.level===level);
  if(group==='attack'){
    if(skillKind(card)==='surrender'){
      const effect=rank?.rules.find(rule=>rule.name==='p_defence_attribute');
      return '<span>Element damage <b>+'+amount(effect?.args[1]??0)+'%</b></span><span>MP <b>'+amount(rank?.mp??0)+'</b></span>';
    }
    const power=rank?.rules.find(r=>['i_m_attack','i_hp_drain','i_p_attack','i_p_attack_over_hit'].includes(r.name))?.args[0];
    return '<span>Power <b>'+escape(power??'—')+'</b></span><span>MP <b>'+amount(rank?.mp??0)+'</b></span>';
  }
  const bonuses=(rank?.rules??[]).filter(r=>['p_magical_attack','p_physical_attack'].includes(r.name)).map(r=>'+'+amount(r.args[1])+(r.args[2]==='per'?'%':'')+' '+(r.name==='p_magical_attack'?'M. Atk.':'P. Atk.'));
  return '<span class="skill-bonus">'+escape(bonuses.join(' · ')||'Off')+'</span>';
}
function levelControls(card,group,level) {
  const ranks=skillRanks(card,group),index=ranks.indexOf(level),id=escape(card.slug),name=escape(card.name);
  return '<div class="skill-level-stepper" role="group" aria-label="'+name+' level"><button type="button" data-level-step="-1" data-level-card="'+id+'" data-level-group="'+group+'" aria-label="Decrease '+name+' level" '+(index<=0?'disabled':'')+'>−</button><span class="skill-rank"><small>LV</small><output data-level-output aria-label="'+name+' skill level" aria-live="polite">'+level+'</output></span><button type="button" data-level-step="1" data-level-card="'+id+'" data-level-group="'+group+'" aria-label="Increase '+name+' level" '+(index>=ranks.length-1?'disabled':'')+'>+</button></div>';
}
function skillIcon(card) {return '<img class="skill-icon" src="'+escape(card.image??'assets/item-fallback.svg')+'" width="32" height="32" alt="" loading="lazy">';}
function refreshSkillRow(card,group) {
  const row=$('[data-level-row="'+group+':'+card.slug+'"]');if(!row)return;
  const level=skillLevel(card,group),ranks=skillRanks(card,group),index=ranks.indexOf(level);
  row.querySelector('[data-level-output]').textContent=level;
  row.querySelector('[data-level-step="-1"]').disabled=index<=0;
  row.querySelector('[data-level-step="1"]').disabled=index>=ranks.length-1;
  row.querySelector('.skill-facts').innerHTML=skillInfo(card,group,level);
}
function renderSkills() {
  const learned=learnedSkills(catalog,profile),attack=learned.filter(skillKind);
  $('#attack-skills').innerHTML=attack.length?attack.map(card=>{
    const chosen=profile.skills.find(s=>s.id===card.slug),kind=skillKind(card),level=skillLevel(card,'attack');
    pendingSkillLevels.set(card.slug,level);
    return '<div class="skill-choice" data-level-row="attack:'+escape(card.slug)+'"><label class="skill-identity"><input type="checkbox" data-skill="'+escape(card.slug)+'" '+(chosen?'checked':'')+'>'+skillIcon(card)+'<span>'+escape(card.name)+'<small>'+(kind==='surrender'?'Opener · no shots':kind==='magic'?'Magic':'Physical')+(card.slug==='1184-ice-bolt'?' · Ice / freezing bolt':'')+'</small></span></label>'+levelControls(card,'attack',level)+'<div class="skill-facts" aria-live="polite">'+skillInfo(card,'attack',level)+'</div><a class="skill-source" href="https://l2hub.info/c1/skills/'+encodeURIComponent(card.slug)+'" target="_blank" rel="noopener noreferrer" aria-label="'+escape(card.name)+' source">↗</a></div>';
  }).join(''):'<p class="field-help">No supported direct attacks at this class/level. You can still allow melee hits.</p>';
  const renderStatRow=(card,group)=>{
    const level=skillLevel(card,group);
    return '<div class="stat-skill" data-level-row="'+group+':'+escape(card.slug)+'"><div class="skill-identity">'+skillIcon(card)+'<span>'+escape(card.name)+'<small>'+(group==='passives'?'Passive':'Active buff')+' · level 0 = off</small></span></div>'+levelControls(card,group,level)+'<div class="skill-facts" aria-live="polite">'+skillInfo(card,group,level)+'</div><a class="skill-source" href="https://l2hub.info/c1/skills/'+encodeURIComponent(card.slug)+'" target="_blank" rel="noopener noreferrer" aria-label="'+escape(card.name)+' source">↗</a></div>';
  };
  $('#stat-skills').innerHTML=learned.filter(card=>card.levels[0].type==='P'&&statSkill(card))
    .map(card=>renderStatRow(card,'passives')).join('')||'<p class="field-help">No supported attack passives at this class and level.</p>';
  $('#party-buffs').innerHTML=partyBuffs(catalog).map(card=>renderStatRow(card,'buffs')).join('');
  const omitted=learned.filter(s=>!skillKind(s)&&!statSkill(s)).length;
  $('#skill-note').textContent='Select up to 12 attacks. '+omitted+' utility, healing, DoT-only, summon or special-condition skills are outside this direct-hit model. Additional effects such as slows and DoT ticks are not counted.'+(attack.some(card=>skillKind(card)==='surrender')?' Select one Surrender to compare plans with and without it. When used, it goes first without shots and counts toward MP and cast limits. The estimate assumes the debuff lands.':'');
  renderPrimary();
}
function renderPrimary() {
  const skills=selectedSkills(catalog,profile).filter(skill=>skill.kind!=='surrender');
  if(!skills.some(skill=>skill.id===profile.primary)) profile.primary=skills[0]?.id??'';
  const label=skill=>skillIcon(catalog.skills.find(card=>card.slug===skill.id))+
    '<span>'+escape(skill.label)+' Lv.'+skill.level+'</span>';
  const current=skills.find(skill=>skill.id===profile.primary);
  $('#primary-skill-current').innerHTML=current?label(current):'Select an attack above';
  $('#primary-skill-options').innerHTML=skills.map(skill=>
    '<button type="button" data-primary-choice="'+escape(skill.id)+'" aria-pressed="'+(skill===current)+'">'+label(skill)+'</button>'
  ).join('')||'<p class="field-help">Select a skill above to make it your primary skill.</p>';
}
function populateForm() {
  profile=normalizeEquipment(profile,equipmentData);
  renderClassTree();
  for(const input of $$('[data-field]')){if(input.type==='radio')input.checked=input.value===profile[input.dataset.field];else if(input.type==='checkbox')input.checked=!!profile[input.dataset.field];else input.value=profile[input.dataset.field];}
  for(const input of $$('[data-price]'))input.value=profile.prices[input.dataset.price];
  for(const input of $$('[data-allowed]'))input.checked=profile.allowed.includes(input.dataset.allowed);
  $(`input[name="stats-mode"][value="${profile.mode}"]`).checked=true;
  renderWeapons();renderSkills();renderStats();
}
function displayedNumber(input) {
  if(input.dataset.price) return profile.prices[input.dataset.price];
  return profile[input.dataset.field] + Number(input.dataset.setOffset ?? 0);
}
function renderStats() {
  const gear=profile.mode==='gear';
  const set = gear ? activeArmorSet(profile) : null;
  for(const field of ['int','str']){
    const input = $('#stat-'+field);
    const offset = set?.[field] ?? 0;
    input.dataset.setOffset = offset;
    input.min = 1 + offset;
    input.max = 99 + offset;
    const value = displayedNumber(input);
    if(input.value === '' || Number(input.value) !== value) input.value = value;
  }
  $('#passive-section').hidden=!gear;
  $('#stat-enchant').textContent='+'+profile.enchant;
  for(const control of $$('.character-step-control')){
    const input=control.querySelector('input');
    const ranks=input?null:enchantRanks();
    const value=input?displayedNumber(input):profile.enchant;
    control.querySelector('[data-stat-step="-1"]').disabled=value<=(input?Number(input.min):ranks[0]);
    control.querySelector('[data-stat-step="1"]').disabled=value>=(input?Number(input.max):ranks.at(-1));
  }
  $('#manual-stats').hidden=gear;$('#gear-stats').hidden=!gear;$('#manual-weapon').hidden=gear;$('#weapon-consumption').hidden=!gear;
  for(const input of $$('#manual-stats input'))input.disabled=gear;
  for(const input of $$('#gear-stats input, #gear-stats select'))input.disabled=!gear;
  const stats=characterStats(catalog,profile);
  equipmentPicker?.render();
  $('#effective-matk').textContent=amount(stats.mAtk);$('#effective-patk').textContent=amount(stats.pAtk);
  $('#stats-note').textContent=gear?stats.warnings.join(' '):'Displayed stats + selected buffs';
  const armor=stats.armor;
  $('#armor-note').textContent=stats.armorSet?stats.armorSet.name+' active · '+stats.armorSet.effects:armor?.sets?.length?armor.sets.map(s=>s.name+': '+Object.values(s.items??{}).flat().map(i=>i.name).join(', ')).join(' / '):'';
  const w=stats.weapon;
  $('#weapon-consumption').textContent=w?`${w.name}: ${w.spiritshots} Spiritshots per charged spell; ${w.soulshots} Soulshots per charged basic attack.`:'Choose a weapon.';
  const basic=profile.attackMode!=='skills';
  $('#skill-controls').hidden=basic;$('#basic-controls').hidden=!basic;
  $('[data-field="shotCount"]').closest('.character-step').hidden=basic;
  if(basic&&gear)$('#weapon-consumption').textContent=w?`${w.name}: ${w.soulshots} Soulshots per charged basic attack${w.weaponType==='bow'?`, ${w.mpCost} MP and 1 arrow per bow shot`:''}.`:'Choose a weapon.';
  $('#basic-bow-mp').hidden=!basic||profile.attackMode!=='bow'||gear;
  $('#basic-help').textContent=profile.attackMode==='bow'?'Uses P. Atk. and one arrow per successful basic bow attack. In Gear estimate, equip a bow; in Manual stats, choose Bow as the weapon type. Critical hits, misses and random damage are not simulated.':'Uses P. Atk. for normal melee auto attacks. In Gear estimate, equip a melee weapon. No skills are cast; critical hits, misses and random damage are not simulated.';
  $('#plan-sort-casts').textContent=basic?'Fewest basic attacks':'Fewest casts';
}
function save() {
  const ok=saveProfile(profile);
  $('#save-status').textContent=ok?'Saved in this browser · used by the monster map':'Browser storage unavailable. Export your build to keep it; the monster map cannot receive these settings.';
  renderStats();
  requestId++;
  clearTimeout(timer);
  timer=setTimeout(calculate,160);
}
let monsterPins = loadMonsterPins();
let pinnedEntries = [];
let pinnedSort = $('#pinned-estimates input:checked').value;
function renderPinnedTargets() {
  if (!atlas) return;
  pinnedEntries = pinnedMonsters(atlas.monsters, monsterPins);
  $('#calculator-pins').hidden = !pinnedEntries.length;
  $('#calculator-pin-list').innerHTML = pinnedEntries.map(monster => {
    const locations = monster.locations.map(location => location.name).join(', ');
    return `<div class="calculator-pin-entry"><div class="calculator-pin-row">
      <button type="button" class="calculator-pin-target" data-pinned-target="${monster.id}" aria-pressed="${monster.id === targetId}">
        <strong>${escape(monster.name)}</strong>
        <small>Lv. ${monster.level}${locations ? ' · '+escape(locations) : ''}</small>
      </button>
      ${monsterPinButton(monster, true)}
    </div><div class="calculator-pin-result" data-pinned-result="${monster.id}" ${pinnedSort === 'off' ? 'hidden' : ''}>${killCard()}</div></div>`;
  }).join('');
}
function selectTarget(id) {
  targetId = id;
  $('#target-monster').value = targetId;
  for (const button of $$('[data-pinned-target]')) {
    button.setAttribute('aria-pressed', Number(button.dataset.pinnedTarget) === id);
  }
  calculate();
}
function renderTargets() {
  const matches=atlas.monsters;
  $('#target-monster').innerHTML=options(matches.map(m=>[m.id,`Lv.${m.level} ${m.name}${m.locations.length?' · '+m.locations[0].name:''} · #${m.id}`]));
  if(!matches.some(m=>m.id===targetId))targetId=matches.find(m=>m.slug==='ruin_bat')?.id??matches[0]?.id;
  renderPinnedTargets();
  selectTarget(targetId);
}
function calculate() {
  clearTimeout(timer);
  const currentRequest=++requestId;
  const m=atlas.monsters.find(m=>m.id===targetId), combat=catalog.monsters[targetId];
  if(!m){$('#target-results').innerHTML='<p class="field-help">No monsters available.</p>';$('#target-facts').textContent='';$('#calculation-status').textContent='';return;}
  $('#target-facts').innerHTML=`<a href="https://l2hub.info/c1/npcs/${encodeURIComponent(m.slug)}" target="_blank" rel="noopener noreferrer">${escape(m.name)} ↗</a><span>${escape(m.locations.map(l=>l.name).join(', ')||'Location not named')}</span><div><span>${amount(combat?.hp)} HP</span><span>${amount(combat?.mDef)} M. Def.</span><span>${amount(combat?.pDef)} P. Def.</span></div>`;
  $('#calculation-status').textContent=profile.attackMode==='skills'?'Comparing spell and shot combinations…':'Calculating basic attacks and consumable costs…';
  const pinnedIds = pinnedSort === 'off' ? [] : pinnedEntries.map(monster => monster.id);
  worker.postMessage({type:'calculate',requestId:currentRequest,profile,ids:[targetId],pinnedIds,pinnedSort});
}
function renderResult(result) {
  $('#calculation-status').textContent='Estimates for successful hits · no regeneration simulated';
  if(!result.best){$('#target-results').innerHTML=`<div class="calc-empty">${escape(result.error)}<small>Change attacks, shot options, or cast/melee limits.</small></div>`;return;}
  const b=result.baseline;
  const overview=`<div class="primary-result"><span class="eyebrow">${result.basicOnly?'BASIC ATTACKS ONLY':'PRIMARY SKILL'}</span><strong>${escape(hitCountLabel(b))}</strong><span>${b?escape(planLabel(b)):'Try a mixed plan below'}</span></div><div class="drop-summary"><span>Expected adena / kill</span><strong>${amount(result.revenue)}</strong></div><p class="field-help">Ranked by ${profile.sort==='cost'?(result.revenue===null?'lowest consumable cost (drop data unavailable)':'highest expected adena profit'):profile.sort==='mp'?'lowest MP use':result.basicOnly?'fewest basic attacks':'fewest casts'}.${result.basicOnly?' Basic-attack plans use no skills.':' Includes cheapest, fewest-cast and lowest-MP alternatives when different.'}</p>`;
  const plans=result.plans.map((plan,i)=>{
    const charges={};for(const a of plan.steps)if(a.shots)charges[a.mode]=(charges[a.mode]??0)+a.shots;
    if(plan.basicShots)charges.soul=(charges.soul??0)+plan.basicShots;
    if(profile.meleeShot&&plan.melee)charges.soul=(charges.soul??0)+plan.melee*(profile.mode==='gear'?characterStats(catalog,profile).weapon?.soulshots??0:profile.soulCount);
    const bone=plan.steps.reduce((n,s)=>n+s.bone,0);
    const weaponType=profile.mode==='gear'?characterStats(catalog,profile).weapon?.weaponType:profile.weaponType;
    const arrows=(plan.arrows??0)+plan.steps.reduce((n,s)=>n+(s.arrow??0),0)+(weaponType==='bow'?plan.melee:0);
    const consumables=[...Object.entries(charges).map(([mode,n])=>`${n} ${MODES[mode]}${n===1?'':'s'}`),...(bone?[`${bone} Cursed Bone${bone===1?'':'s'}`]:[]),...(arrows?[`${arrows} arrow${arrows===1?'':'s'}`]:[])].join(' · ')||'No consumables';
    return `<article class="result-plan ${i===0?'preferred':''}"><div class="result-plan-head"><span>${i===0?'PREFERRED PLAN':'ALTERNATIVE '+i}</span><b class="${plan.profit===null?'':plan.profit>=0?'profit':'loss'}">${escape(profitLabel(plan))}</b></div><h3>${escape(planLabel(plan))}</h3><div class="result-numbers"><div><span>COST</span><strong>${amount(plan.cost)}<small>adena</small></strong></div><div><span>MP</span><strong>${amount(plan.mp)}</strong></div><div><span>DAMAGE</span><strong>${amount(plan.damage)}</strong></div></div><p>${escape(consumables)}${plan.hp?` · ${amount(plan.hp)} HP consumed`:''}${plan.basicHits?` · ${amount(plan.damagePerHit)} damage / hit`:''}</p><small>Damage margin: ${amount(plan.margin)} HP${plan.margin<Math.max(10,result.target*.03)?' · tight margin; add HP safety':''}</small></article>`;
  }).join('');
  const singles=(result.singlePlans??[]).map(plan=>`<div class="single-plan"><span>${escape(planLabel(plan))}</span><small>${amount(plan.mp)} MP · ${amount(plan.cost)} adena cost · <b class="${plan.profit===null?'':plan.profit>=0?'profit':'loss'}">${escape(profitLabel(plan))}</b></small></div>`).join('');
  $('#target-results').innerHTML=overview+plans+(singles?`<details class="single-comparisons"><summary>Compare each skill & shot type (${result.singlePlans.length})</summary>${singles}</details>`:'');
}
function sourcePrices() {
  profile.prices=defaults().prices;
  for(const input of $$('[data-price]'))input.value=profile.prices[input.dataset.price];save();
}
async function init() {
  try {
    const responses=await Promise.all(['data/combat.json','data/monsters.json','data/equipment.json'].map(url=>fetch(url)));
    if(responses.some(r=>!r.ok))throw new Error('C1 data could not be loaded. Reload to try again.');
    [catalog,atlas,equipmentData]=await Promise.all(responses.map(r=>r.json()));repairProfile();
    equipmentPicker=createEquipmentPicker({root:$('#equipment-selector'),catalog:equipmentData,combat:catalog,getProfile:()=>profile,onChange:next=>{profile=cleanProfile(next);renderWeapons();save();}});
    populateForm();
    worker=new Worker(new URL('./combat-worker.js',import.meta.url),{type:'module'});
    worker.postMessage({type:'init',catalog,monsters:atlas.monsters});
    worker.onmessage = ({data}) => {
      if (data.requestId !== requestId) return;
      for (const row of data.results) {
        if (!row.pinned) {
          renderResult(row.result);
          continue;
        }
        const card = $(`[data-pinned-result="${row.id}"]`);
        if (!card || card.hidden) continue;
        const expanded = !!card.querySelector('.kill-details[open]');
        card.innerHTML = killCard(row.result);
        const details = card.querySelector('.kill-details');
        if (details) details.open = expanded;
      }
    };
    worker.onerror = () => {
      $('#calculation-status').textContent = 'Calculator unavailable. Reload this page to try again.';
      $('#target-results').textContent = '';
      for (const card of $$('[data-pinned-result]')) card.textContent = 'Calculator unavailable.';
    };
    targetId=Number(new URLSearchParams(location.search).get('monster'))||undefined;
    $('#calculator-content').hidden=false;$('#calculator-loading').hidden=true;
    renderTargets();saveProfile(profile);
    try {const last=sessionStorage.getItem('c1-atlas-return');if(last&&/^\?/.test(last))for(const a of $$('[data-atlas-link]'))a.href='./'+last;}catch{}
  } catch(error){$('#calculator-loading').hidden=true;$('#calculator-error').hidden=false;$('#calculator-error').textContent=error.message;}
}
document.addEventListener('click', event => {
  for(const picker of $$('.class-picker[open]')){
    if(!picker.contains(event.target)) picker.open=false;
  }
}, true);
$('#build-form').addEventListener('submit',event=>event.preventDefault());
$('#build-form').addEventListener('click',event=>{
  const choice=event.target.closest('[data-class-choice]');
  if(choice){
    const picker=choice.closest('details');
    if(profile.classId!==choice.dataset.classChoice){
      profile.classId=choice.dataset.classChoice;
      profile.level=Math.max(profile.level,(classChain(catalog,profile.classId).length-1)*20||1);
      [profile.str,profile.int]=baseStats(catalog,profile.classId);
      repairProfile(true);
      populateForm();
      save();
    }
    picker.open=false;
    picker.querySelector('summary').focus();
    return;
  }
  const primary=event.target.closest('[data-primary-choice]');
  if(primary){
    const picker=primary.closest('details');
    profile.primary=primary.dataset.primaryChoice;
    renderPrimary();
    picker.open=false;
    picker.querySelector('summary').focus();
    save();
    return;
  }
  const step=event.target.closest('[data-stat-step]');
  if(step&&!step.disabled){
    const direction=Number(step.dataset.statStep);
    const input=step.parentElement.querySelector('input');
    if(input){
      const value=input.value!==''&&input.validity.valid?Number(input.value):displayedNumber(input);
      input.value=Math.max(Number(input.min),Math.min(Number(input.max),Math.round((value+direction)*1e8)/1e8));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }else{
      const ranks=enchantRanks();
      profile.enchant=ranks[ranks.indexOf(profile.enchant)+direction];
      save();
    }
    return;
  }
  const button=event.target.closest('[data-level-step]');if(!button||button.disabled)return;
  const group=button.dataset.levelGroup;
  const cards=group==='buffs'?partyBuffs(catalog):learnedSkills(catalog,profile);
  const card=cards.find(s=>s.slug===button.dataset.levelCard);
  if(!card||!['attack','passives','buffs'].includes(group))return;
  const ranks=skillRanks(card,group),index=ranks.indexOf(skillLevel(card,group));
  const next=ranks[Math.max(0,Math.min(ranks.length-1,index+Number(button.dataset.levelStep)))];
  if(group==='attack'){
    pendingSkillLevels.set(card.slug,next);const selected=profile.skills.find(s=>s.id===card.slug);if(selected)selected.level=next;
  }else{delete profile[group][card.slug];if(next)profile[group][card.slug]=next;}
  refreshSkillRow(card,group);renderPrimary();save();
});
$('#build-form').addEventListener('change',event=>{
  const el=event.target;
  if(el.matches('[data-field]')) {
    if(el.closest('.character-step-control')&&el.type==='number'&&(!el.validity.valid||el.value==='')){
      el.value=displayedNumber(el);
      return;
    }
    profile[el.dataset.field]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value)-Number(el.dataset.setOffset??0):el.value;
    if(el.dataset.field==='attackMode'&&profile.mode==='manual'){
      if(profile.attackMode==='bow')profile.weaponType='bow';
      if(profile.attackMode==='melee'&&profile.weaponType==='bow')profile.weaponType='blunt';
      $('[data-field="weaponType"]').value=profile.weaponType;
    }
    if(el.dataset.field==='level'){profile=cleanProfile(profile);repairProfile();renderSkills();}
    else if(el.dataset.field==='weapon'){renderWeapons();}
  } else if(el.matches('[name="stats-mode"]')){profile.mode=el.value;if(profile.mode==='manual'&&profile.attackMode!=='skills'){profile.weaponType=profile.attackMode==='bow'?'bow':profile.weaponType==='bow'?'blunt':profile.weaponType;$('[data-field="weaponType"]').value=profile.weaponType;}renderStats();}
  else if(el.matches('[data-price]')){
    if(!el.validity.valid||el.value===''){
      el.value=profile.prices[el.dataset.price];
      return;
    }
    profile.prices[el.dataset.price]=Number(el.value);
  }
  else if(el.matches('[data-allowed]')){profile.allowed=$$('[data-allowed]:checked').map(i=>i.dataset.allowed);renderPrimary();}
  else if(el.matches('[data-skill]')){
    const learned=learnedSkills(catalog,profile);
    const card=learned.find(skill=>skill.slug===el.dataset.skill);
    const isOpener=id=>skillKind(learned.find(skill=>skill.slug===id)??{})==='surrender';
    const replacingOpener=el.checked && card && skillKind(card)==='surrender';
    const remaining=profile.skills.filter(skill=>skill.id!==el.dataset.skill && !(replacingOpener && isOpener(skill.id)));
    if(el.checked && remaining.length>=12){el.checked=false;$('#skill-note').textContent='Choose at most 12 attacks. Uncheck another attack first.';return;}
    profile.skills=remaining;
    if(el.checked && card)profile.skills.push({id:card.slug,level:skillLevel(card,'attack')});
    if(replacingOpener) for(const input of $$('[data-skill]')){
      if(input!==el && isOpener(input.dataset.skill)) input.checked=false;
    }
    renderPrimary();
  }
  profile=cleanProfile(profile);save();
});
$('#build-form').addEventListener('input',event=>{
  const el=event.target;if(el.type!=='number'||!el.validity.valid||el.value==='')return;
  if(el.dataset.field&&el.dataset.field!=='level')profile[el.dataset.field]=Number(el.value)-Number(el.dataset.setOffset??0);
  else if(el.dataset.price)profile.prices[el.dataset.price]=Number(el.value);else return;
  profile=cleanProfile(profile);save();
});
$('#sort-plans').addEventListener('change',event=>{profile.sort=event.target.value;save();});
$('#target-monster').addEventListener('change', event => selectTarget(Number(event.target.value)));
$('#pinned-estimates').addEventListener('change', event => {
  pinnedSort = event.target.value;
  for (const card of $$('[data-pinned-result]')) card.hidden = pinnedSort === 'off';
  calculate();
});
$('#clear-calculator-pins').addEventListener('click', () => {
  monsterPins.clear();
  saveMonsterPins(monsterPins);
  renderPinnedTargets();
  calculate();
  $('#target-monster').focus();
});
$('#calculator-pin-list').addEventListener('click', event => {
  const target = event.target.closest('[data-pinned-target]');
  if (target) {
    selectTarget(Number(target.dataset.pinnedTarget));
    $('#target-monster').focus();
    return;
  }
  const unpin = event.target.closest('[data-monster-pin]');
  if (!unpin) return;
  monsterPins.delete(Number(unpin.dataset.monsterPin));
  saveMonsterPins(monsterPins);
  renderPinnedTargets();
  calculate();
  ($('#calculator-pin-list .monster-pin') ?? $('#target-monster')).focus();
});
window.addEventListener('storage', event => {
  if (event.key !== MONSTER_PINS_KEY && event.key !== null) return;
  monsterPins = loadMonsterPins();
  renderPinnedTargets();
  if (worker) calculate();
});
$('#source-prices').addEventListener('click',sourcePrices);
$('#reset-build').addEventListener('click',()=>{profile=defaults();repairProfile();populateForm();save();});
$('#export-build').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(cleanProfile(profile),null,2)],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download='c1-atlas-build.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('#import-build').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>100000)throw new Error('Build file is too large.');const value=JSON.parse(await file.text());if(value?.version!==1)throw new Error('Choose an exported C1 Atlas build file.');profile=cleanProfile(value);repairProfile();populateForm();save();}
  catch(error){$('#save-status').textContent=error.message;}event.target.value='';
});
window.addEventListener('storage',event=>{if(event.key===PROFILE_KEY&&catalog){profile=loadProfile();repairProfile();populateForm();calculate();}});
init();
