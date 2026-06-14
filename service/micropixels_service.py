import os
import io
import zipfile
import tempfile
import shutil
import threading
import atexit
import time
import asyncio
import uuid
from datetime import date
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, List, Tuple
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
_current_cfg: Optional[str] = None


def get_micropixels(encoder_cmd_args=None) -> MicroPixels:
    global _micropixels, _current_cfg
    cfg_key = ";".join(encoder_cmd_args or [])
    if _micropixels is not None and _current_cfg == cfg_key:
        return _micropixels

    logger.info(f"Initializing MicroPixels engine (device=cuda, cfg={cfg_key or 'default'})")
    _micropixels = MicroPixels(
        device="cuda",
        encoder_cmd_args=encoder_cmd_args or [],
        decoder_cmd_args=[],
    )
    _current_cfg = cfg_key
    logger.info("MicroPixels engine initialized successfully")
    return _micropixels


_micropixels = get_micropixels()

# ── Persistent thread pool ──────────────────────────────────────────────
# Workers are created once at startup and never destroyed.
# Each thread lazily creates its own MicroPixels instance on first use,
# so model-loading happens exactly once per thread.
_DEFAULT_POOL_SIZE = int(os.environ.get("MICROPIXELS_MAX_WORKERS", "5"))
_pool: Optional[ThreadPoolExecutor] = None
_pool_ready = threading.Event()
_per_thread_mp = threading.local()


def _get_thread_mp(cfg_args):
    """Return (or lazily create) the MicroPixels instance for the calling thread."""
    inst = getattr(_per_thread_mp, "instance", None)
    cfg_key = ";".join(cfg_args or [])
    if inst is not None and getattr(_per_thread_mp, "cfg_key", "") == cfg_key:
        return inst
    logger.info(
        f"Thread {threading.get_ident()}: creating MicroPixels instance (cfg={cfg_key or 'default'})"
    )
    _per_thread_mp.instance = MicroPixels(
        device="cuda",
        encoder_cmd_args=cfg_args or [],
        decoder_cmd_args=[],
    )
    _per_thread_mp.cfg_key = cfg_key
    return _per_thread_mp.instance


def _warmup_worker(cfg_args=None):
    """Task that forces a thread to spawn and load the MicroPixels model."""
    _get_thread_mp(cfg_args=cfg_args or [])


def _init_pool(max_workers=_DEFAULT_POOL_SIZE, cfg_args=None):
    global _pool
    t0 = time.time()
    _pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="mp")
    futures = [_pool.submit(_warmup_worker, cfg_args) for _ in range(max_workers)]
    ok = 0
    errors = []
    for f in as_completed(futures):
        try:
            f.result()
            ok += 1
        except Exception as e:
            errors.append(str(e))
    elapsed = time.time() - t0
    _pool_ready.set()
    logger.info(
        f"Persistent pool ready — {ok}/{max_workers} workers, "
        f"{elapsed:.1f}s, errors={errors}"
    )
    return ok, len(errors), errors, elapsed


def _shutdown_pool():
    global _pool
    if _pool is not None:
        _pool.shutdown(wait=False)
        _pool = None
    _pool_ready.clear()
    _per_thread_mp.__dict__.clear()


_init_pool()
atexit.register(_shutdown_pool)

# ── Progress tracking ───────────────────────────────────────────────────
_task_lock = threading.Lock()
_task_progress: dict = {}


def _register_task(task_id: str, total: int):
    with _task_lock:
        _task_progress[task_id] = {"total": total, "completed": 0, "status": "processing"}


def _advance_task(task_id: str):
    with _task_lock:
        t = _task_progress.get(task_id)
        if t:
            t["completed"] += 1


def _finish_task(task_id: str, success: bool):
    with _task_lock:
        t = _task_progress.get(task_id)
        if t:
            t["status"] = "done" if success else "failed"


