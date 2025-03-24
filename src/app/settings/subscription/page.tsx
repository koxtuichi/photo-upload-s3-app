"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthContext } from "@/providers/AuthProvider";
import {
  SubscriptionPlan,
  PLAN_DETAILS,
  getUserPlan,
  createCheckoutSession,
  UserPlan,
  recalculateStorageUsage,
} from "@/lib/subscriptionService";

function SubscriptionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuthContext();
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(
    null
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // セッションIDがURLに含まれている場合のメッセージ
  const sessionId = searchParams?.get("session_id");

  useEffect(() => {
    if (sessionId) {
      setMessage("サブスクリプションが正常に更新されました！");
    }
  }, [sessionId]);

  // 認証チェック
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
      return;
    }
  }, [user, loading, router]);

  // ユーザープラン情報の取得
  useEffect(() => {
    async function fetchUserPlan() {
      if (user?.uid) {
        try {
          // ユーザープラン情報の取得
          const plan = await getUserPlan(user.uid);

          // ストレージ使用量を再計算
          try {
            const updatedStorageUsed = await recalculateStorageUsage(user.uid);
            // 再計算後の値を含むプラン情報を設定
            setUserPlan({
              ...plan,
              storageUsed: updatedStorageUsed,
            });
          } catch (storageError) {
            console.error("ストレージ使用量の再計算エラー:", storageError);
            // エラー時は元のプラン情報を使用
            setUserPlan(plan);
          }
        } catch (error) {
          console.error("プラン取得エラー:", error);
        }
      }
    }

    fetchUserPlan();
  }, [user]);

  // プラン変更処理
  const handlePlanChange = async (planId: SubscriptionPlan) => {
    if (!user?.uid) return;

    setError(null);
    setMessage(null);
    setIsProcessing(true);

    try {
      // 現在のプランと同じなら何もしない
      if (userPlan?.planId === planId) {
        setMessage("このプランは既に適用されています");
        setIsProcessing(false);
        return;
      }

      // チェックアウトセッションの作成
      const sessionUrl = await createCheckoutSession(user.uid, planId);

      // 無料プランの場合は再読み込み
      if (planId === SubscriptionPlan.FREE) {
        window.location.reload();
        return;
      }

      // ページ遷移
      router.push(sessionUrl);
    } catch (error: any) {
      setError(error.message || "プラン変更処理中にエラーが発生しました");
      console.error("プラン変更エラー:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // 人間可読形式のストレージサイズに変換
  const formatStorageSize = (bytes: number) => {
    if (bytes === 0) return "0 バイト";

    const k = 1024;
    const sizes = ["バイト", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading || !userPlan) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-6">サブスクリプション設定</h1>
        <div className="mt-4">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">サブスクリプション設定</h1>

      {message && (
        <div className="mb-4 p-3 bg-green-100 text-green-800 rounded">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">{error}</div>
      )}

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">現在のプラン</h2>
        <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded">
          <p className="font-bold text-lg">
            {PLAN_DETAILS[userPlan.planId].name}
          </p>
          <p>{PLAN_DETAILS[userPlan.planId].description}</p>
          <p className="mt-2">
            ストレージ使用量: {formatStorageSize(userPlan.storageUsed)} /
            {userPlan.planId === SubscriptionPlan.UNLIMITED
              ? "無制限"
              : formatStorageSize(PLAN_DETAILS[userPlan.planId].storageLimit)}
          </p>
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-4">利用可能なプラン</h2>

      <div className="grid md:grid-cols-3 gap-4">
        {/* 無料プラン */}
        <div
          className={`border rounded-lg overflow-hidden shadow-sm ${
            userPlan.planId === SubscriptionPlan.FREE ? "border-blue-500" : ""
          }`}
        >
          <div className="p-4">
            <h3 className="text-xl font-bold">
              {PLAN_DETAILS[SubscriptionPlan.FREE].name}
            </h3>
            <p className="text-2xl font-bold my-2">¥0</p>
            <p className="mb-4">
              {PLAN_DETAILS[SubscriptionPlan.FREE].description}
            </p>

            <button
              onClick={() => handlePlanChange(SubscriptionPlan.FREE)}
              disabled={
                isProcessing || userPlan.planId === SubscriptionPlan.FREE
              }
              className={`w-full py-2 px-4 rounded ${
                userPlan.planId === SubscriptionPlan.FREE
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
            >
              {userPlan.planId === SubscriptionPlan.FREE
                ? "現在のプラン"
                : "選択する"}
            </button>
          </div>
        </div>

        {/* スタンダードプラン */}
        <div
          className={`border rounded-lg overflow-hidden shadow-sm ${
            userPlan.planId === SubscriptionPlan.STANDARD
              ? "border-blue-500"
              : ""
          }`}
        >
          <div className="p-4">
            <h3 className="text-xl font-bold">
              {PLAN_DETAILS[SubscriptionPlan.STANDARD].name}
            </h3>
            <p className="text-2xl font-bold my-2">
              ¥{PLAN_DETAILS[SubscriptionPlan.STANDARD].price}
            </p>
            <p className="mb-4">
              {PLAN_DETAILS[SubscriptionPlan.STANDARD].description}
            </p>

            <button
              onClick={() => handlePlanChange(SubscriptionPlan.STANDARD)}
              disabled={
                isProcessing || userPlan.planId === SubscriptionPlan.STANDARD
              }
              className={`w-full py-2 px-4 rounded ${
                userPlan.planId === SubscriptionPlan.STANDARD
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
            >
              {userPlan.planId === SubscriptionPlan.STANDARD
                ? "現在のプラン"
                : "選択する"}
            </button>
          </div>
        </div>

        {/* 無制限プラン */}
        <div
          className={`border rounded-lg overflow-hidden shadow-sm ${
            userPlan.planId === SubscriptionPlan.UNLIMITED
              ? "border-blue-500"
              : ""
          }`}
        >
          <div className="p-4">
            <h3 className="text-xl font-bold">
              {PLAN_DETAILS[SubscriptionPlan.UNLIMITED].name}
            </h3>
            <p className="text-2xl font-bold my-2">
              ¥{PLAN_DETAILS[SubscriptionPlan.UNLIMITED].price}
            </p>
            <p className="mb-4">
              {PLAN_DETAILS[SubscriptionPlan.UNLIMITED].description}
            </p>

            <button
              onClick={() => handlePlanChange(SubscriptionPlan.UNLIMITED)}
              disabled={
                isProcessing || userPlan.planId === SubscriptionPlan.UNLIMITED
              }
              className={`w-full py-2 px-4 rounded ${
                userPlan.planId === SubscriptionPlan.UNLIMITED
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
            >
              {userPlan.planId === SubscriptionPlan.UNLIMITED
                ? "現在のプラン"
                : "選択する"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 text-sm text-gray-600 dark:text-gray-400">
        <p>※ サブスクリプションは30日ごとに自動更新されます。</p>
        <p>※ プランの変更は即時反映されます。</p>
        <p>
          ※
          ダウングレードした場合、容量を超えるデータは閲覧できなくなる可能性があります。
        </p>
      </div>
    </div>
  );
}

// メインコンポーネントをSuspenseでラップ
export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4">
          <h1 className="text-2xl font-bold mb-6">サブスクリプション設定</h1>
          <div className="mt-4">読み込み中...</div>
        </div>
      }
    >
      <SubscriptionContent />
    </Suspense>
  );
}
