import { localize } from '#runtime/svelte/helper';

export default async function doubleDiceDamage(baseRoll) {
  const diceDamage = baseRoll.dice.reduce((acc, die) => acc + die.total, 0);

  const terms = [
    ...baseRoll.terms,
    await new OperatorTerm({ operator: '+' }).evaluate(),
    await new NumericTerm({
      number: diceDamage,
      options: { flavor: localize('A5E.CritDamage') }
    }).evaluate()
  ];

  return terms;
}
