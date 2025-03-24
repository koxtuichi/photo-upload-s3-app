"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DirectoryBrowser from "@/components/DirectoryBrowser";
import { useAuth } from "@/hooks/useAuth";

const BrowserPage: React.FC = () => {
  const { user, loading } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // 認証状態の確認
    if (!loading && !user) {
      router.push("/auth"); // 認証ページへリダイレクト
    } else if (user?.uid) {
      // Firebase uidをユーザーIDとして使用
      setUserId(user.uid);
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">読み込み中...</div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">ユーザー情報を取得できませんでした</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">ファイルブラウザ</h1>

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">
        <div className="h-[calc(100vh-200px)]">
          <DirectoryBrowser userId={userId} />
        </div>
      </div>
    </div>
  );
};

export default BrowserPage;
