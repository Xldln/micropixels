# MicroPixels

**MicroPixels** is a neural network-based image compression service that uses deep learning to compress images into compact bitstreams and reconstruct high-quality images from them. It provides both a REST API (FastAPI) and CLI tools for encoding/decoding.

## Quick Start

### Prerequisites

- Python 3.7+
- CUDA-capable GPU (recommended)
- Docker (optional, for containerized deployment)

### Setup

#### Option 1: Docker (Recommended)

```bash
# Build and start the container
./launch.sh      # Linux
./launch.ps1     # Windows PowerShell
```

The service will start on port `9000`.

#### Option 2: Native

```bash
# Install dependencies
pip install -r requirements.txt

# Compile C++ entropy coding extensions
cd src/codec/entropy_coding/cpp_exts/mans && make
cd src/codec/entropy_coding/cpp_exts/direct && make

# Download pretrained models
mkdir -p models && cd models
wget https://yubinux.cn/tmp/pt/models.zip && unzip models.zip && rm models.zip
```

### Start Service

```bash
python main.py
```

The service listens on `http://0.0.0.0:9000`.

## Usage

### REST API

**Compress an image:**

```bash
curl -X POST http://localhost:9000/micropixels/compress \
  -F "image=@test.png" \
  -F "bpp_idx=0" \
  -o output.bin
```

**Rebuild image from bitstream:**

```bash
curl -X POST http://localhost:9000/micropixels/rebuild \
  -F "bin=@output.bin" \
  -o reconstructed.png
```

### CLI

```bash
# Encode (compress)
python -m src.reco.coders.encoder test.png output.bin \
  --set_target_bpp 100 \
  --cfg cfg/tools_off.json cfg/profiles/high.json

# Decode (reconstruct)
python -m src.reco.coders.decoder output.bin rebuild_img.png
```

### Configuration

Compression behavior can be customized via JSON config files in the `cfg/` directory. Pass them with the `--cfg` flag (CLI) or `cfg` form parameter (API):

| Config File | Purpose |
|---|---|
| `cfg/tools_off.json` | Disable all tools |
| `cfg/tools_on.json` | Enable all tools |
| `cfg/profiles/high.json` | High-quality profile |
| `cfg/profiles/low.json` | Low bitrate profile |

### API Parameters

| Endpoint | Parameter | Type | Description |
|---|---|---|---|
| `POST /micropixels/compress` | `image` | file | Input image (PNG, etc.) |
| | `bpp_idx` | int | Target bitrate index (0 = highest quality) |
| | `cfg` | str (optional) | Config paths, semicolon-separated |
| `POST /micropixels/rebuild` | `bin` | file | Compressed bitstream (`.bin`) |
