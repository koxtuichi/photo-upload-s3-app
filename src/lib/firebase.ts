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

export { app, auth, analytics, db };
