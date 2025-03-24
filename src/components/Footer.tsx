"use client";

import React from "react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-gray-100 dark:bg-gray-900 py-8 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <Link
              href="/"
              className="text-xl font-bold text-gray-800 dark:text-white"
            >
              SnapStock
            </Link>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              安全な写真保存サービス
            </p>
          </div>

          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link
              href="/legal/terms"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
            >
              利用規約
            </Link>
            <Link
              href="/legal/privacy"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
            >
              プライバシーポリシー
            </Link>
            <Link
              href="/legal/transaction"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
            >
              特定商取引法に基づく表記
            </Link>
            <Link
              href="/settings/subscription"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
            >
              料金プラン
            </Link>
          </nav>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 mt-6 pt-6 text-center">
          <div className="text-sm text-gray-600 dark:text-gray-400 text-center md:text-right">
            &copy; {new Date().getFullYear()} SnapStock All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
