# Rhymes Automation: production studio for original nursery-rhyme videos (v0.5)

One local app that takes you from lyrics to a finished MP4, built around a reusable **My World** library of characters, scenery, props, rigs and movement clips.

**Projects** → **+ New project** (name and language) → five stages:

| Stage | What happens |
|---|---|
| **1 · Lyrics** | Paste lyrics, or describe an idea and let the assistant write them. Ask it for edits; the lines it changed are highlighted for review. The target duration is a planning target only. **Approve Lyrics** sets the version that Stage 2 analyzes. |
| **2 · Characters & Scenery** | Analyze the approved lyrics, search My World first (you confirm any reuse), and get one card per missing asset with an editable description. Each card offers four methods: **Build Locally** (offline), **Local AI** (optional), **Import Model**, or **Generate in Meshy** (paid, explicit). Inspect the result in a 3D viewer, edit it, regenerate it or approve it, then **Download & Save to My World**. Static assets only. |
| **3 · Music & Vocals** | Upload a finished song, or music and vocals separately (then mix them). Play takes, approve one as the final audio, and see its real duration. Mark when each lyric line starts and ends, with room for an intro, breaks and an outro, then **Approve timing**. |
| **4 · Animate & Assemble** | Propose a shot plan from the lyrics, timing and approved assets. Merge, split, add, reorder and edit shots: setting, characters, position/turn/scale, movement (rise, drift, bounce, twinkle, spin, sway, path), camera move and framing, and lighting. Click **Generate Preview** to watch the 3D sequence with the audio. Body-bending movement plays an animation clip on a rigged model: the app searches My World first, then lets you import one or request one from Meshy (explicit, paid). |
| **5 · Preview & Export** | Watch the full video with audio, jump to individual shots, or go back to the timeline. **Export MP4** renders every frame from the same 3D scene and encodes it with the approved audio, with progress and errors shown. It also writes a captions `.srt` from the lyric timing. The project stays editable afterwards. |

**Review flags:** when you approve a change that affects later stages (different lyrics, replaced audio, changed timing, an asset changed in Stage 2, or shots edited after an export), those stages show **Needs review**. Their saved work is kept. You check it and then click **Mark as reviewed**.

---

## Run it (Windows, PowerShell)

Needs Node.js 22+ (tested with 26) and FFmpeg: `winget install OpenJS.NodeJS.LTS` and `winget install Gyan.FFmpeg`. Open a new PowerShell window after installing.

```powershell
cd "C:\Users\atcha\OneDrive\Desktop\Projects\Production Studio"
npm.cmd install          # first time only
npm.cmd run setup        # first time only (server + client packages)
npm.cmd start            # builds the UI and starts the app
```

Open **http://localhost:5175** and stop the app with **Ctrl+C**. Use `npm.cmd`, because PowerShell blocks plain `npm` by default.
For development with hot reload, run `npm.cmd run dev` and open http://localhost:5173.

## Test local 3D creation (offline: no GPU, no internet, no paid API)

The sample project **“Look Up at the Sky (sample)”** has already been made this way. To repeat it yourself:

1. **Projects → + New project.** Enter "Look Up at the Sky" and choose English.
2. **Stage 1:** paste
   `Look up, look up at the sky so blue, | Sunny rises over the hill` … (one line per row, in the format `line | action cue`), then click **Approve Lyrics**.
3. **Stage 2:** click **Analyze lyrics (offline)**. You get cards for Sun, Cloud, Meadow and Hill. My World matches show a preview and ask you to confirm reuse.
4. Click **+ Add asset** and fill it in:
   - Kind: Character
   - Name: `Pip the Sky Bunny`
   - Description: `a small sky-blue bunny with one crescent-shaped right ear and one golden right front paw`
5. Open the Pip card → **Build Locally**:
   - The suggestion shows the template (Bunny) and what was applied: crescent right ear, gold shiny right paw, body colour.
   - Adjust any slider or part colour; the preview updates live.
   - Click **⚒ Build Locally**.
6. Rotate and zoom the result. Try the other options:
   - **Part colours** recolours one material only.
   - **Version history** lets you restore an earlier revision.
