# Photo Upload S3 App

写真を AWS S3 に保存して閲覧できる WEB アプリケーションです。ユーザーごとに写真を管理し、スマートフォンでも快適に利用できる PWA 対応アプリケーションです。

## 機能

- **ユーザー認証**: Firebase を使用したメールアドレス/パスワードによる認証
- **写真アップロード**: ドラッグアンドドロップによる簡単アップロード
- **写真閲覧**: ギャラリービューでの写真閲覧、全画面表示もサポート
- **ユーザー設定**: プロフィール・メールアドレス・パスワードの変更
- **PWA 対応**: スマホのホーム画面に追加して、ネイティブアプリのように使用可能

## 技術スタック

- **フロントエンド**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **認証**: Firebase Authentication
- **ストレージ**: AWS S3
- **状態管理**: Zustand
- **PWA**: next-pwa

## 環境構築

### 前提条件

- Node.js 16.8.0 以上
- npm または yarn
- Firebase プロジェクト
- AWS アカウント

### インストール

1. リポジトリをクローン

```bash
git clone [リポジトリURL]
cd photo-upload-s3-app
```

2. 依存パッケージをインストール

```bash
npm install
# または
yarn
```

3. 環境変数の設定

`.env.local`ファイルを作成し、以下の変数を設定:

```
# AWS Settings
NEXT_PUBLIC_AWS_ACCESS_KEY_ID=あなたのAWSアクセスキー
NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY=あなたのAWSシークレットキー
NEXT_PUBLIC_S3_BUCKET_NAME=あなたのS3バケット名

# Firebase Settings
NEXT_PUBLIC_FIREBASE_API_KEY=あなたのFirebaseAPIキー
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=あなたのFirebaseドメイン
NEXT_PUBLIC_FIREBASE_PROJECT_ID=あなたのFirebaseプロジェクトID
```

4. 開発サーバーの起動

```bash
npm run dev
# または
yarn dev
```

5. ブラウザで http://localhost:3000 にアクセス

## AWS S3 バケットの設定

1. AWS コンソールから S3 バケットを作成
2. CORS を設定して、アプリケーションからのアクセスを許可
3. バケットポリシーを適切に設定（パブリックアクセスを制限する場合は認証付き URL を使用）

## デプロイ

### Vercel へのデプロイ

```bash
npm run build
npm run start
# または
vercel deploy
```

## ユーザーガイド

### 新規登録/ログイン

1. トップページからログイン画面にリダイレクトされます
2. 「新規アカウント作成」をクリックして、メールアドレス、パスワード、ユーザー名を入力
3. 既存ユーザーの場合は、メールアドレスとパスワードでログイン

### 写真のアップロード

1. ホームページのドラッグ&ドロップエリアに写真をドラッグするか、「ファイルを選択」ボタンをクリック
2. 複数のファイルを同時にアップロード可能
3. アップロード進捗がリアルタイムで表示されます

### 写真の閲覧/削除

1. アップロードした写真はホームページのギャラリーに表示されます
2. 写真をクリックすると全画面表示
3. 写真の右上にあるメニューボタンから「削除」を選択すると写真を削除できます

### 設定の変更

1. 上部メニューから「設定」をクリック
2. プロフィール設定、メールアドレス設定、パスワード設定を変更可能

## 開発者向け情報

### プロジェクト構造

```
src/
├── app/                # Next.js App Router
│   ├── auth/           # 認証関連ページ
│   ├── settings/       # 設定ページ
│   └── page.tsx        # ホームページ
├── components/         # 再利用可能なコンポーネント
├── hooks/              # カスタムフック
├── lib/                # ユーティリティ関数
│   ├── firebase.ts     # Firebase設定
│   └── s3.ts           # AWS S3設定
├── providers/          # コンテキストプロバイダー
├── store/              # Zustandストア
└── types/              # 型定義
```

## ライセンス

MIT License
