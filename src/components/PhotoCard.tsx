"use client";

import React, { useState } from "react";
import Image from "next/image";
import { usePhotoStore, PhotoItem } from "@/store/photoStore";

interface PhotoCardProps {
  photo: PhotoItem;
  userId: string;
}

const PhotoCard: React.FC<PhotoCardProps> = ({ photo, userId }) => {
  const { deletePhoto } = usePhotoStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // 写真の削除ハンドラー
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("この写真を削除しますか？")) {
      setIsDeleting(true);
      try {
        await deletePhoto(photo.key);
      } catch (error) {
        console.error("写真の削除エラー:", error);
        alert("写真の削除中にエラーが発生しました。");
      } finally {
        setIsDeleting(false);
        setIsMenuOpen(false);
      }
    }
  };

  // メニューの表示・非表示を切り替え
  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(!isMenuOpen);
  };

  // 全画面表示の切り替え
  const toggleFullScreen = () => {
    setShowFullScreen(!showFullScreen);
    setIsMenuOpen(false);
  };

  // 日付のフォーマット
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 画像が読み込み中または URL がない場合はローディング表示
  if (photo.isLoading || !photo.url) {
    return (
      <div className="photo-item flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">読込中...</div>
      </div>
    );
  }

  return (
    <>
      <div
        className="photo-item group cursor-pointer"
        onClick={toggleFullScreen}
      >
        <Image
          src={photo.url}
          alt={photo.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* 写真情報オーバーレイ */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
          <h3 className="text-white font-medium truncate">{photo.name}</h3>
          <p className="text-white/80 text-sm">
            {formatDate(photo.uploadDate)}
          </p>
        </div>

        {/* アクションボタン */}
        <button
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={toggleMenu}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        {/* ドロップダウンメニュー */}
        {isMenuOpen && (
          <div className="absolute top-10 right-2 bg-white dark:bg-gray-800 rounded-md shadow-lg overflow-hidden z-10">
            <button
              className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={toggleFullScreen}
            >
              全画面表示
            </button>
            <button
              className="w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "削除中..." : "削除"}
            </button>
          </div>
        )}
      </div>

      {/* 全画面表示モーダル */}
      {showFullScreen && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={toggleFullScreen}
        >
          <button
            className="absolute top-4 right-4 text-white p-2"
            onClick={toggleFullScreen}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <div
            className="relative w-full h-full max-w-4xl max-h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={photo.url}
              alt={photo.name}
              fill
              sizes="100vw"
              className="object-contain"
            />

            {/* 写真情報 */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-4">
              <h3 className="text-lg font-medium">{photo.name}</h3>
              <p className="text-sm text-white/80">
                {formatDate(photo.uploadDate)}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PhotoCard;
