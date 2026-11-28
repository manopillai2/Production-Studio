# Transcribe the final song with word-level timestamps (faster-whisper, CPU), so every lyric line can be timed
# from the real vocals. usage: python transcribe.py <song.mp3> <out.json>
import json, sys
from faster_whisper import WhisperModel

song, out = sys.argv[1], sys.argv[2]
model = WhisperModel("small.en", device="cpu", compute_type="int8")
prompt = ("Mommy, Mommy, what is this? Tell me, tell me, what is this? This is a sofa, soft and wide! Oh, a sofa! Sofa, sofa! Sit, sit, sit by my side! "
          "This is a TV, look and see! This is a bed, soft and sweet! This is a fan, round and round! This is a fridge, nice and cold! This is a cup, take a sip! Sip, sip, sip. Hip, hip, hooray!")
segments, info = model.transcribe(song, language="en", word_timestamps=True, beam_size=5, initial_prompt=prompt,
                                  condition_on_previous_text=False, vad_filter=False, temperature=0.0)
words = []
for seg in segments:
    for w in seg.words or []:
        words.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "p": round(w.probability, 3)})
    print(f"[{seg.start:7.2f} - {seg.end:7.2f}] {seg.text.strip()}", flush=True)
json.dump({"duration": info.duration, "words": words}, open(out, "w", encoding="utf-8"), indent=1)
print("words:", len(words))
