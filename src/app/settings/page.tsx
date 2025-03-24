"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/providers/AuthProvider";

export default function SettingsPage() {
  const router = useRouter();
  const {
    user,
    loading,
    updateUserProfile,
    updateUserEmail,
    updateUserPassword,
  } = useAuthContext();

  // プロフィール設定
  const [displayName, setDisplayName] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // メール設定
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // パスワード設定
  const [currentPasswordForPw, setCurrentPasswordForPw] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // ユーザー情報を初期化
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
      return;
    }

    if (user) {
      setDisplayName(user.displayName || "");
      setEmail(user.email || "");
    }
  }, [user, loading, router]);

  // プロフィール更新
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);
    setProfileSubmitting(true);

    try {
      await updateUserProfile(displayName);
      setProfileSuccess(true);
    } catch (error) {
      setProfileError("プロフィールの更新に失敗しました");
      console.error(error);
    } finally {
      setProfileSubmitting(false);
    }
  };

  // メールアドレス更新
  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(false);
    setEmailSubmitting(true);

    if (!currentPassword) {
      setEmailError("現在のパスワードを入力してください");
      setEmailSubmitting(false);
      return;
    }

    try {
      await updateUserEmail(email, currentPassword);
      setEmailSuccess(true);
      setCurrentPassword("");
    } catch (error) {
      setEmailError(
        "メールアドレスの更新に失敗しました。パスワードを確認してください。"
      );
      console.error(error);
    } finally {
      setEmailSubmitting(false);
    }
  };

  // パスワード更新
  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    setPasswordSubmitting(true);

    if (newPassword !== confirmPassword) {
      setPasswordError("新しいパスワードが一致しません");
      setPasswordSubmitting(false);
      return;
    }

    try {
      await updateUserPassword(currentPasswordForPw, newPassword);
      setPasswordSuccess(true);
      setCurrentPasswordForPw("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(
        "パスワードの更新に失敗しました。現在のパスワードを確認してください。"
      );
      console.error(error);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loader">読み込み中...</div>
      </div>
    );
  }

  if (!user) {
    return null; // useEffectでリダイレクト処理済み
  }

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">アカウント設定</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* プロフィール設定 */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">プロフィール設定</h2>

            {profileError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {profileError}
              </div>
            )}

            {profileSuccess && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                プロフィールが更新されました
              </div>
            )}

            <form onSubmit={handleProfileUpdate}>
              <div className="mb-4">
                <label
                  htmlFor="displayName"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  名前
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input-field text-gray-900 dark:text-gray-900"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={profileSubmitting}
              >
                {profileSubmitting ? "更新中..." : "プロフィールを更新"}
              </button>
            </form>
          </div>

          {/* メールアドレス設定 */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">メールアドレス設定</h2>

            {emailError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {emailError}
              </div>
            )}

            {emailSuccess && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                メールアドレスが更新されました
              </div>
            )}

            <form onSubmit={handleEmailUpdate}>
              <div className="mb-4">
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
                  className="input-field text-gray-900 dark:text-gray-900"
                  required
                />
              </div>

              <div className="mb-4">
                <label
                  htmlFor="currentPassword"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  現在のパスワード
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input-field text-gray-900 dark:text-gray-900"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={emailSubmitting}
              >
                {emailSubmitting ? "更新中..." : "メールアドレスを更新"}
              </button>
            </form>
          </div>

          {/* パスワード設定 */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">パスワード設定</h2>

            {passwordError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                パスワードが更新されました
              </div>
            )}

            <form onSubmit={handlePasswordUpdate}>
              <div className="mb-4">
                <label
                  htmlFor="currentPasswordForPw"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  現在のパスワード
                </label>
                <input
                  id="currentPasswordForPw"
                  type="password"
                  autoComplete="current-password"
                  value={currentPasswordForPw}
                  onChange={(e) => setCurrentPasswordForPw(e.target.value)}
                  className="input-field text-gray-900 dark:text-gray-900"
                  required
                />
              </div>

              <div className="mb-4">
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  新しいパスワード
                </label>
                <input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field text-gray-900 dark:text-gray-900"
                  required
                />
              </div>

              <div className="mb-4">
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  新しいパスワード（確認）
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field text-gray-900 dark:text-gray-900"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={passwordSubmitting}
              >
                {passwordSubmitting ? "更新中..." : "パスワードを更新"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
