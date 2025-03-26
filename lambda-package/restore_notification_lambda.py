"""
S3 Glacier復元完了通知処理Lambda関数
S3のイベント通知を受け取り、オブジェクトの復元完了時にユーザーにメール通知を送信します
"""

import json
import boto3
import os
import logging
from botocore.exceptions import ClientError
from urllib.parse import unquote_plus
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
import io
import zipfile

# ロギング設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# 環境変数
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@example.com')
S3_BUCKET = os.environ.get('S3_BUCKET', 'photo-upload-s3-app')
PRESIGNED_URL_EXPIRY = int(os.environ.get('PRESIGNED_URL_EXPIRY', '86400'))  # デフォルト24時間(秒)
DYNAMODB_TABLE = os.environ.get('DYNAMODB_TABLE', 'user-emails')

# AWS クライアント初期化
s3_client = boto3.client('s3')
ses_client = boto3.client('ses')
dynamodb = boto3.resource('dynamodb')

def get_user_email(user_id):
    """
    DynamoDBからユーザーのメールアドレスを取得
    """
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        response = table.get_item(Key={'userId': user_id})
        if 'Item' in response and 'email' in response['Item']:
            return response['Item']['email']
        logger.warning(f"ユーザーID {user_id} のメールアドレスが見つかりません")
        return None
    except ClientError as e:
        logger.error(f"DynamoDB エラー: {e}")
        return None

def extract_user_id_from_key(key):
    """
    S3オブジェクトキーからユーザーIDを抽出
    例: user/abc123/raw/2023/04/15/file.RAF -> abc123
    """
    parts = key.split('/')
    if len(parts) > 2 and parts[0] == 'user':
        return parts[1]
    return None

def generate_presigned_url(bucket, key, expiry=PRESIGNED_URL_EXPIRY):
    """
    プレスポンドURLを生成
    """
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expiry
        )
        return url
    except ClientError as e:
        logger.error(f"プレスポンドURL生成エラー: {e}")
        return None

def create_download_zip_url(keys, zip_name="download", expiry=PRESIGNED_URL_EXPIRY):
    """
    複数ファイルのZIPダウンロード用URLを生成
    """
    if not keys:
        return None

    # 一時的なS3キーを作成（ユーザーIDと日時を含める）
    first_key = keys[0]
    user_id = extract_user_id_from_key(first_key)
    timestamp = int(boto3.client('dynamodb').describe_endpoints()['TimeSeconds'])
    temp_zip_key = f"temp/{user_id}/{timestamp}_{zip_name}.zip"

    # ZIPファイルを作成
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for key in keys:
            try:
                # S3からファイルを取得
                response = s3_client.get_object(Bucket=S3_BUCKET, Key=key)
                file_content = response['Body'].read()

                # ZIPにファイルを追加（ファイル名のみ使用）
                file_name = key.split('/')[-1]
                zip_file.writestr(file_name, file_content)
            except Exception as e:
                logger.error(f"ファイル {key} の処理中にエラーが発生しました: {e}")

    # S3にZIPファイルをアップロード
    zip_buffer.seek(0)
    s3_client.put_object(
        Bucket=S3_BUCKET,
        Key=temp_zip_key,
        Body=zip_buffer.getvalue(),
        ContentType='application/zip',
        Metadata={'auto-delete': 'true', 'ttl': str(timestamp + expiry)}
    )

    # 署名付きURLを生成
    return generate_presigned_url(S3_BUCKET, temp_zip_key, expiry)

