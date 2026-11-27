import { useState } from 'react';

// A short "how this stage works" guide at the top of every stage, for people new to making rhyme videos.
// It can be collapsed; the choice is remembered in this browser.
const GUIDES = {
  lyrics: {
    title: 'Stage 1 · Write the song',
    steps: [
      'Pick a target length (1–2 minutes suits toddlers). Paste your lyrics, or ask the Lyrics assistant on the right to write them.',
      'Give every line an action cue: what we SEE while it is sung (“Bear waves at the camera”). Stage 4 turns cues into shots.',
      'Use a verse / chorus structure and repeat the chorus. Repetition is how little children learn a song.',
      'Click Approve Lyrics. Later stages always use the approved version.',
    ],
    tip: 'Simple words, short lines and one idea per line. Name the characters in the lyrics so Stage 2 finds them.',
  },
  cast: {
    title: 'Stage 2 · Characters, scenery & props',
    steps: [
      'Write your ideas in “Your ideas for Claude” (who the characters are, what the places look like), then click Analyze with Claude (or offline).',
      'Open each card. Reuse a My World match, or make a model: Build Locally (free), Import a .glb, or Generate in Meshy (paid: preview first, ~3 credits).',
      'Check the result in the 3D viewer, then click 👁 Check with Claude so a model called “Bear” really is a bear.',
      'Approve, then Download & Save to My World so the character is reused, identical, in every future song.',
      'Scroll to “Landscape · where the story happens” and click ✨ Design the landscape with Claude (or Simple landscape). Check each place’s 3D preview and adjust its time of day, sky, clouds, hills, trees and flowers.',
    ],
    tip: 'Every ✨ Claude button first asks what to use as reference: My World, My World + your existing characters, or Something new (paste a description). Scenery = the set they stand on; the landscape around it is designed at the bottom of this page.',
  },
  music: {
    title: 'Stage 3 · Music & timing',
    steps: [
      'Get music ideas from the Music assistant, make the song in your music tool, and import the finished song (or a vocal and an instrumental to mix).',
      'Set the finished take as the Master audio track.',
      'Mark when each line is sung: press Tap along, then S at the start of every line (and E at the end if there is a pause). Fine-tune the numbers.',
      'Leave 2–4 s of instrumental before the first line (title card) and after the last (end card). Then Approve timing.',
    ],
    tip: 'Good timing makes the karaoke words, the mouths and the shot changes land on the singing.',
  },
  animate: {
    title: 'Stage 4 · Animate & assemble',
    steps: [
      'Open 🎬 Direct with Claude, describe the story in plain words, and click Make a plan. (Simple plan makes one shot per line without AI.)',
      'Open 🎨 Look to choose the landscape (sky, clouds, hills, trees, flowers), the title and end cards, karaoke lyrics and transitions.',
      'Click Generate Preview. Watch it, then read 🩺 Shot Doctor and click Fix on each problem (or Fix all).',
      'Fine-tune any shot on the right: camera move + shot size, transition, who is in it, where they stand and what they do.',
    ],
    tip: 'A good rhythm: open a new place with a wide shot, then full / medium shots, and a close-up on the singer for key lines. Characters should face the camera.',
  },
  export: {
    title: 'Stage 5 · Preview & export',
    steps: [
      'Watch the whole video once in full screen (F). Space = play / pause, ← → jump between shots.',
      'Go through “Before you export” on the right. Every “!” has an Open button that takes you to the fix.',
      'Choose 720p (quick check) or 1080p (YouTube) and click Export MP4. Keep this tab open while frames render.',
      'Download the MP4 and the captions .srt. On YouTube, mark the video “Made for kids”.',
    ],
    tip: 'The project stays editable: change anything and export again.',
  },
};

const read = (k) => { try { return localStorage.getItem(`guide:${k}`); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(`guide:${k}`, v); } catch { /* private window */ } };

export default function StageGuide({ stage }) {
  const g = GUIDES[stage];
  const [open, setOpen] = useState(() => read(stage) !== 'closed');
  if (!g) return null;
  const toggle = () => { setOpen(!open); write(stage, open ? 'closed' : 'open'); };
  return (
    <div className={`stage-guide ${open ? 'open' : ''}`}>
      <button className="stage-guide-head" onClick={toggle} aria-expanded={open}>
        <span>💡 <b>How this stage works</b> · {g.title}</span><span className="muted small">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="stage-guide-body">
          <ol>{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <p className="small"><b>Tip:</b> {g.tip}</p>
        </div>
      )}
    </div>
  );
}
