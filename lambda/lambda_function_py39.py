"""
photo-upload-s3-app Lambda関数
S3にアップロードされたRAWファイルからサムネイルを抽出し、指定のパスに保存する
Python 3.9 + rawpy対応版
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

def get_file_extension(filename: str) -> str:
    """ファイルの拡張子を取得"""
    return os.path.splitext(filename)[1].lower()

def is_raw_file(filename: str) -> bool:
    """RAWファイルかどうかを判定"""
    extension = get_file_extension(filename)
    return extension in RAW_EXTENSIONS

def extract_path_info(key: str) -> Optional[Dict[str, str]]:
    """S3パスからユーザーIDと日付情報を抽出"""
    # パスの例: user/abc123/raw/2023/04/15/file.x3f
    path_parts = key.split('/')
    if len(path_parts) < 7:  # 必要な階層が足りない
        logger.warning(f"無効なパス形式: {key}")
        return None

    try:
        # user/userId/raw/year/month/day/filename.ext
        user_id = path_parts[1]
        year = path_parts[3]
        month = path_parts[4]
        day = path_parts[5]

        # 数値形式の検証
        if not (year.isdigit() and month.isdigit() and day.isdigit()):
            logger.warning(f"パスの日付部分が数値ではありません: {key}")
            return None

        return {
            "user_id": user_id,
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

    # サムネイル用のファイル名を生成（拡張子をjpgに変更）
    thumbnail_filename = os.path.splitext(filename)[0] + "_thumb.jpg"

    # サムネイル保存先のパスを生成
    return f"user/{path_info['user_id']}/rawThumbnail/{path_info['year']}/{path_info['month']}/{path_info['day']}/{thumbnail_filename}"

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
            rgb = raw.postprocess(
                use_camera_wb=True,
                half_size=True,
                no_auto_bright=True
            )

            # JPEG形式で保存（品質85%）
            # Python 3.9のimageioでは少し異なるAPIを使用
            imageio.imwrite(thumb_path, rgb, format='jpeg', quality=85)
            logger.info(f"未処理イメージからのサムネイル生成完了: {thumb_path}")
            return True

    except Exception as e:
        logger.error(f"RAW処理エラー: {e}")
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

                # Python 3.9では、Image.LANCZOSはPython 3.13のImage.LANCZOSと同等
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
        bucket = event['Records'][0]['s3']['bucket']['name']
        key = event['Records'][0]['s3']['object']['key'].replace('%3A', ':').replace('%2B', '+').replace('%20', ' ')

        # ファイル名を取得
        filename = os.path.basename(key)

        logger.info(f"処理開始: バケット={bucket}, キー={key}, ファイル名={filename}")

        # RAWファイルかどうかをチェック
        if not is_raw_file(filename):
            logger.info(f"RAWファイルではないためスキップします: {filename}")
            return {
                'statusCode': 200,
                'body': f"Not a RAW file: {filename}"
            }

        # サムネイル保存先パスを生成
        thumbnail_key = generate_thumbnail_path(key, filename)
        if not thumbnail_key:
            return {
                'statusCode': 400,
                'body': f"Invalid path structure: {key}"
            }

        logger.info(f"サムネイル保存先: {thumbnail_key}")

        # 一時ファイルパス
        tmp_raw_path = f"/tmp/{filename}"
        tmp_thumb_path = f"/tmp/thumb_{filename.replace('.', '_')}.jpg"

        try:
            # S3からRAWファイルをダウンロード
            logger.info(f"S3からRAWファイルダウンロード開始: {bucket}/{key}")
            s3_client.download_file(bucket, key, tmp_raw_path)
            logger.info(f"RAWファイルダウンロード完了: {tmp_raw_path}")

            # RAWファイルからサムネイルを抽出
            if not process_raw_file(tmp_raw_path, tmp_thumb_path):
                raise Exception("サムネイル抽出に失敗しました")

            # サムネイルを最適化
            optimize_thumbnail(tmp_thumb_path)

            # サムネイルをS3にアップロード
            logger.info(f"サムネイルアップロード開始: {bucket}/{thumbnail_key}")
            s3_client.upload_file(
                tmp_thumb_path,
                bucket,
                thumbnail_key,
                ExtraArgs={
                    'ContentType': 'image/jpeg',
                    'Metadata': {
                        'source-key': key,
                        'processing-date': datetime.now().isoformat()
                    }
                }
            )

            logger.info(f"サムネイル処理完了: {thumbnail_key}")

            return {
                'statusCode': 200,
                'body': f"Successfully processed {filename} and created thumbnail at {thumbnail_key}"
            }

        finally:
            # 一時ファイルの削除
            if os.path.exists(tmp_raw_path):
                os.remove(tmp_raw_path)
            if os.path.exists(tmp_thumb_path):
                os.remove(tmp_thumb_path)

    except Exception as e:
        logger.error(f"Lambda処理エラー: {e}")

        return {
            'statusCode': 500,
            'body': f"Error processing file: {str(e)}"
        }