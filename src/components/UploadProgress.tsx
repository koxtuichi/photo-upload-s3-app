"use client";

import React from "react";

interface UploadProgressProps {
  fileName: string;
  progress: number;
}

const UploadProgress: React.FC<UploadProgressProps> = ({
  fileName,
  progress,
}) => {
  // ファイル名が長すぎる場合は省略
  const truncatedFileName =
    fileName.length > 25 ? fileName.substring(0, 22) + "..." : fileName;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm p-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {truncatedFileName}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {progress}%
        </span>
      </div>

      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {progress === 100 && (
        <div className="text-xs text-green-500 mt-1">完了</div>
      )}
    </div>
  );
};

export default UploadProgress;