@micropixels_router.post("/pool/init")
async def init_pool_endpoint(
    max_workers: int = Form(5),
    cfg: Optional[str] = Form(None),
):
    """Create or recreate the persistent thread pool and pre-warm all workers.

    All existing workers are shut down first, then ``max_workers`` new threads
    are spawned and each one loads a fresh MicroPixels model.

    Parameters
    ----------
    max_workers : int
        Number of persistent worker threads (default 5).
    cfg : str, optional
        Semicolon-separated config paths to use for all workers.
    """
    global _pool_size
    t0 = time.time()

    cfg_args = []
    if cfg:
        for c in cfg.split(";"):
            cfg_args.extend(["--cfg", c.strip()])

    # Teardown existing pool
    _shutdown_pool()

    # Recreate
    _pool_size = max_workers
    ok, fail, errors, warmup_elapsed = _init_pool(max_workers=max_workers, cfg_args=cfg_args)

    total_elapsed = time.time() - t0
    return JSONResponse({
        "success": fail == 0,
        "workers_requested": max_workers,
        "workers_ready": ok,
        "workers_failed": fail,
        "errors": errors,
        "warmup_seconds": round(warmup_elapsed, 1),
        "total_seconds": round(total_elapsed, 1),
        "cfg_used": cfg or "default",
    })


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

        cfg_args = []
        if cfg:
            for c in cfg.split(";"):
                cfg_args.extend(["--cfg", c.strip()])
        mp = get_micropixels(encoder_cmd_args=cfg_args)

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

        if mp.decoder.rec_image is None:
            raise HTTPException(status_code=500, detail="Reconstruction produced no output image")

        mp.decoder.rec_image.write_file(rec_path)

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


# ── Supported image extensions ──────────────────────────────────────────
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"}


def _compress_single(params: dict) -> tuple:
    """Thread worker: compress one image → (relpath, bin_data).

    Uses a dedicated per-thread MicroPixels instance — no global lock needed.
    """
    input_path = params["input_path"]
    bin_path = params["bin_path"]
    relpath = params["relpath"]
    bpp_idx = params["bpp_idx"]
    cfg_args = params["cfg_args"]

    mp = _get_thread_mp(cfg_args)
    mp.encoder.set_target_bpp_idx(bpp_idx)
    mp.encode_stream({"input_path": input_path, "bin_path": bin_path})

    with open(bin_path, "rb") as f:
        bin_data = f.read()

    bin_relpath = Path(relpath).with_suffix(".bin")
    logger.info(f"  [OK] {relpath} → {bin_relpath} ({len(bin_data)} bytes)")
    return str(bin_relpath), bin_data


def _rebuild_single(params: dict) -> tuple:
    """Thread worker: rebuild one bitstream → (relpath, png_data).

    Reuses the thread-local MicroPixels instance regardless of encoder cfg,
    since the decoder does not depend on encoder configuration.
    """
    bin_path = params["bin_path"]
    rec_path = params["rec_path"]
    relpath = params["relpath"]

    mp = getattr(_per_thread_mp, "instance", None) or _get_thread_mp(cfg_args=[])
    mp.decode_stream(bin_path)
    if mp.decoder.rec_image is None:
        raise RuntimeError(f"Decode failed for {relpath}")
    mp.decoder.rec_image.write_file(rec_path)

    with open(rec_path, "rb") as f:
        png_data = f.read()

    png_relpath = Path(relpath).with_suffix(".png")
    logger.info(f"  [OK] {relpath} → {png_relpath} ({len(png_data)} bytes)")
    return str(png_relpath), png_data


