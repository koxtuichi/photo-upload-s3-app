# S3 Glacier Deep Archive 復元通知 Lambda 関数

この Lambda 関数は、S3 Glacier Deep Archive から復元されたオブジェクトの通知を処理し、ユーザーにメール通知を送信します。

## 機能

- S3 バケットからの「ObjectRestore:Completed」イベントを受信
- 復元が完了したファイルごとに署名付き URL を生成
- 複数ファイルの場合、一括ダウンロード用の ZIP ファイルを作成
- Amazon SES を使用してユーザーにダウンロードリンクを含むメールを送信

## 前提条件

- AWS Lambda
- Amazon S3 バケット
- Amazon SES（メール送信のための設定が必要）
- Amazon DynamoDB（ユーザー ID とメールアドレスのマッピング用）
- Python 3.9 以上

## デプロイ手順

### 1. DynamoDB テーブルの作成

ユーザー ID とメールアドレスを保存する DynamoDB テーブルを作成します：

```bash
aws dynamodb create-table \
  --table-name user-emails \
  --attribute-definitions AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

### 2. Lambda 関数のパッケージング

以下のコマンドで Lambda 関数をパッケージ化します：

```bash
cd lambda
pip install boto3 -t .
zip -r restore_notification_lambda.zip restore_notification_lambda.py boto3 botocore
```

### 3. Lambda 関数のデプロイ

以下のコマンドで Lambda 関数をデプロイします：

```bash
aws lambda create-function \
  --function-name restore-notification-lambda \
  --runtime python3.9 \
  --handler restore_notification_lambda.lambda_handler \
  --role arn:aws:iam::<AWS_ACCOUNT_ID>:role/lambda-s3-ses-role \
  --zip-file fileb://restore_notification_lambda.zip \
  --environment "Variables={SENDER_EMAIL=noreply@example.com,S3_BUCKET=photo-upload-s3-app,DYNAMODB_TABLE=user-emails}"
```

### 4. IAM ロールの設定

Lambda 関数が必要なリソースにアクセスするための IAM ロールを設定します。以下の権限が必要です：

- Amazon S3 への読み取り・書き込み権限
- Amazon SES でのメール送信権限
- DynamoDB テーブルへの読み取り権限
- CloudWatch でのログ作成権限

ポリシーの例：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::photo-upload-s3-app",
        "arn:aws:s3:::photo-upload-s3-app/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem"],
      "Resource": "arn:aws:dynamodb:*:*:table/user-emails"
    }
  ]
}
```

### 5. Amazon SES の設定

1. SES コンソールで送信者のメールアドレスを検証します。
2. 運用環境では、SES プロダクション利用申請を行って送信制限を解除します。

### 6. S3 イベント通知の設定

S3 バケットでイベント通知を設定して、「ObjectRestore:Completed」イベントが発生したときに Lambda 関数を呼び出すようにします：

1. S3 コンソールでバケットを選択
2. 「プロパティ」タブを選択
3. 「イベント通知」セクションで「作成」をクリック
4. 以下の設定を行います：
   - 名前：RestoreCompletedNotification
   - イベントタイプ：ObjectRestore:Completed
   - 送信先：Lambda 関数
   - Lambda 関数：restore-notification-lambda

## テスト方法

1. S3 Glacier Deep Archive に保存されている写真に対して復元リクエストを送信します。
2. 復元完了後（数時間〜数日かかる場合があります）、Lambda 関数が呼び出されます。
3. 設定したメールアドレスにダウンロードリンクが送信されることを確認します。

## 環境変数

Lambda 関数では以下の環境変数を設定できます：

- `SENDER_EMAIL`: 送信者のメールアドレス（デフォルト: noreply@example.com）
- `S3_BUCKET`: S3 バケット名（デフォルト: photo-upload-s3-app）
- `PRESIGNED_URL_EXPIRY`: 署名付き URL の有効期間（秒）（デフォルト: 86400 = 24 時間）
- `DYNAMODB_TABLE`: ユーザーメール情報を保存する DynamoDB テーブル名（デフォルト: user-emails）

## トラブルシューティング

- **Lambda 関数がタイムアウトする**：タイムアウト設定を増やしてください（特に多数のファイルを処理する場合）
- **メールが送信されない**：SES の設定を確認し、送信者メールアドレスが検証済みであることを確認してください
- **権限エラーが発生する**：IAM ロールに必要な権限が付与されているか確認してください
