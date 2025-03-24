import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { SubscriptionPlan, PLAN_DETAILS } from "@/lib/subscriptionService";
import Payjp from "payjp";

// PAY.JP SDKを初期化（サーバーサイド）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const payjp = new (Payjp as any)(process.env.PAYJP_SECRET_KEY || "");

export async function POST(request: Request) {
  try {
    const { userId, planId } = await request.json();

    if (!userId || !planId) {
      return NextResponse.json(
        { error: "ユーザーIDとプランIDが必要です" },
        { status: 400 }
      );
    }

    // ユーザードキュメントの参照
    const userDocRef = doc(db, "users", userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    let customerId = userData.plan?.customerId;
    const planDetails = PLAN_DETAILS[planId as SubscriptionPlan];

    // 金額が0円の場合（無料プラン）は直接更新して終了
    if (planDetails.price === 0) {
      await updateDoc(userDocRef, {
        "plan.planId": planId,
        "plan.status": "active",
      });

      return NextResponse.json({
        success: true,
        message: "無料プランに更新されました",
        redirect: "/settings/subscription",
      });
    }

    // PAY.JPの顧客IDがまだない場合は作成
    if (!customerId) {
      const customer = await payjp.customers.create({
        email: userData.email || "",
        description: `ユーザーID: ${userId}`,
      });
      customerId = customer.id;

      // ユーザードキュメントにPAY.JPの顧客IDを保存
      await updateDoc(userDocRef, {
        "plan.customerId": customerId,
      });
    }

    // PAY.JPでチェックアウトセッションを作成
    const session = await payjp.charges.create({
      amount: planDetails.price,
      currency: "jpy",
      customer: customerId,
      description: `${planDetails.name}（${planDetails.description}）`,
      capture: true,
    });

    // 処理が成功したらサブスクリプション情報を更新
    await updateDoc(userDocRef, {
      "plan.planId": planId,
      "plan.status": "active",
      "plan.currentPeriodEnd":
        Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30日後
    });

    return NextResponse.json({
      success: true,
      message: "サブスクリプションが更新されました",
      sessionUrl: `/settings/subscription?session_id=${session.id}`,
    });
  } catch (error: any) {
    console.error("サブスクリプション処理エラー:", error);
    return NextResponse.json(
      {
        error:
          error.message || "サブスクリプション処理中にエラーが発生しました",
      },
      { status: 500 }
    );
  }
}
