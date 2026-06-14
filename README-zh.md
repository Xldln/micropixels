<p align="center">
  <img src="public/logo.png" alt="MicroPixels Logo" width="200"/>
</p>

<h1 align="center">MicroPixels</h1>

<p align="center">
  <strong>基于 JPEG AI 模型的神经网络图像压缩服务</strong>
</p>

<p align="center">
  <img src="public/demo.gif" alt="演示" width="700"/>
</p>

MicroPixels 是基于 **JPEG AI** 神经网络模型的图像压缩服务。利用深度学习将图像压缩为紧凑的二进制码流（相比传统编码器具有更优的率失真性能），并能够从码流中高质量重建图像。项目提供 **FastAPI 后端 REST API**、**React 前端页面**和**命令行工具**三种使用方式。

---

## 快速启动

### 方式 A：Docker（推荐）

```bash
# Linux
./launch.sh

# Windows PowerShell
./launch.ps1
```

脚本会自动：
1. 构建 Docker 镜像（已存在则跳过）
2. 启动容器（已停止则重启，不存在则新建）
3. 下载预训练权重并执行验证
4. 安装 npm 依赖（仅首次）并启动 **React 前端**（`http://localhost:8999`）
5. 启动**后端服务**（端口 `9000`）

### 方式 B：本地安装

```bash
pip install -r requirements.txt
cd src/codec/entropy_coding/cpp_exts/mans && make
cd src/codec/entropy_coding/cpp_exts/direct && make
mkdir -p models && cd models
wget https://yubinux.cn/tmp/pt/models.zip && unzip models.zip && rm models.zip
cd ../..

# 启动后端
python main.py

# 另开终端，启动前端
npm install    # 仅首次
npm run dev
```

---

## 业务能力

### REST API

| 接口 | 说明 |
|---|---|
| `POST /micropixels/compress` | 压缩图像 → 下载 `.bin` 码流 |
| `POST /micropixels/rebuild` | 从 `.bin` 码流重建图像 |

**压缩：**
```bash
curl -X POST http://localhost:9000/micropixels/compress \
  -F "image=@test.png" -F "bpp_idx=0" -o output.bin
```

**重建：**
```bash
curl -X POST http://localhost:9000/micropixels/rebuild \
  -F "bin=@output.bin" -o reconstructed.png
```

### 命令行工具

```bash
# 编码（压缩）
python -m src.reco.coders.encoder test.png output.bin \
  --set_target_bpp 100 --cfg cfg/tools_off.json cfg/profiles/high.json

# 解码（重建）
python -m src.reco.coders.decoder output.bin rebuild_img.png
```

### 参数说明

| 参数 | 类型 | 说明 |
|---|---|---|
| `image` | 文件 | 输入图像（PNG 等格式） |
| `bin` | 文件 | 压缩后的二进制码流 |
| `bpp_idx` | int | 码率索引（0 为最高质量） |
| `cfg` | str | 配置文件路径，分号分隔 |
