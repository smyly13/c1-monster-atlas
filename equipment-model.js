export const GRADE_ORDER = ['none', 'd', 'c', 'b', 'a', 's'];
export const gradeName = grade => grade === 'none' ? 'No Grade' : `${grade.toUpperCase()} Grade`;
// Coordinates refer to the user's original, unchanged 219 × 133 equipment image.
export const EQUIPMENT_SLOTS = [
  { id:'underwear', label:'Underwear', accepts:['underwear'], x:12, y:14 },
  { id:'head', label:'Helmet', accepts:['head'], x:52, y:14 },
  { id:'back', label:'Cloak', accepts:['back'], x:92, y:14 },
  { id:'neck', label:'Necklace', accepts:['neck'], x:176, y:14 },
  { id:'weapon', label:'Weapon', accepts:['rhand','lrhand'], x:12, y:53 },
  { id:'chest', label:'Chest / full-body armor', accepts:['chest','onepiece'], x:52, y:53 },
  { id:'offhand', label:'Shield / off hand', accepts:['lhand'], x:92, y:53 },
  { id:'earLeft', label:'Left earring', accepts:['ear'], x:136, y:53 },
  { id:'earRight', label:'Right earring', accepts:['ear'], x:176, y:53 },
  { id:'gloves', label:'Gloves', accepts:['gloves'], x:12, y:92 },
  { id:'legs', label:'Leg armor', accepts:['legs'], x:52, y:92 },
  { id:'feet', label:'Boots', accepts:['feet'], x:92, y:92 },
  { id:'ringLeft', label:'Left ring', accepts:['finger'], x:136, y:92 },
  { id:'ringRight', label:'Right ring', accepts:['finger'], x:176, y:92 },
];
export const WEAPON_TYPES = [['all','All weapon types'],['sword','Sword'],['staff','Staff'],['wand','Wand / rod'],['book','Spellbook'],['blunt','Blunt / axe'],['dagger','Dagger'],['bow','Bow'],['pole','Polearm'],['dual','Dual swords'],['dualfist','Dual fists'],['fist','Fist'],['etc','Other weapons']];
export const ARMOR_SETS = [
  { name:'Knowledge Set', pieces:{chest:'tunic_of_knowledge',legs:'hose_of_knowledge',gloves:'gloves_of_knowledge'}, effects:'M. Atk. +10.25%, MP recovery −5%', mAtk:1.1025 },
  { name:'Mithril Set', pieces:{chest:'mithril_tunic',legs:'mithril_hose',gloves:'elven_mithril_gloves'}, effects:'INT −1, WIT +1, Speed +7', int:-1 },
  { name:'Plated Leather Set', pieces:{chest:'plate_leather',legs:'plate_leather_gaiters',feet:'plate_leather_boots'}, effects:'STR +4, CON −1', str:4 },
  { name:"Demon's Set", pieces:{chest:"demon's_tunic",legs:"demon's_hose",gloves:"demon's_gloves"}, effects:'INT +4, WIT −1, Max HP −270', int:4 },
  { name:'Divine Set', pieces:{chest:'divine_tunic',legs:'divine_hose',gloves:'divine_gloves'}, effects:'INT −1, WIT +1, P. Def. +5.26%, Max MP +171', int:-1 },
];
export function activeArmorSet(profile) {
  return ARMOR_SETS.find(set => Object.entries(set.pieces).every(([slot, slug]) =>
    (slot === 'chest' ? profile.armor : profile.equipment?.[slot]) === slug));
}
export function equipArmorSet(profile, catalog, set) {
  let next = profile;
  for (const [slot, slug] of Object.entries(set.pieces)) {
    const item = catalog.items.find(entry => entry.slug === slug);
    if (!item) return null;
    next = equipItem(next, catalog, slot, item);
    if (!next) return null;
  }
  return next;
}
export function canEquip(item, slotId) {
  const slot=EQUIPMENT_SLOTS.find(s=>s.id===slotId);
  return !!slot && !!item && slot.accepts.includes(item.slot) && (slotId === 'weapon' ? item.type === 'weapon' : item.type !== 'weapon');
}
export function normalizeEquipment(profile, catalog) {
  const equipment={};
  for(const slot of EQUIPMENT_SLOTS){
    const slug=slot.id==='weapon'?profile.weapon:slot.id==='chest'?profile.armor:profile.equipment?.[slot.id];
    const item=catalog.items.find(i=>i.slug===slug);
    if(canEquip(item,slot.id))equipment[slot.id]=item.slug;
  }
  const weapon=catalog.items.find(i=>i.slug===equipment.weapon), chest=catalog.items.find(i=>i.slug===equipment.chest);
  if(weapon?.twoHanded)delete equipment.offhand;
  if(chest?.slot==='onepiece')delete equipment.legs;
  return {...profile,equipment,weapon:equipment.weapon??'',armor:equipment.chest??''};
}
export function equipItem(profile, catalog, slotId, item) {
  if(item&&!canEquip(item,slotId))return null;
  if(!EQUIPMENT_SLOTS.some(s=>s.id===slotId))return null;
  const next=normalizeEquipment(profile,catalog);next.equipment={...next.equipment};
  if(item)next.equipment[slotId]=item.slug;else delete next.equipment[slotId];
  if(slotId==='weapon') {next.weapon=item?.slug??'';next.enchant=0;if(item?.twoHanded)delete next.equipment.offhand;}
  if(slotId==='chest'){next.armor=item?.slug??'';if(item?.slot==='onepiece')delete next.equipment.legs;}
  if(slotId==='offhand'&&item){const w=catalog.items.find(i=>i.slug===next.weapon);if(w?.twoHanded){next.weapon='';next.enchant=0;delete next.equipment.weapon;}}
  if(slotId==='legs'&&item){const c=catalog.items.find(i=>i.slug===next.armor);if(c?.slot==='onepiece'){next.armor='';delete next.equipment.chest;}}
  return next;
}
// Starter loadout and tooltip values verified against the in-game item screens.
export const STARTER_WEAPONS = new Map([
  [2368, { speed: 'Normal', accuracy: '4.75', critical: '4.00' }], // Training Gloves
  [2369, { speed: 'Fast', critical: '8.00' }], // Squire's Sword
  [10, { speed: 'Very Fast', accuracy: '-3.75', critical: '12.00' }], // Dagger
  [6, { speed: 'Fast', accuracy: '4.75', critical: '4.00' }], // Apprentice's Wand
  [2370, { speed: 'Fast', accuracy: '4.75', critical: '4.00' }], // Guild Member's Club
]);
export function filterEquipment(catalog, slotId, { type='all', search='', availableOnly=false }={}) {
  const q=search.trim().toLowerCase();
  const isPetSword = item => item.grade === 'none' && item.weaponType === 'sword'
    && item.image === 'assets/items/etc_pet_arms_i00.png';
  const isPetArmor = item => item.grade === 'none' && item.type === 'armor'
    && item.image === 'assets/items/etc_pet_armor_i00.png';
  return catalog.items.filter(item => !isPetSword(item) && !isPetArmor(item))
    .filter(item=>canEquip(item,slotId)&&(!availableOnly||item.available||(item.type==='weapon'&&STARTER_WEAPONS.has(item.id)))&&(!q||`${item.name} ${item.slug}`.toLowerCase().includes(q))&&(type==='all'||(slotId==='weapon'?item.category===type:item.armorType===type))).sort((a,b)=>(a.pAtk+a.mAtk+a.pDef+a.mDef+a.shield)-(b.pAtk+b.mAtk+b.pDef+b.mDef+b.shield)||a.name.localeCompare(b.name)||a.id-b.id);
}
