"""
CPU-only Hunyuan3D-2mini shape server for machines without an NVIDIA GPU (e.g. Intel Iris Xe laptops).

Speaks the same API as Hunyuan3D-2's api_server.py, so server/src/localai.js works unchanged:
  POST /send            {"image": <base64>, "seed", "octree_resolution", "num_inference_steps", ...} -> {"uid"}
  GET  /status/{uid}    -> {"status": "processing" | "completed" | "error", "progress", "message", "model_base64"}

Differences from the stock server:
  * runs on the CPU: DiT and VAE in float32, the DINOv2-giant image encoder in bfloat16, loaded
    without the stock loader's double allocation (~9 GB committed once loaded; it starts on an
    8 GB laptop but pages heavily — 16 GB+ is practical),
  * shape only (texturing needs CUDA-only extensions),
  * one job at a time (RAM is the limit), and failures are reported as status "error"
    instead of leaving the job "processing" forever,
  * step count and octree resolution are capped for the CPU (see --steps / --max_octree).

Run (from anywhere):
  <hunyuan3d-2>/.venv/Scripts/python.exe tools/hunyuan3d_cpu_server.py --repo <hunyuan3d-2>
"""
import argparse
import base64
import gc
import os
import sys
import threading
import time
import traceback
import uuid
from io import BytesIO

parser = argparse.ArgumentParser()
parser.add_argument('--repo', default=os.path.join(os.path.expanduser('~'), 'hunyuan3d-2'),
                    help='Path to the cloned Tencent-Hunyuan/Hunyuan3D-2 repo')
parser.add_argument('--host', default='127.0.0.1')
parser.add_argument('--port', type=int, default=8081)
parser.add_argument('--model_path', default='tencent/Hunyuan3D-2mini')
parser.add_argument('--subfolder', default='hunyuan3d-dit-v2-mini-turbo')
parser.add_argument('--steps', type=int, default=5,
                    help='Diffusion steps (the turbo model is distilled for ~5; more is slower, not better)')
parser.add_argument('--max_octree', type=int, default=256, help='Upper limit for octree_resolution')
parser.add_argument('--rembg_model', default='u2net', help='rembg background-removal model (small: u2net, isnet-general-use)')
parser.add_argument('--encoder_dtype', choices=['bf16', 'fp32'], default='bf16',
                    help='DINOv2-giant image encoder precision; fp32 needs ~2.3 GB more RAM')
parser.add_argument('--threads', type=int, default=0, help='Torch CPU threads (0 = PyTorch default)')
args = parser.parse_args()

sys.path.insert(0, os.path.abspath(args.repo))

import torch  # noqa: E402
import trimesh  # noqa: E402
import uvicorn  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from PIL import Image  # noqa: E402

import yaml  # noqa: E402
from accelerate import init_empty_weights  # noqa: E402
from rembg import new_session, remove  # noqa: E402
from safetensors import safe_open  # noqa: E402
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline  # noqa: E402
from hy3dgen.shapegen.pipelines import instantiate_from_config  # noqa: E402
from hy3dgen.shapegen.utils import smart_load_model  # noqa: E402

if args.threads > 0:
    torch.set_num_threads(args.threads)

OUT_DIR = os.path.join(os.path.abspath(args.repo), 'cpu_server_output')
os.makedirs(OUT_DIR, exist_ok=True)

ENCODER_DTYPE = torch.bfloat16 if args.encoder_dtype == 'bf16' else torch.float32


def build_low_memory(cfg, state_dict, dtype, strict=True):
    """Instantiate a module without allocating its weights, then adopt the checkpoint tensors in place.

    The stock loader builds every model in float32 *and* holds the whole checkpoint at the same time
    (>10 GB peak for 2mini, whose image encoder is DINOv2-giant), which does not fit in 8 GB of RAM.
    """
    with init_empty_weights(include_buffers=False):
        module = instantiate_from_config(cfg)
    module.load_state_dict({k: v.to(dtype) for k, v in state_dict.items()}, strict=strict, assign=True)
    leftover = [n for n, p in module.named_parameters() if p.is_meta]
    if leftover:  # unused parts missing from the checkpoint (e.g. the VAE encoder): give them real storage
        for name in leftover:
            *parents, leaf = name.split('.')
            owner = module.get_submodule('.'.join(parents)) if parents else module
            old = getattr(owner, leaf)
            setattr(owner, leaf, torch.nn.Parameter(torch.zeros(old.shape, dtype=dtype), requires_grad=False))
    return module.to(dtype).eval().requires_grad_(False)


def read_checkpoint(path):
    """{'model': {...}, 'vae': {...}, 'conditioner': {...}} from a Hunyuan3D safetensors file, one tensor at a time."""
    groups = {}
    with safe_open(path, framework='pt', device='cpu') as f:
        for key in f.keys():
            group, sub = key.split('.', 1)
            groups.setdefault(group, {})[sub] = f.get_tensor(key)
    return groups


class CastingConditioner(torch.nn.Module):
    """Runs the (huge) image encoder in a smaller dtype and hands float32 features to the DiT."""

    def __init__(self, inner):
        super().__init__()
        self.inner = inner

    @staticmethod
    def _f32(out):
        return {k: (v.float() if torch.is_tensor(v) else v) for k, v in out.items()}

    def forward(self, *a, **kw):
        return self._f32(self.inner(*a, **kw))

    def unconditional_embedding(self, *a, **kw):
        return self._f32(self.inner.unconditional_embedding(*a, **kw))


print(f'Loading {args.model_path}/{args.subfolder} on CPU ({torch.get_num_threads()} threads, '
      f'image encoder in {args.encoder_dtype})...', flush=True)
