import type ArchetypeItemA5e from './archetype';
import type { ClassCastingData, ClassSystemSource } from './data';

import OriginItemA5e from './origin';

import ClassResourceManager from '../../managers/ClassResourceManager';

export default class ClassItemA5e extends OriginItemA5e {
  declare casting: ClassCastingData | null;

  declare hitDice: {
    current: number;
    total: number;
    size: number;
  };

  declare system: ClassSystemSource;

  declare resources: ClassResourceManager;

  get associatedLevels() {
    const { levels } = this.system.hp;
    return Object.entries(levels ?? {}).reduce((acc, [level, value]) => {
      if (!value) return acc;
      acc.push(level);
      return acc;
    }, [] as string[]);
  }

  get averageHP() {
    return Math.floor(this.hitDice.size / 2) + 1;
  }

  get classLevels() {
    return this.system.classLevels;
  }

  get isStartingClass() {
    if (!this.isEmbedded) return false;

    return this.parent?.system.classes.startingClass === this.slug;
  }

  // TODO: Class documents - Cache this
  get maxHP() {
    return this.prepareMaxHitPoints();
  }

  get subclass() {
    if (!this.isEmbedded) return null;
    const { slug } = this;

    const cls: unknown | undefined = this.parent?.items
      .find((i) => i.type === 'archetype' && i.system.class === slug);

    if (!cls) return null;
    return cls as ArchetypeItemA5e;
  }

  get slug() {
    return this.system.slug || this.name.slugify({ strict: true });
  }

  get totalHitDice() {
    return this.classLevels;
  }

  prepareBaseData() {
    super.prepareBaseData();

    // Set up class resource manager
    this.resources = new ClassResourceManager(this);

    // this.maxHP = this.prepareMaxHitPoints();
    this.hitDice = {
      current: this.totalHitDice - this.system.hp.hitDiceUsed,
      total: this.totalHitDice,
      size: this.system.hp.hitDiceSize
    };

    this.casting = this.prepareCasterData();
  }

  prepareMaxHitPoints() {
    const { levels } = this.system.hp;

    const actor = this.isEmbedded ? this.parent : null;
    const maxLevel = actor ? actor.levels.character : 20;

    return Object.entries(levels ?? {}).reduce((acc, [level, value]) => {
      if (!value || level > maxLevel) return acc;
      return acc + value;
    }, 0);
  }

  prepareCasterData() {
    const { casterType } = this.system.spellcasting;
    if (!casterType || casterType === 'none' || !this.classLevels) return null;

    const progressionConfig = CONFIG.A5E.casterProgression[casterType] ?? null;
    if (!progressionConfig) return null;

    const {
      type, config, resource, multiplier, roundUp, multiclassMode
    } = progressionConfig;

    const data: ClassCastingData = { casterType, resource, progressionType: type };

    // Add spellcasting resource data
    if (type === 'multiplier' && resource === 'slots') {
      const roundFunc = Math.ceil;
      const slots = config[roundFunc(this.classLevels * (multiplier ?? 1))] ?? [];

      data.slots = Object.fromEntries(slots.map((slot: number, idx: number) => {
        const skip = Math.round(1 / multiplier) > this.classLevels;
        if (multiplier < 1 && skip && !roundUp) return [idx + 1, 0];

        return [idx + 1, slot];
      }));
    }

    if (type === 'reference') {
      const ref = config[this.classLevels];
      data.multiclassMode = multiclassMode;
      if (resource === 'slots') {
        data.slots = { [ref.level]: ref.slots };
      } else if (resource === 'points') {
        data.points = ref.points;
        data.maxLevel = ref.level;
      } else if (resource === 'inventions') {
        data.inventions = ref.count;
        data.maxLevel = ref.level;
      } else if (resource === 'artifactCharges') {
        data.charges = ref.charges;
        data.maxLevel = ref.level;
      }
    }

    return data;
  }

  getRollData() {
    const data: Record<string, any> = { ...super.getRollData() };
    const resources = this?.resources?.rollData ?? {};

    const { subclass } = this;
    if (subclass) {
      const subResources = subclass?.resources?.rollData ?? {};
      Object.assign(resources, subResources);
    }

    data.actorTransfer = {
      level: this.classLevels,
      hitDiceSize: this.system.hp.hitDiceSize,
      hitDiceUsed: this.system.hp.hitDiceUsed,
      resources,
      ...resources
    };

    return data;
  }

  _preCreate(data, options, user) {
    foundry.utils.setProperty(data, 'system.classLevels', 1);
    foundry.utils.setProperty(data, 'system.hp.hitDiceUsed', 0);

    // Reset hp rolls
    Array.from({ length: 19 }, (_, i) => i + 2).forEach((level) => {
      foundry.utils.setProperty(data, `system.hp.levels.${level}`, 0);
    });

    if (this.parent?.documentName === 'Actor') {
      const actor = this.parent;
      const { classes } = actor;

      if (!Object.keys(classes).length) {
        actor.update({ 'system.classes.startingClass': this.slug });

        // Update starting hp
        const startingHp = this?.system?.hp?.hitDiceSize ?? 6;
        foundry.utils.setProperty(data, 'system.hp.levels.1', startingHp);
      } else {
        foundry.utils.setProperty(data, 'system.hp.levels.1', 0);
      }

      const existing = classes[this.slug];
      if (existing) {
        existing.update({ 'system.classLevels': Math.min(existing.system.classLevels + 1, 20) });
        return false;
      }
    }

    this.updateSource(data);

    super._preCreate(data, options, user);
    return true;
  }

  // eslint-disable-next-line consistent-return
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    const keys = Object.keys(foundry.utils.flattenObject(changed));
    if (keys.includes('system.hp.hitDiceSize') && (this.isStartingClass || !this.parent)) {
      const size = foundry.utils.getProperty(changed, 'system.hp.hitDiceSize');
      await this.updateSource({ 'system.hp.levels.1': size });
    }

    if (keys.includes('system.slug') && this.isStartingClass && this.parent?.documentName === 'Actor') {
      const slug = foundry.utils.getProperty(changed, 'system.slug');
      this.parent.update({ 'system.classes.startingClass': slug });
    }

    // Clamp hitDice used
    if (keys.includes('system.hp.hitDiceUsed')) {
      const used = foundry.utils.getProperty(changed, 'system.hp.hitDiceUsed');
      const max = this.totalHitDice;
      await this.updateSource({ 'system.hp.hitDiceUsed': Math.clamp(used, 0, max) });
    }

    if (this.parent?.documentName === 'Actor' && keys.includes('system.classLevels')) {
      const actor = this.parent;
      const currentLevel = this.system.classLevels;
      const newLevel = foundry.utils.getProperty(changed, 'system.classLevels');
      const result = await actor.grants.createLeveledGrants(currentLevel, newLevel, this);
      if (!result) return false;
    }
  }

  async _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
  }

  async _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);
  }

  async _onDelete(data, options, user) {
    super._onDelete(data, options, user);

    if (this.isStartingClass && this.parent?.documentName === 'Actor') {
      const actor = this.parent;
      actor.update({ 'system.classes.startingClass': '' });
    }
  }
}
