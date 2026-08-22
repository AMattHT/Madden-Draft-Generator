import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const madden = require('madden-franchise');
(async () => {
  for (const f of ['C:/Users/amatthews/Documents/Madden NFL 27/saves/CAREER-AUG10-01h29m21p-AUTOSAVE', 'C:/Users/amatthews/Documents/Madden NFL 26/Saves/CAREER-JUN30-08h18m10p-AUTOSAVE']) {
    const file = await madden.create(f, { autoParse: true });
    const pt = file.getTableByName('Player');
    await pt.readRecords();
    const field = pt.records[0].fields.CharacterBodyType;
    const enumDef = field?.offset?.enum ?? field?.enum;
    console.log(f.split('/').pop(), 'enum:', enumDef?.members?.map((m: any) => `${m.name}=${m.value}`) ?? enumDef?._members?.map((m: any) => `${m._name}=${m._value}`) ?? Object.keys(enumDef ?? {}));
    const counts: Record<string, number> = {};
    for (const r of pt.records) { if (r.isEmpty) continue; const v = String(r.CharacterBodyType); counts[v] = (counts[v] || 0) + 1; }
    console.log('  roster counts', counts);
  }
})();
