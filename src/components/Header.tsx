"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuthContext } from "@/providers/AuthProvider";

const Header: React.FC = () => {
  const { user, logout } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/auth");
    } catch (error) {
      console.error("ログアウトエラー:", error);
    }
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* ロゴ / アプリ名 */}
          <div className="flex-shrink-0">
            <Link
              href="/"
              className="flex items-center gap-2 text-xl font-bold"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="text-blue-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
                />
                <circle cx="12" cy="11" r="3" strokeWidth="2" />
                <line x1="8" y1="21" x2="16" y2="21" strokeWidth="2" />
              </svg>
              <span className="bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent font-extrabold">
                SnapStock
              </span>
            </Link>
          </div>

          {/* ナビゲーションメニュー (デスクトップ) */}
          <nav className="hidden md:flex items-center space-x-4">
            {user && (
              <>
                <Link
                  href="/"
                  className={`text-gray-600 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400 ${
                    pathname === "/" ? "text-blue-500 dark:text-blue-400" : ""
                  }`}
                >
                  ホーム
                </Link>
                <Link
                  href="/settings/subscription"
                  className={`text-gray-600 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400 ${
                    pathname === "/settings/subscription"
                      ? "text-blue-500 dark:text-blue-400"
                      : ""
                  }`}
                >
                  サブスクリプション
                </Link>
                <Link
                  href="/settings"
                  className={`text-gray-600 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400 ${
                    pathname === "/settings"
                      ? "text-blue-500 dark:text-blue-400"
                      : ""
                  }`}
                >
                  設定
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-gray-600 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400"
                >
                  ログアウト
                </button>
              </>
            )}
            {!user && (
              <Link
                href="/auth"
                className="text-gray-600 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400"
              >
                ログイン
              </Link>
            )}
          </nav>

          {/* モバイルメニューボタン */}
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              className="p-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {isMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* モバイルメニュー */}
      {isMenuOpen && (
        <div className="md:hidden bg-white dark:bg-gray-800 shadow-lg">
          <div className="container mx-auto px-4 py-3 space-y-2">
            {user && (
              <>
                <Link
                  href="/"
                  className={`block py-2 text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 ${
                    pathname === "/" ? "text-blue-500 dark:text-blue-400" : ""
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  ホーム
                </Link>
                <Link
                  href="/settings/subscription"
                  className={`block py-2 text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 ${
                    pathname === "/settings/subscription"
                      ? "text-blue-500 dark:text-blue-400"
                      : ""
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  サブスクリプション
                </Link>
                <Link
                  href="/settings"
                  className="block py-2 text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400"
                  onClick={() => setIsMenuOpen(false)}
                >
                  設定
                </Link>
                <button
                  onClick={() => {
                    handleLogout();
                    setIsMenuOpen(false);
                  }}
                  className="block w-full text-left py-2 text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400"
                >
                  ログアウト
                </button>
              </>
            )}
            {!user && (
              <Link
                href="/auth"
                className="block py-2 text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400"
                onClick={() => setIsMenuOpen(false)}
              >
                ログイン
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
