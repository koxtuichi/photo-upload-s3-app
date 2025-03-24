"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { useAuthContext } from "@/providers/AuthProvider";
import { usePhotoStore } from "@/store/photoStore";
import UploadProgress from "@/components/UploadProgress";
import PhotoPreview from "@/components/PhotoPreview";
import FileBrowser from "@/components/FileBrowser";
import { toast } from "react-hot-toast";

// AWS認証情報のチェック
const isAwsConfigured =
  typeof process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID === "string" &&
  process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID.length > 0 &&
  typeof process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY === "string" &&
  process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY.length > 0;

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuthContext();
  const { error, uploadPhoto } = usePhotoStore();

  // 選択した写真ファイルの配列
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  // アップロード中のファイル
  const [uploadingFiles, setUploadingFiles] = useState<
    (File & { fileId: string; fileName: string })[]
  >([]);
  // アップロード進捗
  const [uploadProgress, setUploadProgress] = useState<{
    [key: string]: number;
  }>({});
  // ファイルブラウザのキー（アップロード後に更新する）
  const [fileBrowserKey, setFileBrowserKey] = useState<number>(0);

  // 認証状態をチェック
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);

  // ドラッグアンドドロップ用の設定
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".gif", ".webp"],
      "application/octet-stream": [
        ".pef",
        ".raw",
        ".arw",
        ".cr2",
        ".cr3",
        ".nef",
        ".nrw",
        ".orf",
        ".rw2",
        ".dng",
        ".raf",
        ".sr2",
        ".3fr",
        ".ari",
        ".bay",
        ".braw",
        ".cap",
        ".crw",
        ".dcr",
        ".dcs",
        ".erf",
        ".fff",
        ".mef",
        ".mrw",
        ".x3f",
      ],
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

    // ファイルとIDのマッピングを作成
    const filesToUpload = selectedFiles.map((file, index) => {
      // 固定されたユニークIDを作成 (現在時刻はファイルアップロード開始時に一度だけ取得)
      const timestamp = Date.now();
      const fileId = `file-${index}-${timestamp}`;
      // ファイル名を明示的に保存
      return { file, fileId, fileName: file.name };
    });

    // ファイル配列をセット（fileIdとfileNameを含める）
    setUploadingFiles(
      filesToUpload.map((item) => ({
        ...item.file,
        fileId: item.fileId,
        fileName: item.fileName, // ファイル名を明示的に保存
      })) as (File & { fileId: string; fileName: string })[]
    );

    // アップロード開始前にプレビューから削除
    setSelectedFiles([]);

    // 進捗表示の初期化
    const initialProgress = filesToUpload.reduce((acc, { fileId }) => {
      acc[fileId] = 1; // 1%から開始
      return acc;
    }, {} as Record<string, number>);
    setUploadProgress(initialProgress);

    // アップロード完了カウンター
    let completedFiles = 0;

    // 各ファイルを個別にアップロード
    for (const [index, { file, fileId }] of filesToUpload.entries()) {
      try {
        console.log(
          `アップロード開始: ${fileId} (${index + 1}/${filesToUpload.length})`
        );

        // 実際のアップロード処理（進捗コールバック付き）
        await uploadPhoto(user.uid, file, (progress) => {
          console.log(`進捗更新: ${fileId} -> ${progress}%`);
          // 進捗状況を更新
          setUploadProgress((prev) => ({ ...prev, [fileId]: progress }));
        });

        // アップロード完了をカウント
        completedFiles++;

        // アップロード完了後、少し待ってから進行状況をリストから削除
        setTimeout(() => {
          setUploadingFiles((prev) =>
            prev.filter((f) => "fileId" in f && f.fileId !== fileId)
          );
          setUploadProgress((prev) => {
            const newProgress = { ...prev };
            delete newProgress[fileId];
            return newProgress;
          });
        }, 1000);

        console.log(
          `アップロード完了: ${fileId} (${completedFiles}/${filesToUpload.length})`
        );
      } catch (error: any) {
        console.error("アップロードエラー:", error, fileId);

        // エラーメッセージを表示
        toast.error(error.message || "アップロードに失敗しました");

        // エラーが発生したファイルの進捗状況をリセット
        setUploadProgress((prev) => {
          const newProgress = { ...prev };
          delete newProgress[fileId];
          return newProgress;
        });

        // エラーが発生したファイルをリストから削除
        setTimeout(() => {
          setUploadingFiles((prev) =>
            prev.filter((f) => "fileId" in f && f.fileId !== fileId)
          );
        }, 1000);
      }
    }

    // ファイルブラウザを更新（キーを変更して強制的に再レンダリング）
    setFileBrowserKey((prev) => prev + 1);
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

        {/* アップロード中ファイルの進捗表示 */}
        {uploadingFiles.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">
              アップロード中 ({uploadingFiles.length}ファイル)
            </h2>
            <div className="space-y-2">
              {uploadingFiles.map((file, index) => {
                // fileIdを直接使用（ファイルオブジェクトに保存されています）
                const fileId = file.fileId;

                // fileIdがuploadProgressに存在するか確認
                if (!fileId || !(fileId in uploadProgress)) {
                  console.log("進捗情報なし:", file.name, fileId);
                  return null;
                }

                return (
                  <UploadProgress
                    key={fileId}
                    fileName={file.fileName || file.name} // ファイル名を使用（バックアップとして両方チェック）
                    progress={Number(uploadProgress[fileId]) || 0}
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

        {/* ファイルブラウザ */}
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-lg shadow-md p-4">
          <h2 className="text-2xl font-bold mb-6">ファイルブラウザ</h2>
          <FileBrowser key={fileBrowserKey} userId={user.uid} />
        </div>
      </div>
    </main>
  );
}
