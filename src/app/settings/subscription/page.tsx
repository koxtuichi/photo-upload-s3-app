"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthContext } from "@/providers/AuthProvider";
import {
  SubscriptionPlan,
  PLAN_DETAILS,
  getUserPlan,
  UserPlan,
  recalculateStorageUsage,
} from "@/lib/subscriptionService";
import Script from "next/script";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

// PAY.JPの型定義
declare global {
  interface Window {
    Payjp?: any;
    payjpInstance?: any;
  }
}

// AWS Lambda APIエンドポイント
const API_ENDPOINT =
  "https://ng2bc45of9.execute-api.ap-northeast-1.amazonaws.com/prod/payJpFunc";

function SubscriptionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuthContext();
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payjpLoaded, setPayjpLoaded] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<SubscriptionPlan | null>(
    null
  );

  // セッションIDがURLに含まれている場合のメッセージ
  const sessionId = searchParams?.get("session_id");

  useEffect(() => {
    if (sessionId) {
      setMessage("サブスクリプションが正常に更新されました！");
    }
  }, [sessionId]);

  // PAY.JPの初期化
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.Payjp &&
      !window.payjpInstance
    ) {
      // テスト環境の公開キーを使用
      window.payjpInstance = window.Payjp("pk_test_86bb235a244b9fcdcc597fe4");
      setPayjpLoaded(true);
    }
  }, []);

  // PAY.JPのカード要素初期化
  useEffect(() => {
    let cardElement: any = null;

    const initializeCardElement = () => {
      if (!window.payjpInstance) {
        console.error("PAY.JPインスタンスが見つかりません");
        return;
      }

      const elements = window.payjpInstance.elements();
      cardElement = elements.create("card", {
        style: {
          base: {
            color: "#333333",
            fontFamily: "sans-serif",
            fontSize: "16px",
            lineHeight: "40px",
            fontSmoothing: "antialiased",
            backgroundColor: "#ffffff",
            "::placeholder": {
              color: "#999999",
            },
          },
          invalid: {
            color: "#E25950",
            iconColor: "#E25950",
          },
        },
        classes: {
          base: "payjp-element",
          focus: "focused",
          invalid: "invalid",
        },
        placeholder: {
          number: "カード番号",
          exp: "有効期限 (MM/YY)",
          cvc: "セキュリティコード",
        },
      });

      // 要素のマウント
      try {
        const mountElement = document.querySelector("#payjp-element");
        if (!mountElement) {
          console.error("マウント要素が見つかりません");
          return;
        }

        cardElement.mount("#payjp-element");
        console.log("カード要素が正常にマウントされました");

        // イベントリスナーの設定
        cardElement.on("change", (event: any) => {
          const element = document.querySelector("#payjp-element");

          if (event.complete) {
            // 入力が完了した場合
            element?.classList.add(
              "ring-2",
              "ring-green-500",
              "border-transparent"
            );
          } else if (event.error) {
            // エラーがある場合
            element?.classList.add(
              "ring-2",
              "ring-red-500",
              "border-transparent"
            );
            setError(event.error.message);
          } else {
            // 通常の状態
            element?.classList.remove(
              "ring-2",
              "ring-green-500",
              "ring-red-500",
              "border-transparent"
            );
            setError(null);
          }
        });
      } catch (error) {
        console.error("PAY.JP要素のマウントエラー:", error);
        setError("カード情報入力フォームの初期化に失敗しました");
      }
    };

    // カード要素の初期化を遅延実行
    if (showCardForm && payjpLoaded) {
      setTimeout(initializeCardElement, 500);
    }

    // クリーンアップ関数
    return () => {
      if (cardElement) {
        try {
          cardElement.unmount();
        } catch (error) {
          console.error("PAY.JP要素のアンマウントエラー:", error);
        }
      }
    };
  }, [showCardForm, payjpLoaded]);

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

  // カード情報フォームの表示
  const showPaymentForm = (planId: SubscriptionPlan) => {
    setSelectedPlanId(planId);
    setShowCardForm(true);
  };

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

      // 無料プランの場合は直接更新
      if (planId === SubscriptionPlan.FREE) {
        // Firestoreを直接更新
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
          "plan.planId": planId,
          "plan.status": "active",
        });
        setMessage("無料プランに更新されました");
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      // 有料プランの場合はカード情報入力フォームを表示
      showPaymentForm(planId);
      setIsProcessing(false);
    } catch (error: any) {
      setError(error.message || "プラン変更処理中にエラーが発生しました");
      console.error("プラン変更エラー:", error);
      setIsProcessing(false);
    }
  };

  // カード情報送信処理
  const handleCardSubmit = async () => {
    if (
      !user?.uid ||
      !selectedPlanId ||
      !window.payjpInstance ||
      !payjpLoaded
    ) {
      setError("カード情報の処理に失敗しました。再度お試しください。");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const elements = window.payjpInstance.elements();
      const cardElement = elements.getElement("card");

      if (!cardElement) {
        console.error("カード要素が見つかりません");
        throw new Error("カード情報の要素が見つかりません");
      }

      console.log("カード要素が正常に取得されました");

      // トークン作成をPromiseでラップ
      const tokenResult = await new Promise<{ id: string }>(
        (resolve, reject) => {
          window.payjpInstance.createToken(
            cardElement,
            (status: number, response: any) => {
              if (status === 200) {
                resolve(response);
              } else {
                reject(new Error(response.error.message));
              }
            }
          );
        }
      );

      // AWS Lambda APIを呼び出す
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.uid,
          planId: selectedPlanId,
          token: tokenResult.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "サブスクリプション処理に失敗しました");
      }

      setMessage(data.message || "サブスクリプションが更新されました");
      setShowCardForm(false);

      // 成功したら再読み込み
      setTimeout(() => window.location.reload(), 2000);
    } catch (error: any) {
      setError(error.message || "カード処理中にエラーが発生しました");
      console.error("カード処理エラー:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // カード情報入力フォームをキャンセル
  const handleCancelCardForm = () => {
    setShowCardForm(false);
    setSelectedPlanId(null);
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
      {/* PAY.JPのスクリプト読み込み */}
      <Script
        src="https://js.pay.jp/v2/pay.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (
            typeof window !== "undefined" &&
            window.Payjp &&
            !window.payjpInstance
          ) {
            window.payjpInstance = window.Payjp(
              "pk_test_86bb235a244b9fcdcc597fe4"
            );
            setPayjpLoaded(true);
          }
        }}
      />

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

      {/* カード情報入力フォーム */}
      {showCardForm && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 shadow">
          <h3 className="text-lg font-semibold mb-4">カード情報を入力</h3>
          <div className="mb-4 bg-white dark:bg-gray-700 p-4 rounded-lg">
            <p className="text-gray-800 dark:text-gray-200">
              選択プラン: {selectedPlanId && PLAN_DETAILS[selectedPlanId].name}
            </p>
            <p className="text-gray-800 dark:text-gray-200 mt-1">
              料金: ¥{selectedPlanId && PLAN_DETAILS[selectedPlanId].price}/月
            </p>
          </div>

          <div className="mb-4 bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              カード情報
            </label>
            <div
              id="payjp-element"
              className="p-3 border rounded bg-white"
              style={{
                minHeight: "40px",
              }}
            ></div>
            <p className="mt-2 text-sm text-gray-500">
              ※ テスト用カード番号: 4242 4242 4242 4242
            </p>
            <p className="mt-1 text-sm text-gray-500">
              ※ テスト用有効期限: 12/25
            </p>
            <p className="mt-1 text-sm text-gray-500">※ テスト用CVC: 123</p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleCardSubmit}
              disabled={isProcessing || !payjpLoaded}
              className="py-2 px-6 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors duration-200 disabled:opacity-50"
            >
              {isProcessing ? "処理中..." : "支払い情報を送信"}
            </button>
            <button
              onClick={handleCancelCardForm}
              disabled={isProcessing}
              className="py-2 px-6 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium transition-colors duration-200"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

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

      {isProcessing && !showCardForm && (
        <div className="mt-4 text-center">
          <p>処理中...</p>
        </div>
      )}

      <div className="mt-8 bg-gray-50 dark:bg-gray-800 p-4 rounded">
        <div className="mb-4 bg-blue-100 dark:bg-blue-900 p-4 rounded">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
            🎉 期間限定キャンペーン
          </h3>
          <p className="text-blue-700 dark:text-blue-300">
            2025年4月末までの期間限定で、全てのプランでストレージ容量無制限でご利用いただけます！
          </p>
        </div>

        <h3 className="font-semibold mb-2">注意事項:</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>プラン変更は即時反映されます</li>
          <li>有料プランへのアップグレードは即時処理されます</li>
          <li>解約や返金についてはお問い合わせください</li>
          <li>
            キャンペーン期間（2025年4月末まで）終了後は、各プランの通常の容量制限が適用されます
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <SubscriptionContent />
    </Suspense>
  );
}
