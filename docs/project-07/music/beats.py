# Tempo and beat grid of the song (so actions can land ON the beat). Onset envelope from the audio's spectral flux,
# tempo by autocorrelation (70-160 bpm), then the beat phase that best fits the onsets.
# usage: python -I beats.py <song.mp3> <out.json>
import json, subprocess, sys
import numpy as np

song, out = sys.argv[1], sys.argv[2]
SR = 11025
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", song, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
x = np.frombuffer(raw, dtype=np.float32)
hop, win = 256, 1024
frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop] * np.hanning(win)
mag = np.abs(np.fft.rfft(frames, axis=1))
flux = np.maximum(0, np.diff(np.log1p(mag * 10), axis=0)).sum(axis=1)
flux = np.concatenate([[0], flux]); flux -= np.convolve(flux, np.ones(16) / 16, mode="same"); flux = np.maximum(flux, 0)
fps = SR / hop
ac = np.correlate(flux, flux, mode="full")[len(flux) - 1:]
lags = np.arange(len(ac)); bpm = 60 * fps / np.maximum(lags, 1)
ok = (bpm >= 70) & (bpm <= 160)
best = lags[ok][np.argmax(ac[ok])]; tempo = 60 * fps / best
period = 60 / tempo
# phase: the offset whose beat train collects the most onset energy
t = np.arange(len(flux)) / fps
phases = np.linspace(0, period, 120, endpoint=False)
score = [flux[np.clip(np.round((np.arange(p, t[-1], period)) * fps).astype(int), 0, len(flux) - 1)].sum() for p in phases]
ph = phases[int(np.argmax(score))]
beats = [round(float(b), 3) for b in np.arange(ph, t[-1], period)]
json.dump({"tempo": round(float(tempo), 2), "period": round(float(period), 4), "phase": round(float(ph), 4), "beats": beats}, open(out, "w"), indent=0)
print("tempo", round(float(tempo), 2), "bpm; period", round(float(period), 3), "s; first beat", round(float(ph), 3), "; beats", len(beats))