7. Do the same for Sunny and the Meadow. The meadow's trees, hills and cloud are separate objects: pick one, then move or recolour it.
8. Click **✓ Approve**. The card shows **Approved · Not saved to My World**.
9. Click **⬇ Download & Save to My World**. The highlight clears once the library copy is saved, and a `.glb` download is offered.
10. Create a second project whose lyrics mention Pip, and run **Analyze**. Pip appears as a My World match; click **Confirm reuse**. Nothing is regenerated.

The **Meshy calls logged** counter at the top of Stage 2 stays at **0** for all of the above.

**What Build Locally can make:** templates for a **bunny, sun, moon, star, cloud, tree, hill and meadow** (the meadow is scenery containing editable trees, hills and clouds). Each has editable parameters and part colours. If a description needs something else ("elephant", "hat"…), the card says so and suggests Local AI, Import or Meshy. You can also pick a template by hand.
Every saved asset keeps its **recipe and revision history**. Use **My World → item → Open for revision** to reopen it in a project; saving adds a new version to the same asset.
Exported `.glb` files include their materials and any embedded textures (the hill, meadow and moon use procedural PNG textures).

## World Style (My World → World Style)

This is the single place for your world's visual rules: characters, faces, fur, scenery, colour, light and 3D quality. Each save keeps the previous version (the last 30), and you can restore any of them.
- **Style Profile.** The app extracts structured rules from the document offline: palette roles (fur, muzzle, inner ear, iris, nose, foliage, stone, sun…), surface finish, proportions, face and fur construction, scenery and sky shapes. You can adjust them on the same page. Saving the document or the profile creates a new style version.
- **Build Locally** applies the whole profile to every build:
  - Colours default to your palette roles, and any colour named in a description snaps to the nearest palette colour.
  - Satin fur, glossy eyes, oversized heads, plush cheeks, irises with catchlights, eyelids, a sculpted muzzle, tufts, inset ears and asymmetry.
  - Petal-ray suns, lobed clouds, leaf-cluster trees, leaf-shaped terrain with a path, folded-petal flowers, landmark stones and layered hills that get cooler with distance.
  - Each recipe stores the style snapshot it was built with, so rebuilds are reproducible.
