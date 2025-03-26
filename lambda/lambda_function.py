"""
photo-upload-s3-app Lambda関数
S3にアップロードされたRAWファイルとJPGファイルからサムネイルを抽出し、指定のパスに保存する
Python 3.13 + rawpy対応版
"""

import json
import boto3
import rawpy
import imageio
import os
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple

# ロギング設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# S3クライアント初期化
s3_client = boto3.client('s3')

# サポートするRAW拡張子のリスト
RAW_EXTENSIONS = [
    '.arw',  # Sony
    '.cr2', '.cr3',  # Canon
    '.dng',  # Adobe DNG
    '.nef', '.nrw',  # Nikon
    '.orf',  # Olympus
    '.pef',  # Pentax
    '.raf',  # Fuji
    '.rw2',  # Panasonic
    '.x3f',  # Sigma
    '.srw',  # Samsung
    '.kdc', '.dcr',  # Kodak
    '.raw',  # Generic
    '.tiff', '.tif',  # TIFF formats
    '.3fr',  # Hasselblad
    '.mef',  # Mamiya
    '.mrw',  # Minolta
    '.rwl',  # Leica
    '.iiq',  # Phase One
    '.erf',  # Epson
    '.mos',  # Leaf
    '.rwz',  # Rawzor
]

# サポートするJPG拡張子のリスト
JPG_EXTENSIONS = [
    '.jpg',
    '.jpeg',
]

def get_file_extension(filename: str) -> str:
    """ファイルの拡張子を取得"""
    return os.path.splitext(filename)[1].lower()

def is_raw_file(filename: str) -> bool:
    """RAWファイルかどうかを判定"""
    extension = get_file_extension(filename)
    return extension in RAW_EXTENSIONS

def is_jpg_file(filename: str) -> bool:
    """JPGファイルかどうかを判定"""
    extension = get_file_extension(filename)
    return extension in JPG_EXTENSIONS

def extract_path_info(key: str) -> Optional[Dict[str, str]]:
    """S3パスからユーザーIDと日付情報を抽出"""
    # パスの例: user/abc123/raw/2023/04/15/file.x3f
    # または: user/abc123/jpg/2023/04/15/file.jpg
    path_parts = key.split('/')
    if len(path_parts) < 7:  # 必要な階層が足りない
        logger.warning(f"無効なパス形式: {key}")
        return None

    try:
        # user/userId/filetype/year/month/day/filename.ext
        user_id = path_parts[1]
        file_type = path_parts[2]  # raw または jpg
        year = path_parts[3]
        month = path_parts[4]
        day = path_parts[5]

        # 数値形式の検証
        if not (year.isdigit() and month.isdigit() and day.isdigit()):
            logger.warning(f"パスの日付部分が数値ではありません: {key}")
            return None

        return {
            "user_id": user_id,
            "file_type": file_type,
            "year": year,
            "month": month.zfill(2),  # 1桁の場合は0埋め
            "day": day.zfill(2)  # 1桁の場合は0埋め
        }
    except Exception as e:
        logger.error(f"パス情報抽出エラー: {e}")
        return None

def generate_thumbnail_path(source_key: str, filename: str) -> Optional[str]:
    """サムネイル保存先のS3パスを生成"""
    path_info = extract_path_info(source_key)
    if not path_info:
        return None

    # ファイルタイプに基づいてサムネイルディレクトリを決定
    if path_info['file_type'] == 'raw':
        thumbnail_dir = 'rawThumbnail'
    elif path_info['file_type'] == 'jpg':
        thumbnail_dir = 'jpgThumbnail'
    else:
        logger.warning(f"サポートされていないファイルタイプ: {path_info['file_type']}")
        return None

    # サムネイル用のファイル名を生成（拡張子をjpgに変更）
    thumbnail_filename = os.path.splitext(filename)[0] + "_thumb.jpg"

    # サムネイル保存先のパスを生成
    return f"user/{path_info['user_id']}/{thumbnail_dir}/{path_info['year']}/{path_info['month']}/{path_info['day']}/{thumbnail_filename}"

