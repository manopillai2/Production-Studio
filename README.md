# Rhymes Automation: local production studio (v0.2)

A local web app for making original Tamil + English nursery-rhyme videos for YouTube.
Every video is a **project** that moves through four stages:

A new project needs only a **name** and **one language**. English projects are English-only. For any other language (Tamil, Hindi, Telugu, …), the lyrics are sung in that language, and each line has an English meaning shown only for you (it isn't sung). Captions default to the sung language.

1. **Lyrics.** Paste your lyrics, or describe the idea and the assistant writes them. Ask for tweaks ("catchier chorus", "fit it to 1:30"), set the video length, then **finalize** the lyrics. Use **Unlock to edit** to change finalized lyrics.
2. **Characters & Scenery.** Click **Find & create from lyrics**. Claude reads the lyrics and creates every character, place and prop the song needs, each with a first design. It reuses matching locked designs from *My World* instead of making duplicates. If GPT Image is connected, it also creates the pictures. On each card, **Design / Redesign** opens a workshop with a design chat. Upload several reference photos and ask the assistant to "combine them into one design"; Claude sees the images. Then **🔒 Lock for lifetime**.
   - **World style:** every new design and image follows the *World style guide* (editable in Stage 2 or in Channel Identity). Your locked designs are also sent as visual style references, so all creations share one recognisable look, and each new design is told to stay unique from the existing ones.
3. **Music.** Get music-direction recommendations, pick one, and copy the ready-made prompt (plus lyrics) into your music AI, or use a connected tool. Import the takes and set the master song.
4. **Assemble & Export.** One page that combines everything. Build the storyboard from the lyrics (one shot per line), copy each shot's animation prompt into Kling, Veo, Runway or Blender, and import and approve the clips. Then preview, time the captions, and export the MP4 (1080p or 4K) with SRT, thumbnail and YouTube text.

**Stack:** React 18 + Vite 6 (`client/`), Node + Express 4 (`server/`), SQLite via Node's built-in `node:sqlite`, local media in `storage/`, and FFmpeg for export.

---

## 1. Requirements (Windows)

Installed on this PC on 2026-11-23:

```powershell
winget install OpenJS.NodeJS.LTS   # Node 26+ (needs node:sqlite)
winget install Gyan.FFmpeg         # ffmpeg + ffprobe
```

Use `npm.cmd` in PowerShell, because Windows' default script policy blocks `npm.ps1`.

## 2. Setup (first time only)

```powershell
cd "C:\Users\atcha\OneDrive\Desktop\Projects\Production Studio"
npm.cmd install
npm.cmd run setup
```

## 3. Launch

```powershell
cd "C:\Users\atcha\OneDrive\Desktop\Projects\Production Studio"
npm.cmd start
```

Open **http://localhost:5175** and stop with `Ctrl+C`.
For development with hot reload, run `npm.cmd run dev` and open http://localhost:5173.

`npm.cmd run reset-sample` wipes **all** data back to the sample project. Stop the server before running it.

## 4. Connect AI tools (sidebar → AI Connections)

Paste API keys on the **AI Connections** page. Keys are stored only on this PC, in `storage/studio.sqlite`, and are never sent to the browser. You can also put them in `server/.env` (see `server/.env.example`).
Nothing paid runs until you switch **Paid generation** on.

| Tool | Stage | Status |
|---|---|---|
| Claude (`ANTHROPIC_API_KEY`) | Assistant in every stage (lyrics, cast suggestions, character design, music) | **Implemented** (model `claude-opus-5-5`). A bad key gives a readable error, but it hasn't yet been tested with a real key. |
| GPT Image (`OPENAI_API_KEY`) | 2: character and scenery images | **Implemented, untested with a live key** (`gpt-image-1`, override with `OPENAI_IMAGE_MODEL`) |
| Meshy (`MESHY_API_KEY`, paid plan needed) | 2: design images + 3D models | **Implemented**. It was tested end to end against a fake Meshy server, not yet against a live key. It creates design images (image-to-image with your references + locked designs as style, max 5) and 3D models (from images or from a Claude-written prompt). Jobs run in the background and resume after a restart. Results (.glb, .fbx, preview) are downloaded straight into the design, because Meshy deletes API results after 3 days. |
| Eleven Music, Suno | 3: sing the lyrics | Placeholder. Use "📋 Prompt + lyrics" and import the result. |
| Kling, Veo, Runway | 4: animate shots | Placeholder. Use each shot's "📋 Prompt" and import the clip. |

**Works without any AI key:**
- Writing and pasting lyrics, with the length meter and versions.
- The **Quick scan (offline)** of lyrics, a keyword list covering about 50 English and Tamil animal, place and prop words.
- Music **Starter presets**, the 3D-model search links, the character workshop (references, spec, lock), the storyboard builder, the preview and the export.

## 5. Rules the app enforces

- The assistant never overwrites anything. Each lyrics change becomes a new version, and each design tweak goes into a draft.
- Final lyrics are locked; to change them, duplicate and finalize the new version.
- Locked character and scenery versions never change. Tweaking a locked design starts a new draft, and projects keep their pinned version until you click "Use newest locked version here".
- Locking requires at least one reference file. When you lock, projects that were developing that item automatically switch to the locked version.
- Importing a song take never changes the master track. Only approved takes and clips are used in the export.

## 6. Try it

1. Open **Projects** and click **＋ New project**. Name it, pick the length (for example 1:00), and create it.
2. In **Stage 1**, connect Claude, then type "an elephant and a monkey playing by the river, counting to five". The lyrics appear as a new version. Ask for tweaks, then click **🔒 Finalize these lyrics**. Without Claude, paste lyrics in the format `Tamil | English | cue`.
3. In **Stage 2**, click **✨ Suggest from lyrics** (or **🔍 Quick scan**). For each suggestion, click **Start designing** (or **Reuse my 🔒 …** if you already have a matching locked character). In the workshop:
   - Import references, or open the Sketchfab, Poly Haven or BlenderKit links to find an existing 3D model.
   - Chat with the design assistant.
   - Click **🔒 Lock for lifetime**.
4. In **Stage 3**, click **✨ Recommend music** (or **Starter presets**), choose one, and copy the prompt plus lyrics into your music AI. Import the song, click ✔ Approve, then ★ Set as master.
5. In **Stage 4**, click **✨ Build from final lyrics**. For each shot, click 📋 Prompt, then import the clip from your animation tool and approve it. Preview, click **From approved lyrics** for the captions, then export.

The sample project, *#1 Hop Hop Little Bunny*, has every stage done except the export, so you can see a finished pipeline.

## 7. Project layout

```
server/src/index.js      Express routes (projects, stages, library, assistant, export, connections)
server/src/providers.js  AI connections: Claude assistants, GPT Image, placeholders
server/src/offline.js    lyrics keyword scan + music starter presets (no AI needed)
server/src/model.js      project assembly, 4-stage progress, timeline
server/src/export.js     FFmpeg export + SRT
server/src/seed.js       sample project (+ --reset)
server/src/db.js         SQLite schema (+ v0.2 migrations)
client/src/pages/        Projects, Project (stepper), Library (My World), Channel, Connections, + building blocks (Music, Animation, Studio)
client/src/stages/       StageLyrics, StageCast (+ workshop), StageMusic, StageAssemble
client/src/ui.jsx        shared UI incl. the Assistant chat box
storage/                 runtime data (git-ignored): studio.sqlite + media/
```

## 8. Verified on 2026-11-23

- **Lyrics:** a new project was created, and lyrics with Tamil + English lines were pasted and finalized.
- **Assistant without a key:** the lyrics and design assistants reply "Claude is not connected…".
- **Assistant with a bad key:** it replies "Claude rejected the API key…". The key was then removed again.
- **Quick scan:** it found Elephant, Monkey, River, Mountain, Tree, Sun and Banana from the lyrics.
- **Cast:** reusing Little Bunny pinned its locked v1. Elephant and River were added as in development.
- **Locking:** locking was refused until a reference was added. After locking, the project pinned the version automatically. A later tweak created Draft 2, and the project stayed on the locked version.
- **Music:** the starter presets came back and one was chosen.
- **Storyboard:** building it from the lyrics created 4 shots, each with a character, location, cue and duration.
- **UI:** all screens rendered in headless Edge.
- **Cleanup:** the test project was deleted afterwards. The v0.1 export pipeline (1080p and 4K) is unchanged.

## 9. Next steps

- [ ] Test Claude and GPT Image with your real keys. Tune the assistant prompts in `server/src/providers.js` to your channel's voice.
- [ ] Implement Eleven Music or Suno: send the final lyrics + the chosen `music_ai_prompt`, and save the result as a Draft take.
- [ ] Implement Kling, Veo or Runway: send the shot's reference frame + `animationPrompt()` (client `pages/Animation.jsx`), poll the job, and save the result as a Draft clip.
- [ ] Meshy: generate a 3D model from a locked design, then save the `.glb` into the character's draft.
- [ ] GPT Image: use the character's reference images (the edits endpoint) so new images stay on-model.
- [ ] Workshop: side-by-side compare of drafts inside Stage 2 (a compare view exists in My World → Characters).
- [ ] Storyboard: let the assistant suggest motion notes and camera moves per shot.
- [ ] Export: intro/outro with channel jingle + logo, loudness target, cancel a running job.

Known limits: single user, local only, no authentication. API keys are stored unencrypted in the local SQLite database.