- **Uniqueness.** Every character is compared with your locked designs (My World and approved cards). If a character is too similar (≥ 84% alike), approval is blocked. **✨ Make unique** changes the fewest signature features needed, such as fur colour, an ear, freckles, eye shape or an accent paw.
- **Local AI** builds whatever is in the reference image. **Use the Build Locally model as reference** gives it a World-Style starting image. Every reference is checked against the palette ("fits", "partly" or "off-style"), and the result gets the world's surface finish.
- **Meshy.** The World Style summary, a palette line and a "clearly different from <your locked characters>" clause are attached automatically at submit, within 800 characters. The card shows exactly what will be sent.
- **Claude** reads the full document when it analyzes lyrics, drafts descriptions or writes Meshy prompts, and in the lyrics and design assistants.
- **Style changes.** Cards made with an older style version are flagged. **Apply current World Style** updates the recipe (colours you changed by hand are kept), or you can keep them as they are.
- Character-specific details (for example Pip's own-right crescent ear and own-front-left golden paw) belong in that character's card description. Left and right always mean **the character's own** sides.
- **Limits.** Uniqueness for Meshy, Local AI and imported models is guided (prompt clause, palette check), not measured geometrically. Only Build Locally designs get a similarity score.

## Look, framing and checks (v0.6, 26 Nov 2026)

The full step-by-step guide is in **docs/Rhymes-Studio-Guide.pdf**.

- **Landscape around the scenery** (`client/src/engine/Landscape.js`). Every shot gets a gradient sky, drifting clouds, three layers of hills that fade into haze, trees, set dressing (flowers, bushes, grass) and a blended ground, all in the World Style colours. Stars appear at night. Project defaults are in **Stage 4 → 🎨 Look**; a shot can override them under **Landscape for this shot**, which is stored in `lighting.look`.
- **Rendering.** Neutral tone mapping, sky-based reflections (PMREM), a rim light, softer shadows fitted to the action, and contact shadows under everything standing.
- **Shot sizes.** `camera.size` is one of extreme-wide, wide, full, medium or close-up, and frames subjects by their measured size. A fitting pass then keeps every subject inside the frame. Still moves get a slow push-in. Sky objects are kept in frame at a readable size.
- **Transitions.** `camera.transition` is one of cut, dissolve, dip-white, iris or wipe. Auto means a dissolve at a new section and an iris at a new place. The video also fades in and out.
- **On-screen text** (`client/src/engine/captions.js`): a title card over the intro, an end card over the outro, and karaoke lyrics in the Channel Identity caption style. The preview and the MP4 draw them with the same function.
- **Shot Doctor** (`SceneEngine.analyse()`) flags characters that are small, cut off, hidden, have their back to the camera, mostly empty sky, repeated framing and long still shots. Each problem has a one-click fix. It shows in Stages 4 and 5, along with shot thumbnails.
- **Actor option `face_travel: false`**: a rider or vehicle keeps facing the camera while it moves.
- **Claude look check** (Stage 2, `POST /api/cards/:id/look-check`): Claude views front and side pictures of a model and reports whether it matches its name. The result is stored in `asset_cards.look_check`.
- **Review feedback** under each result: the direction the result was made from (`card_revisions.direction`) and your notes (`card_revisions.feedback`). Claude revises the prompt from the notes and keeps applying them.
- **Project look API**: `PUT /api/episodes/:id/look` (`episodes.look`). Both planners (Claude and the offline plan) use shot sizes, transitions and per-shot landscape.
- **World Style is compulsory** for every Claude call: lyrics, cast analysis, prompts, the design chat, music and shot plans. **Inspiration screenshots** (My World → World Style, up to 12, stored as `assets` with owner_type `world`) are read by Claude into an **inspiration brief** (setting `world_inspiration`). The brief takes about 80% of the ideas and never copies characters, logos or exact designs. Every call gets the brief, and visual calls also get the screenshots. **Landscape for every video** (setting `world_look`, with Claude suggestions) is the default under each project's Stage 4 Look.
- **Reference choice for every Claude call** (`client/src/reference.jsx`): **My World**, **My World + my existing characters & designs** (adds the locked designs and their pictures, and allows reuse matches), or **Something new** (only the pasted description). The request body carries `reference: {mode, text}`, the server resolves it with `worldFor()` in `index.js`, and the last choice per action is remembered in the browser. Chat assistants show it as a chip.
- **Stage 2 landscape** (`stages/LandscapeSection.jsx`, `POST /api/episodes/:id/landscape/design`, Claude or offline). It designs the project landscape plus each place's differences and time of day (`asset_cards.landscape`, `episodes.landscape_plan`), with a live 3D preview per place. Layering: World Style → project Look → place (Stage 2) → shot. Shot planning uses the place's time of day as the lighting.
- **UI**: a “How this stage works” guide on every stage, a Stage 4 workspace where the player stays in view, quick placement buttons, keyboard shortcuts (Space, ← →, F) and a Stage 5 “Before you export” checklist.

## Optional: Local AI (Hunyuan3D-2)

> **This laptop (Intel Iris Xe, 7.6 GB RAM) can't use its GPU for it.** The "4 GB" Windows shows for Intel graphics is borrowed system memory, and PyTorch's Intel GPU backend doesn't support 12th-gen Iris Xe. It **can** run shape-only generation on the CPU. See [Local AI on a laptop without an NVIDIA GPU](#local-ai-on-a-laptop-without-an-nvidia-gpu-cpu-shape-only).
> If you have a PC with an NVIDIA card, you can run the server there and point this app at it: `LOCAL_AI_URL=http://<that-pc-ip>:8081`, and start the server with `--host 0.0.0.0`. The app then only checks that the server is reachable.

**Requirements and licence**, checked from the project's README, `api_server.py` and LICENSE in Nov 2026:
- **Hardware:** an NVIDIA GPU with CUDA. Shape generation needs about 6 GB of video memory; shape plus texture needs about 16 GB. Integrated graphics can't run it on the GPU. Shape-only generation also runs on the CPU (slowly) through `tools/hunyuan3d_cpu_server.py`.
- **What the server supports:**
  - Image-to-3D: supported.
  - Separate texture pass on an existing mesh: supported, but needs `--enable_tex`.
  - Text-to-3D: disabled in the stock server, so it isn't offered.
  - Multi-image input: needs the Hunyuan3D-2mv model and a custom server, so it isn't wired up.
- **Licence:** Tencent Hunyuan 3D 2.0 Community License.
  - Not licensed in the **EU, UK or South Korea**.
  - Outputs may not be used to improve other AI models.
  - AI-generated content must be identified when published (for example, YouTube's "altered or synthetic content" setting).

### Local AI on a laptop without an NVIDIA GPU (CPU, shape only)

`tools/hunyuan3d_cpu_server.py` runs Hunyuan3D-2mini (turbo) on the CPU in float32 and speaks the same API as `api_server.py`, so the app needs no settings: it detects the CPU server and shows **CPU mode**.

- **Shape only.** Texturing needs CUDA-only extensions.
- **Very slow on 8 GB of RAM.** The server needs about 9 GB of memory once loaded, so on this laptop (i5-1235U, 7.6 GB) Windows pages it to disk. In the first test (Nov 2026), image prep plus the first of 5 diffusion steps took about 21 minutes, and the run was stopped for low memory before it finished. Close VS Code, browsers and other apps before using it. A machine with 16 GB or more is far more practical.
- One job at a time. Failures show in the app instead of hanging.

One-time setup (Python 3.11 and Git; first run downloads about 3 GB of model weights into the Hugging Face cache):

```powershell
git clone --depth 1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2 $env:USERPROFILE\hunyuan3d-2
py -3.11 -m venv $env:USERPROFILE\hunyuan3d-2\.venv
$py = "$env:USERPROFILE\hunyuan3d-2\.venv\Scripts\python.exe"
& $py -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
& $py -m pip install "diffusers>=0.30,<0.36" "transformers>=4.45,<5" einops opencv-python numpy omegaconf tqdm trimesh pymeshlab pygltflib accelerate fastapi uvicorn rembg onnxruntime huggingface_hub safetensors pyyaml scikit-image
```

Start it (keep the window open while you use Local AI):

```powershell
.\tools\start-hunyuan3d-cpu.ps1                       # http://127.0.0.1:8081
.\tools\start-hunyuan3d-cpu.ps1 --max_octree 192      # lighter, if you run out of memory
```

**Setup on a suitable PC** (Python 3.10+, CUDA build of PyTorch):

```powershell
git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2
cd Hunyuan3D-2
pip install -r requirements.txt
pip install -e .
# texture pass (optional, ≥16 GB VRAM): build the custom rasterizer per the repo's README
python api_server.py --host 127.0.0.1 --port 8081            # shape only
# python api_server.py --host 127.0.0.1 --port 8081 --enable_tex   # shape + texture
```

Then add to `server/.env` (create it from `.env.example`): `LOCAL_AI_URL=http://127.0.0.1:8081`, plus `LOCAL_AI_TEXTURE=true` if you started it with `--enable_tex`. Restart the app.
The Local AI tab on each card shows each check (GPU, video memory, server) and which capabilities are available. Upload a reference image, then click **Generate shape**, then optionally **Refine texture**.

## Meshy (optional, paid)

Add your key in **AI Connections** and switch **Paid generation** on. Meshy rules, enforced by the server:
- Only the **Generate in Meshy** button on one card (or **Request rig / Request clip / Browse motions / Check credits** in Stage 4) can reach Meshy.
- Analyzing lyrics, searching My World, drafting prompts, opening Stage 2 and confirming reuse never do.
- Every Meshy request is logged in the `meshy_calls` table and counted on Stage 2.
- **One generation per project at a time.** There's no batch generation, no automatic retry and no automatic regeneration. After a restart the app only checks the status of tasks already submitted.
- Results arrive as drafts. They're downloaded immediately, because Meshy deletes API results after 3 days.

## What's verified (23–24 Nov 2026, this PC: Windows 11, integrated graphics, Node 26.13, FFmpeg 9.1)

**Automated end-to-end run** on an isolated copy, with a fake Meshy server counting every request (Meshy deliberately left "active"):
- **Offline analysis** found Sun, Cloud, Meadow and Hill.
- **Pip** mapped to a crescent right ear and a gold shiny right paw, was built locally, and went through edit, rebuild and restore (3 revisions).
- **Meadow:** tree 1 moved while tree 2 stayed untouched.
- **Approve and save:** approving Pip, Sunny and the meadow showed "3 not saved"; saving Pip cleared only Pip's flag.
- **Reopening the .glb:** the downloaded file reopens with its EarRight/PawRight nodes, the gold paw material and the ear-wiggle clip.
- **Zero Meshy calls** for opening, analyzing, drafting, building, recolouring, approving and saving.
- **Generate without the button** was refused with 0 calls.
- **One at a time:** a second generation while one was running was refused (409). One click produced one job (shape + texture), and the result arrived as a draft.
- **Reuse:** a second project found Pip in My World and reused the saved copy, with 0 Meshy calls for that project in the audit log.
- **Timing and shots:** timing was approved against the 19.5 s audio, and the shot plan had Pip bouncing in line 4.
- **Review flags:** replacing the audio flagged timing and shots, and re-approving changed lyrics flagged Stage 2, with all saved work kept.
- **Local AI:** correctly reported as unavailable here, and requests are refused with a clear reason.

**Real-browser run** (headless Edge, software WebGL):
- Stage 2 showed 3D thumbnails and the interactive viewer.
- Stage 4 preview: the audio clock and scene time matched (4.307 s vs 4.307 s), and seeking showed the right shot. After a full reload (reopening the project) they matched again (4.015 s vs 4.015 s).
- Stage 5 exported a 1280×720 H.264 + AAC MP4 of 19.5 s in 95 s, plus an SRT, with no browser console errors.

## Still needs a key, hardware, or more work

| Item | Status |
|---|---|
| Meshy generation / rigging / clips | Built and tested against a **fake** Meshy server only. Needs your Meshy key for a real run. The shape of rig results is handled defensively but unverified. |
| Local AI (Hunyuan3D-2) | Adapter, checks and capability display are built. **Needs an NVIDIA GPU (≥6 GB)** and the Python server, so it's untested here. |
| Claude features (lyrics assistant, analysis with Claude, prompt drafting) | Built. Your key is connected, but I made no paid calls while testing. |
| Music/vocal generation | Provider slots exist (Eleven Music, Suno) as labelled placeholders. Uploads work without them. |
| Editing tools | **Working:** per-part colours (recipe colours for Build Locally assets, material recolouring for any .glb), version history, and restore. **Planned** (shown as such in the app): painted texture masks, masked retexturing, local geometry edits, remeshing and UV tools. The editor stores every edit as a revision so these can be added later. |
| Bone rigs for Build Locally models | Procedural models are static plus a simple node clip (Pip's ear wiggle). A real skeleton comes from Meshy rigging or an imported rig. |
| Export speed | About 5 s of render time per second of video at 720p on this laptop. 1080p is slower. |

Removed in v0.5: the old clip-based storyboard and studio (Kling/Veo clip import), and the per-item Meshy image panel. These were replaced by the 3D shot plan and the card-based Stage 2.

## Project layout

```
server/src/index.js       Express app; projects, lyrics, audio, library, assistant routes; startup
server/src/studio.js      Stages 2–5: asset cards, Build Locally / Local AI / Import / Meshy, revisions, recolour,
                          Save to My World, mixing, line timing, 3D shots, rigs & clips, frame-based MP4 export
server/src/procedural.js  Offline generator: templates, description → recipe mapper, recipe → .glb
server/src/glb.js         .glb writer (materials, embedded PNG textures, node animations)
server/src/glbedit.js     Read / recolour materials inside any .glb
server/src/meshy.js       The only Meshy client (permits, audit log, one-at-a-time, no auto-submit)
server/src/localai.js     Hunyuan3D-2 adapter + hardware/runtime checks
server/src/samples.js     “Look Up at the Sky” sample (built with the procedural generator)
server/src/model.js       Project assembly, five-stage progress, review flags
client/src/stages/        StageLyrics, StageCast (+RecipeEditor), StageMusic (+TimingEditor), StageAnimate, StageExport
client/src/engine/        SceneEngine (deterministic 3D renderer), ScenePlayer (audio-synced), Viewer3D, thumbnails
storage/                  database + media (in git; API keys live in storage/secrets.json, which is ignored)
```

## Learnings
See [docs/LEARNINGS.md](docs/LEARNINGS.md) for detailed lessons from building the studio and producing Project 05, and `tools/testing/` for the headless test harness.
