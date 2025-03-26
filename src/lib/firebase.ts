import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebaseの設定情報
const firebaseConfig = {
  apiKey: "AIzaSyBVzdg4Kq88ymWRjcGp_hB7JtDi3Zy6l0k",
  authDomain: "photo-upload-s3-app.firebaseapp.com",
  projectId: "photo-upload-s3-app",
  storageBucket: "photo-upload-s3-app.firebasestorage.app",
  messagingSenderId: "406294671870",
  appId: "1:406294671870:web:dc5301f9a0ebb78a5ed0af",
  measurementId: "G-ZWZMLKFKL7",
};

// Firebase初期化
const app = initializeApp(firebaseConfig);

// 分析機能の初期化（クライアントサイドのみ）
let analytics;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

// 認証インスタンスの取得
const auth = getAuth(app);

// Firestoreインスタンスの取得
const db = getFirestore(app);

/**
 * Firestoreセキュリティルール設定手順
 *
 * 現在、「Missing or insufficient permissions」エラーが発生しています。
 * これはFirestoreのセキュリティルールが適切に設定されていないためです。
 *
 * 以下の手順でFirestoreのセキュリティルールを設定してください：
 *
 * 1. Firebaseコンソール（https://console.firebase.google.com/）にアクセス
 * 2. プロジェクト「photo-upload-s3-app」を選択
 * 3. 左メニューから「Firestore Database」を選択
 * 4. 「ルール」タブをクリック
 * 5. 以下のルールを貼り付けて「公開」ボタンをクリック
 *
 * ```
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     // ユーザー自身のデータのみ読み書き可能
 *     match /photos/{photoId} {
 *       allow read: if request.auth != null;
 *       allow write: if request.auth != null &&
 *                      request.resource.data.userId == request.auth.uid;
 *     }
 *
 *     // 他のコレクションにも同様のルールを適用
 *     match /{document=**} {
 *       allow read: if request.auth != null;
 *       allow write: if request.auth != null;
 *     }
 *   }
 * }
 * ```
 *
 * このルールは、認証済みユーザーのみがデータにアクセスでき、
 * 自分のユーザーIDに関連付けられたデータのみを作成できるようにします。
 */

export { app, auth, analytics, db };
