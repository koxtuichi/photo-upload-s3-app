"use client";

import React from "react";
import Link from "next/link";

export default function TransactionPage() {
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-8 pb-2 border-b">
        特定商取引法に基づく表記
      </h1>

      <div className="space-y-6">
        <table className="w-full border-collapse">
          <tbody>
            <tr className="border-b">
              <th className="py-4 px-4 text-left w-1/3 align-top bg-blue-50 text-gray-700">
                運営責任者
              </th>
              <td className="py-4 px-4">杉本 光一</td>
            </tr>

            <tr className="border-b">
              <th className="py-4 px-4 text-left w-1/3 align-top bg-blue-50 text-gray-700">
                問い合わせ窓口（メールアドレス）
              </th>
              <td className="py-4 px-4">meiguang2wprld@gmail.com</td>
            </tr>

            <tr className="border-b">
              <th className="py-4 px-4 text-left w-1/3 align-top bg-blue-50 text-gray-700">
                問い合わせ窓口（電話番号）
              </th>
              <td className="py-4 px-4">
                080-5686-2808
                <br />
                （平日10:00〜17:00、土日祝休み）
              </td>
            </tr>

            <tr className="border-b">
              <th className="py-4 px-4 text-left w-1/3 align-top bg-blue-50 text-gray-700">
                商品代金以外の必要料金
              </th>
              <td className="py-4 px-4">
                <ul className="list-disc ml-5 space-y-2">
                  <li>サービス利用料の他に料金は発生しません</li>
                  <li>インターネット接続料金はお客様のご負担となります</li>
                </ul>
              </td>
            </tr>

            <tr className="border-b">
              <th className="py-4 px-4 text-left w-1/3 align-top bg-blue-50 text-gray-700">
                お支払い方法
              </th>
              <td className="py-4 px-4">
                <ul className="list-disc ml-5 space-y-2">
                  <li>
                    クレジットカード決済（VISA, Mastercard, JCB, American
                    Express, Diners Club）
                  </li>
                </ul>
              </td>
            </tr>

            <tr className="border-b">
              <th className="py-4 px-4 text-left w-1/3 align-top bg-blue-50 text-gray-700">
                代金の支払い時期
              </th>
              <td className="py-4 px-4">
                <p className="mb-2">【クレジットカード決済】</p>
                <ul className="list-disc ml-5 space-y-2">
                  <li>初回：お申し込み時に即時決済</li>
                  <li>
                    次回以降：毎月同日に自動決済（初回申込日が31日の場合、翌月は月末日に決済）
                  </li>
                </ul>
              </td>
            </tr>

            <tr className="border-b">
              <th className="py-4 px-4 text-left w-1/3 align-top bg-blue-50 text-gray-700">
                商品の引き渡し時期
              </th>
              <td className="py-4 px-4">
                <ul className="list-disc ml-5 space-y-2">
                  <li>お支払い完了後、即時にサービスをご利用いただけます</li>
                  <li>
                    決済処理完了のメールをお送りした時点でサービス提供開始となります
                  </li>
                </ul>
              </td>
            </tr>

            <tr className="border-b">
              <th className="py-4 px-4 text-left w-1/3 align-top bg-blue-50 text-gray-700">
                返品・交換不良品・解約について
              </th>
              <td className="py-4 px-4">
                <ul className="list-disc ml-5 space-y-2">
                  <li>
                    本サービスはデジタルコンテンツのため、ご購入後の返品・返金はできません
                  </li>
                  <li>
                    解約はいつでもマイページの「サブスクリプション設定」から行うことができます
                  </li>
                  <li>
                    次回決済日より前に解約手続きを完了された場合、次回以降の請求は発生しません
                  </li>
                  <li>解約後もその月の末日までサービスをご利用いただけます</li>
                  <li>
                    解約時に保存されたデータは90日間保持され、その後削除されます
                  </li>
                  <li>
                    サービス障害等が発生した場合は、状況に応じて対応いたします
                  </li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-8 text-center">
        <Link href="/" className="text-blue-600 hover:underline">
          トップページに戻る
        </Link>
      </div>
    </div>
  );
}
