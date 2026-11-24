// Helpers that work without any AI connection. Clearly labelled "offline" in the UI.

// [kind, English name, ...keywords (English + Tamil)]
const LEXICON = [
  ['character', 'Bunny', 'bunny', 'rabbit', 'முயல்', 'முயலே'], ['character', 'Elephant', 'elephant', 'யானை'], ['character', 'Monkey', 'monkey', 'குரங்கு'],
  ['character', 'Cat', 'cat', 'kitten', 'பூனை'], ['character', 'Dog', 'dog', 'puppy', 'நாய்'], ['character', 'Cow', 'cow', 'calf', 'பசு', 'மாடு'],
  ['character', 'Parrot', 'parrot', 'கிளி'], ['character', 'Peacock', 'peacock', 'மயில்'], ['character', 'Fish', 'fish', 'மீன்'],
  ['character', 'Duck', 'duck', 'வாத்து'], ['character', 'Hen', 'hen', 'chick', 'கோழி'], ['character', 'Lion', 'lion', 'சிங்கம்'],
  ['character', 'Tiger', 'tiger', 'புலி'], ['character', 'Sparrow', 'sparrow', 'bird', 'குருவி', 'பறவை'], ['character', 'Butterfly', 'butterfly', 'பட்டாம்பூச்சி'],
  ['character', 'Frog', 'frog', 'தவளை'], ['character', 'Squirrel', 'squirrel', 'அணில்'], ['character', 'Crow', 'crow', 'காகம்', 'காக்கா'],
  ['character', 'Bear', 'bear', 'கரடி'], ['character', 'Owl', 'owl', 'ஆந்தை'], ['character', 'Child', 'child', 'kids', 'baby', 'குழந்தை', 'பாப்பா'],
  ['character', 'Grandma', 'grandma', 'granny', 'பாட்டி'], ['character', 'Mother', 'mother', 'mummy', 'amma', 'அம்மா'],
  ['location', 'River', 'river', 'stream', 'ஆறு', 'நதி'], ['location', 'Mountain', 'mountain', 'hill', 'மலை'], ['location', 'Meadow', 'meadow', 'field', 'grass', 'புல்வெளி', 'வயல்'],
  ['location', 'Forest', 'forest', 'jungle', 'woods', 'காடு'], ['location', 'Sea / Beach', 'sea', 'beach', 'ocean', 'கடல்'], ['location', 'Garden', 'garden', 'தோட்டம்'],
  ['location', 'Village', 'village', 'கிராமம்', 'ஊர்'], ['location', 'House', 'house', 'home', 'வீடு'], ['location', 'School', 'school', 'பள்ளி'],
  ['location', 'Farm', 'farm', 'பண்ணை'], ['location', 'Night sky', 'night', 'sky', 'இரவு', 'வானம்'], ['location', 'Pond', 'pond', 'lake', 'குளம்'],
  ['location', 'Bridge', 'bridge', 'பாலம்'],
  ['prop', 'Carrot', 'carrot', 'கேரட்'], ['prop', 'Tree', 'tree', 'மரம்'], ['prop', 'Flowers', 'flower', 'பூ', 'மலர்'], ['prop', 'Ball', 'ball', 'பந்து'],
  ['prop', 'Moon', 'moon', 'நிலா', 'சந்திரன்'], ['prop', 'Sun', 'sun', 'சூரியன்'], ['prop', 'Stars', 'star', 'நட்சத்திர'], ['prop', 'Boat', 'boat', 'படகு'],
  ['prop', 'Banana', 'banana', 'வாழைப்பழ'], ['prop', 'Mango', 'mango', 'மாம்பழ'], ['prop', 'Drum', 'drum', 'மேளம்'], ['prop', 'Rain', 'rain', 'மழை'],
];

export function scanLyrics(lines) {
  const found = new Map();
  for (const line of lines) {
    const text = `${line.ta || ''} ${line.en || ''}`;
    const lower = text.toLowerCase();
    for (const [kind, name, ...words] of LEXICON) {
      if (found.has(name)) continue;
      const hit = words.some((w) => (/[a-z]/.test(w) ? new RegExp(`\\b${w}s?\\b`).test(lower) : text.includes(w)));
      if (hit) found.set(name, { kind, name, description: '', appears_in: (line.en || line.ta).trim() });
    }
  }
  return [...found.values()];
}

export function musicPresets(episode) {
  const secs = episode.target_duration || 60;
  const t = episode.title || 'this rhyme';
  return [
    { title: 'Playful bounce', style: 'Kids pop with a light Indian flavour', tempo_bpm: 112, key: 'C major', time_signature: '4/4', mood: 'Happy, energetic',
      instruments: ['ukulele', 'glockenspiel', 'hand claps', 'soft bass', 'tabla accents'], vocal: 'Bright female lead with a children\'s chorus on the hook',
      structure: `4-bar intro, verse, chorus, verse, chorus x2, 2-bar outro (≈${secs}s)`,
      music_ai_prompt: `Cheerful children's nursery rhyme "${t}", 112 BPM, C major, ukulele, glockenspiel, hand claps, soft tabla accents, bright female vocal with kids chorus, simple catchy melody, bilingual Tamil and English, clean mix` },
    { title: 'Tamil folk sing-along', style: 'Tamil folk (nattupura) for kids', tempo_bpm: 100, key: 'D major (Mohanam-like pentatonic)', time_signature: '4/4', mood: 'Warm, joyful, clap-along',
      instruments: ['thavil-style percussion (soft)', 'flute', 'nadaswaram-style lead (light)', 'manjira', 'harmonium'], vocal: 'Warm male/female duet, call-and-response with children',
      structure: `drum call intro, verse, chorus with claps, verse, chorus x2 (≈${secs}s)`,
      music_ai_prompt: `Tamil folk children's song "${t}", 100 BPM, pentatonic Mohanam feel, soft thavil and manjira, bamboo flute, harmonium, call-and-response vocals with children, joyful clap-along, gentle for toddlers` },
    { title: 'Gentle lullaby', style: 'Soft lullaby', tempo_bpm: 72, key: 'F major', time_signature: '3/4', mood: 'Calm, cosy',
      instruments: ['music box', 'soft piano', 'veena (light)', 'warm strings pad'], vocal: 'Soft, breathy female vocal',
      structure: `music-box intro, verse, chorus, verse, chorus, fade out (≈${secs}s)`,
      music_ai_prompt: `Gentle bilingual Tamil-English lullaby "${t}", 72 BPM, 3/4, music box, soft piano, light veena, warm strings, soft female vocal, calm and cosy for toddlers` },
  ];
}
