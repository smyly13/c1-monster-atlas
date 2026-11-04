import { EQUIPMENT_SLOTS, GRADE_ORDER, WEAPON_TYPES, STARTER_WEAPONS, ARMOR_SETS, activeArmorSet, equipArmorSet, gradeName, normalizeEquipment, equipItem, filterEquipment } from './equipment-model.js';
import { escape, amount } from './combat-ui.js';
const option=(value,label)=>`<option value="${escape(value)}">${escape(label)}</option>`;
export function createEquipmentPicker({root,catalog,combat,getProfile,onChange}) {
  let slotId='weapon',type='all',search='',hoverTarget;
  const bySlug=new Map(catalog.items.map(i=>[i.slug,i])),byId=new Map(catalog.items.map(i=>[i.id,i]));
  const dialog=document.createElement('dialog');dialog.className='gear-picker';dialog.setAttribute('aria-labelledby','gear-picker-title');
  dialog.innerHTML=`<div class="gear-picker-heading"><div><span class="eyebrow">C1 EQUIPMENT</span><h2 id="gear-picker-title">Choose equipment</h2><p id="gear-picker-help">Hover or focus an icon to inspect it. Click to equip.</p></div><button type="button" class="gear-picker-close" aria-label="Close equipment picker">×</button></div><div class="gear-picker-toolbar"><label id="gear-type-label">Weapon type<select id="gear-type"></select></label><label>Find an item<input id="gear-search" type="search" placeholder="Search item names…" autocomplete="off"></label></div><div class="gear-picker-options"><span id="gear-item-count" role="status"></span></div><p id="gear-conflict" class="gear-conflict" hidden></p><div id="gear-picker-items" class="gear-picker-items"></div><div class="gear-picker-footer"><span id="gear-current-item"></span><button id="gear-remove" type="button" class="outline-button">Remove item</button></div>`;
  document.body.append(dialog);
  const $=s=>dialog.querySelector(s);
  const tooltip=document.createElement('div');tooltip.id='gear-item-tooltip';tooltip.className='gear-item-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
  function equipped(id){return bySlug.get(normalizeEquipment(getProfile(),catalog).equipment[id]);}
  function hideTooltip(){tooltip.hidden=true;if(hoverTarget)hoverTarget.removeAttribute('aria-describedby');hoverTarget=null;}
  function showTooltip(target,item,{enchant=0,note='',slot}={}){
    hideTooltip();if(!target)return;
    hoverTarget=target;target.setAttribute('aria-describedby',tooltip.id);
    if(dialog.open)dialog.append(tooltip);else document.body.append(tooltip);
    const weapon=combat.weapons.find(w=>w.slug===item?.slug),e=weapon?.enchants?.find(e=>e.level===enchant);
    const starter=item?.type==='weapon'?STARTER_WEAPONS.get(item.id):null;
    const rows=[];
    if(item){
      if(item.type==='weapon'){
        rows.push(['P. Atk.',e?.pAtk??item.pAtk],['M. Atk.',e?.mAtk??item.mAtk],['Atk. Speed',starter?.speed??item.attackSpeed]);
        if(starter){
          if(starter.accuracy!==undefined) rows.push(['Accuracy',starter.accuracy]);
          rows.push(['Crit. Rate',starter.critical]);
        }else{
          rows.push(['Soulshots / charge',item.soulshots],['Spiritshots / charge',item.spiritshots]);
        }
      }
      else{if(item.pDef)rows.push(['P. Def.',item.pDef]);if(item.mDef)rows.push(['M. Def.',item.mDef]);if(item.shield)rows.push(['Shield defense',item.shield]);}
      rows.push(['Weight',item.weight],['Base price',`${amount(item.basePrice)} adena`]);
    }
    const category=item?.type==='weapon'?(WEAPON_TYPES.find(([key])=>key===item.category)?.[1]??item.weaponType):item?.slot==='onepiece'?'Full-body armor':item?.armorType==='magic'?'Robe':item?.armorType&&item.armorType!=='none'?`${item.armorType} armor`:slot?.label??'Equipment';
    tooltip.innerHTML=item?`<div class="item-tooltip-heading"><img src="${escape(item.image)}" width="32" height="32" alt=""><div><strong>${enchant?'+'+enchant+' ':''}${escape(item.name)}</strong><span>${escape(gradeName(item.grade))} · ${escape(category)}${item.twoHanded?' · Two-handed':starter?' · One-handed':''}</span></div></div><dl>${rows.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${typeof value==='number'?amount(value):escape(value)}</dd></div>`).join('')}</dl>${note?`<p>${escape(note)}</p>`:''}${starter?'<p>Starter equipment. Cannot use Soulshots or Spiritshots.</p>':!item.available?'<p class="item-availability">The C1 source lists no acquisition route for this item.</p>':''}`:`<strong>${escape(slot?.label??'Equipment')}</strong><p>Empty slot · click to choose an item.</p>${note?`<p>${escape(note)}</p>`:''}`;
    tooltip.hidden=false;
    const rect=target.getBoundingClientRect(),tip=tooltip.getBoundingClientRect(),width=document.documentElement.clientWidth,height=window.innerHeight;
    let left=rect.right+12;if(left+tip.width>width-8)left=rect.left-tip.width-12;
    tooltip.style.left=Math.max(8,Math.min(left,width-tip.width-8))+'px';tooltip.style.top=Math.max(8,Math.min(rect.top,height-tip.height-8))+'px';
  }
  function render(){
    const profile=normalizeEquipment(getProfile(),catalog),weapon=bySlug.get(profile.weapon),chest=bySlug.get(profile.armor),equipment=profile.equipment;
    root.innerHTML=`<div class="equipment-heading"><div><span class="eyebrow">YOUR LOADOUT</span><h3>Character equipment</h3></div><button type="button" class="text-button" data-clear-equipment>Unequip all</button></div><div class="equipment-paperdoll"><img class="equipment-background" src="assets/equipment-empty.png" width="219" height="133" alt="" aria-hidden="true">${EQUIPMENT_SLOTS.map(slot=>{
      const item=bySlug.get(equipment[slot.id]);
      const ghost=slot.id==='offhand'&&weapon?.twoHanded?weapon:slot.id==='legs'&&chest?.slot==='onepiece'?chest:null;
      return `<button type="button" class="equipment-slot ${item?'equipped':''} ${ghost?'occupied':''}" data-equipment-slot="${slot.id}" style="left:${slot.x/219*100}%;top:${slot.y/133*100}%;width:${31/219*100}%;height:${31/133*100}%" aria-label="${escape(slot.label)}: ${escape(item?.name??(ghost?'occupied by '+ghost.name:'empty'))}. Choose equipment.">${item?`<img src="${escape(item.image)}" alt="" width="32" height="32">${item.grade!=='none'?`<span class="equipped-grade">${item.grade.toUpperCase()}</span>`:''}`:ghost?'<span class="slot-lock" aria-hidden="true">↔</span>':''}<span class="slot-focus-label">${escape(slot.label)}</span></button>`;
    }).join('')}<span class="equipment-reserved" style="left:${136/219*100}%;top:${14/133*100}%;width:${31/219*100}%;height:${31/133*100}%" title="Reserved — no C1 equipment slot" aria-label="Reserved, no C1 equipment slot"></span></div><p class="equipment-hint">Click a slot to choose gear. Hover an equipped item to inspect it.</p><p class="gear-selection-status" role="status"></p>`;
  }
  function itemButton(item,index){
    const selected=equipped(slotId)?.id===item.id;
    return `<button type="button" class="gear-item ${selected?'selected':''}" data-item-id="${item.id}" aria-label="Equip ${escape(item.name)}, ${escape(gradeName(item.grade))}" aria-pressed="${selected}" tabindex="${index===0?'0':'-1'}"><img src="${escape(item.image)}" width="32" height="32" alt="" loading="lazy">${selected?'<span class="item-check" aria-hidden="true">✓</span>':''}</button>`;
  }
  function renderItems(){
    hideTooltip();
    const items=filterEquipment(catalog,slotId,{type,search,availableOnly:true});let index=0;
    $('#gear-item-count').textContent=`${items.length} item${items.length===1?'':'s'}`;
    $('#gear-picker-items').innerHTML=items.length?GRADE_ORDER.map(grade=>{
      const group=items.filter(i=>i.grade===grade);
      return group.length?`<section class="gear-grade-group" aria-label="${escape(gradeName(grade))} equipment"><div class="gear-grade-heading"><h3>${escape(gradeName(grade))}</h3><span>${group.length} item${group.length===1?'':'s'}</span></div><div class="gear-icon-grid">${group.map(i=>itemButton(i,index++)).join('')}</div></section>`:'';
    }).join(''):'<div class="gear-empty"><strong>No matching equipment</strong><p>Try another type or clear the search. Only items with a known acquisition source are shown.</p></div>';
    if(!['weapon','neck','earLeft','earRight','ringLeft','ringRight'].includes(slotId)){
      const active=activeArmorSet(getProfile());
      const sets=ARMOR_SETS.map((set,index)=>`<button type="button" data-armor-set="${index}" aria-pressed="${set===active}"><strong>${escape(set.name)}</strong><span>${escape(set.effects)}</span></button>`).join('');
      $('#gear-picker-items').insertAdjacentHTML('afterbegin',`<section class="gear-set-list"><h3>Armor sets · 3 pieces</h3>${sets}</section>`);
    }
    const item=equipped(slotId);
    $('#gear-current-item').textContent=item?'Equipped: '+item.name:'This slot is empty';$('#gear-remove').disabled=!item;
  }
  function open(id){
    slotId=id;search='';
    const slot=EQUIPMENT_SLOTS.find(s=>s.id===id),item=equipped(id);
    type=id==='weapon'?item?.category??'all':'all';
    const categories=id==='weapon'?WEAPON_TYPES:[['all','All armor types'],['magic','Robe'],['light','Light'],['heavy','Heavy'],['none','Other']];
    $('#gear-type').innerHTML=categories.map(([value,label])=>option(value,label)).join('');
    if(!categories.some(([value])=>value===type))type='all';
    $('#gear-type').value=type;$('#gear-search').value='';
    $('#gear-type-label').firstChild.textContent=id==='weapon'?'Weapon type':'Armor type';
    $('#gear-type-label').hidden=id!=='weapon'&&id!=='chest'&&id!=='legs';
    $('#gear-picker-title').textContent='Choose '+slot.label.toLowerCase();
    const profile=normalizeEquipment(getProfile(),catalog),weapon=bySlug.get(profile.weapon),chest=bySlug.get(profile.armor);
    const conflict=id==='offhand'&&weapon?.twoHanded?`Equipping a shield will unequip ${weapon.name}, which uses both hands.`:id==='legs'&&chest?.slot==='onepiece'?`Equipping leg armor will unequip ${chest.name}, which covers the full body.`:'';
    $('#gear-conflict').textContent=conflict;$('#gear-conflict').hidden=!conflict;
    renderItems();hideTooltip();dialog.showModal();document.body.classList.add('equipment-modal-open');$('#gear-search').focus();
  }
  function close(){hideTooltip();dialog.close();document.body.classList.remove('equipment-modal-open');root.querySelector(`[data-equipment-slot="${slotId}"]`)?.focus({preventScroll:true});}
  function choose(item){
    const profile=equipItem(getProfile(),catalog,slotId,item);if(!profile)return;
    onChange(profile);render();close();
    const label=EQUIPMENT_SLOTS.find(s=>s.id===slotId).label;
    root.querySelector('.gear-selection-status').textContent=item?`${item.name} equipped in ${label.toLowerCase()}.`:`${label} unequipped.`;
  }
  root.addEventListener('click',event=>{
    const slot=event.target.closest('[data-equipment-slot],[data-edit-slot]');
    if(slot){open(slot.dataset.equipmentSlot??slot.dataset.editSlot);return;}
    if(event.target.closest('[data-clear-equipment]')){hideTooltip();onChange({...getProfile(),weapon:'',armor:'',enchant:0,equipment:{}});render();root.querySelector('.gear-selection-status').textContent='All equipment removed.';}
  });
  function showSlotTooltip(target){
    const slot=EQUIPMENT_SLOTS.find(s=>s.id===target.dataset.equipmentSlot);if(!slot)return;
    const profile=getProfile(),item=equipped(slot.id),weapon=equipped('weapon'),chest=equipped('chest');
    let note='';if(slot.id==='offhand'&&weapon?.twoHanded)note=weapon.name+' occupies both hands. Click to choose a shield instead.';
    if(slot.id==='legs'&&chest?.slot==='onepiece')note=chest.name+' also covers your legs.';
    showTooltip(target,item,{slot,note,enchant:slot.id==='weapon'?profile.enchant:0});
  }
  root.addEventListener('pointerover',event=>{const t=event.target.closest('[data-equipment-slot]');if(t&&!t.contains(event.relatedTarget))showSlotTooltip(t);});
  root.addEventListener('pointerout',event=>{const t=event.target.closest('[data-equipment-slot]');if(t&&!t.contains(event.relatedTarget))hideTooltip();});
  root.addEventListener('focusin',event=>{if(event.target.matches('[data-equipment-slot]'))showSlotTooltip(event.target);});
  root.addEventListener('focusout',hideTooltip);
  dialog.addEventListener('pointerover',event=>{const t=event.target.closest('[data-item-id]');if(t&&!t.contains(event.relatedTarget))showTooltip(t,byId.get(Number(t.dataset.itemId)));});
  dialog.addEventListener('pointerout',event=>{const t=event.target.closest('[data-item-id]');if(t&&!t.contains(event.relatedTarget))hideTooltip();});
  dialog.addEventListener('focusin',event=>{if(event.target.matches('[data-item-id]'))showTooltip(event.target,byId.get(Number(event.target.dataset.itemId)));});
  dialog.addEventListener('focusout',hideTooltip);
  dialog.addEventListener('click',event=>{
    const setButton=event.target.closest('[data-armor-set]');
    if(setButton){
      const set=ARMOR_SETS[Number(setButton.dataset.armorSet)];
      const profile=equipArmorSet(getProfile(),catalog,set);
      if(profile){
        onChange(profile);render();close();
        root.querySelector('.gear-selection-status').textContent=set.name+' equipped.';
      }
      return;
    }
    const item=event.target.closest('[data-item-id]');if(item){choose(byId.get(Number(item.dataset.itemId)));return;}
    if(event.target.closest('.gear-picker-close'))close();
    if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}
  });
  $('#gear-remove').addEventListener('click',()=>choose(null));
  $('#gear-type').addEventListener('change',event=>{type=event.target.value;renderItems();});
  $('#gear-search').addEventListener('input',event=>{search=event.target.value;renderItems();});
  $('#gear-picker-items').addEventListener('scroll',hideTooltip,{passive:true});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{
    if(!event.target.matches('[data-item-id]'))return;
    const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];if(!keys.includes(event.key))return;
    event.preventDefault();const buttons=[...dialog.querySelectorAll('[data-item-id]')],index=buttons.indexOf(event.target);
    const columns=Math.max(1,Math.floor(event.target.parentElement.clientWidth/48));
    let next=event.key==='Home'?0:event.key==='End'?buttons.length-1:index+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key]??0);
    next=Math.max(0,Math.min(buttons.length-1,next));buttons.forEach((b,i)=>b.tabIndex=i===next?0:-1);buttons[next]?.focus();
  });
  window.addEventListener('resize',hideTooltip);window.addEventListener('scroll',hideTooltip,{passive:true});
  return {render,close,destroy(){hideTooltip();dialog.remove();tooltip.remove();}};
}
