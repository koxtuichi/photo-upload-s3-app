import { useEffect, useState } from "react";
import { S3ClientAPI } from "@/lib/s3";
import Image from "next/image";

export interface PhotoModalProps {
  fileKey: string;
  url?: string;
  onClose: () => void;
}

export default function PhotoModal({ fileKey, url, onClose }: PhotoModalProps) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  // 画像URL取得
  useEffect(() => {
    // モーダルが開かれるたびに実行される
    const loadImage = async () => {
      try {
        // 状態をリセット
        setLoading(true);
        setError(false);

        console.log(`PhotoModal: 画像読み込み開始 fileKey=${fileKey}`);

        // 提供されたURLがある場合はそれを使用（FileCardからのURL）
        if (url) {
          console.log(
            `PhotoModal: 提供されたURLを使用: ${url.substring(0, 100)}...`
          );
          setImageUrl(url);
          setLoading(false);
          return;
        }

        // URLがない場合は、ファイルキーからURLを生成
        console.log(`PhotoModal: fileKeyからURLを生成: ${fileKey}`);

        // ファイル拡張子を取得
        const fileExtension = fileKey.split(".").pop()?.toLowerCase() || "";
        const isRawFile =
          /^(arw|cr2|cr3|nef|dng|orf|rw2|raf|x3f|pef|3fr|ari|bay|braw|cap|ce1|ce2|cib|craw|crw|dcr|dcs|drf|eip|erf|fff|gpr|iiq|k25|kc2|kdc|mdc|mef|mos|mrw|nex|ptx|pxn|r3d|ra2|rwl|srw)$/i.test(
            fileExtension
          );

        let signedUrl = "";

        if (isRawFile && fileKey.includes("/raw/")) {
          console.log(`PhotoModal: RAWファイルのサムネイル取得開始`);

          // RAWファイルの場合、サムネイルパスを明示的に構築
          const pathParts = fileKey.split("/");
          const fileName = pathParts[pathParts.length - 1];
          const fileNameWithoutExt = fileName.substring(
            0,
            fileName.lastIndexOf(".")
          );

          // サムネイルパスを構築
          const thumbnailPath = fileKey
            .replace("/raw/", "/rawThumbnail/")
            .replace(/\/[^\/]+$/, `/${fileNameWithoutExt}_thumb.jpg`);

          console.log(`PhotoModal: 構築したサムネイルパス: ${thumbnailPath}`);

          try {
            signedUrl = await S3ClientAPI.getSignedImageUrl(thumbnailPath);
            console.log(
              `PhotoModal: 取得したサムネイルURL: ${
                signedUrl ? signedUrl.substring(0, 100) + "..." : "null"
              }`
            );
          } catch (thumbErr) {
            console.error(`PhotoModal: サムネイル取得エラー: ${thumbErr}`);

            // サムネイル取得失敗時はJPGバージョンを試す
            try {
              const jpgPath = fileKey
                .replace("/raw/", "/jpg/")
                .replace(/\.[^.]+$/, ".jpg");

              console.log(`PhotoModal: JPGパスを試行: ${jpgPath}`);
              signedUrl = await S3ClientAPI.getSignedImageUrl(jpgPath);
              console.log(
                `PhotoModal: JPG URL取得結果: ${signedUrl ? "成功" : "失敗"}`
              );
            } catch (jpgError) {
              console.error(`PhotoModal: JPG取得エラー: ${jpgError}`);

              // それでもダメなら元のRAWファイルのURLを試す
              try {
                console.log(`PhotoModal: 元のRAWファイルを試行`);
                signedUrl = await S3ClientAPI.getSignedImageUrl(fileKey);
              } catch (rawError) {
                console.error(`PhotoModal: RAW直接取得も失敗: ${rawError}`);
                throw new Error("画像の取得に失敗しました");
              }
            }
          }
        } else {
          // 通常のファイルは直接URLを取得
          console.log(`PhotoModal: 通常ファイルのURLを取得`);
          signedUrl = await S3ClientAPI.getSignedImageUrl(fileKey);
        }

        console.log(
          `PhotoModal: 最終的なURL: ${signedUrl ? "取得済み" : "取得失敗"}`
        );

        if (!signedUrl) {
          console.error("PhotoModal: 有効なURLが取得できません");
          throw new Error("画像URLの取得に失敗しました");
        }

        setImageUrl(signedUrl);
      } catch (error) {
        console.error("PhotoModal: 画像URL取得エラー:", error);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadImage();
  }, [fileKey, url]);

  // モーダルを閉じる処理をラップした関数
  const handleClose = () => {
    // モーダルを閉じる前にエラー状態をリセット
    setError(false);
    setLoading(false);
    setImageUrl(""); // URLもクリア
    onClose();
  };

  // キーボードイベントでモーダルを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 外側クリックでモーダルを閉じる
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  // 画像を再読み込み
  const handleRetryLoad = () => {
    setError(false);
    setLoading(true);
    setImageUrl(""); // URLをクリアして再取得を強制

    // 少し遅延を入れてから再読み込み
    setTimeout(() => {
      // useEffectを再トリガーするためにダミーのstate更新
      setLoading((state) => state);
    }, 500);
  };

  // ファイル名を取得
  const fileName = fileKey.split("/").pop() || "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90"
      onClick={handleBackdropClick}
    >
      <div
        className="relative max-w-[95vw] max-h-[95vh] bg-white dark:bg-gray-900 rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-3 right-3 z-10 flex space-x-2">
          {/* 閉じるボタンのみ残す */}
          <button
            className="p-1 rounded-full bg-white bg-opacity-70 text-gray-800 hover:bg-opacity-100"
            onClick={handleClose}
            aria-label="閉じる"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
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
        </div>

        <div className="w-full h-full flex items-center justify-center overflow-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-500 mx-auto mb-4"></div>
              <p>画像を読み込み中...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">
              <p>画像ロードエラー</p>
              <p className="text-sm mt-2">ファイル: {fileKey}</p>
              <button
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                onClick={handleRetryLoad}
              >
                再読み込み
              </button>
            </div>
          ) : (
            <div className="relative w-[85vw] h-[85vh] overflow-auto">
              <div className="relative w-full h-full">
                <Image
                  src={imageUrl}
                  alt={fileName}
                  fill
                  sizes="(max-width: 1280px) 100vw, 1280px"
                  className="object-contain"
                  unoptimized={true}
                  onError={() => {
                    console.error("画像ロードエラー:", imageUrl);
                    setError(true);
                  }}
                  // キャッシュをバイパスするために一意のキー値を設定
                  key={`image-${fileKey}-${Date.now()}`}
                />
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3 text-sm text-gray-700 dark:text-gray-300 bg-white bg-opacity-80 dark:bg-gray-800 dark:bg-opacity-80">
          <div className="truncate font-medium">{fileName}</div>
        </div>
      </div>
    </div>
  );
}
