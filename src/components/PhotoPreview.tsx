"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";

interface PhotoPreviewProps {
  file: File;
  onRemove: () => void;
}

const PhotoPreview: React.FC<PhotoPreviewProps> = ({ file, onRemove }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    // FileオブジェクトからURLを生成
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // コンポーネントのアンマウント時にURLを解放
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  if (!previewUrl) {
    return (
      <div className="bg-gray-200 dark:bg-gray-700 w-full h-full animate-pulse"></div>
    );
  }

  return (
    <div className="relative w-full h-full group">
      <Image
        src={previewUrl}
        alt={file.name}
        fill
        className="object-cover rounded-lg"
      />
      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
        <button
          onClick={onRemove}
          className="bg-red-500 text-white p-2 rounded-full"
          aria-label="写真を削除"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs truncate p-1">
        {file.name}
      </div>
    </div>
  );
};

export default PhotoPreview;
