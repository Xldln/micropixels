FROM nvcr.io/nvidia/tensorrt:19.12-py3

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        software-properties-common \
        ffmpeg \
        libsm6 \
        libxext6 \
        wget \
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
    ln -sf /usr/bin/python3.7-config /usr/bin/python3-config && \
    wget https://bootstrap.pypa.io/pip/3.7/get-pip.py -O /tmp/get-pip.py && \
    python3.7 /tmp/get-pip.py && \
    python3.7 -m pip install --upgrade pip==24.0 setuptools==59.6.0 wheel

# Install Python dependencies
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m pip install --no-cache-dir -r /tmp/requirements.txt \
        -i https://pypi.tuna.tsinghua.edu.cn/simple

# Set working directory and copy source code
WORKDIR /workspace
COPY . /workspace


# Keep container running for development
CMD ["tail", "-f", "/dev/null"]
