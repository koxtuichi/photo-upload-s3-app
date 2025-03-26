#!/bin/bash
# EC2インスタンス上でPython 3.9用のLambda Layerを作成するスクリプト

# 必要なツールのインストール
echo "基本ツールと開発環境のインストール..."
sudo yum update -y
sudo yum install -y python3.9 python3.9-devel python3.9-pip
sudo yum install -y gcc gcc-c++ make cmake
sudo yum install -y libtiff-devel libjpeg-devel libpng-devel

# 作業ディレクトリの作成
echo "作業ディレクトリの作成..."
mkdir -p ~/lambda-layer/python

# 依存ライブラリのインストール (Python 3.9用)
echo "依存ライブラリのインストール..."
python3.9 -m pip install --target ~/lambda-layer/python \
  boto3==1.26.0 \
  rawpy==0.17.0 \
  imageio==2.25.1 \
  pillow==9.5.0

# zipファイルの作成
echo "Lambda Layer用ZIPファイルの作成..."
cd ~/lambda-layer
zip -r raw-processing-layer-py39.zip python/

echo "完了: $(pwd)/raw-processing-layer-py39.zip が作成されました"
echo "このファイルをEC2インスタンスからダウンロードし、Lambda Layerとしてアップロードしてください"