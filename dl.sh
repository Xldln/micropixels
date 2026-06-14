

if [ -d "models" ] && [ "$(ls -A models 2>/dev/null)" ]; then
    echo "models 文件夹已存在且不为空，跳过下载。"
else
    echo "models 文件夹不存在或为空，开始下载..."
    mkdir -p models && cd models && wget https://yubinux.cn/tmp/pt/models.zip && unzip models.zip && rm models.zip && cd ..
fi