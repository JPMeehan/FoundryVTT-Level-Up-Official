export default function prepareDamageBonuses(actor, rolls) {
  const attackRoll = rolls.attack ?? [];

  if (!Array.isArray(attackRoll[0])) return [];

  const { attackType } = attackRoll[0][1] ?? {};
  const bonusDamage = actor.system.bonuses.damage;
  const counts = {};

  const damageBonuses = Object.entries(bonusDamage).filter(
    ([, { context, formula }]) => {
      if (!formula) return false;
      const { attackTypes } = context;

      if (attackTypes && attackTypes.includes(attackType)) return true;

      return false;
    }
  );

  return damageBonuses.map(([key, damageBonus]) => {
    if (!damageBonus.label) {
      const label = game.i18n.format('A5E.DamageBonusSpecific', {
        damageType: game.i18n.localize(CONFIG.A5E.damageTypes[damageBonus.damageType] ?? '')
      });

      counts[damageBonus.damageType] ??= 0;
      counts[damageBonus.damageType] += 1;

      damageBonus.defaultLabel = `${label} #${counts[damageBonus.damageType]}`;
    }

    return [key, damageBonus];
  });
}
