import { localize } from '#runtime/svelte/helper';

export default function getAttunementLabel(item) {
  const { requiresAttunement, attuned } = item.system;

  if (!requiresAttunement) return null;
  if (attuned) return localize('A5E.Attuned');
  if (!item.actor) return localize('A5E.AttunementRequired');

  return `${localize('A5E.AttunementRequired')} - ${localize('A5E.AttunedNot')}`;
}