def process_raw_file(raw_path: str, thumb_path: str) -> bool:
    """RAWファイルからサムネイルを抽出して保存"""
    try:
        logger.info(f"RAW処理開始: {raw_path}")

        with rawpy.imread(raw_path) as raw:
            # まず埋め込みサムネイルの取得を試みる
            try:
                thumb = raw.extract_thumb()
                if thumb.format == 'jpeg':
                    # JPEGサムネイルがある場合
                    logger.info("埋め込みJPEGサムネイル抽出成功")
                    with open(thumb_path, 'wb') as f:
                        f.write(thumb.data)
                    return True
                else:
                    # 埋め込みサムネイルがあるがJPEGではない場合
                    logger.info(f"埋め込みサムネイルはJPEG形式ではありません: {thumb.format}")
            except (rawpy.LibRawError, OSError) as e:
                # サムネイル取得に失敗した場合
                logger.info(f"埋め込みサムネイル抽出失敗: {e}")

            # サムネイル取得失敗時または非JPEG形式の場合は、未処理イメージから生成
            logger.info("未処理イメージからサムネイル生成中...")

            # 処理オプション
            # use_camera_wb: カメラのホワイトバランス設定を使用
            # half_size: 高速処理のため半分のサイズで出力
            # no_auto_bright: 自動明るさ調整を無効化
            # output_bps: 出力ビット深度（8ビット）
            rgb = raw.postprocess(
                use_camera_wb=True,
                half_size=True,
                no_auto_bright=True,
                output_bps=8
            )

            # JPEG形式で保存（品質85%）
            imageio.imsave(thumb_path, rgb, format='jpeg', quality=85)
            logger.info(f"未処理イメージからのサムネイル生成完了: {thumb_path}")
            return True

    except Exception as e:
        logger.error(f"RAW処理エラー: {e}")
        return False

def process_jpg_file(jpg_path: str, thumb_path: str) -> bool:
    """JPGファイルからサムネイルを生成して保存"""
    try:
        logger.info(f"JPG処理開始: {jpg_path}")

        # PILを使用してJPG画像を処理
        from PIL import Image

        with Image.open(jpg_path) as img:
            # 元のサイズを記録
            orig_width, orig_height = img.size
            logger.info(f"元の画像サイズ: {orig_width}x{orig_height}")

            # 最大サイズ（長辺800px）を指定してリサイズ
            max_size = 800
            if orig_width > max_size or orig_height > max_size:
                # アスペクト比を維持してリサイズ
                if orig_width > orig_height:
                    new_width = max_size
                    new_height = int(orig_height * (max_size / orig_width))
                else:
                    new_height = max_size
                    new_width = int(orig_width * (max_size / orig_height))

                img = img.resize((new_width, new_height), Image.LANCZOS)
                logger.info(f"リサイズ後のサイズ: {new_width}x{new_height}")

            # 品質を下げて保存（ファイルサイズ縮小のため）
            img.save(thumb_path, format='JPEG', quality=80, optimize=True)

            # ファイルサイズを確認
            thumb_size = os.path.getsize(thumb_path)
            logger.info(f"サムネイルサイズ: {thumb_size} bytes")

            # 目標サイズ: 100KB以下
            if thumb_size > 100 * 1024:
                logger.info("サムネイルが100KBを超えています。さらに圧縮します。")
                # サイズに応じて品質を調整
                quality = max(50, 80 - int((thumb_size - 100 * 1024) / (20 * 1024)))
                img.save(thumb_path, format='JPEG', quality=quality, optimize=True)
                logger.info(f"再圧縮後のサイズ: {os.path.getsize(thumb_path)} bytes (品質: {quality})")

            return True

    except Exception as e:
        logger.error(f"JPG処理エラー: {e}")
        return False

