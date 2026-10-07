# 3D Generation Options (free only) — researched 2026-10-07

Caveat: pricing/quotas came mostly from search snippets and aggregators; vendor pages were not directly readable. Re-verify before relying on any number.

## Recommendation
Primary: **Blender `bpy` + parametric species configs** (verified working headless in the sandbox: bpy 5.2.2 on Python 3.13, GLB export OK).
Optional add-on: **TRELLIS.2 / Hunyuan3D 2.1 on Kaggle/Colab** for organic reference or a head/texture draft, never as the final style source.

## Options

| Option | Pros | Cons |
|---|---|---|
| **Blender `bpy` (pip)** | Free (GPL), fully scriptable, deterministic, verified headless here; loft + Subsurf + shape keys; best style consistency across species; glTF export | Must model each shark parametrically (more up-front work); 400 MB wheel pinned to Python version; Eevee/Cycles rendering untested here; procedural shaders must be baked to vertex colours/texture for glTF |
| **blender-mcp** (MIT) | Interactive viewport feedback | Needs a running Blender GUI + socket; adds little over bpy scripts; hurts reproducibility. Skip |
| **three.js / Babylon (Node)** | MIT, deterministic, great for a runtime viewer | No subdivision/remesh tools; lower realism ceiling; previews need Chromium (not installed); Node exporter untested |
| **trimesh (Python)** | MIT, installs fine, good validation (watertight, export GLB) | Weak authoring; use as glue/QA only |
| **CadQuery / build123d** | Clean parametric lofts | Heavy OpenCascade install (untested on 3.13); NURBS tessellation; awkward for fins/gills |
| **OpenSCAD / Houdini Apprentice** | — | No native glTF / organic modelling (OpenSCAD); non-commercial, login-gated installer (Houdini). Not recommended |
| **TRELLIS.2 (MIT*)** | Best open organic quality; GLB with PBR | Needs ~24 GB VRAM; *a dependency may be non-commercial (unconfirmed); fins may fuse/thicken; no GPU or HF access in this sandbox |
| **Hunyuan3D 2.1** | High geometry quality; PBR | Tencent license reportedly excludes EU/UK/South Korea; texturing needs 21+ GB VRAM |
| **SPAR3D / TripoSR** | Run on a free T4; fast | Coarse, low-poly, weak on fine organic detail; drafts only |
| **HF Spaces via gradio_client** | Free, scriptable | ZeroGPU quota only ~3.5–5 min/day (sources conflict); queues; huggingface.co blocked in this sandbox |
| **Kaggle / Colab free GPU** | ~30 h/week (Kaggle) / ~15–30 h/week (Colab); can run open models | 16 GB T4 too small for TRELLIS.2 at default settings; manual setup; session caps |
| **Meshy / Tripo3D / Rodin** | Good quality web UIs | Free tiers have no API (agent can't drive); CC BY / unclear commercial terms; Rodin effectively paid |
| **Stability API / CSM** | Has API (Stability) | One-time trial credits only (~2 models) |
| **Sloyd** | — | Template-based; unsuitable for animals |
