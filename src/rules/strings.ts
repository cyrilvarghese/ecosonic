/** The page's own chrome, in each language the rulebook ships. The RULES themselves come from the
 *  baked books; this is only the furniture around them — kept in one map rather than scattered as
 *  literals, so adding a language is a matter of adding a column. */
export type Lang = 'en' | 'it';

export const LANGS: { code: Lang; label: string; title: string }[] = [
  { code: 'en', label: 'EN', title: 'English' },
  { code: 'it', label: 'IT', title: 'Italiano' },
];

export const STRINGS: Record<Lang, {
  back: string;
  searchPlaceholder: string;
  searchLabel: string;
  count: (rules: number, sections: number) => string;
  hits: (hits: number, total: number) => string;
  clear: string;
  empty: (q: string) => string;
  footer: string;
  panels: Record<string, string>;
  coverageLegend: (dead: string) => string;
  otherCategories: (db: number, min: number, max: number) => string;
}> = {
  en: {
    back: '← /remix',
    searchPlaceholder: 'Search the rules…',
    searchLabel: 'Search the rules',
    count: (r, s) => `${r} rules · ${s} sections`,
    hits: (h, t) => `${h} of ${t} rules`,
    clear: 'clear',
    empty: (q) => `Nothing matches “${q}”. The rules cover the pool, the draw, the timeline, `
      + 'playback, sends, whole loops and the UI.',
    footer: 'Generated from the rules doc by npm run build:rulebook. A test fails if the two drift '
      + 'apart, so what you are reading is what is built.',
    panels: {
      coverage: 'Live · what the library actually covers',
      planets: 'Live · the bodies each element ships',
      windows: 'Live · where each element opens each section',
      defaults: 'Live · categories that do not start dry at unity',
    },
    coverageLegend: (dead) => `rules/samples. Red = authored but unplayable. Faint = audio no rule `
      + `reaches. ${dead}`,
    otherCategories: (db, min, max) =>
      `Every other category starts at ${db} dB and fully dry. Slider range ${min} to +${max} dB.`,
  },
  it: {
    back: '← /remix',
    searchPlaceholder: 'Cerca nelle regole…',
    searchLabel: 'Cerca nelle regole',
    count: (r, s) => `${r} regole · ${s} sezioni`,
    hits: (h, t) => `${h} di ${t} regole`,
    clear: 'azzera',
    empty: (q) => `Nessun risultato per “${q}”. Le regole coprono il pool, l'estrazione, la `
      + 'timeline, la riproduzione, le mandate, i loop interi e l\'interfaccia.',
    footer: 'Generato dal documento delle regole con npm run build:rulebook. Un test fallisce se i '
      + 'due divergono, quindi ciò che leggi è ciò che è costruito.',
    panels: {
      coverage: 'Dal vivo · cosa copre davvero la libreria',
      planets: 'Dal vivo · i corpi che ogni elemento distribuisce',
      windows: 'Dal vivo · dove ogni elemento apre ogni sezione',
      defaults: 'Dal vivo · categorie che non partono asciutte a unità',
    },
    coverageLegend: (dead) => `regole/campioni. Rosso = scritto ma non riproducibile. Tenue = audio `
      + `che nessuna regola raggiunge. ${dead}`,
    otherCategories: (db, min, max) =>
      `Ogni altra categoria parte a ${db} dB e completamente asciutta. Cursore da ${min} a +${max} dB.`,
  },
};
