from fastapi import FastAPI, HTTPException, Response,APIRouter, Depends,UploadFile, File, Form,BackgroundTasks
from typing import List
from datetime import datetime
import os
import shutil
from fastapi.responses import JSONResponse,FileResponse,PlainTextResponse,StreamingResponse
import pandas as pd
import cv2
import io
import numpy as np
from src.reco.coders.micropixels import  MicroPixels


micropixels_router = APIRouter(
    prefix="/micropixels",  # 所有接口路径前缀，例如 /photon/visualize_photons
    tags=["micropixels service API"]  # 文档分组标题
)

# 懒加载：首次调用 API 时才初始化
_micropixels = None

def get_micropixels():
    global _micropixels
    if _micropixels is None:
        _micropixels = MicroPixels(device="cuda",
                                   encoder_cmd_args=[],
                                   decoder_cmd_args=[])
    return _micropixels


@micropixels_router.post("/detect")
async def detect_micropixels(image: UploadFile = File(...), model_type: str = Form(...)):

    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    temp_image_path = f"temp_{timestamp}_{image.filename}"
    
    print("hello!")

