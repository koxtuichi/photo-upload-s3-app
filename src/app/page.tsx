"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { useAuthContext } from "@/providers/AuthProvider";
import { usePhotoStore } from "@/store/photoStore";
import Header from "@/components/Header";
import PhotoCard from "@/components/PhotoCard";
import UploadProgress from "@/components/UploadProgress";
import PhotoPreview from "@/components/PhotoPreview";

// AWS認証情報のチェック
const isAwsConfigured =
  typeof process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID === "string" &&
  process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID.length > 0 &&
  typeof process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY === "string" &&
  process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY.length > 0;

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuthContext();
  const { photos, isLoading, error, fetchUserPhotos, uploadPhoto } =
    usePhotoStore();

  // 選択した写真ファイルの配列
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  // アップロード中のファイル
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  // アップロード進捗
  const [uploadProgress, setUploadProgress] = useState<{
    [key: string]: number;
  }>({});

  // 認証状態をチェック
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);

  // ユーザーの写真をロード
  useEffect(() => {
    if (user?.uid) {
      fetchUserPhotos(user.uid);
    }
  }, [user, fetchUserPhotos]);

  // ドラッグアンドドロップ用の設定
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".gif", ".webp"],
    },
    onDrop: (acceptedFiles) => {
      // 選択したファイルをプレビュー用の状態に追加
      setSelectedFiles((prev) => [...prev, ...acceptedFiles]);
    },
  });

  // プレビュー用写真を削除
  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ファイルアップロードのハンドラー
  const handleUploadFiles = async () => {
    if (!user?.uid || selectedFiles.length === 0) return;

    const filesToUpload = [...selectedFiles];
    setUploadingFiles(filesToUpload);

    // アップロード開始前にプレビューから削除
    setSelectedFiles([]);

    // 各ファイルを個別にアップロード
    for (const file of filesToUpload) {
      try {
        // アップロードの進行状況をシミュレート（実際の進行状況を取得する方法がない場合）
        const fileId = `${file.name}-${Date.now()}`;
        const simulateProgress = () => {
          let progress = 0;
          const interval = setInterval(() => {
            progress += Math.floor(Math.random() * 10) + 5;
            if (progress >= 100) {
              progress = 100;
              clearInterval(interval);
            }
            setUploadProgress((prev) => ({ ...prev, [fileId]: progress }));
          }, 300);
          return interval;
        };

        const progressInterval = simulateProgress();

        // 実際のアップロード処理
        await uploadPhoto(user.uid, file);

        // 完了したらアップロードのインターバルをクリア
        clearInterval(progressInterval);
        setUploadProgress((prev) => ({ ...prev, [fileId]: 100 }));

        // アップロード完了後に進行状況をリストから削除
        setTimeout(() => {
          setUploadingFiles((prev) => prev.filter((f) => f !== file));
          setUploadProgress((prev) => {
            const newProgress = { ...prev };
            delete newProgress[fileId];
            return newProgress;
          });
        }, 1000);
      } catch (error) {
        console.error("アップロードエラー:", error);
      }
    }
  };

  // ファイル入力からのアップロードハンドラー
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // 選択したファイルをプレビュー用の状態に追加
      setSelectedFiles((prev) => [
        ...prev,
        ...Array.from(e.target.files || []),
      ]);
    }
  };

  // ログイン前、または読み込み中の表示
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loader">読み込み中...</div>
      </div>
    );
  }

  // 未ログイン時はリダイレクト（useEffectで処理済み）
  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen">
      <Header />

      <div className="container mx-auto px-4 py-8">
        {/* AWS認証情報の警告 */}
        {!isAwsConfigured && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-8">
            <p className="font-bold">AWS設定の注意</p>
            <p>
              AWS認証情報が設定されていないため、S3ストレージの機能が制限されています。
              <br />
              完全な機能を使用するには、.env.localファイルにAWS_ACCESS_KEY_IDとAWS_SECRET_ACCESS_KEYを設定してください。
            </p>
          </div>
        )}

        {/* アップロードエリア */}
        <div
          {...getRootProps()}
          className={`upload-zone mb-8 ${
            isDragActive ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : ""
          }`}
        >
          <input {...getInputProps()} />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12 text-gray-400 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-gray-600 dark:text-gray-400">
            写真をドラッグ&ドロップ、または
          </p>
          <button className="btn-primary mt-2">ファイルを選択</button>
        </div>

        {/* 選択した写真のプレビュー表示 */}
        {selectedFiles.length > 0 && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">選択した写真</h2>
              <button onClick={handleUploadFiles} className="btn-primary">
                アップロード ({selectedFiles.length}枚)
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {selectedFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="aspect-square">
                  <PhotoPreview
                    file={file}
                    onRemove={() => removeSelectedFile(index)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* アップロード進捗状況の表示 */}
        {uploadingFiles.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">アップロード中</h2>
            <div className="space-y-2">
              {uploadingFiles.map((file, index) => {
                const fileId = `${file.name}-${Date.now()}`;
                const progress = uploadProgress[fileId] || 0;
                return (
                  <UploadProgress
                    key={index}
                    fileName={file.name}
                    progress={progress}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* エラーメッセージ */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* 写真一覧 */}
        <h1 className="text-2xl font-bold mb-6">マイフォト</h1>

        {isLoading && photos.length === 0 ? (
          <div className="text-center py-8">
            <div className="loader">写真を読み込み中...</div>
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">
              写真がありません。写真をアップロードしてください。
            </p>
          </div>
        ) : (
          <div className="photo-grid">
            {photos.map((photo, index) => (
              <PhotoCard key={photo.key} photo={photo} userId={user.uid} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
