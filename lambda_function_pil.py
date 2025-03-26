"""
photo-upload-s3-app Lambda関数
S3にアップロードされたRAWファイルからサムネイルを抽出し、指定のパスに保存する
Python 3.9 + PIL/Pillow実装版（rawpy依存なし）
"""

import json
import boto3
import os
import logging
import io
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple
from PIL import Image, ImageOps

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

def find_jpeg_data_in_raw(raw_data: bytes) -> Optional[bytes]:
    """RAWデータ内のJPEGデータを検索する"""
    # JPEGマーカーのパターン
    jpeg_start = b'\xff\xd8\xff'
    jpeg_end = b'\xff\xd9'

    try:
        # JPEGの開始マーカーを検索
        start_pos = raw_data.find(jpeg_start)
        if start_pos == -1:
            logger.info("JPEGマーカーが見つかりません")
            return None

        # JPEGの終了マーカーを検索
        end_pos = raw_data.find(jpeg_end, start_pos)
        if end_pos == -1:
            logger.info("JPEG終了マーカーが見つかりません")
            return None

        # JPEGデータを切り出し（終了マーカーも含める）
        jpeg_data = raw_data[start_pos:end_pos + 2]
        logger.info(f"JPEGデータ検出: {len(jpeg_data)}バイト")

        # 有効なJPEGかチェック
        try:
            Image.open(io.BytesIO(jpeg_data))
            return jpeg_data
        except Exception as e:
            logger.info(f"抽出したJPEGデータが無効です: {e}")
            return None

    except Exception as e:
        logger.error(f"JPEG検索エラー: {e}")
        return None

def create_placeholder_thumbnail(width=1200, height=800) -> bytes:
    """RAWファイルからサムネイルを抽出できない場合のプレースホルダー画像を生成"""
    try:
        # プレースホルダー画像の作成（グレースケール）
        img = Image.new('RGB', (width, height), (220, 220, 220))

        # 「RAW」というテキストを中央に描画
        draw = ImageDraw.Draw(img)

        # フォントがなくてもエラーにならないよう、テキスト描画をtry-exceptで囲む
        try:
            # デフォルトのフォントでテキスト描画（フォントサイズは環境によって異なる）
            font_size = width // 8
            text = "RAW"
            text_width, text_height = draw.textsize(text)
            position = ((width - text_width) // 2, (height - text_height) // 2)
            draw.text(position, text, fill=(150, 150, 150))
        except Exception as e:
            logger.warning(f"テキスト描画エラー（無視して続行）: {e}")

        # 画像をバイトストリームに変換
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85)
        buffer.seek(0)
        return buffer.getvalue()
    except Exception as e:
        logger.error(f"プレースホルダー画像生成エラー: {e}")
        # 最低限の単色JPEGを生成（エラー時のフォールバック）
        img = Image.new('RGB', (400, 300), (200, 200, 200))
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=80)
        buffer.seek(0)
        return buffer.getvalue()

def process_tiff_file(raw_data: bytes) -> Optional[bytes]:
    """TIFFファイルからサムネイルを抽出"""
    try:
        # PILを使ってTIFFを開く
        img = Image.open(io.BytesIO(raw_data))

        # RGBに変換（TIFFの場合、CMYKやYCbCrの可能性もある）
        if img.mode != 'RGB':
            img = img.convert('RGB')

        # サイズ調整
        img.thumbnail((1200, 1200), Image.LANCZOS)

        # JPEGとして保存
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85)
        buffer.seek(0)
        return buffer.getvalue()
    except Exception as e:
        logger.error(f"TIFF処理エラー: {e}")
        return None

def process_raw_file(raw_data: bytes, extension: str) -> bytes:
    """RAWファイルからサムネイルを抽出して保存
    常に何らかのデータを返す（抽出失敗時はプレースホルダー）
    """
    try:
        logger.info(f"RAW処理開始: 形式={extension}, サイズ={len(raw_data)}バイト")

        # まずRAWファイル内のJPEGデータを検索
        jpeg_data = find_jpeg_data_in_raw(raw_data)
        if jpeg_data:
            logger.info("RAWファイルからJPEGデータの抽出に成功")
            return jpeg_data

        # TIFFの場合はPILで直接開く
        if extension.lower() in ['.tiff', '.tif']:
            tiff_thumbnail = process_tiff_file(raw_data)
            if tiff_thumbnail:
                logger.info("TIFFからのサムネイル生成に成功")
                return tiff_thumbnail

        # 抽出失敗時はプレースホルダー画像を返す
        logger.info(f"サムネイル抽出失敗 - プレースホルダー生成: {extension}")
        return create_placeholder_thumbnail()
    except Exception as e:
        logger.error(f"RAW処理エラー: {e}")
        return create_placeholder_thumbnail()

def optimize_thumbnail(thumb_data: bytes, max_width: int = 1200, max_height: int = 1200) -> bytes:
    """サムネイルの最適化（大きすぎる場合のリサイズ）"""
    try:
        # データが既に最適化されている場合は、そのまま返す
        if len(thumb_data) < 100 * 1024:  # 100KB未満はそのまま返す
            return thumb_data

        # PILを使ってリサイズが必要かチェック
        img = Image.open(io.BytesIO(thumb_data))
        width, height = img.size

        # 最大サイズを超えている場合のみリサイズ
        if width > max_width or height > max_height:
            logger.info(f"サムネイルリサイズ: {width}x{height} -> 最大{max_width}x{max_height}")

            # アスペクト比を維持してリサイズ
            img.thumbnail((max_width, max_height), Image.LANCZOS)

            # 画像を回転（Exif情報に基づく）
            img = ImageOps.exif_transpose(img)

            # 最適化して保存
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=85, optimize=True)
            buffer.seek(0)
            return buffer.getvalue()
        else:
            # 画像を回転（Exif情報に基づく）
            img = ImageOps.exif_transpose(img)

            # 最適化して保存
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=85, optimize=True)
            buffer.seek(0)
            return buffer.getvalue()
    except Exception as e:
        logger.error(f"サムネイル最適化エラー: {e}")
        return thumb_data  # エラー時は元のデータをそのまま返す

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

        # S3からRAWファイルを取得
        response = s3_client.get_object(Bucket=bucket, Key=key)
        raw_data = response['Body'].read()

        # ファイルの拡張子を取得
        extension = get_file_extension(filename)

        # RAWファイルからサムネイルを抽出
        thumbnail_data = process_raw_file(raw_data, extension)

        # サムネイルを最適化
        optimized_thumbnail = optimize_thumbnail(thumbnail_data)

        # サムネイルをS3にアップロード
        logger.info(f"サムネイルアップロード開始: {bucket}/{thumbnail_key}")
        s3_client.put_object(
            Bucket=bucket,
            Key=thumbnail_key,
            Body=optimized_thumbnail,
            ContentType='image/jpeg',
            Metadata={
                'source-key': key,
                'processing-date': datetime.now().isoformat()
            }
        )

        logger.info(f"サムネイル処理完了: {thumbnail_key}")

        return {
            'statusCode': 200,
            'body': f"Successfully processed {filename} and created thumbnail at {thumbnail_key}"
        }

    except Exception as e:
        logger.error(f"Lambda処理エラー: {e}")

        return {
            'statusCode': 500,
            'body': f"Error processing file: {str(e)}"
        }