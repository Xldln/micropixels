import os
import io
import tempfile
import shutil
from datetime import date
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from loguru import logger

from src.reco.coders.micropixels import MicroPixels

LOG_PATH = "./logs"


micropixels_router = APIRouter(
    prefix="/micropixels",
    tags=["micropixels service API"],
)

_micropixels: Optional[MicroPixels] = None


def get_micropixels() -> MicroPixels:
    global _micropixels
    if _micropixels is None:
        logger.info("Initializing MicroPixels engine (device=cuda)")
        _micropixels = MicroPixels(
            device="cuda",
            encoder_cmd_args=[],
            decoder_cmd_args=[],
        )
        logger.info("MicroPixels engine initialized successfully")
    return _micropixels


_micropixels = get_micropixels()


@micropixels_router.post("/compress")
async def compress_micropixels(
    image: UploadFile = File(...),
    bpp_idx: int = Form(0),
    cfg: Optional[str] = Form(None),
):
    """Compress an uploaded image and return the binary bitstream.

    Parameters
    ----------
    image : UploadFile
        Input image (PNG, etc.).
    bpp_idx : int
        Index into the target_bpps list (0 = highest quality).
    cfg : str, optional
        Semicolon-separated config file paths, e.g.
        ``cfg/tools_on.json;cfg/profiles/high.json``.
    """
    temp_dir = tempfile.mkdtemp(prefix="micropixels_compress_")
    try:
        ext = os.path.splitext(image.filename or "input.png")[1] or ".png"
        input_path = os.path.join(temp_dir, f"input{ext}")
        bin_path = os.path.join(temp_dir, "output.bin")

        content = await image.read()
        with open(input_path, "wb") as f:
            f.write(content)

        logger.info(f"Compressing {image.filename} ({len(content)} bytes), bpp_idx={bpp_idx}")

        mp = _micropixels

        if cfg:
            cfg_args = []
            for c in cfg.split(";"):
                cfg_args.extend(["--cfg", c.strip()])
            mp.encoder.init_common_codec(build_model=False, cmd_args=cfg_args)
            logger.info(f"Applied configs: {cfg}")

        mp.encoder.set_target_bpp_idx(bpp_idx)
        mp.encode_stream({"input_path": input_path, "bin_path": bin_path})

        with open(bin_path, "rb") as f:
            bin_data = f.read()

        logger.info(f"Compression complete: {len(bin_data)} bytes -> {Path(image.filename).stem}.bin")

        return StreamingResponse(
            io.BytesIO(bin_data),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{Path(image.filename).stem}.bin"',
                "Content-Length": str(len(bin_data)),
            },
        )
    except Exception as e:
        logger.error(f"Compression failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@micropixels_router.post("/rebuild")
async def rebuild_micropixels(bin: UploadFile = File(...)):
    """Reconstruct an image from a compressed bitstream and return a PNG."""
    temp_dir = tempfile.mkdtemp(prefix="micropixels_rebuild_")
    try:
        bin_path = os.path.join(temp_dir, "input.bin")
        rec_path = os.path.join(temp_dir, "reconstructed.png")

        content = await bin.read()
        with open(bin_path, "wb") as f:
            f.write(content)

        logger.info(f"Rebuilding from bitstream ({len(content)} bytes)")

        mp = get_micropixels()
        mp.decode_stream(bin_path)

        if mp.rec_image is None:
            raise HTTPException(status_code=500, detail="Reconstruction produced no output image")

        mp.rec_image.write_file(rec_path)

        with open(rec_path, "rb") as f:
            img_data = f.read()

        logger.info(f"Rebuild complete: {len(img_data)} bytes -> {Path(bin.filename).stem}_reconstructed.png")

        return StreamingResponse(
            io.BytesIO(img_data),
            media_type="image/png",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="{Path(bin.filename).stem}_reconstructed.png"'
                ),
                "Content-Length": str(len(img_data)),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Rebuild failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def _today_log_path() -> str:
    return os.path.join(LOG_PATH, f"app_{date.today().isoformat()}.log")


@micropixels_router.get("/logs")
async def get_logs(offset: int = Query(0, ge=0)):
    log_file = _today_log_path()
    if not os.path.exists(log_file):
        return JSONResponse({"lines": [], "offset": 0, "total": 0})

    with open(log_file, "r", encoding="utf-8") as f:
        f.seek(offset)
        new_content = f.read()
        new_offset = f.tell()

    lines = new_content.split("\n")
    if lines and lines[-1] == "":
        lines = lines[:-1]

    return JSONResponse({
        "lines": lines,
        "offset": new_offset,
        "total": len(lines),
    })
