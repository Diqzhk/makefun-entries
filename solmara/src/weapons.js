// weapons.js — Reno's five-slot rack: fists plus four guns with their own
// magazines and reserves. Pure state + rules; main.js does the hitting.
export const WEAPON_DEFS = [
  { id: 'fists', tag: 'FST', name: 'Fists',     ammo: -1, reserve: -1, damage: 8,  range: 2.4, cooldown: 0.34, spread: 0 },
  { id: 'p9',    tag: 'P-9', name: 'P-9',       ammo: 48, reserve: 12, damage: 16, range: 46,  cooldown: 0.26, spread: 0.02 },
  { id: 'smg',   tag: 'SMG', name: 'Kestrel SMG', ammo: 30, reserve: 90, damage: 12, range: 42, cooldown: 0.09, spread: 0.05 },
  { id: 'sg',    tag: '12G', name: 'Brisa 12G', ammo: 14, reserve: 8,  damage: 34, range: 22,  cooldown: 0.8,  spread: 0.12 },
  { id: 'ar',    tag: 'AR9', name: 'AR-9',      ammo: 0,  reserve: 30, damage: 22, range: 60,  cooldown: 0.13, spread: 0.03 },
];

export function createWeapons() {
  const slots = WEAPON_DEFS.map((d) => ({ ...d }));
  return {
    slots,
    current: 0,
    cooldownLeft: 0,
    select(i) {
      if (i >= 0 && i < slots.length) this.current = i;
    },
    currentDef() { return this.slots[this.current]; },
    ammoText(slot) {
      if (slot.ammo < 0) return '—';
      return `${slot.ammo} / ${slot.reserve}`;
    },
    // try to loose one shot; returns 'ok', 'empty' or 'cooling'
    fire(dt) {
      this.cooldownLeft -= dt;
      const s = this.currentDef();
      if (this.cooldownLeft > 0) return 'cooling';
      if (s.ammo === 0) {
        this.cooldownLeft = 0.3;
        return 'empty';
      }
      if (s.ammo > 0) {
        s.ammo -= 1;
        if (s.ammo === 0 && s.reserve > 0) { // auto reload from the reserve
          const take = Math.min(s.reserve, s.id === 'p9' ? 12 : 30);
          s.ammo = take; s.reserve -= take;
        }
      }
      this.cooldownLeft = s.cooldown;
      return 'ok';
    },
    tick(dt) { this.cooldownLeft -= dt; },
  };
}
