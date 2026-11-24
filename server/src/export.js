// YouTube export: approved clips + master song + captions -> MP4 (1080p or 4K UHD) via FFmpeg.
import fs from 'node:fs';
import path from 'node:path';
import { run, one } from './db.js';
import { episodeFull } from './model.js';
import { runFfmpeg, FFMPEG } from './media.js';
import { MEDIA_DIR, EXPORT_DIR } from './paths.js';

export const RESOLUTIONS = { '1080p': [1920, 1080], '4k': [3840, 2160] };

const fmtTs = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
export function toSrt(captions) {
  return captions
    .filter((c) => c.end > c.start && c.text.trim())
    .map((c, i) => `${i + 1}\n${fmtTs(c.start)} --> ${fmtTs(c.end)}\n${c.text.trim()}\n`)
    .join('\n');
}

const assColor = (hex = '#ffffff') => {
  const h = hex.replace('#', '').padEnd(6, 'f');
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};

/** Validate before queueing so the user gets a readable error immediately. */
export function preflight(ep) {
  const problems = [];
  if (!FFMPEG) problems.push('FFmpeg is not installed (winget install Gyan.FFmpeg).');
  if (!ep.shots.length) problems.push('The storyboard has no shots yet.');
  ep.shots.forEach((s, i) => { if (!s.approved_clip) problems.push(`Shot ${i + 1} "${s.title || 'untitled'}" has no approved clip.`); });
  if (!ep.master_audio) problems.push('No master audio track is selected (Tune, Music & Vocals → Set as master).');
  return problems;
}

const update = (id, fields) => {
  const keys = Object.keys(fields);
  run(`UPDATE jobs SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now') WHERE id=?`, ...keys.map((k) => fields[k]), id);
};

export async function runExportJob(jobId) {
  const job = one('SELECT * FROM jobs WHERE id=?', jobId);
  const params = JSON.parse(job.params);
  const ep = episodeFull(job.episode_id);
  const [W, H] = RESOLUTIONS[params.resolution] || RESOLUTIONS['1080p'];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dirRel = path.join('exports', `episode-${ep.id}`, `${stamp}-${params.resolution}`);
  const dir = path.join(MEDIA_DIR, dirRel);
  fs.mkdirSync(dir, { recursive: true });

  try {
    update(jobId, { status: 'running', message: 'Preparing shots…', progress: 0.01 });
    const problems = preflight(ep);
    if (problems.length) throw new Error(problems.join(' '));

    const total = ep.timeline.reduce((a, s) => a + s.length, 0);
    const bg = (ep.caption_style.letterbox || '#000000').replace('#', '0x');
    const segFiles = [];
    // Phase 1 (0–70%): normalise every shot to the same size/fps so concat is seamless.
    for (let i = 0; i < ep.shots.length; i++) {
      const shot = ep.shots[i], seg = ep.timeline[i];
      const src = path.join(MEDIA_DIR, shot.approved_clip.file_path);
      if (!fs.existsSync(src)) throw new Error(`Clip file for shot ${i + 1} is missing on disk: ${shot.approved_clip.file_path}`);
      const out = path.join(dir, `seg${String(i).padStart(3, '0')}.mp4`);
      update(jobId, { message: `Rendering shot ${i + 1} of ${ep.shots.length} at ${W}×${H}…` });
      const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${bg},fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=${seg.length.toFixed(3)}`;
      const base = ep.timeline.slice(0, i).reduce((a, s) => a + s.length, 0);
      await runFfmpeg(
        ['-ss', seg.trim_in.toFixed(3), '-i', src, '-t', seg.length.toFixed(3), '-vf', vf, '-an',
          '-c:v', 'libx264', '-preset', params.resolution === '4k' ? 'faster' : 'veryfast', '-crf', '20', out],
        { totalSeconds: seg.length, onProgress: (p) => update(jobId, { progress: 0.02 + 0.68 * ((base + p * seg.length) / total) }) },
      );
      segFiles.push(path.basename(out));
    }
    fs.writeFileSync(path.join(dir, 'concat.txt'), segFiles.map((f) => `file '${f}'`).join('\n'));
    update(jobId, { message: 'Joining shots…', progress: 0.72 });
    await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'video_only.mp4'], { cwd: dir });

    // Captions: always write a sidecar SRT for YouTube.
    fs.writeFileSync(path.join(dir, 'captions.srt'), '﻿' + toSrt(ep.captions), 'utf8');

    // Phase 2 (72–100%): mux master audio + captions.
    update(jobId, { message: params.burn_captions ? 'Mixing song and burning captions…' : 'Mixing song and adding caption track…', progress: 0.75 });
    const audioSrc = path.join(MEDIA_DIR, ep.master_audio.file_path);
    const args = ['-i', 'video_only.mp4', '-i', audioSrc];
    const hasCaps = ep.captions.length > 0;
    if (params.burn_captions && hasCaps) {
      const cs = ep.caption_style;
      const scale = 288 / 1080; // libass PlayResY for SRT input
      const style = [
        'FontName=Nirmala UI', // ships with Windows and renders Tamil + English
        `FontSize=${Math.round((cs.fontSize || 54) * scale)}`,
        `PrimaryColour=${assColor(cs.color)}`,
        `OutlineColour=${assColor(cs.outline || '#000000')}`,
        `Outline=${Math.max(0, ((cs.outlineWidth ?? 4) * scale)).toFixed(1)}`,
        `BorderStyle=${cs.background ? 3 : 1}`,
        `BackColour=&H80000000`,
        'Bold=1',
        `Alignment=${cs.position === 'top' ? 8 : cs.position === 'middle' ? 5 : 2}`,
        'MarginV=18',
      ].join(',');
      args.push('-vf', `subtitles=captions.srt:force_style='${style}'`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p');
    } else {
      if (hasCaps) args.push('-i', 'captions.srt');
      args.push('-c:v', 'copy');
    }
    args.push('-map', '0:v:0', '-map', '1:a:0');
    if (!params.burn_captions && hasCaps) args.push('-map', '2:s:0', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=tam');
    args.push('-af', 'apad', '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), '-movflags', '+faststart', 'final.mp4');
    await runFfmpeg(args, { cwd: dir, totalSeconds: total, onProgress: (p) => update(jobId, { progress: 0.75 + 0.24 * p }) });

    for (const f of [...segFiles, 'concat.txt', 'video_only.mp4']) fs.rmSync(path.join(dir, f), { force: true });
    const safeTitle = (ep.title || 'episode').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'episode';
    const finalName = `${safeTitle}-${params.resolution}.mp4`;
    fs.renameSync(path.join(dir, 'final.mp4'), path.join(dir, finalName));
    const rel = dirRel.replace(/\\/g, '/');
    update(jobId, {
      status: 'done', progress: 1,
      message: `Exported ${W}×${H}, ${total.toFixed(1)}s${params.burn_captions ? ', captions burned in' : ', captions as a selectable track'}.`,
      output: JSON.stringify({ mp4: `/media/${rel}/${finalName}`, srt: `/media/${rel}/captions.srt`, folder: dir }),
    });
  } catch (e) {
    update(jobId, { status: 'error', message: e.message || String(e) });
  }
}