cfg_path, ckpt_path = smart_load_model(args.model_path, subfolder=args.subfolder, use_safetensors=True, variant='fp16')
with open(cfg_path, 'r') as f:
    cfg = yaml.safe_load(f)
ckpt = read_checkpoint(ckpt_path)
conditioner = CastingConditioner(build_low_memory(cfg['conditioner'], ckpt.pop('conditioner'), ENCODER_DTYPE))
gc.collect()
model = build_low_memory(cfg['model'], ckpt.pop('model'), torch.float32)
del ckpt
gc.collect()

# Turbo VAE (FlashVDM): the fast mesh decoder that api_server.py swaps in via enable_flashvdm().
vae_cfg_path, vae_ckpt_path = smart_load_model(args.model_path, subfolder='hunyuan3d-vae-v2-mini-turbo',
                                               use_safetensors=True, variant='fp16')
with open(vae_cfg_path, 'r') as f:
    vae_cfg = yaml.safe_load(f)
vae_cfg['target'] = 'hy3dgen.shapegen.models.ShapeVAE'
with safe_open(vae_ckpt_path, framework='pt', device='cpu') as f:
    vae_sd = {k: f.get_tensor(k) for k in f.keys()}
vae = build_low_memory(vae_cfg, vae_sd, torch.float32, strict=False)
del vae_sd
vae.enable_flashvdm_decoder(enabled=True, adaptive_kv_selection=True, topk_mode='mean', mc_algo='mc')

pipeline = Hunyuan3DDiTFlowMatchingPipeline(
    vae=vae, model=model, conditioner=conditioner,
    scheduler=instantiate_from_config(cfg['scheduler']),
    image_processor=instantiate_from_config(cfg['image_processor']),
    device='cpu', dtype=None)  # dtype=None: don't cast everything (the encoder stays small)
pipeline.dtype = torch.float32
gc.collect()

# Recent rembg versions default to BRIA RMBG-2.0 (a 1 GB model that needs several GB of RAM), which
# does not fit next to the shape model on an 8 GB laptop. u2net is ~170 MB and fine for single objects.
rembg_session = new_session(args.rembg_model)


def remove_background(image):
    image = image.convert('RGBA')
    alpha = image.getchannel('A')
    if alpha.getextrema()[0] < 250:  # already cut out (has transparent pixels) — keep it as is
        return image
    return remove(image, session=rembg_session, bgcolor=[255, 255, 255, 0])


print('Model loaded.', flush=True)

jobs = {}  # uid -> {"status", "progress", "message", "path"}
gpu_lock = threading.Lock()  # one generation at a time


def run_job(uid, params):
    job = jobs[uid]
    try:
        with gpu_lock:
            job.update(status='processing', progress=0.02, message='Removing background...')
            image = Image.open(BytesIO(base64.b64decode(params['image'])))
            image = remove_background(image)

            steps = args.steps
            octree = min(int(params.get('octree_resolution', 256)), args.max_octree)
            job.update(progress=0.05, message=f'Generating shape ({steps} steps, octree {octree})...')

            def on_step(i, _t, _out):
                job.update(progress=round(0.05 + 0.6 * (i + 1) / steps, 3),
                           message=f'Diffusion step {i + 1}/{steps}')

            start = time.time()
            with torch.inference_mode():
                mesh = pipeline(
                    image=image,
                    num_inference_steps=steps,
                    guidance_scale=float(params.get('guidance_scale', 5.0)),
                    octree_resolution=octree,
                    generator=torch.Generator('cpu').manual_seed(int(params.get('seed', 1234))),
                    mc_algo='mc',
                    callback=on_step, callback_steps=1,
                )[0]
            job.update(progress=0.95, message='Exporting mesh...')
            if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
                raise RuntimeError('No surface found — try an image with one clear object on a plain background.')
            path = os.path.join(OUT_DIR, f'{uid}.glb')
            mesh.export(path)
            print(f'[{uid}] done in {time.time() - start:.0f}s, {len(mesh.faces)} faces', flush=True)
            job.update(status='completed', progress=1.0, message='Done', path=path)
    except Exception as e:  # report instead of hanging the client
        traceback.print_exc()
        msg = 'Out of memory — close other apps or lower octree_resolution' if isinstance(e, MemoryError) else str(e)
        job.update(status='error', message=msg or e.__class__.__name__)


app = FastAPI()


@app.post('/send')
async def send(params: dict):
    if 'image' not in params:
        return JSONResponse({'error': 'image (base64) is required; text-to-3D is not supported'}, status_code=400)
    if params.get('texture') or 'mesh' in params:
        return JSONResponse({'error': 'Texturing is not available on the CPU server'}, status_code=400)
    uid = str(uuid.uuid4())
    jobs[uid] = {'status': 'queued', 'progress': 0.0, 'message': 'Waiting for the previous job...'}
    threading.Thread(target=run_job, args=(uid, params), daemon=True).start()
    return {'uid': uid}


@app.get('/status/{uid}')
async def status(uid: str):
    if uid == 'healthcheck':
        return {'status': 'ok', 'device': 'cpu', 'texture': False}
    job = jobs.get(uid)
    if job is None:
        return JSONResponse({'status': 'error', 'message': 'Unknown job (the server may have restarted)'}, status_code=404)
    out = {k: job[k] for k in ('status', 'progress', 'message')}
    if job['status'] == 'completed':
        with open(job['path'], 'rb') as f:
            out['model_base64'] = base64.b64encode(f.read()).decode()
    return out


if __name__ == '__main__':
    uvicorn.run(app, host=args.host, port=args.port, log_level='warning')
