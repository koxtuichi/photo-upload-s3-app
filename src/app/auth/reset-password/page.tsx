"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthContext } from "@/providers/AuthProvider";

const ResetPasswordPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const { sendPasswordReset } = useAuthContext();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      await sendPasswordReset(email);
      setMessage({
        type: "success",
        text: "パスワードリセットのリンクをメールで送信しました。メールをご確認ください。",
      });
      // 成功メッセージを表示して数秒後にログインページに戻る
      setTimeout(() => {
        router.push("/auth");
      }, 5000);
    } catch (error: any) {
      let errorMessage = "エラーが発生しました。もう一度お試しください。";

      if (error.code === "auth/user-not-found") {
        errorMessage =
          "このメールアドレスに関連するアカウントが見つかりません。";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "有効なメールアドレスを入力してください。";
      }

      setMessage({
        type: "error",
        text: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <h1 className="text-2xl font-bold mb-6 text-center">
            パスワードをリセット
          </h1>

          {message && (
            <div
              className={`px-4 py-3 rounded mb-4 ${
                message.type === "success"
                  ? "bg-green-100 border border-green-400 text-green-700"
                  : "bg-red-100 border border-red-400 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <p className="mb-4 text-gray-600 dark:text-gray-400">
            アカウントに関連付けられたメールアドレスを入力してください。パスワードリセット用のリンクを送信します。
          </p>

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "処理中..." : "リセットリンクを送信"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/auth" className="text-blue-500 hover:text-blue-600">
              ログイン画面に戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
