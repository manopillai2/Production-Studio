# Starts the CPU-only Hunyuan3D-2mini shape server on http://127.0.0.1:8081 (no NVIDIA GPU needed).
# One-time setup is described in README.md ("Local AI on a laptop without an NVIDIA GPU").
param([string]$Repo = "$env:USERPROFILE\hunyuan3d-2")
$py = Join-Path $Repo '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { Write-Error "No Python environment at $py - see README.md for the one-time setup."; exit 1 }
& $py (Join-Path $PSScriptRoot 'hunyuan3d_cpu_server.py') --repo $Repo @args
