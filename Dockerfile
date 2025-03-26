FROM amazonlinux:2

# 基本パッケージのインストール
RUN yum -y update && yum -y install \
    gcc gcc-c++ make \
    python3-devel python3-pip \
    zip unzip tar gzip \
    wget git \
    libffi-devel openssl-devel \
    && yum clean all

# Python環境のセットアップ
RUN python3 -m pip install --upgrade pip wheel setuptools

# Python 3.9をソースからビルド
RUN cd /tmp && \
    wget https://www.python.org/ftp/python/3.9.16/Python-3.9.16.tgz && \
    tar xzf Python-3.9.16.tgz && \
    cd Python-3.9.16 && \
    ./configure --enable-optimizations && \
    make altinstall && \
    ln -sf /usr/local/bin/python3.9 /usr/bin/python3.9 && \
    ln -sf /usr/local/bin/pip3.9 /usr/bin/pip3.9

# 作業ディレクトリの作成
WORKDIR /lambda-layer

# Lambda Layerに必要なパッケージのインストール（pythonディレクトリにインストール）
RUN mkdir -p /lambda-layer/python
WORKDIR /lambda-layer/python

# 必要なパッケージをインストール（manylinux2014対応）
RUN pip3.9 install numpy==1.22.4 --platform manylinux2014_x86_64 --only-binary=:all: --target .
RUN pip3.9 install rawpy==0.17.1 --platform manylinux2014_x86_64 --only-binary=:all: --target .
RUN pip3.9 install Pillow --platform manylinux2014_x86_64 --only-binary=:all: --target .
RUN pip3.9 install imageio==2.25.1 --platform manylinux2014_x86_64 --only-binary=:all: --target .

# インストールされたパッケージを確認
RUN ls -la /lambda-layer/python
RUN du -sh /lambda-layer/python/numpy /lambda-layer/python/rawpy /lambda-layer/python/PIL /lambda-layer/python/imageio || true

# ZIPアーカイブ作成
WORKDIR /lambda-layer
RUN zip -r raw-numpy-layer-py39.zip python/

# 確認用のコマンド
CMD echo "レイヤービルド完了。ZIPは以下のパスで利用可能です: /lambda-layer/raw-numpy-layer-py39.zip"