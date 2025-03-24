"use client";

import React, { useState, useRef, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "react-hot-toast";
import { uploadFile } from "@/lib/s3";
import {
  checkStorageLimit,
  updateStorageUsed,
} from "@/lib/subscriptionService";
import exifr from "exifr";
import { format } from "date-fns";

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  error: string | null;
}

interface FileUploaderProps {
  userId: string;
  onUploadComplete?: () => void;
}

export default function FileUploader({
  userId,
  onUploadComplete,
}: FileUploaderProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // EXIF情報からS3パスを決定
  const determineS3Path = async (file: File, userId: string) => {
    let dateFolder;

    try {
      // 画像ファイルからEXIF情報を抽出
      const exifData = await exifr.parse(file);

      if (exifData?.DateTimeOriginal || exifData?.CreateDate) {
        // EXIF日付がある場合はそれを使用
        const exifDate = exifData.DateTimeOriginal || exifData.CreateDate;
        dateFolder = format(new Date(exifDate), "yyyy/MM/dd");
      } else if (file.lastModified) {
        // EXIF日付がない場合はファイルの最終更新日を使用
        dateFolder = format(new Date(file.lastModified), "yyyy/MM/dd");
      } else {
        // どちらもない場合は現在日時を使用
        dateFolder = format(new Date(), "yyyy/MM/dd");
      }
    } catch (error) {
      // EXIF読み取りエラー時は現在日時を使用
      console.error("EXIF読み取りエラー:", error);
      dateFolder = format(new Date(), "yyyy/MM/dd");
    }

    // ファイル拡張子を取得
    const extension = file.name.split(".").pop()?.toLowerCase() || "";

    // 拡張子に基づいてフォルダ分け
    let typeFolder;
    if (["jpg", "jpeg"].includes(extension)) {
      typeFolder = "jpg";
    } else if (
      ["dng", "cr2", "nef", "arw", "rw2", "orf", "raf", "raw"].includes(
        extension
      )
    ) {
      typeFolder = "raw";
    } else {
      typeFolder = "other";
    }

    return `users/${userId}/${typeFolder}/${dateFolder}/${file.name}`;
  };

  // ファイルアップロード処理
  const handleUpload = async (file: File) => {
    if (!file || !userId) return;

    try {
      // ストレージ制限のチェック
      const hasEnoughStorage = await checkStorageLimit(userId, file.size);
      if (!hasEnoughStorage) {
        toast.error(
          "ストレージ容量が不足しています。プランをアップグレードしてください。"
        );
        return;
      }

      // アップロード中のファイルを追跡
      const fileId = Date.now().toString();
      setUploadingFiles((prev) => [
        ...prev,
        { id: fileId, file, progress: 0, error: null },
      ]);

      // EXIF情報を取得してアップロードパスを決定
      const s3Path = await determineS3Path(file, userId);

      // S3にアップロード
      await uploadFile(file, s3Path, (progress) => {
        setUploadingFiles((prev) =>
          prev.map((item) =>
            item.id === fileId ? { ...item, progress } : item
          )
        );
      });

      // ストレージ使用量の更新
      await updateStorageUsed(userId, file.size);

      // アップロード完了
      toast.success(`${file.name} のアップロードが完了しました`);

      // アップロード完了後に一覧を更新
      if (onUploadComplete) {
        onUploadComplete();
      }

      // アップロード完了したら一定時間後にリストから削除
      setTimeout(() => {
        setUploadingFiles((prev) => prev.filter((item) => item.id !== fileId));
      }, 3000);
    } catch (error) {
      console.error("アップロードエラー:", error);
      toast.error("アップロードに失敗しました");
    }
  };

  // ドロップゾーン設定
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      acceptedFiles.forEach((file) => {
        handleUpload(file);
      });
    },
    [userId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/x-adobe-dng": [".dng"],
      "image/x-canon-cr2": [".cr2"],
      "image/x-nikon-nef": [".nef"],
      "image/x-sony-arw": [".arw"],
      "image/x-panasonic-rw2": [".rw2"],
      "image/x-olympus-orf": [".orf"],
      "image/x-fujifilm-raf": [".raf"],
      "application/octet-stream": [".raw"],
    },
  });

  // ファイル選択ボタンクリック
  const handleButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // アップロード中ファイルの進捗表示
  const renderUploadProgress = () => {
    return uploadingFiles.map((file) => (
      <div
        key={file.id}
        className="bg-gray-100 dark:bg-gray-800 p-3 my-2 rounded-lg"
      >
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium truncate max-w-[200px]">
            {file.file.name}
          </span>
          <span className="text-sm">{Math.round(file.progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
          <div
            className="bg-blue-600 h-2.5 rounded-full"
            style={{ width: `${file.progress}%` }}
          ></div>
        </div>
      </div>
    ));
  };

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
            : "border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/10"
        }`}
      >
        <input {...getInputProps()} ref={fileInputRef} />
        <div className="flex flex-col items-center justify-center space-y-2">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            ></path>
          </svg>
          <p className="text-lg font-medium">
            {isDragActive
              ? "ここにドロップしてください"
              : "クリックまたはドラッグでファイルをアップロード"}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            サポートファイル: JPG, DNG, CR2, NEF, ARW, RW2, ORF, RAF, RAW
          </p>
        </div>
      </div>

      <div className="mt-4">
        <button
          onClick={handleButtonClick}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
        >
          ファイルを選択
        </button>
      </div>

      {uploadingFiles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-medium mb-2">アップロード進捗</h3>
          {renderUploadProgress()}
        </div>
      )}
    </div>
  );
}
