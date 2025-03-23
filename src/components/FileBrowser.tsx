import React, { useState, useEffect, useCallback } from "react";
import { S3ClientAPI } from "@/lib/s3";
import Image from "next/image";
import FileCard, { FileInfo } from "./FileCard";

// ディレクトリツリーのアイテム型
type DirectoryItem = {
  path: string;
  name: string;
  type: "directory" | "file";
  children?: DirectoryItem[];
  isExpanded?: boolean;
};

// 画像キャッシュの型
type ImageCache = {
  [key: string]: {
    url: string;
    timestamp: number; // キャッシュ作成時のタイムスタンプ
    priority: number; // キャッシュの優先度 (高いほど優先)
  };
};

// キャッシュの有効期限（1時間 = 3600000ミリ秒）
const CACHE_EXPIRY = 3600000;
// キャッシュの最大サイズ (項目数)
const MAX_CACHE_SIZE = 100;

interface FileBrowserProps {
  userId: string;
}

const FileBrowser: React.FC<FileBrowserProps> = ({ userId }) => {
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<string>("");
  // 画像URLキャッシュ
  const [imageCache, setImageCache] = useState<ImageCache>({});
  // プレビューポップアップの表示状態
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  // プリフェッチするファイルの最大数
  const MAX_PREFETCH = 5;
  // サムネイルの有効期限（短く設定して頻繁に更新 - 5分）
  const THUMBNAIL_EXPIRY = 300000;

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

  // キャッシュから画像URLを取得するヘルパー関数
  const getCachedImageUrl = useCallback(
    (fileKey: string, isThumbnail: boolean = false): string | null => {
      const cachedImage = imageCache[fileKey];
      if (!cachedImage) return null;

      // キャッシュが有効期限内かチェック
      const now = Date.now();
      const expiry = isThumbnail ? THUMBNAIL_EXPIRY : CACHE_EXPIRY;

      if (now - cachedImage.timestamp > expiry) {
        // キャッシュが期限切れなら削除
        const newCache = { ...imageCache };
        delete newCache[fileKey];
        setImageCache(newCache);
        return null;
      }

      // キャッシュヒット時は優先度を上げる
      updateCachePriority(fileKey);

      return cachedImage.url;
    },
    [imageCache]
  );

  // キャッシュの優先度を更新
  const updateCachePriority = useCallback(
    (fileKey: string) => {
      if (!imageCache[fileKey]) return;

      setImageCache((prevCache) => {
        const updatedCache = { ...prevCache };
        updatedCache[fileKey] = {
          ...updatedCache[fileKey],
          priority: updatedCache[fileKey].priority + 1,
          timestamp: Date.now(), // 最終アクセス時刻も更新
        };
        return updatedCache;
      });
    },
    [imageCache]
  );

  // 画像URLをキャッシュに保存するヘルパー関数
  const cacheImageUrl = useCallback(
    (fileKey: string, url: string, priority: number = 1) => {
      setImageCache((prevCache) => {
        // キャッシュサイズが上限に達した場合、優先度の低いアイテムを削除
        if (Object.keys(prevCache).length >= MAX_CACHE_SIZE) {
          const sortedEntries = Object.entries(prevCache).sort(
            ([, a], [, b]) => a.priority - b.priority
          );
          const newCache = { ...prevCache };
          // 優先度の低いアイテムから20%程度削除
          const removeCount = Math.ceil(MAX_CACHE_SIZE * 0.2);
          for (let i = 0; i < removeCount && i < sortedEntries.length; i++) {
            delete newCache[sortedEntries[i][0]];
          }

          return {
            ...newCache,
            [fileKey]: {
              url,
              timestamp: Date.now(),
              priority,
            },
          };
        }

        return {
          ...prevCache,
          [fileKey]: {
            url,
            timestamp: Date.now(),
            priority,
          },
        };
      });
    },
    []
  );

  // ディレクトリの展開/折りたたみとファイル一覧の表示
  const toggleDirectory = async (path: string) => {
    try {
      // まずディレクトリの状態を反転
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

      // ディレクトリが展開される場合、内容を取得
      const dirToExpand = findDirectory(directories, path);
      const isExpandingDir = dirToExpand && !dirToExpand.isExpanded;

      // 子ディレクトリを取得して表示
      if (isExpandingDir) {
        let childItems: DirectoryItem[] = [];
        const pathParts = path.split("/").filter(Boolean);

        console.log("Expanding directory:", path);
        console.log("Path parts:", pathParts);

        try {
          // 階層レベルに応じた処理
          if (pathParts.length === 3) {
            // ファイルタイプディレクトリ (user/userId/jpg/)
            // → 年ディレクトリを表示
            const dirContents = await S3ClientAPI.listDirectoryFiles(path);

            // 年ディレクトリを抽出
            const yearDirs = new Map<string, boolean>();

            for (const item of dirContents) {
              if (item.Key && item.Key.includes("/")) {
                const keyParts = item.Key.split("/");
                if (keyParts.length > 3) {
                  // 数字4桁で年を判定
                  const potentialYear = keyParts[3];
                  if (
                    /^\d{4}$/.test(potentialYear) &&
                    !yearDirs.has(potentialYear)
                  ) {
                    yearDirs.set(potentialYear, true);
                    childItems.push({
                      path: `${path}${potentialYear}/`,
                      name: potentialYear,
                      type: "directory",
                      children: [],
                      isExpanded: false,
                    });
                  }
                }
              }
            }
          } else if (pathParts.length === 4) {
            // 年ディレクトリ (user/userId/jpg/2025/)
            // → 月ディレクトリを表示
            const dirContents = await S3ClientAPI.listDirectoryFiles(path);

            // 月ディレクトリを抽出
            const monthDirs = new Map<string, boolean>();

            for (const item of dirContents) {
              if (item.Key && item.Key.includes("/")) {
                const keyParts = item.Key.split("/");
                if (keyParts.length > 4) {
                  // 数字2桁で月を判定
                  const potentialMonth = keyParts[4];
                  if (
                    /^\d{2}$/.test(potentialMonth) &&
                    !monthDirs.has(potentialMonth)
                  ) {
                    monthDirs.set(potentialMonth, true);
                    childItems.push({
                      path: `${path}${potentialMonth}/`,
                      name: potentialMonth,
                      type: "directory",
                      children: [],
                      isExpanded: false,
                    });
                  }
                }
              }
            }
          } else if (pathParts.length === 5) {
            // 月ディレクトリ (user/userId/jpg/2025/03/)
            // → 日ディレクトリを表示
            const dirContents = await S3ClientAPI.listDirectoryFiles(path);

            // 日ディレクトリを抽出
            const dayDirs = new Map<string, boolean>();

            for (const item of dirContents) {
              if (item.Key && item.Key.includes("/")) {
                const keyParts = item.Key.split("/");
                if (keyParts.length > 5) {
                  // 数字2桁で日を判定
                  const potentialDay = keyParts[5];
                  if (
                    /^\d{2}$/.test(potentialDay) &&
                    !dayDirs.has(potentialDay)
                  ) {
                    dayDirs.set(potentialDay, true);
                    childItems.push({
                      path: `${path}${potentialDay}/`,
                      name: potentialDay,
                      type: "directory",
                      children: [],
                      isExpanded: false,
                    });
                  }
                }
              }
            }
          } else {
            // その他の階層
            const response = await S3ClientAPI.listDirectoryFiles(path);

            // 通常のディレクトリ処理
            const dirPaths = new Set<string>();
            for (const item of response) {
              if (!item.Key || !item.Key.endsWith("/")) continue;

              const itemPath = item.Key;
              const itemParts = itemPath.split("/").filter(Boolean);
              const depth = pathParts.length;

              // 直下のディレクトリのみを対象
              if (itemParts.length === depth + 1) {
                const dirName = itemParts[depth];
                const dirPath = itemPath;

                if (!dirPaths.has(dirPath)) {
                  dirPaths.add(dirPath);
                  childItems.push({
                    path: dirPath,
                    name: dirName,
                    type: "directory",
                    children: [],
                    isExpanded: false,
                  });
                }
              }
            }
          }
        } catch (error) {
          console.error("子ディレクトリの取得エラー:", error);
        }

        console.log("Child items:", childItems);

        // 子ディレクトリ情報を更新
        setDirectories((prev) => {
          return prev.map((dir) => {
            if (dir.path === path) {
              return { ...dir, children: childItems };
            } else if (dir.children) {
              return {
                ...dir,
                children: updateDirectoryChildren(
                  dir.children,
                  path,
                  childItems
                ),
              };
            }
            return dir;
          });
        });
      }

      // ファイル一覧を読み込み
      loadDirectoryFiles(path);
    } catch (err) {
      console.error("ディレクトリ展開エラー:", err);
      setError("ディレクトリ展開中にエラーが発生しました。");
    }
  };

  // ディレクトリを検索
  const findDirectory = (
    items: DirectoryItem[],
    path: string
  ): DirectoryItem | undefined => {
    for (const item of items) {
      if (item.path === path) {
        return item;
      }
      if (item.children) {
        const found = findDirectory(item.children, path);
        if (found) return found;
      }
    }
    return undefined;
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

  // 子ディレクトリの更新
  const updateDirectoryChildren = (
    children: DirectoryItem[],
    path: string,
    newChildren: DirectoryItem[]
  ): DirectoryItem[] => {
    return children.map((child) => {
      if (child.path === path) {
        return { ...child, children: newChildren };
      } else if (child.children) {
        return {
          ...child,
          children: updateDirectoryChildren(child.children, path, newChildren),
        };
      }
      return child;
    });
  };

  // ファイル一覧を取得
  const loadDirectoryFiles = async (path: string) => {
    // 現在のパスを設定
    setCurrentPath(path);

    // 現在選択中のファイルの情報を保持
    const currentFileKey = selectedFile?.key || null;
    const currentFileUrl = selectedFile?.url || null;

    // まだロード中でなければロード中状態にする
    if (!isLoading) {
      setIsLoading(true);
    }

    try {
      const response = await S3ClientAPI.listDirectoryFiles(path);

      // ファイル情報の整形
      const fileInfos: FileInfo[] = [];
      let currentFileStillExists = false;
      const jpegFiles: FileInfo[] = [];

      for (const item of response) {
        if (!item.Key || item.Key.endsWith("/")) continue; // ディレクトリをスキップ

        const name = item.Key.split("/").pop() || "";
        const isJpg = /\.(jpg|jpeg)$/i.test(name);

        // 現在選択中のファイルがこのディレクトリに存在するか確認
        if (currentFileKey === item.Key) {
          currentFileStillExists = true;
        }

        // ファイルパスから撮影日を抽出する試み
        // パスの形式は通常 user/{userId}/{fileType}/{YYYY}/{MM}/{DD}/{fileName} となっているはず
        let takenDate: Date | undefined = undefined;
        const pathParts = item.Key.split("/");

        // パスからの撮影日取得を試みる（ディレクトリ構造に依存）
        if (pathParts.length >= 6) {
          const yearStr = pathParts[pathParts.length - 4];
          const monthStr = pathParts[pathParts.length - 3];
          const dayStr = pathParts[pathParts.length - 2];

          // 日付としてパース可能か確認
          if (
            /^\d{4}$/.test(yearStr) &&
            /^\d{2}$/.test(monthStr) &&
            /^\d{2}$/.test(dayStr)
          ) {
            const year = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10) - 1; // JavaScriptの月は0始まり
            const day = parseInt(dayStr, 10);

            // 有効な日付の範囲かチェック
            if (
              year >= 1900 &&
              year <= 9999 &&
              month >= 0 &&
              month <= 11 &&
              day >= 1 &&
              day <= 31
            ) {
              takenDate = new Date(year, month, day);
            }
          }
        }

        const fileInfo: FileInfo = {
          key: item.Key,
          name,
          size: item.Size || 0,
          lastModified: item.LastModified || new Date(),
          isSelected: selectedFiles.some((f) => f.key === item.Key),
          takenDate, // 撮影日を追加
        };

        fileInfos.push(fileInfo);

        // JPGファイルのリストを作成（先読み用）
        if (isJpg) {
          jpegFiles.push(fileInfo);
        }
      }

      // 現在選択中のファイルとの関係に基づいて状態更新
      if (currentFileKey && currentFileUrl) {
        if (currentFileStillExists) {
          // 選択中ファイルがこのディレクトリにもある場合はそのまま保持
          const currentFile = fileInfos.find(
            (file) => file.key === currentFileKey
          );
          if (currentFile) {
            setSelectedFile({ ...currentFile, url: currentFileUrl });
          }
        } else {
          // 別のディレクトリに移動した場合は慎重に更新
          // もし画像表示中なら状態を保持し、ユーザーが明示的に選択するまで表示を維持
          // setSelectedFile(null); // この行をコメントアウトして、プレビューを維持
        }
      }

      // ファイルリストを更新
      setFiles(fileInfos);

      // 選択中のファイルリストを更新（既存の選択状態を維持）
      setSelectedFiles((prev) => {
        // 現在のディレクトリに存在するファイルのみ選択状態を保持
        return prev.filter((f) =>
          fileInfos.some((newFile) => newFile.key === f.key)
        );
      });

      // JPGファイルの先読み（最初の数枚のみ）
      prefetchImages(jpegFiles.slice(0, MAX_PREFETCH));
    } catch (err) {
      console.error("ファイル一覧の読み込みエラー:", err);
      setError("ファイル一覧の読み込み中にエラーが発生しました。");
    } finally {
      setIsLoading(false);
    }
  };

  // 画像の先読み処理
  const prefetchImages = useCallback(
    async (files: FileInfo[]) => {
      for (const file of files) {
        try {
          // すでにキャッシュにある場合はスキップ
          if (getCachedImageUrl(file.key)) continue;

          // バックグラウンドでURLを取得してキャッシュ
          const imageUrl = await S3ClientAPI.getSignedImageUrl(file.key);
          // 優先度を低く設定（先読みは優先度低め）
          cacheImageUrl(file.key, imageUrl, 0);
        } catch (error) {
          // 先読み中のエラーは無視（ユーザー体験に影響しないため）
          console.warn(`画像先読みエラー: ${file.key}`, error);
        }
      }
    },
    [getCachedImageUrl, cacheImageUrl]
  );

  // ファイルをクリックしたときの処理
  const handleFileClick = async (file: FileInfo) => {
    // 画像ファイルの場合はプレビュー表示
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);

    if (isImage) {
      try {
        // キャッシュから画像URLをチェック
        let imageUrl = getCachedImageUrl(file.key);

        // キャッシュにない場合はS3から取得
        if (!imageUrl) {
          console.log(`キャッシュミス: ${file.key} のURLを取得します`);

          // 読み込み中のプレビューをすぐに表示
          setSelectedFile({ ...file, url: "", isLoading: true });
          // プレビューポップアップを表示
          setIsPreviewOpen(true);

          imageUrl = await S3ClientAPI.getSignedImageUrl(file.key);
          // 取得したURLをキャッシュに保存（優先度高め）
          cacheImageUrl(file.key, imageUrl, 5);
        } else {
          console.log(
            `キャッシュヒット: ${file.key} のURLをキャッシュから使用します`
          );
        }

        setSelectedFile({ ...file, url: imageUrl, isLoading: false });
        // プレビューポップアップを表示
        setIsPreviewOpen(true);

        // 選択された画像の周辺画像も先読み
        const currentIndex = files.findIndex((f) => f.key === file.key);
        if (currentIndex >= 0) {
          const surroundingFiles: FileInfo[] = [];

          // 前後2枚ずつ（計4枚）の画像を先読み
          for (let i = 1; i <= 2; i++) {
            if (currentIndex + i < files.length) {
              const nextFile = files[currentIndex + i];
              if (/\.(jpg|jpeg|png|gif|webp)$/i.test(nextFile.name)) {
                surroundingFiles.push(nextFile);
              }
            }

            if (currentIndex - i >= 0) {
              const prevFile = files[currentIndex - i];
              if (/\.(jpg|jpeg|png|gif|webp)$/i.test(prevFile.name)) {
                surroundingFiles.push(prevFile);
              }
            }
          }

          // バックグラウンドで先読み
          if (surroundingFiles.length > 0) {
            prefetchImages(surroundingFiles);
          }
        }
      } catch (err) {
        console.error("ファイルURLの取得エラー:", err);
        setError("ファイルの表示中にエラーが発生しました。");
        if (selectedFile?.isLoading) {
          setSelectedFile((prev) =>
            prev ? { ...prev, isLoading: false } : null
          );
        }
      }
    }

    // ファイル選択状態の切り替え - 削除（モーダルを開くとき選択しない）
    // toggleFileSelection(file);
  };

  // チェックボックス変更時の処理
  const handleCheckboxChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    file: FileInfo
  ) => {
    e.stopPropagation();
    toggleFileSelection(file);
  };

  // ファイル選択の切り替え
  const toggleFileSelection = (file: FileInfo) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.key === file.key ? { ...f, isSelected: !f.isSelected } : f
      )
    );

    setSelectedFiles((prev) => {
      const isAlreadySelected = prev.some((f) => f.key === file.key);
      if (isAlreadySelected) {
        return prev.filter((f) => f.key !== file.key);
      } else {
        return [...prev, file];
      }
    });
  };

  // 日時からファイル名を生成する関数
  const getTimestampFileName = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `photos_${year}${month}${day}_${hours}${minutes}${seconds}`;
  };

  // 選択されたファイルのダウンロード
  const handleSelectedFilesDownload = async () => {
    if (selectedFiles.length === 0) return;

    setIsDownloading(true);
    setDownloadProgress("準備中...");

    try {
      // 単一ファイルの場合
      if (selectedFiles.length === 1) {
        setDownloadProgress("ファイルをダウンロード中...");
        await handleFileDownload(selectedFiles[0]);
      }
      // 複数ファイルの場合は並列ダウンロードを使用
      else {
        setDownloadProgress("複数のファイルをダウンロード中...");

        // ファイルキーの配列を作成
        const keys = selectedFiles.map((file) => file.key);

        // 日時を元にしたZIPファイル名を生成
        const zipFileName = getTimestampFileName();

        // 並列ダウンロード実行
        const blob = await S3ClientAPI.downloadMultipleFiles(keys, zipFileName);

        // ダウンロードリンクの作成
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${zipFileName}.zip`;
        document.body.appendChild(a);
        a.click();

        // クリーンアップ
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error("ファイルダウンロードエラー:", err);
      setError("ファイルのダウンロード中にエラーが発生しました。");
    } finally {
      setIsDownloading(false);
      setDownloadProgress("");
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
      setIsDownloading(true);
      setDownloadProgress("ディレクトリをダウンロード中...");

      const blob = await S3ClientAPI.downloadDirectory(path);

      // ディレクトリ名と日時を組み合わせたファイル名を生成
      const pathParts = path.split("/");
      const dirType = pathParts[pathParts.length - 2] || "directory";
      const zipFileName = `${dirType}_${getTimestampFileName()}`;

      // ダウンロードリンクの作成
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${zipFileName}.zip`;
      document.body.appendChild(a);
      a.click();

      // クリーンアップ
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("ディレクトリダウンロードエラー:", err);
      setError("ディレクトリのダウンロード中にエラーが発生しました。");
    } finally {
      setIsDownloading(false);
      setDownloadProgress("");
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
        {items.map((item) => {
          // 子ディレクトリがあるかどうかを確認
          const hasChildren = item.children && item.children.length > 0;
          // ルートレベルのディレクトリかどうか確認（パスの形式で判断）
          const isRootLevelDir = item.path.split("/").length <= 4; // user/userId/fileType/ の形式
          // 現在表示中のパスかどうかを確認
          const isCurrentPath = item.path === currentPath;

          // 三角形を表示すべきかどうか判定
          const shouldShowTriangle = isRootLevelDir || hasChildren;

          return (
            <li key={item.path} className="py-1">
              <div className="flex items-center">
                <button
                  onClick={() => toggleDirectory(item.path)}
                  className={`flex items-center ${
                    isCurrentPath ? "text-blue-500" : "hover:text-blue-500"
                  }`}
                >
                  {/* ルートディレクトリまたは子ディレクトリがある場合は三角形を表示 */}
                  {shouldShowTriangle && (
                    <span className="mr-1">{item.isExpanded ? "▼" : "▶"}</span>
                  )}
                  <span>{item.name}</span>
                </button>
                {/* ダウンロードボタンを削除 */}
              </div>

              {item.isExpanded &&
                item.children &&
                item.children.length > 0 &&
                renderDirectoryTree(item.children)}
            </li>
          );
        })}
      </ul>
    );
  };

  // プレビューモーダルを閉じる
  const closePreview = () => {
    setIsPreviewOpen(false);
  };

  // モーダル外のクリックでプレビューを閉じる
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closePreview();
    }
  };

  // キーボードイベントでプレビューを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPreviewOpen) {
        closePreview();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPreviewOpen]);

  return (
    <div className="flex flex-col md:flex-row h-[600px]">
      {/* 左側のサイドバー（ディレクトリツリー） */}
      <div className="w-full md:w-64 bg-gray-100 dark:bg-gray-800 p-4 overflow-y-auto">
        <h2 className="text-lg font-medium mb-4">ファイル階層</h2>

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
        {/* 選択ファイルのアクション */}
        {selectedFiles.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-medium">
                  {selectedFiles.length}個のファイルを選択中
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  (合計:{" "}
                  {formatFileSize(
                    selectedFiles.reduce((sum, file) => sum + file.size, 0)
                  )}
                  )
                </span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleSelectedFilesDownload}
                  className={`px-3 py-1 ${
                    isDownloading
                      ? "bg-blue-300 cursor-not-allowed"
                      : "bg-blue-500 hover:bg-blue-600"
                  } text-white rounded`}
                  disabled={isDownloading}
                >
                  {isDownloading ? downloadProgress : "ダウンロード"}
                </button>
                <button
                  onClick={() => {
                    setFiles((prev) =>
                      prev.map((f) => ({ ...f, isSelected: false }))
                    );
                    setSelectedFiles([]);
                  }}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  disabled={isDownloading}
                >
                  選択解除
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ファイル一覧 */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium">ファイル</h2>
            {files.length > 0 && (
              <button
                onClick={() => {
                  // 表示されている画像をすべて選択
                  const allSelected = files.every((file) => file.isSelected);

                  // すべて選択済みの場合は選択解除、そうでなければすべて選択
                  setFiles((prev) =>
                    prev.map((f) => ({ ...f, isSelected: !allSelected }))
                  );

                  if (allSelected) {
                    // すべて選択解除
                    setSelectedFiles([]);
                  } else {
                    // すべて選択
                    setSelectedFiles([...files]);
                  }
                }}
                className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm"
                disabled={isDownloading}
              >
                {files.every((file) => file.isSelected)
                  ? "すべて選択解除"
                  : "すべて選択"}
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="text-gray-500">読み込み中...</div>
          ) : error ? (
            <div className="text-red-500">{error}</div>
          ) : files.length === 0 ? (
            <div className="text-gray-500">ファイル階層を選択してください</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {files.map((file) => (
                <FileCard
                  key={file.key}
                  file={file}
                  onClick={() => handleFileClick(file)}
                  onCheckboxChange={(e) => handleCheckboxChange(e, file)}
                  formatFileSize={formatFileSize}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 画像プレビューモーダル */}
      {isPreviewOpen && selectedFile && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={handleBackdropClick}
        >
          <div className="relative bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* モーダルヘッダー */}
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-medium">{selectedFile.name}</h3>
              <button
                onClick={closePreview}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
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

            {/* モーダルコンテンツ */}
            <div className="relative h-[70vh] bg-gray-200 dark:bg-gray-700 overflow-hidden">
              {selectedFile.isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
              ) : selectedFile.url ? (
                <Image
                  src={selectedFile.url}
                  alt={selectedFile.name}
                  fill
                  className="object-contain"
                  sizes="(max-width: 1024px) 100vw, 75vw"
                  priority={true}
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  画像を読み込めませんでした
                </div>
              )}
            </div>

            {/* モーダルフッター */}
            <div className="p-4 border-t">
              <div className="flex items-center">
                <div>
                  {formatFileSize(selectedFile.size)} •{" "}
                  {selectedFile.lastModified.toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileBrowser;