@micropixels_router.post("/compress_zip")
async def compress_zip(
    file: UploadFile = File(...),
    bpp_idx: int = Form(0),
    cfg: Optional[str] = Form(None),
    max_workers: int = Form(5),
    task_id: Optional[str] = Form(None),
):
    """Compress every image inside a ZIP archive and return a ZIP of .bin
    files preserving the original directory structure.

    Parameters
    ----------
    file : UploadFile
        ZIP archive containing images (PNG, JPEG, BMP, TIFF, WebP, …).
    bpp_idx : int
        Quality index (0 = highest).
    cfg : str, optional
        Semicolon-separated config paths.
    max_workers : int
        Maximum concurrent compression jobs (default5).
    """
    temp_dir = tempfile.mkdtemp(prefix="micropixels_zip_compress_")
    extract_dir = os.path.join(temp_dir, "input")
    output_dir = os.path.join(temp_dir, "output")

    try:
        os.makedirs(extract_dir)
        os.makedirs(output_dir)

        # ── 1. Extract the uploaded ZIP ──────────────────────────────
        content = await file.read()
        zip_path = os.path.join(temp_dir, "upload.zip")
        with open(zip_path, "wb") as f:
            f.write(content)

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        # ── 2. Parse config ─────────────────────────────────────────
        cfg_args = []
        if cfg:
            for c in cfg.split(";"):
                cfg_args.extend(["--cfg", c.strip()])

        # ── 3. Collect image files ──────────────────────────────────
        image_files = []
        for root, _dirs, files in os.walk(extract_dir):
            for fn in files:
                ext = os.path.splitext(fn)[1].lower()
                if ext in _IMAGE_EXTENSIONS:
                    full_path = os.path.join(root, fn)
                    relpath = os.path.relpath(full_path, extract_dir)
                    bin_path = os.path.join(output_dir, Path(relpath).with_suffix(".bin"))
                    os.makedirs(os.path.dirname(bin_path), exist_ok=True)
                    image_files.append({
                        "input_path": full_path,
                        "bin_path": bin_path,
                        "relpath": relpath,
                        "bpp_idx": bpp_idx,
                        "cfg_args": cfg_args,
                    })

        if not image_files:
            raise HTTPException(status_code=400, detail="No supported image files found in the ZIP archive")

        logger.info(f"Compress ZIP: {len(image_files)} images, max_workers={max_workers}")

        # ── 4. Parallel compression (reuses persistent pool) ─────────
        task_id = task_id or uuid.uuid4().hex[:12]
        _register_task(task_id, len(image_files))
        logger.info(f"Task {task_id}: compressing {len(image_files)} images")

        def _run_compress_block():
            results = []
            futures = {_pool.submit(_compress_single, p): p for p in image_files}
            for future in as_completed(futures):
                try:
                    results.append(future.result())
                except Exception as e:
                    relpath = futures[future]["relpath"]
                    logger.error(f"  [FAIL] {relpath}: {e}")
                    raise RuntimeError(f"Compression failed for {relpath}: {e}") from e
                finally:
                    _advance_task(task_id)
            return results

        loop = asyncio.get_running_loop()
        try:
            results = await loop.run_in_executor(None, _run_compress_block)
        except RuntimeError as e:
            _finish_task(task_id, success=False)
            raise HTTPException(status_code=500, detail=str(e)) from e
        _finish_task(task_id, success=True)

        # ── 5. Build output ZIP ─────────────────────────────────────
        out_zip_path = os.path.join(temp_dir, "output.zip")
        with zipfile.ZipFile(out_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for relpath, bin_data in results:
                zf.writestr(relpath, bin_data)

        with open(out_zip_path, "rb") as f:
            zip_data = f.read()

        logger.info(f"Compress ZIP complete: {len(image_files)} images → {len(zip_data)} bytes")

        return StreamingResponse(
            io.BytesIO(zip_data),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{Path(file.filename).stem}_compressed.zip"',
                "Content-Length": str(len(zip_data)),
                "X-Task-Id": task_id,
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"compress_zip failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@micropixels_router.post("/rebuild_zip")
async def rebuild_zip(
    file: UploadFile = File(...),
    max_workers: int = Form(5),
    task_id: Optional[str] = Form(None),
):
    """Rebuild PNG images from every .bin inside a ZIP archive and return
    a ZIP of reconstructed images preserving the original directory structure.

    Parameters
    ----------
    file : UploadFile
        ZIP archive containing MicroPixels bitstreams (``.bin`` files).
    max_workers : int
        Maximum concurrent rebuild jobs (default 5).
    """
    temp_dir = tempfile.mkdtemp(prefix="micropixels_zip_rebuild_")
    extract_dir = os.path.join(temp_dir, "input")
    output_dir = os.path.join(temp_dir, "output")

    try:
        os.makedirs(extract_dir)
        os.makedirs(output_dir)

        # ── 1. Extract the uploaded ZIP ──────────────────────────────
        content = await file.read()
        zip_path = os.path.join(temp_dir, "upload.zip")
        with open(zip_path, "wb") as f:
            f.write(content)

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        # ── 2. Collect .bin files ───────────────────────────────────
        bin_files = []
        for root, _dirs, files in os.walk(extract_dir):
            for fn in files:
                if fn.lower().endswith(".bin"):
                    full_path = os.path.join(root, fn)
                    relpath = os.path.relpath(full_path, extract_dir)
                    rec_path = os.path.join(output_dir, Path(relpath).with_suffix(".png"))
                    os.makedirs(os.path.dirname(rec_path), exist_ok=True)
                    bin_files.append({
                        "bin_path": full_path,
                        "rec_path": rec_path,
                        "relpath": relpath,
                    })

        if not bin_files:
            raise HTTPException(status_code=400, detail="No .bin files found in the ZIP archive")

        logger.info(f"Rebuild ZIP: {len(bin_files)} bitstreams, max_workers={max_workers}")

        # ── 3. Parallel rebuild (reuses persistent pool) ─────────────
        task_id = task_id or uuid.uuid4().hex[:12]
        _register_task(task_id, len(bin_files))
        logger.info(f"Task {task_id}: rebuilding {len(bin_files)} bitstreams")

        def _run_rebuild_block():
            results = []
            futures = {_pool.submit(_rebuild_single, p): p for p in bin_files}
            for future in as_completed(futures):
                try:
                    results.append(future.result())
                except Exception as e:
                    relpath = futures[future]["relpath"]
                    logger.error(f"  [FAIL] {relpath}: {e}")
                    raise RuntimeError(f"Rebuild failed for {relpath}: {e}") from e
                finally:
                    _advance_task(task_id)
            return results

        loop = asyncio.get_running_loop()
        try:
            results = await loop.run_in_executor(None, _run_rebuild_block)
        except RuntimeError as e:
            _finish_task(task_id, success=False)
            raise HTTPException(status_code=500, detail=str(e)) from e
        _finish_task(task_id, success=True)

        # ── 4. Build output ZIP ─────────────────────────────────────
        out_zip_path = os.path.join(temp_dir, "output.zip")
        with zipfile.ZipFile(out_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for relpath, png_data in results:
                zf.writestr(relpath, png_data)

        with open(out_zip_path, "rb") as f:
            zip_data = f.read()

        logger.info(f"Rebuild ZIP complete: {len(bin_files)} bitstreams → {len(zip_data)} bytes")

        return StreamingResponse(
            io.BytesIO(zip_data),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{Path(file.filename).stem}_reconstructed.zip"',
                "Content-Length": str(len(zip_data)),
                "X-Task-Id": task_id,
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"rebuild_zip failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@micropixels_router.get("/progress/{task_id}")
async def get_progress(task_id: str):
    """Return real-time progress for a compress/rebuild ZIP operation.

    Parameters
    ----------
    task_id : str
        The task identifier returned in the ``X-Task-Id`` response header
        (or supplied by the client in the compress/rebuild request).
    """
    with _task_lock:
        t = _task_progress.get(task_id)

    if t is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found (may have completed and been cleaned up)")

    total = t["total"]
    completed = t["completed"]
    return JSONResponse({
        "task_id": task_id,
        "total": total,
        "completed": completed,
        "percent": round(completed * 100.0 / total, 1) if total > 0 else 0.0,
        "status": t["status"],
    })
