# MicroPixels

**MicroPixels** 是一个基于深度学习的图像压缩服务，利用神经网络将图像压缩为紧凑的二进制码流，并能够从码流中重建出高质量图像。项目提供 REST API（FastAPI）和命令行工具两种使用方式。

## 快速开始

### 环境要求

- Python 3.7+
- 支持 CUDA 的 GPU（推荐）
- Docker（可选，用于容器化部署）

### 安装配置

#### 方式一：Docker（推荐）

```bash
# Linux
./launch.sh

# Windows PowerShell
./launch.ps1
```

服务启动后监听 `9000` 端口。

#### 方式二：本地安装

```bash
# 安装依赖
pip install -r requirements.txt

# 编译 C++ 熵编码扩展
cd src/codec/entropy_coding/cpp_exts/mans && make
cd src/codec/entropy_coding/cpp_exts/direct && make

# 下载预训练模型
mkdir -p models && cd models
wget https://yubinux.cn/tmp/pt/models.zip && unzip models.zip && rm models.zip
```

### 启动服务

```bash
python main.py
```

服务默认运行在 `http://0.0.0.0:9000`。

## 使用说明

### REST API

**压缩图像：**

```bash
curl -X POST http://localhost:9000/micropixels/compress \
  -F "image=@test.png" \
  -F "bpp_idx=0" \
  -o output.bin
```

**从码流重建图像：**

```bash
curl -X POST http://localhost:9000/micropixels/rebuild \
  -F "bin=@output.bin" \
  -o reconstructed.png
```

### 命令行工具

```bash
# 编码（压缩）
python -m src.reco.coders.encoder test.png output.bin \
  --set_target_bpp 100 \
  --cfg cfg/tools_off.json cfg/profiles/high.json

# 解码（重建）
python -m src.reco.coders.decoder output.bin rebuild_img.png
```

### 配置

压缩行为可通过 `cfg/` 目录下的 JSON 配置文件自定义，使用 `--cfg` 参数（CLI）或 `cfg` 表单参数（API）指定：

| 配置文件 | 用途 |
|---|---|
| `cfg/tools_off.json` | 关闭所有工具 |
| `cfg/tools_on.json` | 启用所有工具 |
| `cfg/profiles/high.json` | 高质量配置 |
| `cfg/profiles/low.json` | 低码率配置 |

### API 参数

| 接口 | 参数 | 类型 | 说明 |
|---|---|---|---|
| `POST /micropixels/compress` | `image` | 文件 | 输入图像（PNG 等格式） |
| | `bpp_idx` | int | 目标码率索引（0 为最高质量） |
| | `cfg` | str（可选） | 配置文件路径，分号分隔 |
| `POST /micropixels/rebuild` | `bin` | 文件 | 压缩后的二进制码流（`.bin`） |
