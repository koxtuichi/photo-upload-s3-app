# Photo Upload S3 App - Python Lambda 関数

S3 にアップロードされた RAW ファイルからサムネイルを抽出し、指定のパスに保存する Python Lambda 関数です。

## 機能概要

- S3 イベント通知をトリガーとして動作
- `rawpy`ライブラリを使用して幅広い RAW 形式に対応
- RAW ファイルから JPEG サムネイルを抽出
- 抽出したサムネイルを最適化して S3 の指定パスに保存

## サポートしている RAW 形式

- `.x3f` (Sigma)
- `.arw` (Sony)
- `.nef`, `.nrw` (Nikon)
- `.cr2`, `.cr3` (Canon)
- `.raf` (Fujifilm)
- `.dng` (Adobe DNG)
- その他多数の RAW 形式 (全 30 種類以上)

## ファイルパス規則

Lambda 関数は以下のパス変換規則に従ってサムネイルを保存します:

```
入力: user/{userId}/raw/{year}/{month}/{day}/{filename}.{ext}
出力: user/{userId}/rawThumbnail/{year}/{month}/{day}/{filename}_thumb.jpg
```

## Lambda Layer のセットアップ

### 1. レイヤー用の zip ファイル作成

以下のコマンドを実行して、必要なライブラリをインストールしレイヤー用の zip ファイルを作成します：

```bash
# 一時ディレクトリ作成
mkdir -p layer/python

# 依存関係のインストール
pip install -r requirements.txt -t layer/python

# Zipファイルの作成
cd layer
zip -r ../raw-processing-layer.zip python/
cd ..
```

### 2. AWS Lambda でレイヤーを作成

1. AWS コンソールで Lambda のレイヤーページを開く
2. 「レイヤーの作成」をクリック
3. 名前に `raw-processing-layer` と入力
4. 「アップロード」を選択し、作成した zip ファイルをアップロード
5. ランタイムに `Python 3.13` を選択
6. 「作成」をクリック

### 3. Lambda 関数にレイヤーを追加

1. Lambda 関数「photo-upload-s3-app」の詳細ページを開く
2. 「レイヤー」セクションに移動
3. 「レイヤーの追加」をクリック
4. 先ほど作成したレイヤーを選択
5. 「追加」をクリック

## デプロイ方法

### 1. Lambda 関数デプロイパッケージの作成

```bash
# lambda_function.pyをzipに追加
zip photo-upload-s3-app-lambda.zip lambda_function.py
```

### 2. AWS コンソールからアップロード

1. AWS コンソールで Lambda 関数「photo-upload-s3-app」を選択
2. 「コード」タブで「.zip ファイルをアップロード」を選択
3. 作成した zip ファイルをアップロード

### 3. 関数設定の変更

以下の設定を行ってください：

- ランタイム: Python 3.13
- ハンドラ: lambda_function.lambda_handler
- メモリ: 1024MB 以上 (RAW ファイルによっては 2048MB 必要な場合も)
- タイムアウト: 30 秒以上 (60 秒推奨)

## IAM 権限の確認

この関数には以下の権限が必要です:

- S3 の読み取り権限（RAW ファイルの取得）
- S3 の書き込み権限（サムネイルの保存）
- CloudWatch Logs への書き込み権限（ログ出力）

## トラブルシューティング

### 特定の RAW 形式が処理できない場合

- CloudWatch ログを確認して詳細なエラーメッセージを確認
- メモリ設定を増やして（2048MB ～ 3008MB）再試行
- rawpy のバージョンを更新（最新バージョンでは対応形式が増えている可能性あり）

### Lambda のコールドスタート問題

初回起動時に処理に時間がかかる場合：

- プロビジョンドコンカレンシー機能を検討
- Lambda ウォームアップの導入

## 特記事項

- X3F 形式を含む多様な RAW 形式に対応
- 埋め込みサムネイルが利用できない場合は自動的に RAW データから生成
- サムネイルは最大 1200x1200 ピクセルにリサイズされます
- JPEG の品質は 85%に設定されています
