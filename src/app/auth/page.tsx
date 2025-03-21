"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/providers/AuthProvider";
import Header from "@/components/Header";

export default function AuthPage() {
  const router = useRouter();
  const {
    user,
    loading,
    signIn,
    signUp,
    sendPasswordReset,
    error: authError,
  } = useAuthContext();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 認証済みならホームにリダイレクト
  useEffect(() => {
    if (!loading && user) {
      router.push("/");
    }
  }, [user, loading, router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!email || !password) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    try {
      if (isLogin) {
        await signIn(email, password);
        // 成功したらホームにリダイレクト（useEffectで処理）
      } else {
        await signUp(email, password, displayName);
        setMessage("アカウントが作成されました。ログインしてください。");
        setIsLogin(true);
      }
    } catch (err) {
      setError("認証エラーが発生しました。再度お試しください。");
      console.error(err);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError("パスワードリセットにはメールアドレスが必要です");
      return;
    }

    try {
      await sendPasswordReset(email);
      setMessage(
        "パスワードリセットのメールを送信しました。メールをご確認ください。"
      );
    } catch (err) {
      setError("パスワードリセットメールの送信に失敗しました");
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loader">読み込み中...</div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            {isLogin ? "アカウントにログイン" : "新規アカウント登録"}
          </h2>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            {message && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                {message}
              </div>
            )}

            {authError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {authError}
              </div>
            )}

            <form className="space-y-6" onSubmit={handleAuth}>
              {!isLogin && (
                <div>
                  <label
                    htmlFor="displayName"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    名前
                  </label>
                  <div className="mt-1">
                    <input
                      id="displayName"
                      name="displayName"
                      type="text"
                      required={!isLogin}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="input-field text-gray-900 dark:text-gray-900"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  メールアドレス
                </label>
                <div className="mt-1">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field text-gray-900 dark:text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  パスワード
                </label>
                <div className="mt-1">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field text-gray-900 dark:text-gray-900"
                  />
                </div>
              </div>

              {!isLogin && (
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    パスワード（確認）
                  </label>
                  <div className="mt-1">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required={!isLogin}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input-field text-gray-900 dark:text-gray-900"
                    />
                  </div>
                </div>
              )}

              <div>
                <button type="submit" className="w-full btn-primary">
                  {isLogin ? "ログイン" : "アカウント登録"}
                </button>
              </div>
            </form>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {isLogin ? "新規アカウント登録" : "ログイン画面に戻る"}
                </button>

                {isLogin && (
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    パスワードを忘れた場合
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