def optimize_thumbnail(thumb_path: str, max_width: int = 1200, max_height: int = 1200) -> bool:
    """サムネイルの最適化（大きすぎる場合のリサイズ）"""
    try:
        # PILを使用してリサイズが必要かチェック
        from PIL import Image

        with Image.open(thumb_path) as img:
            width, height = img.size

            # 最大サイズを超えている場合のみリサイズ
            if width > max_width or height > max_height:
                logger.info(f"サムネイルリサイズ: {width}x{height} -> 最大{max_width}x{max_height}")

                # アスペクト比を維持してリサイズ
                aspect = width / height
                if width > height:
                    new_width = min(width, max_width)
                    new_height = int(new_width / aspect)
                else:
                    new_height = min(height, max_height)
                    new_width = int(new_height * aspect)

                # リサイズして保存
                img = img.resize((new_width, new_height), Image.LANCZOS)
                img.save(thumb_path, format='JPEG', quality=85, optimize=True)
                logger.info(f"サムネイルリサイズ完了: {new_width}x{new_height}")

            return True
    except Exception as e:
        logger.error(f"サムネイル最適化エラー: {e}")
        return False

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda関数ハンドラー"""
    logger.info(f"S3イベント受信: {json.dumps(event)}")

    try:
        # イベントからS3情報を取得
        for record in event['Records']:
            if record['eventSource'] != 'aws:s3' or not record['eventName'].startswith('ObjectCreated'):
                continue

            bucket = record['s3']['bucket']['name']
            key = record['s3']['object']['key'].replace('%3A', ':').replace('%2B', '+').replace('%20', ' ')

            # キーを確認し、サムネイルディレクトリのファイルは処理しない
            if 'rawThumbnail' in key or 'jpgThumbnail' in key:
                logger.info(f"サムネイルディレクトリのファイルはスキップします: {key}")
                continue

            # ファイル名を取得
            filename = os.path.basename(key)

            logger.info(f"処理開始: バケット={bucket}, キー={key}, ファイル名={filename}")

            # ファイルタイプチェック
            is_raw = is_raw_file(filename)
            is_jpg = is_jpg_file(filename)

            if not (is_raw or is_jpg):
                logger.info(f"サポートされていないファイル形式のためスキップします: {filename}")
                continue

            # サムネイル保存先パスを生成
            thumbnail_key = generate_thumbnail_path(key, filename)
            if not thumbnail_key:
                logger.error(f"サムネイルパス生成失敗: {key}")
                continue

            logger.info(f"サムネイル保存先: {thumbnail_key}")

            # 一時ファイルのパスを設定
            temp_dir = '/tmp'
            temp_input_path = os.path.join(temp_dir, filename)
            temp_output_path = os.path.join(temp_dir, f"{os.path.splitext(filename)[0]}_thumb.jpg")

            try:
                # S3からファイルをダウンロード
                s3_client.download_file(bucket, key, temp_input_path)
                logger.info(f"ファイルダウンロード完了: {temp_input_path}")

                # ファイルタイプに応じた処理
                success = False
                if is_raw:
                    # RAWファイル処理
                    success = process_raw_file(temp_input_path, temp_output_path)
                elif is_jpg:
                    # JPGファイル処理
                    success = process_jpg_file(temp_input_path, temp_output_path)

                if not success:
                    logger.error(f"サムネイル生成失敗: {filename}")
                    continue

                # サムネイル最適化
                if not optimize_thumbnail(temp_output_path):
                    logger.warning(f"サムネイル最適化失敗: {temp_output_path}")

                # サムネイルをS3にアップロード
                s3_client.upload_file(
                    temp_output_path,
                    bucket,
                    thumbnail_key,
                    ExtraArgs={'ContentType': 'image/jpeg'}
                )
                logger.info(f"サムネイルアップロード完了: {thumbnail_key}")

            finally:
                # 一時ファイルを削除
                if os.path.exists(temp_input_path):
                    os.remove(temp_input_path)
                if os.path.exists(temp_output_path):
                    os.remove(temp_output_path)
                logger.info("一時ファイルの削除完了")

        return {
            'statusCode': 200,
            'body': json.dumps("処理完了")
        }

    except Exception as e:
        logger.error(f"Lambda処理エラー: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f"エラー: {str(e)}")
        }