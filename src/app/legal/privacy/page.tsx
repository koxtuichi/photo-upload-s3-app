"use client";

import React from "react";
import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-8 pb-2 border-b">
        プライバシーポリシー
      </h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-4">1. はじめに</h2>
          <p>
            SnapVault（以下「当サービス」）は、ユーザーの個人情報の取扱いについて以下のとおりプライバシーポリシーを定めます。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">2. 収集する情報</h2>
          <p className="mb-3">
            当サービスは、以下の情報を収集することがあります：
          </p>
          <ul className="list-disc ml-8 space-y-2">
            <li>
              ユーザーが提供する情報（氏名、メールアドレス、パスワード等）
            </li>
            <li>ユーザーがアップロードした写真やその他のコンテンツ</li>
            <li>支払い情報（クレジットカード情報等、PAY.JPを通じて処理）</li>
            <li>利用状況（アクセスログ、使用量、ストレージ使用状況など）</li>
            <li>デバイス情報（IPアドレス、ブラウザの種類、OSの種類等）</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">3. 情報の利用目的</h2>
          <p className="mb-3">収集した情報は、以下の目的で利用します：</p>
          <ul className="list-disc ml-8 space-y-2">
            <li>本サービスの提供・維持・改善</li>
            <li>ユーザーからのお問い合わせ対応</li>
            <li>料金請求処理</li>
            <li>不正アクセスの検知・防止</li>
            <li>新機能や更新情報のお知らせ</li>
            <li>利用統計データの作成（個人を特定しない形式）</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">4. 情報の共有</h2>
          <p className="mb-3">
            当サービスは、以下の場合を除き、ユーザーの個人情報を第三者と共有しません：
          </p>
          <ul className="list-disc ml-8 space-y-2">
            <li>ユーザーの同意がある場合</li>
            <li>法令に基づく場合</li>
            <li>
              決済処理等のサービス提供に必要なパートナー企業との共有（PAY.JP等）
            </li>
            <li>当サービスの権利や財産を保護する必要がある場合</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">5. データセキュリティ</h2>
          <p>
            当サービスは、ユーザーの個人情報を保護するために適切な技術的・組織的措置を講じます。ただし、インターネット上での完全なセキュリティを保証することはできません。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">6. ユーザーの権利</h2>
          <p className="mb-3">ユーザーには以下の権利があります：</p>
          <ul className="list-disc ml-8 space-y-2">
            <li>個人情報へのアクセス、訂正、削除の要求</li>
            <li>データ処理の制限または異議申し立て</li>
            <li>データポータビリティ（データの移行）の要求</li>
          </ul>
          <p className="mt-3">
            これらの権利行使については、以下の連絡先までお問い合わせください。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">7. Cookieの使用</h2>
          <p>
            本サービスでは、ユーザー体験の向上やサービス改善のためにCookieを使用しています。ブラウザの設定によりCookieの受け入れを拒否することも可能ですが、一部機能が制限される場合があります。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">
            8. お子様のプライバシー
          </h2>
          <p>
            本サービスは13歳未満のお子様を対象としていません。13歳未満のお子様から個人情報を収集したことが判明した場合、速やかに削除します。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">
            9. プライバシーポリシーの変更
          </h2>
          <p>
            当サービスは、必要に応じて本プライバシーポリシーを変更することがあります。変更があった場合は、本ページ上で通知します。定期的にご確認いただくことをお勧めします。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">10. お問い合わせ</h2>
          <p>
            本プライバシーポリシーに関するご質問やお問い合わせは、以下の連絡先までご連絡ください：
          </p>
          <div className="mt-3">
            <p>運営責任者：杉本 光一</p>
            <p>Eメール：meiguang2wprld@gmail.com</p>
            <p>電話番号：080-5686-2808（平日10:00〜17:00）</p>
          </div>
        </section>

        <p className="text-sm text-gray-600 mt-4">最終更新日：2024年7月1日</p>
      </div>

      <div className="mt-8 text-center">
        <Link href="/" className="text-blue-600 hover:underline">
          トップページに戻る
        </Link>
      </div>
    </div>
  );
}
