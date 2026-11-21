// crew.js — the three people who answer when Reno calls: Marisol works the
// heat off, Wrench keeps the car alive, Sana reads the SPD's own net.
// Every ability is a real gameplay effect with a real cooldown.
export const CREW_DEFS = [
  {
    id: 'marisol', name: 'Marisol Vega', role: 'FIXER', ability: 'Cold Trail',
    key: 'Q', cooldownMax: 45,
    line: 'Cold trail, Reno. One star burns off — do not waste it.',
  },
  {
    id: 'wrench', name: 'Wrench Fontana', role: 'MECHANIC', ability: 'Field Repair',
    key: 'Z', cooldownMax: 30,
    line: 'Patched what I could reach. She will hold — mostly.',
  },
  {
    id: 'sana', name: 'Sana Iqbal', role: 'LOOKOUT', ability: 'Badge Scan',
    key: 'C', cooldownMax: 40,
    line: 'Reading their net now. Their picture of you just got fuzzy.',
  },
];

export function createCrew(ctx) {
  const members = CREW_DEFS.map((d) => ({ ...d, cooldown: 0 }));
  return {
    members,
    byKey(key) { return members.find((m) => m.key === key); },
    use(id) {
      const m = members.find((x) => x.id === id);
      if (!m || m.cooldown > 0) return false;
      let worked = true;
      if (id === 'marisol') {
        if (ctx.police.wanted <= 0) worked = false;
        else {
          ctx.police.heat = Math.max(0, ctx.police.heat - 1.15);
          ctx.police.wanted = Math.max(0, Math.ceil(ctx.police.heat) - 1);
          if (ctx.police.wanted === 0) ctx.police.heat = 0;
        }
      } else if (id === 'wrench') {
        const v = ctx.currentVehicle();
        if (!v || v.damage <= 0) worked = false;
        else v.damage = Math.max(0, v.damage - 35);
      } else if (id === 'sana') {
        ctx.police.heat = Math.max(0, ctx.police.heat - 0.8);
        ctx.police.wanted = Math.min(ctx.police.wanted, Math.ceil(ctx.police.heat));
        ctx.flags.badgeScan = 10;
      }
      if (!worked) return false;
      m.cooldown = m.cooldownMax;
      ctx.dialogue.show(m.name, m.line);
      ctx.audio.blip(880);
      return true;
    },
    update(dt) {
      for (const m of members) m.cooldown = Math.max(0, m.cooldown - dt);
    },
  };
}
