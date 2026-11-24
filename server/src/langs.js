// One language per project. English projects are English-only; any other language is sung in
// that language, with an English meaning line shown for the producer (not sung).
export const LANGS = {
  en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada',
  bn: 'Bengali', mr: 'Marathi', gu: 'Gujarati', pa: 'Punjabi', ur: 'Urdu',
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ar: 'Arabic', zh: 'Chinese (Mandarin)', ja: 'Japanese',
};
export const langName = (code) => LANGS[code] || LANGS.ta;
export const isEnglish = (code) => code === 'en';
/** The line that is actually sung (and captioned by default). */
export const sungLine = (line, code) => (isEnglish(code) ? line.en : line.ta || line.en) || '';
