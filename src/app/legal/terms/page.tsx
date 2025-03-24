"use client";

import React from "react";
import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-8 pb-2 border-b">利用規約</h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-4">1. はじめに</h2>
          <p>
            本利用規約（以下「本規約」）は、SnapVault（以下「当サービス」）が提供する写真保存サービス「SnapVault」の利用条件を定めるものです。ユーザーは本サービスを利用することにより、本規約に同意したものとみなされます。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">2. サービス内容</h2>
          <p>
            本サービスは、ユーザーがデジタル写真を安全にクラウド上に保存・管理できるサービスです。当サービスは、機能について事前の通知なく変更、追加または削除を行う権利を有します。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">3. アカウント管理</h2>
          <p className="mb-3">ユーザーは以下の責任を負います：</p>
          <ul className="list-disc ml-8 space-y-2">
            <li>アカウント登録情報を正確かつ最新の状態に保つこと</li>
            <li>パスワードの機密性を保持すること</li>
            <li>自身のアカウントで行われるすべての活動に責任を持つこと</li>
          </ul>
          <p className="mt-3">
            不正アクセスや不正使用を発見した場合は、直ちに当サービスに通知してください。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">4. 料金と支払い</h2>
          <p className="mb-3">本サービスのプラン内容は以下の通りです：</p>
          <ul className="list-disc ml-8 space-y-2">
            <li>無料プラン：2GBまでのストレージ利用が可能</li>
            <li>
              スタンダードプラン：月額500円で300GBまでのストレージ利用が可能
            </li>
            <li>無制限プラン：月額1,000円で容量無制限のストレージ利用が可能</li>
          </ul>
          <p className="mt-3">
            有料プランはクレジットカードによる支払いとなり、初回申込時から毎月自動的に更新されます。料金の変更がある場合は、事前に通知します。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">5. キャンセルと返金</h2>
          <p className="mb-3">
            有料プランは「サブスクリプション設定」ページからいつでも解約できます。解約後も当月末までサービスをご利用いただけます。日割り計算による返金は行っておりません。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">6. 禁止事項</h2>
          <p className="mb-3">
            ユーザーは、本サービスを利用するにあたり、以下の行為を行ってはなりません：
          </p>
          <ul className="list-disc ml-8 space-y-2">
            <li>法令に違反する行為</li>
            <li>第三者の権利を侵害する行為</li>
            <li>
              著作権や商標権などの知的財産権を侵害するコンテンツのアップロード
            </li>
            <li>
              コンピュータウイルスなどの有害なプログラムを含むファイルのアップロード
            </li>
            <li>本サービスのシステムに過度の負荷をかける行為</li>
            <li>不正アクセスを試みる行為</li>
            <li>その他、当サービスが不適切と判断する行為</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">7. 知的財産権</h2>
          <p>
            本サービスに関連するすべての知的財産権は当サービスに帰属します。ユーザーがアップロードしたコンテンツの権利はユーザーに帰属しますが、当サービスはサービス提供に必要な範囲でこれらのコンテンツを使用する権利を有します。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">8. 免責事項</h2>
          <p className="mb-3">
            当サービスは、以下について一切の責任を負いません：
          </p>
          <ul className="list-disc ml-8 space-y-2">
            <li>サービスの中断、遅延または停止</li>
            <li>データの損失または破損</li>
            <li>
              ユーザーが本サービスを通じて投稿したコンテンツに起因する損害
            </li>
            <li>ユーザーと第三者との間で生じたトラブル</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">
            9. サービスの変更・終了
          </h2>
          <p>
            当サービスは、事前に通知することなく、内容の変更または提供の終了することができます。サービス終了時には、ユーザーに対してデータのダウンロードや移行のための合理的な期間を設けます。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">10. 本規約の変更</h2>
          <p>
            当サービスは、本規約を随時変更することがあります。変更後の規約は、本ウェブサイトに掲載された時点で効力を生じます。重要な変更については、メールまたはサービス内通知で通知します。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">11. 準拠法と管轄</h2>
          <p>
            本規約の解釈および適用は、日本法に準拠するものとします。本規約に関連する紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">12. お問い合わせ</h2>
          <p>
            本規約に関するご質問やお問い合わせは、以下の連絡先までご連絡ください：
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
