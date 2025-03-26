# Python 3.9 用 Lambda 関数のデプロイ手順

## 1. Lambda Layer の作成

### EC2 インスタンスの準備

1. Amazon Linux 2023 の EC2 インスタンスを起動
   - t2.micro（無料利用枠）で十分
   - Amazon Linux 2023 AMI を選択
   - セキュリティグループは SSH（22 番ポート）のみ許可

### スクリプトのアップロードと実行

1. 作成したスクリプトファイル `create_layer_py39.sh` を EC2 インスタンスにアップロード

   ```bash
   scp -i your-key.pem create_layer_py39.sh ec2-user@your-ec2-ip:~/
   ```

2. EC2 インスタンスに SSH 接続

   ```bash
   ssh -i your-key.pem ec2-user@your-ec2-ip
   ```

3. スクリプトに実行権限を付与して実行

   ```bash
   chmod +x create_layer_py39.sh
   ./create_layer_py39.sh
   ```

4. 作成された ZIP ファイルをダウンロード
   ```bash
   # ローカルマシンで実行
   scp -i your-key.pem ec2-user@your-ec2-ip:~/lambda-layer/raw-processing-layer-py39.zip .
   ```

### Lambda Layer のアップロード

1. AWS コンソールで Lambda サービスを開く
2. 左側メニューから「Layers」（レイヤー）を選択
3. 「Create layer」（レイヤーの作成）をクリック
4. 以下の情報を入力:
   - Name: `raw-processing-layer-py39`
   - Description: `RAW file processing libraries for Python 3.9`
   - Upload: ダウンロードした `raw-processing-layer-py39.zip` を選択
   - Compatible runtimes: `Python 3.9` を選択
5. 「Create」をクリック

## 2. Lambda 関数のデプロイ

### 関数の作成

1. AWS コンソールで Lambda サービスを開く
2. 「Functions」（関数）を選択し、「Create function」（関数の作成）をクリック
3. 以下の設定で関数を作成:
   - Author from scratch（最初から作成）を選択
   - Function name: `photo-upload-s3-app`
   - Runtime: `Python 3.9`
   - Architecture: `x86_64`（または必要に応じて `arm64`）
   - 「Create function」をクリック

### コードのアップロード

1. 作成した関数の「Code」タブを開く
2. 「Upload from」ドロップダウンから「.zip file」を選択
3. `photo-upload-s3-app-lambda-py39.zip` をアップロード
4. 「Save」をクリック

### Layer の追加

1. 「Layers」セクションに移動
2. 「Add a layer」をクリック
3. 「Custom layers」を選択
4. Layer: `raw-processing-layer-py39` を選択
5. Version: 最新バージョンを選択
6. 「Add」をクリック

### 関数の設定

1. 「Configuration」タブを開く
2. 「General configuration」を選択し「Edit」をクリック

   - Memory: `2048 MB` に設定
   - Timeout: `60 seconds` に設定
   - 「Save」をクリック

3. 「Environment variables」を選択し「Edit」をクリック

   - 必要に応じて環境変数を追加
   - 「Save」をクリック

4. 「Permissions」を選択
   - 実行ロールに以下の権限があることを確認:
     - S3 read/write アクセス
     - CloudWatch Logs 書き込みアクセス

## 3. トリガーの設定

1. 「Function overview」セクションで「Add trigger」をクリック
2. 「S3」を選択
3. バケット: 対象の S3 バケットを選択
4. Event type: `All object create events` を選択
5. Prefix: `user/` を指定（オプション）
6. 「Add」をクリック

## 4. テスト

1. テスト用の RAW ファイルを S3 バケットの適切なパスにアップロード:

   ```
   user/{userID}/raw/{year}/{month}/{day}/{filename}.{raw_ext}
   ```

2. CloudWatch ログで処理結果を確認:

   - AWS コンソールで CloudWatch を開く
   - 「Log groups」を選択
   - `/aws/lambda/photo-upload-s3-app` を選択
   - 最新のログストリームを確認

3. S3 バケットでサムネイルが生成されていることを確認:
   ```
   user/{userID}/rawThumbnail/{year}/{month}/{day}/{filename}_thumb.jpg
   ```

## 注意事項

- メモリ設定は処理する RAW ファイルのサイズによって調整が必要
- 処理時間が長い場合はタイムアウト設定を調整
- EC2 インスタンスは作業完了後に停止または終了することでコスト削減
