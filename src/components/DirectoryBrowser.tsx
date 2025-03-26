import React, { useState, useEffect } from "react";
import { S3ClientAPI } from "@/lib/s3";
import Image from "next/image";
import { useRouter } from "next/router";

// ディレクトリツリーのアイテム型
type DirectoryItem = {
  path: string;
  name: string;
  type: "directory" | "file";
  children?: DirectoryItem[];
  isExpanded?: boolean;
};

// ファイル情報の型
type FileInfo = {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  url?: string;
};

interface DirectoryBrowserProps {
  userId: string;
}

const DirectoryBrowser: React.FC<DirectoryBrowserProps> = ({ userId }) => {
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  // ディレクトリツリーの読み込み
  useEffect(() => {
    const loadDirectoryTree = async () => {
      if (!userId) return;

      setIsLoading(true);
      try {
        const rootPrefix = `user/${userId}/`;
        const response = await S3ClientAPI.listUserDirectories(userId);

        // ディレクトリ構造を構築
        const directoryItems: DirectoryItem[] = [];

        // ファイルタイプディレクトリ（jpg, raw, etc.）
        for (const prefix of response) {
          if (!prefix.Prefix) continue;

          const path = prefix.Prefix;
          const parts = path.split("/");
          const fileType = parts[2]; // user/userId/fileType/

          // ファイルタイプディレクトリ
          const fileTypeDir: DirectoryItem = {
            path,
            name: fileType,
            type: "directory",
            children: [],
            isExpanded: false,
          };

          // 年月ディレクトリを取得
          const yearMonthResponse = await S3ClientAPI.listDirectoryFiles(path);
          const yearMonthDirs = new Set<string>();

          for (const item of yearMonthResponse) {
            if (!item.Key) continue;

            const itemPath = item.Key;
            const parts = itemPath.split("/");

            if (parts.length >= 4) {
              const yearMonth = parts[3]; // user/userId/fileType/yearMonth/
              const yearMonthPath = `${path}${yearMonth}/`;

              if (!yearMonthDirs.has(yearMonthPath)) {
                yearMonthDirs.add(yearMonthPath);

                if (fileTypeDir.children) {
                  fileTypeDir.children.push({
                    path: yearMonthPath,
                    name: yearMonth,
                    type: "directory",
                    isExpanded: false,
                  });
                }
              }
            }
          }

          directoryItems.push(fileTypeDir);
        }

        setDirectories(directoryItems);
      } catch (err) {
        console.error("ディレクトリツリーの読み込みエラー:", err);
        setError("ディレクトリツリーの読み込み中にエラーが発生しました。");
      } finally {
        setIsLoading(false);
      }
    };

    loadDirectoryTree();
  }, [userId]);

  // ディレクトリの展開/折りたたみ
  const toggleDirectory = (path: string) => {
    setDirectories((prev) => {
      return prev.map((dir) => {
        if (dir.path === path) {
          return { ...dir, isExpanded: !dir.isExpanded };
        } else if (dir.children) {
          return {
            ...dir,
            children: toggleDirectoryChildren(dir.children, path),
          };
        }
        return dir;
      });
    });
  };

  // 子ディレクトリの再帰的な展開/折りたたみ
  const toggleDirectoryChildren = (
    children: DirectoryItem[],
    path: string
  ): DirectoryItem[] => {
    return children.map((child) => {
      if (child.path === path) {
        return { ...child, isExpanded: !child.isExpanded };
      } else if (child.children) {
        return {
          ...child,
          children: toggleDirectoryChildren(child.children, path),
        };
      }
      return child;
    });
  };

  // ディレクトリ内のファイル一覧を取得
  const loadDirectoryFiles = async (path: string) => {
    setIsLoading(true);
    setCurrentPath(path);
    setSelectedFile(null);

    try {
      const response = await S3ClientAPI.listDirectoryFiles(path);

      // ファイル情報の整形
      const fileInfos: FileInfo[] = [];

      for (const item of response) {
        if (!item.Key || item.Key.endsWith("/")) continue; // ディレクトリをスキップ

        const name = item.Key.split("/").pop() || "";

        fileInfos.push({
          key: item.Key,
          name,
          size: item.Size || 0,
          lastModified: item.LastModified || new Date(),
        });
      }

      setFiles(fileInfos);
    } catch (err) {
      console.error("ファイル一覧の読み込みエラー:", err);
      setError("ファイル一覧の読み込み中にエラーが発生しました。");
    } finally {
      setIsLoading(false);
    }
  };

  // ファイルをクリックしたときの処理
  const handleFileClick = async (file: FileInfo) => {
    // 画像ファイルの場合はプレビュー表示
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);

    if (isImage) {
      try {
        const url = await S3ClientAPI.getSignedImageUrl(file.key);
        setSelectedFile({ ...file, url });
      } catch (err) {
        console.error("ファイルURLの取得エラー:", err);
        setError("ファイルの表示中にエラーが発生しました。");
      }
    } else {
      // 非画像ファイルの場合はダウンロード
      handleFileDownload(file);
    }
  };

  // ファイルのダウンロード
  const handleFileDownload = async (file: FileInfo) => {
    try {
      const blob = await S3ClientAPI.downloadFile(file.key);

      // ダウンロードリンクの作成
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();

      // クリーンアップ
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("ファイルダウンロードエラー:", err);
      setError("ファイルのダウンロード中にエラーが発生しました。");
    }
  };

  // ディレクトリのダウンロード
  const handleDirectoryDownload = async (path: string) => {
    try {
      const blob = await S3ClientAPI.downloadDirectory(path);

      // ディレクトリ名を抽出
      const pathParts = path.split("/");
      const dirName = pathParts[pathParts.length - 2] || "download";

      // ダウンロードリンクの作成
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dirName}.zip`;
      document.body.appendChild(a);
      a.click();

      // クリーンアップ
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("ディレクトリダウンロードエラー:", err);
      setError("ディレクトリのダウンロード中にエラーが発生しました。");
    }
  };

  // ファイルサイズのフォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // 再帰的なディレクトリツリーのレンダリング
  const renderDirectoryTree = (items: DirectoryItem[]) => {
    return (
      <ul className="pl-4">
        {items.map((item) => (
          <li key={item.path} className="py-1">
            <div className="flex items-center">
              <button
                onClick={() => {
                  toggleDirectory(item.path);
                  loadDirectoryFiles(item.path);
                }}
                className="flex items-center hover:text-blue-500"
              >
                <span className="mr-1">{item.isExpanded ? "▼" : "▶"}</span>
                <span>{item.name}</span>
              </button>
              <button
                onClick={() => handleDirectoryDownload(item.path)}
                className="ml-2 text-xs text-gray-500 hover:text-blue-500"
                title="ディレクトリをダウンロード"
              >
                ↓
              </button>
            </div>

            {item.isExpanded &&
              item.children &&
              item.children.length > 0 &&
              renderDirectoryTree(item.children)}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* 左側のサイドバー（ディレクトリツリー） */}
      <div className="w-full md:w-64 bg-gray-100 dark:bg-gray-800 p-4 overflow-y-auto">
        <h2 className="text-lg font-medium mb-4">ディレクトリ</h2>

        {isLoading && directories.length === 0 ? (
          <div className="text-gray-500">読み込み中...</div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : directories.length === 0 ? (
          <div className="text-gray-500">ディレクトリがありません</div>
        ) : (
          renderDirectoryTree(directories)
        )}
      </div>

      {/* 右側のコンテンツエリア（ファイル一覧とプレビュー） */}
      <div className="flex-1 p-4 overflow-y-auto">
        {/* パンくずリスト */}
        {currentPath && (
          <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            {currentPath.split("/").filter(Boolean).join(" / ")}
          </div>
        )}

        {/* ファイル一覧 */}
        <div className="mb-6">
          <h2 className="text-lg font-medium mb-4">ファイル</h2>

          {isLoading ? (
            <div className="text-gray-500">読み込み中...</div>
          ) : error ? (
            <div className="text-red-500">{error}</div>
          ) : files.length === 0 ? (
            <div className="text-gray-500">ファイルがありません</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {files.map((file) => (
                <div
                  key={file.key}
                  className="border rounded-lg overflow-hidden hover:shadow-md cursor-pointer"
                  onClick={() => handleFileClick(file)}
                >
                  <div className="p-4">
                    <div className="font-medium truncate">{file.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatFileSize(file.size)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {file.lastModified.toLocaleDateString()}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFileDownload(file);
                      }}
                      className="mt-2 px-3 py-1.5 flex items-center text-sm text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-full shadow-sm hover:shadow-md transition-all duration-200 transform hover:-translate-y-0.5"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 mr-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      ダウンロード
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ファイルプレビュー */}
        {selectedFile && selectedFile.url && (
          <div className="mt-6">
            <h2 className="text-lg font-medium mb-4">
              プレビュー: {selectedFile.name}
            </h2>
            <div className="relative h-96 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
              <Image
                src={selectedFile.url}
                alt={selectedFile.name}
                fill
                className="object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DirectoryBrowser;
