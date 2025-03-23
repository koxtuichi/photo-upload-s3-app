import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { S3ClientAPI, getPhotoTakenDate } from "@/lib/s3";

// ファイル情報の型
export interface FileInfo {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  isSelected: boolean;
  url?: string;
  isLoading?: boolean;
  takenDate?: Date; // 撮影日を追加
}

interface FileCardProps {
  file: FileInfo;
  onClick: (file: FileInfo) => void;
  onCheckboxChange: (
    e: React.ChangeEvent<HTMLInputElement>,
    file: FileInfo
  ) => void;
  formatFileSize: (bytes: number) => string;
}

const FileCard: React.FC<FileCardProps> = ({
  file,
  onClick,
  onCheckboxChange,
  formatFileSize,
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [observer, setObserver] = useState<IntersectionObserver | null>(null);
  const [cardRef, setCardRef] = useState<HTMLDivElement | null>(null);

  // ファイルが画像かどうかを判定
  const isJpgImage = /\.(jpg|jpeg)$/i.test(file.name);

  // ファイルがRAWかどうかを判定 - 幅広いカメラメーカーに対応
  const isRawFile =
    /\.(raw|arw|cr2|cr3|nef|nrw|orf|rw2|pef|dng|raf|sr2|3fr|ari|bay|braw|cap|ce1|ce2|cib|craw|crw|dcr|dcs|drf|eip|erf|fff|gpr|iiq|k25|kc2|kdc|mdc|mef|mos|mrw|nex|ptx|pxn|r3d|ra2|rwl|srw|x3f)$/i.test(
      file.name
    );

  // Intersection Observerを使用して要素の可視性を監視
  useEffect(() => {
    if (!cardRef) return;

    // テスト環境では IntersectionObserver が利用できないため、代替処理
    if (typeof IntersectionObserver === "undefined") {
      // テスト環境では即座に可視状態にする
      setIsVisible(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          // 一度表示されたら監視を解除
          obs.disconnect();
        }
      },
      { threshold: 0.1 } // 10%表示されたらコールバックを実行
    );

    obs.observe(cardRef);
    setObserver(obs);

    return () => {
      if (obs) {
        obs.disconnect();
      }
    };
  }, [cardRef]);

  // 可視状態になったらJPG画像のサムネイルを読み込む
  useEffect(() => {
    if (isVisible && isJpgImage && !thumbnailUrl && !isLoading) {
      const loadThumbnail = async () => {
        setIsLoading(true);
        try {
          // サムネイル用のURLを取得（60秒の短い有効期限）
          const url = await S3ClientAPI.getSignedImageUrl(file.key, 60);
          setThumbnailUrl(url);
        } catch (error) {
          console.error("サムネイル読み込みエラー:", error);
        } finally {
          setIsLoading(false);
        }
      };

      loadThumbnail();
    }
  }, [isVisible, isJpgImage, file.key, thumbnailUrl, isLoading]);

  // 日付表示のフォーマット
  const formatDateDisplay = (date: Date) => {
    return date.toLocaleDateString();
  };

  // 撮影日と更新日の表示テキスト
  const dateDisplay = () => {
    if (file.takenDate) {
      return (
        <>
          <div className="text-xs text-gray-500">
            <span className="font-semibold">撮影日:</span>{" "}
            {formatDateDisplay(file.takenDate)}
          </div>
          <div className="text-xs text-gray-500">
            <span className="font-semibold">更新日:</span>{" "}
            {formatDateDisplay(file.lastModified)}
          </div>
        </>
      );
    } else {
      return (
        <div className="text-xs text-gray-500">
          <span className="font-semibold">更新日:</span>{" "}
          {formatDateDisplay(file.lastModified)}
        </div>
      );
    }
  };

  return (
    <div
      ref={setCardRef}
      className={`border rounded-lg overflow-hidden hover:shadow-md cursor-pointer transition-all ${
        file.isSelected
          ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20"
          : ""
      }`}
      onClick={() => onClick(file)}
    >
      {/* サムネイル表示エリア（JPG画像の場合のみ） */}
      {isJpgImage && (
        <div className="w-full h-32 bg-gray-100 dark:bg-gray-800 relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs text-gray-500">読み込み中...</span>
            </div>
          ) : thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt={file.name}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover"
              unoptimized // S3から直接取得するため最適化を無効化
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs text-gray-500">画像</span>
            </div>
          )}
        </div>
      )}

      {/* RAWファイルの場合の表示 */}
      {isRawFile && (
        <div className="w-full h-32 bg-gray-100 dark:bg-gray-800 relative flex items-center justify-center">
          <span className="text-xl font-bold text-gray-500 dark:text-gray-400">
            RAW
          </span>
        </div>
      )}

      {/* その他のファイル形式の場合 */}
      {!isJpgImage && !isRawFile && (
        <div className="w-full h-32 bg-gray-100 dark:bg-gray-800 relative flex items-center justify-center">
          <span className="text-xs text-gray-500">ファイル</span>
        </div>
      )}

      {/* ファイル情報表示エリア */}
      <div className="p-4">
        <div className="font-medium truncate">{file.name}</div>
        <div className="text-xs text-gray-500 mt-1">
          {formatFileSize(file.size)}
        </div>
        {dateDisplay()}

        <div className="mt-2 flex justify-end">
          <div
            className="flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={file.isSelected}
              onChange={(e) => onCheckboxChange(e, file)}
              className="w-5 h-5 text-blue-600 rounded cursor-pointer"
              aria-label={`${file.name}を選択`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileCard;