def send_notification_email(email, file_keys, urls):
    """
    SESを使用して通知メールを送信
    """
    if not email or not urls:
        return False

    # メールの件名と本文
    subject = "写真の復元が完了しました"

    # HTMLメール本文
    html_body = f"""
    <html>
    <head>
      <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        h2 {{ color: #2c3e50; }}
        ul {{ padding-left: 20px; }}
        li {{ margin-bottom: 10px; }}
        .button {{ display: inline-block; background-color: #3498db; color: white;
                  padding: 10px 15px; text-decoration: none; border-radius: 5px; }}
        .button:hover {{ background-color: #2980b9; }}
        .footer {{ margin-top: 30px; font-size: 12px; color: #7f8c8d; }}
      </style>
    </head>
    <body>
      <div class="container">
        <h2>写真の復元が完了しました</h2>
        <p>リクエストいただいた以下のファイルの復元が完了しました。</p>

        <ul>
    """

    # 各ファイルとダウンロードリンクを追加
    for i, key in enumerate(file_keys):
        file_name = key.split('/')[-1]
        html_body += f'<li><a href="{urls[i]}">{file_name}</a></li>\n'

    # 複数ファイルの場合、ZIPダウンロードリンクを追加
    if len(file_keys) > 1 and urls[-1] != urls[-2]:  # 最後のURLが特別な場合（ZIPファイル）
        html_body += f"""
        </ul>

        <p>すべてのファイルを一括でダウンロードすることもできます：</p>
        <p><a href="{urls[-1]}" class="button">すべてをZIPでダウンロード</a></p>
        """
    else:
        html_body += "</ul>"

    html_body += """
        <p>ダウンロードリンクは24時間有効です。期限が切れた場合は、アプリから再度復元をリクエストしてください。</p>

        <div class="footer">
          <p>※このメールは自動送信されています。ご返信いただいても対応できません。</p>
        </div>
      </div>
    </body>
    </html>
    """

    # プレーンテキスト版の本文
    text_body = f"""
写真の復元が完了しました

リクエストいただいた以下のファイルの復元が完了しました：

"""

    for i, key in enumerate(file_keys):
        file_name = key.split('/')[-1]
        text_body += f"- {file_name}: {urls[i]}\n"

    if len(file_keys) > 1 and urls[-1] != urls[-2]:
        text_body += f"\nすべてのファイルを一括ダウンロード: {urls[-1]}\n"

    text_body += """
ダウンロードリンクは24時間有効です。期限が切れた場合は、アプリから再度復元をリクエストしてください。

※このメールは自動送信されています。ご返信いただいても対応できません。
    """

    # MIMEマルチパートメッセージの作成
    message = MIMEMultipart('alternative')
    message['Subject'] = subject
    message['From'] = SENDER_EMAIL
    message['To'] = email

    # テキストとHTML部分を追加
    message.attach(MIMEText(text_body, 'plain'))
    message.attach(MIMEText(html_body, 'html'))

    try:
        # SESでメール送信
        response = ses_client.send_raw_email(
            Source=SENDER_EMAIL,
            Destinations=[email],
            RawMessage={'Data': message.as_string()}
        )
        logger.info(f"メール送信成功: {response['MessageId']}")
        return True
    except ClientError as e:
        logger.error(f"メール送信エラー: {e}")
        return False

def lambda_handler(event, context):
    """
    Lambda関数のメインハンドラー
    S3イベント通知から復元完了を検出し、ユーザーに通知
    """
    logger.info("S3 復元完了通知処理を開始")
    logger.info(json.dumps(event))

    try:
        # イベントレコードを処理
        restored_keys = []

        for record in event.get('Records', []):
            # S3イベントのみ処理
            if record.get('eventSource') != 'aws:s3':
                continue

            # S3イベント情報を取得
            bucket = record.get('s3', {}).get('bucket', {}).get('name')
            key = record.get('s3', {}).get('object', {}).get('key', '')
            if not key:
                continue

            # URLデコード
            key = unquote_plus(key)

            # イベントタイプを確認
            event_name = record.get('eventName', '')

            # オブジェクト復元完了イベントのみ処理
            if 'ObjectRestore:Completed' in event_name:
                logger.info(f"復元完了イベント検出: {key}")
                restored_keys.append(key)

        if not restored_keys:
            logger.info("復元完了イベントが見つかりませんでした")
            return {
                'statusCode': 200,
                'body': json.dumps('No restore completed events found')
            }

        # ユーザーIDを取得（最初のキーから）
        user_id = extract_user_id_from_key(restored_keys[0])
        if not user_id:
            logger.error(f"ユーザーIDが見つかりません: {restored_keys[0]}")
            return {
                'statusCode': 400,
                'body': json.dumps('User ID not found in object key')
            }

        # ユーザーのメールアドレスを取得
        email = get_user_email(user_id)
        if not email:
            logger.error(f"ユーザー {user_id} のメールアドレスが見つかりません")
            return {
                'statusCode': 400,
                'body': json.dumps('User email not found')
            }

        # 各ファイルの署名付きURLを生成
        urls = []
        for key in restored_keys:
            url = generate_presigned_url(S3_BUCKET, key)
            if url:
                urls.append(url)

        # 複数ファイルの場合、ZIPダウンロードURLも生成
        if len(restored_keys) > 1:
            zip_url = create_download_zip_url(restored_keys)
            if zip_url:
                urls.append(zip_url)

        # メール送信
        if email and urls:
            success = send_notification_email(email, restored_keys, urls)
            if success:
                logger.info(f"通知メールをユーザー {user_id} ({email}) に送信しました")
                return {
                    'statusCode': 200,
                    'body': json.dumps(f'Notification email sent to {email}')
                }
            else:
                logger.error("通知メールの送信に失敗しました")
                return {
                    'statusCode': 500,
                    'body': json.dumps('Failed to send notification email')
                }

        return {
            'statusCode': 400,
            'body': json.dumps('Failed to generate presigned URLs or get user email')
        }

    except Exception as e:
        logger.error(f"エラーが発生しました: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error: {str(e)}')
        }