import { User } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { S3ClientAPI } from "./s3";

// サブスクリプションプラン
export enum SubscriptionPlan {
  FREE = "free",
  STANDARD = "standard", // 300GB
  UNLIMITED = "unlimited",
}

// プラン詳細
export const PLAN_DETAILS = {
  [SubscriptionPlan.FREE]: {
    name: "無料プラン",
    price: 0,
    storageLimit: 2 * 1024 * 1024 * 1024, // 2GB
    description: "基本機能のみ",
  },
  [SubscriptionPlan.STANDARD]: {
    name: "スタンダードプラン",
    price: 500,
    storageLimit: 300 * 1024 * 1024 * 1024, // 300GB
    description: "300GBまでのストレージ",
  },
  [SubscriptionPlan.UNLIMITED]: {
    name: "無制限プラン",
    price: 1000,
    storageLimit: Number.MAX_SAFE_INTEGER, // 実質無制限
    description: "無制限のストレージ",
  },
};

// ユーザープラン情報
export interface UserPlan {
  planId: SubscriptionPlan;
  customerId?: string; // PAY.JPの顧客ID
  subscriptionId?: string; // PAY.JPのサブスクリプションID
  status: "active" | "canceled" | "trial" | "unpaid";
  currentPeriodEnd?: number; // Unix timestamp
  storageUsed: number; // 使用済みストレージ (bytes)
}

// 初期プラン情報
const DEFAULT_USER_PLAN: UserPlan = {
  planId: SubscriptionPlan.FREE,
  status: "active",
  storageUsed: 0,
};

// ユーザープランの取得
export async function getUserPlan(userId: string): Promise<UserPlan> {
  try {
    const userDocRef = doc(db, "users", userId);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists() && userDoc.data().plan) {
      return userDoc.data().plan as UserPlan;
    } else {
      // 存在しない場合は作成
      await setDoc(userDocRef, { plan: DEFAULT_USER_PLAN }, { merge: true });
      return DEFAULT_USER_PLAN;
    }
  } catch (error) {
    console.error("ユーザープラン取得エラー:", error);
    return DEFAULT_USER_PLAN;
  }
}

// ストレージ使用量の更新
export async function updateStorageUsed(
  userId: string,
  bytesUsed: number
): Promise<void> {
  try {
    const userPlan = await getUserPlan(userId);
    const userDocRef = doc(db, "users", userId);

    await updateDoc(userDocRef, {
      "plan.storageUsed": userPlan.storageUsed + bytesUsed,
    });
  } catch (error) {
    console.error("ストレージ使用量更新エラー:", error);
    throw error;
  }
}

// ストレージ使用量を再計算して更新する
export async function recalculateStorageUsage(userId: string): Promise<number> {
  try {
    // S3からユーザーのファイル一覧を取得
    const files = await S3ClientAPI.listUserFiles(userId);

    // 合計サイズを計算
    let totalSize = 0;
    for (const file of files) {
      if (file.Size) {
        totalSize += file.Size;
      }
    }

    // ユーザードキュメントの参照を取得
    const userDocRef = doc(db, "users", userId);

    // ストレージ使用量を更新
    await updateDoc(userDocRef, {
      "plan.storageUsed": totalSize,
    });

    return totalSize;
  } catch (error) {
    console.error("ストレージ使用量の再計算エラー:", error);
    throw error;
  }
}

// ストレージ制限の確認
export async function checkStorageLimit(
  userId: string,
  fileSize: number
): Promise<boolean> {
  const userPlan = await getUserPlan(userId);

  // 無制限プランの場合は常にtrue
  if (userPlan.planId === SubscriptionPlan.UNLIMITED) {
    return true;
  }

  // それ以外のプランでは、現在の使用量+ファイルサイズが制限以下かチェック
  const planDetails = PLAN_DETAILS[userPlan.planId];
  return userPlan.storageUsed + fileSize <= planDetails.storageLimit;
}

// サブスクリプション開始処理のためのチェックアウトセッション作成
export async function createCheckoutSession(
  userId: string,
  planId: SubscriptionPlan
): Promise<string> {
  try {
    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        planId,
      }),
    });

    if (!response.ok) {
      throw new Error("チェックアウトセッションの作成に失敗しました");
    }

    const { sessionUrl } = await response.json();
    return sessionUrl;
  } catch (error) {
    console.error("チェックアウト作成エラー:", error);
    throw error;
  }
}
