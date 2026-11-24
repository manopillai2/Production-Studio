// Keep in sync with server/src/langs.js
export const LANGS = {
  en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada',
  bn: 'Bengali', mr: 'Marathi', gu: 'Gujarati', pa: 'Punjabi', ur: 'Urdu',
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ar: 'Arabic', zh: 'Chinese (Mandarin)', ja: 'Japanese',
};
export const langName = (code) => LANGS[code] || LANGS.ta;
export const isEnglish = (code) => code === 'en';
export const sungLine = (line, code) => (isEnglish(code) ? line.en : line.ta || line.en) || '';

export function LanguageSelect({ value, onChange }) {
  return (
    <select value={LANGS[value] ? value : 'ta'} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}{k === 'en' ? ' (English only)' : ' + English meaning'}</option>)}
    </select>
  );
}
