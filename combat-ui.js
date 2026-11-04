import { planLabel } from './combat.js';
export const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const amount = n => n === null || !Number.isFinite(n) ? 'Unknown' : n.toLocaleString('en-US',{ maximumFractionDigits:1 });
export function profitLabel(plan) { return plan.profit === null ? 'Drop unknown' : `${plan.profit >= 0 ? '+' : '−'}${amount(Math.abs(plan.profit))} adena / kill`; }
function actionLabel(count, label, action) {
  const image = action.image ?? (action.basicType === 'bow' ? 'assets/skills/skill0208.png'
    : action.basicType === 'melee' ? 'assets/skills/skill0217.png' : '');
  const icon = image
    ? `<img class="kill-skill-icon" src="${escape(image)}" alt="" width="18" height="18" loading="lazy">`
    : '';
  return `${count}× ${icon}${escape(label)}`;
}
function planRow(plan, best = false, finishingShotsPerHit = 0) {
  const shots = plan.steps.reduce((total, step) => total + step.shots, 0)
    + (plan.basicShots ?? 0) + plan.melee * finishingShotsPerHit;
  return `<div class="kill-option${best ? ' kill-option-best' : ''}"><span class="kill-option-title">${best ? '<b class="best-tag">BEST</b> ' : ''}${planLabel(plan, actionLabel)}</span><span class="kill-metrics">${amount(plan.mp)} MP · ${shots} shot${shots === 1 ? '' : 's'} · ${amount(plan.cost)} adena cost</span><span class="${plan.profit === null ? '' : plan.profit >= 0 ? 'profit' : 'loss'}">${escape(profitLabel(plan))}</span></div>`;
}
export function killCard(result) {
  if (!result?.best) return '<div class="kill-card"><span class="kill-unavailable">'+escape(result?.error ?? 'Calculating…')+'</span></div>';
  const { best, plans, singlePlans = [], finishingShotsPerHit = 0 } = result;
  const seen = new Set([planLabel(best)]);
  const alternatives = [...plans, ...singlePlans].filter(plan => {
    const label = planLabel(plan);
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
  const compare = alternatives.length
    ? `<details class="kill-details"><summary>Each skill &amp; shot type (${alternatives.length})</summary>${alternatives.map(plan => planRow(plan, false, finishingShotsPerHit)).join('')}</details>`
    : '';
  return `<div class="kill-card">${planRow(best, true, finishingShotsPerHit)}${compare}</div>`;
}
