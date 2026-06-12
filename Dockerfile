FROM nvcr.io/nvidia/tensorrt:19.12-py3

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        software-properties-common \
        openssh-server \
        sudo \
        net-tools \
        ffmpeg \
        libsm6 \
        libxext6 \
        && \
    add-apt-repository -y ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        python3.7 \
        python3.7-dev \
        python3.7-distutils \
        && \
    rm -rf /var/lib/apt/lists/* && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.7 1 && \
    update-alternatives --install /usr/bin/python python /usr/bin/python3.7 1 && \
    python3 -m ensurepip --upgrade && \
    python3 -m pip install --upgrade pip setuptools wheel

# Install Python dependencies
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m pip install --no-cache-dir -r /tmp/requirements.txt \
        -i https://pypi.tuna.tsinghua.edu.cn/simple

# Set working directory and copy source code
WORKDIR /workspace
COPY . /workspace

# Build C++ extensions (me-tANS and direct ECU)
RUN cd /workspace/src/codec/entropy_coding/cpp_exts/mans && make && \
    cd /workspace/src/codec/entropy_coding/cpp_exts/direct && make
