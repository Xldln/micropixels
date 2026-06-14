<p align="center">
  <img src="public/logo.png" alt="MicroPixels Logo" width="200"/>
</p>

<h1 align="center">MicroPixels</h1>

<p align="center">
  <a href="README-zh.md">zh</a> · <strong>ENG</strong>
</p>

<p align="center">
  <strong>JPEG AI neural-network image compression service</strong>
</p>

<p align="center">
  <img src="public/demo.gif" alt="Demo" width="700"/>
</p>

MicroPixels is an image compression service based on the **JPEG AI** neural network model. It leverages deep learning to compress images into compact bitstreams with significantly better rate-distortion performance than traditional codecs, and reconstructs high-quality images from those bitstreams. The project provides a **REST API (FastAPI)** for the backend, a **React web UI** for the frontend, and **CLI tools** for direct encoding/decoding.

---

## Quick Start

### Option A: Docker (Recommended)

```bash
# Linux
./launch.sh

# Windows PowerShell
./launch.ps1
```

The script will automatically:
1. Build the Docker image (skipped if already exists)
2. Start the container (restart if stopped, create if not exists)
3. Run `dl.sh` to download pretrained weights, then `test.sh` for verification
4. Check port 8999 — if already in use, skip React startup; otherwise install npm dependencies (first time) & start **React frontend** on `http://localhost:8999`
5. Start the **backend service** on port `9000`

### Option B: Native

```bash
pip install -r requirements.txt
cd src/codec/entropy_coding/cpp_exts/mans && make
cd src/codec/entropy_coding/cpp_exts/direct && make
bash dl.sh          # download pretrained weights

# Start backend (loguru logs to ./logs/app_*.log)
python main.py

# In another terminal, start frontend
npm install         # first time only
npm run dev
```

---

## Business Capabilities

### REST API

| Endpoint | Description |
|---|---|
| `POST /micropixels/compress` | Compress an image → download `.bin` bitstream |
| `POST /micropixels/rebuild` | Reconstruct image from a `.bin` bitstream |
| `GET /micropixels/logs` | Retrieve backend logs (supports offset-based pagination) |

**Compress:**
```bash
curl -X POST http://localhost:9000/micropixels/compress \
  -F "image=@test.png" -F "bpp_idx=0" -o output.bin
```

**Rebuild:**
```bash
curl -X POST http://localhost:9000/micropixels/rebuild \
  -F "bin=@output.bin" -o reconstructed.png
```

### CLI

```bash
# Encode (compress)
python -m src.reco.coders.encoder test.png output.bin \
  --set_target_bpp 100 --cfg cfg/tools_off.json cfg/profiles/high.json

# Decode (reconstruct)
python -m src.reco.coders.decoder output.bin rebuild_img.png
```

### Parameters

| Param | Type | Description |
|---|---|---|
| `image` | file | Input image (PNG, etc.) |
| `bin` | file | Compressed bitstream |
| `bpp_idx` | int | Bitrate index (0 = highest quality) |
| `cfg` | str | Config paths, semicolon-separated |

---


### Key Features

- **Port auto-detection** — React dev server on 8999 is only started if port is free
- **Logging** — All `print()` / `Logger.info()` from the codec library, plus uvicorn & FastAPI logs, are captured by **loguru** and written to `./logs/app_YYYY-MM-DD.log` with UTF-8 encoding
- **Weight management** — `dl.sh` downloads pretrained models, `test.sh` verifies them with a full encode/decode cycle
- **React frontend** — Web UI served on `localhost:8999`, communicates with the backend API on port 9000 (CORS configured)
