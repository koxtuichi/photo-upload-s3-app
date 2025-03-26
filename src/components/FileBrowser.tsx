import React, { useState, useEffect, useCallback } from "react";
import { S3ClientAPI } from "@/lib/s3";
import Image from "next/image";
import FileCard, { FileInfo } from "./FileCard";
import PhotoModal from "./PhotoModal";

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
  enableSelect?: boolean;
  onFileSelect?: (file: FileInfo) => void;
  initialPath?: string;
}

const FileBrowser: React.FC<FileBrowserProps> = ({
  userId,
  enableSelect = false,
  onFileSelect,
  initialPath,
}) => {
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // ストレージ使用量の状態
  const [storageUsage, setStorageUsage] = useState<{
    used: number;
    limit: number;
  }>({ used: 0, limit: 0 });
  // 画像URLキャッシュ
  const [imageCache, setImageCache] = useState<ImageCache>({});
  // プレビューポップアップの表示状態
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  // プリフェッチするファイルの最大数
  const MAX_PREFETCH = 5;
  // サムネイルの有効期限（短く設定して頻繁に更新 - 5分）
  const THUMBNAIL_EXPIRY = 300000;
  // アップロード完了後に自動リロードする間隔 (ミリ秒)
  const AUTO_RELOAD_INTERVAL = 5000;

  // 画像URLのキャッシュ
  const [imageUrlCache, setImageUrlCache] = useState<
    Record<string, { url: string; timestamp: number }>
  >({});

  // 画像URLをキャッシュに格納する関数
  const cacheImageUrl = (key: string, url: string, priority: number = 1) => {
    if (!key || !url) return;

    console.log(`URLをキャッシュに追加: ${key}`);
    setImageUrlCache((prev) => ({
      ...prev,
      [key]: {
        url: url,
        timestamp: Date.now(),
      },
    }));
  };

  // キャッシュから画像URLを取得する関数
  const getCachedImageUrl = (key: string): string => {
    if (!key) return "";
    return imageUrlCache[key]?.url || "";
  };

  // ファイル拡張子が RAW ファイルかどうかをチェック
  const isRawFile = (extension: string): boolean => {
    return /^(arw|cr2|cr3|nef|dng|orf|rw2|raf|x3f|pef|3fr|ari|bay|braw|cap|ce1|ce2|cib|craw|crw|dcr|dcs|drf|eip|erf|fff|gpr|iiq|k25|kc2|kdc|mdc|mef|mos|mrw|nex|ptx|pxn|r3d|ra2|rwl|srw)$/i.test(
      extension
    );
  };

  // 複数の画像を先読みする関数
  const prefetchImages = async (filesToPrefetch: FileInfo[]) => {
    console.log(`画像の先読み開始: ${filesToPrefetch.length}件`);

    // 先読み処理は非同期で実行
    for (const file of filesToPrefetch) {
      if (!file.key) continue;

      // 既にキャッシュにある場合はスキップ
      if (getCachedImageUrl(file.key)) {
        console.log(`キャッシュヒット(先読み): ${file.key}`);
        continue;
      }

      try {
        // ファイル拡張子の取得
        const fileExtension = file.key.split(".").pop()?.toLowerCase() || "";
        const isRaw = isRawFile(fileExtension);
        const isJpg = /jpg|jpeg/i.test(fileExtension);

        console.log(
          `先読み: ${file.key} (タイプ: ${
            isRaw ? "RAW" : isJpg ? "JPG" : "他"
          })`
        );

        let imageUrl = "";

        if (isRaw) {
          // RAWファイルのサムネイルパスを構築
          const pathParts = file.key.split("/");
          const fileName = pathParts[pathParts.length - 1];
          const fileNameWithoutExt = fileName.substring(
            0,
            fileName.lastIndexOf(".")
          );

          // サムネイルパスを構築
          const thumbnailPath = file.key
            .replace("/raw/", "/rawThumbnail/")
            .replace(/\/[^\/]+$/, `/${fileNameWithoutExt}_thumb.jpg`);

          try {
            imageUrl = await S3ClientAPI.getSignedImageUrl(thumbnailPath);
          } catch (error) {
            console.log(`先読みサムネイルエラー: ${error}`);

            // サムネイル取得に失敗した場合、JPGバージョンを試す
            try {
              const jpgPath = file.key
                .replace("/raw/", "/jpg/")
                .replace(/\.[^.]+$/, ".jpg");

              imageUrl = await S3ClientAPI.getSignedImageUrl(jpgPath);
            } catch (jpgError) {
              console.log(`先読みJPGエラー: ${jpgError}`);
              // JPGも取得できない場合はデフォルトアイコンを設定
              imageUrl = "/file.svg";
            }
          }
        } else if (isJpg) {
          // JPGファイルの場合：jpgThumbnailからサムネイルを取得
          const thumbnailPath = file.key
            .replace("/jpg/", "/jpgThumbnail/")
            .replace(/\.[^.]+$/, "_thumb.jpg");

          try {
            imageUrl = await S3ClientAPI.getSignedImageUrl(thumbnailPath);
          } catch (thumbError) {
            console.log(`先読みJPGサムネイルエラー: ${thumbError}`);
            // サムネイル取得に失敗した場合は元のファイルを使用
            imageUrl = await S3ClientAPI.getSignedImageUrl(file.key);
          }
        } else {
          // その他のファイルタイプは通常通り処理
          imageUrl = await S3ClientAPI.getSignedImageUrl(file.key);
        }

        // 取得したURLをキャッシュに保存（優先度低め）
        if (imageUrl && imageUrl !== "/file.svg") {
          cacheImageUrl(file.key, imageUrl, 1);
        }
      } catch (error) {
        console.error(`先読みエラー: ${file.key}`, error);
      }
    }
  };

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
          } else if (pathParts.length === 6) {
            // 日ディレクトリ (user/userId/jpg/2025/03/15/)
            // → ファイル一覧を表示するだけで良い（さらにサブディレクトリは表示しない）
            // ここでは特に何もせず、ファイル一覧の表示はloadDirectoryFilesで行われる
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

        // ファイルの拡張子からcontentTypeを推測
        let contentType = "application/octet-stream";
        const ext = name.toLowerCase().split(".").pop();
        if (ext) {
          switch (ext) {
            case "jpg":
            case "jpeg":
              contentType = "image/jpeg";
              break;
            case "png":
              contentType = "image/png";
              break;
            case "gif":
              contentType = "image/gif";
              break;
            case "webp":
              contentType = "image/webp";
              break;
            // RAWファイルの拡張子に対するcontentType
            case "arw":
              contentType = "image/x-sony-arw";
              break;
            case "cr2":
            case "cr3":
              contentType = "image/x-canon-cr2";
              break;
            case "nef":
              contentType = "image/x-nikon-nef";
              break;
            case "raf":
              contentType = "image/x-fuji-raf";
              break;
            case "rw2":
              contentType = "image/x-panasonic-rw2";
              break;
            case "orf":
              contentType = "image/x-olympus-orf";
              break;
            case "pef":
              contentType = "image/x-pentax-pef";
              break;
            case "dng":
              contentType = "image/x-adobe-dng";
              break;
            case "x3f":
              contentType = "image/x-sigma-x3f";
              break;
          }
        }

        // 現在選択中のファイルがこのディレクトリに存在するか確認
        if (currentFileKey === item.Key) {
          currentFileStillExists = true;
        }

        const fileInfo: FileInfo = {
          key: item.Key || "",
          size: item.Size || 0,
          lastModified: item.LastModified || new Date(),
          contentType: getContentTypeFromKey(item.Key || ""),
          url: "",
          isRawFile: isRawFile(item.Key || ""),
          isSelected: false,
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

  // ファイルクリック時の処理
  const handleFileClick = async (file: FileInfo) => {
    if (!file.key) return;

    try {
      // ファイルの種類を判別
      const fileExtension = file.key.split(".").pop()?.toLowerCase() || "";
      const isRaw = isRawFile(fileExtension);
      const isJpg = /jpg|jpeg/i.test(fileExtension);

      // 選択されたファイルを設定
      setSelectedFile({ ...file, isLoading: true });

      // ファイルURLをキャッシュから取得
      let imageUrl = getCachedImageUrl(file.key);

      if (!imageUrl) {
        console.log(`キャッシュミス: ${file.key} のURLを取得します`);

        // ファイル種別の判定
        console.log(`ファイル拡張子: ${fileExtension}`);

        // ファイルタイプの判定
        console.log(`ファイルタイプ: isRaw=${isRaw}, isJpg=${isJpg}`);

        if (isRaw) {
          // RAWファイルの場合：明示的にサムネイルパスを構築
          console.log(`RAWファイルのサムネイル取得開始: ${file.key}`);

          // ファイル名を取得
          const pathParts = file.key.split("/");
          const fileName = pathParts[pathParts.length - 1];
          const fileNameWithoutExt = fileName.substring(
            0,
            fileName.lastIndexOf(".")
          );

          // サムネイルパスを構築
          const thumbnailPath = file.key
            .replace("/raw/", "/rawThumbnail/")
            .replace(/\/[^\/]+$/, `/${fileNameWithoutExt}_thumb.jpg`);

          console.log(`構築したサムネイルパス: ${thumbnailPath}`);

          try {
            imageUrl = await S3ClientAPI.getSignedImageUrl(thumbnailPath);
            console.log(`取得したサムネイルURL: ${imageUrl}`);
          } catch (error) {
            console.error(`サムネイル取得エラー: ${error}`);

            // サムネイル取得に失敗した場合、JPGバージョンを試す
            try {
              const jpgPath = file.key
                .replace("/raw/", "/jpg/")
                .replace(/\.[^.]+$/, ".jpg");

              console.log(`対応するJPGパスを試す: ${jpgPath}`);
              imageUrl = await S3ClientAPI.getSignedImageUrl(jpgPath);
            } catch (jpgError) {
              console.error(`JPG取得エラー: ${jpgError}`);
              // JPGも取得できない場合はデフォルトアイコンを表示
              imageUrl = "/file.svg";
            }
          }
        } else if (isJpg) {
          // JPGファイルの場合：jpgThumbnailからサムネイルを取得
          const thumbnailPath = file.key
            .replace("/jpg/", "/jpgThumbnail/")
            .replace(/\.[^.]+$/, "_thumb.jpg");

          console.log(`JPGサムネイルパス: ${thumbnailPath}`);

          try {
            imageUrl = await S3ClientAPI.getSignedImageUrl(thumbnailPath);
          } catch (thumbError) {
            console.error(`JPGサムネイル取得エラー: ${thumbError}`);
            // サムネイル取得に失敗した場合は元のファイルを使用
            imageUrl = await S3ClientAPI.getSignedImageUrl(file.key);
          }
        } else {
          // それ以外のファイルは通常通り取得
          imageUrl = await S3ClientAPI.getSignedImageUrl(file.key);
        }

        // 取得したURLをキャッシュに保存（優先度高め）
        if (imageUrl && imageUrl !== "/file.svg") {
          cacheImageUrl(file.key, imageUrl, 5);
        }
      } else {
        console.log(
          `キャッシュヒット: ${file.key} のURLをキャッシュから使用します`
        );

        // キャッシュのURLが新鮮かを確認
        const cacheAge = Date.now() - (imageUrlCache[file.key]?.timestamp || 0);
        // 30分以上経過していたら再取得
        if (cacheAge > 30 * 60 * 1000) {
          console.log(
            `キャッシュが古いため再取得します（${Math.round(
              cacheAge / 1000 / 60
            )}分経過）`
          );

          // ここで新しいURLを取得（キャッシュミスの場合と同じ処理）
          try {
            let freshUrl = "";
            if (isRaw) {
              // RAWファイルの場合はサムネイルパスを構築
              const pathParts = file.key.split("/");
              const fileName = pathParts[pathParts.length - 1];
              const fileNameWithoutExt = fileName.substring(
                0,
                fileName.lastIndexOf(".")
              );
              const thumbnailPath = file.key
                .replace("/raw/", "/rawThumbnail/")
                .replace(/\/[^\/]+$/, `/${fileNameWithoutExt}_thumb.jpg`);

              freshUrl = await S3ClientAPI.getSignedImageUrl(thumbnailPath);
            } else {
              freshUrl = await S3ClientAPI.getSignedImageUrl(file.key);
            }

            if (freshUrl) {
              imageUrl = freshUrl;
              // 新しいURLでキャッシュを更新
              cacheImageUrl(file.key, freshUrl, 5);
            }
          } catch (error) {
            console.error("キャッシュ更新エラー:", error);
            // エラー時は既存のキャッシュを使用
          }
        }
      }

      // ローディング状態を解除し、URLを設定したファイル情報を更新
      const updatedFile = { ...file, url: imageUrl, isLoading: false };
      setSelectedFile(updatedFile);

      // 画像URLが取得できている場合のみプレビューを表示
      if (imageUrl && imageUrl !== "/file.svg") {
        console.log(
          `プレビュー表示: ${file.key} (URL: ${imageUrl.substring(0, 50)}...)`
        );
        setIsPreviewOpen(true);
      } else {
        console.error(`有効な画像URLが取得できませんでした: ${file.key}`);
        setError("画像URLの取得に失敗しました。");
      }

      // 選択された画像の周辺画像も先読み
      const currentIndex = files.findIndex((f) => f.key === file.key);
      if (currentIndex >= 0) {
        const surroundingFiles: FileInfo[] = [];

        // 前後2枚ずつ（計4枚）の画像を先読み
        for (let i = 1; i <= 2; i++) {
          if (currentIndex + i < files.length) {
            surroundingFiles.push(files[currentIndex + i]);
          }

          if (currentIndex - i >= 0) {
            surroundingFiles.push(files[currentIndex - i]);
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
    // ファイルが既に選択リストにあるかチェック
    const isSelected = selectedFiles.some((f) => f.key === file.key);

    if (isSelected) {
      // 既に選択されている場合は、選択リストから削除
      setSelectedFiles((prev) => prev.filter((f) => f.key !== file.key));
    } else {
      // 選択されていない場合は、選択リストに追加
      setSelectedFiles((prev) => [...prev, file]);
    }
  };

  // 指定した日時を含んだファイル名を生成
  const getTimestampFileName = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  };

  // ファイルサイズのフォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // ストレージ使用量のフォーマット
  const formatStorageSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // ユーザーのストレージ使用量を計算
  const calculateStorageUsage = async () => {
    if (!userId) return;

    try {
      const userFiles = await S3ClientAPI.listUserFiles(userId);
      let totalSize = 0;

      // ファイルサイズの合計を計算
      for (const file of userFiles) {
        totalSize += file.Size || 0;
      }

      // プランに応じた上限容量（仮の値、実際にはバックエンドから取得する）
      const storageLimit = 2 * 1024 * 1024 * 1024; // 2GB

      setStorageUsage({
        used: totalSize,
        limit: storageLimit,
      });
    } catch (error) {
      console.error("ストレージ使用量の計算エラー:", error);
    }
  };

  // コンポーネントのマウント時にストレージ使用量を計算
  useEffect(() => {
    if (userId) {
      calculateStorageUsage();
    }
  }, [userId]);

  // ファイル削除後やアップロード完了後にストレージ使用量を更新
  useEffect(() => {
    const handleStorageUpdate = () => {
      calculateStorageUsage();
    };

    window.addEventListener("upload-complete", handleStorageUpdate);

    return () => {
      window.removeEventListener("upload-complete", handleStorageUpdate);
    };
  }, [userId]);

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
                    <span className="mr-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 transition-colors duration-200">
                      {item.isExpanded ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      )}
                    </span>
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
  const handlePreviewClose = () => {
    setIsPreviewOpen(false);
    // モーダルを閉じた後で選択状態もクリア
    setSelectedFile(null);
  };

  // モーダル外のクリックでプレビューを閉じる
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handlePreviewClose();
    }
  };

  // キーボードイベントでプレビューを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPreviewOpen) {
        handlePreviewClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPreviewOpen]);

  // 日付の表示
  const formatDate = (date: Date | string | undefined): string => {
    if (!date) return "";
    if (typeof date === "string") {
      const d = new Date(date);
      return d.toLocaleDateString();
    }
    return date.toLocaleDateString();
  };

  // ファイルの種類からMIMEタイプを判定する関数
  const getContentTypeFromKey = (key: string): string => {
    const extension = key.split(".").pop()?.toLowerCase() || "";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      txt: "text/plain",
      csv: "text/csv",
      html: "text/html",
      htm: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      xml: "application/xml",
      mp3: "audio/mpeg",
      mp4: "video/mp4",
      avi: "video/x-msvideo",
      mov: "video/quicktime",
      zip: "application/zip",
      rar: "application/x-rar-compressed",
      tar: "application/x-tar",
      gz: "application/gzip",
      // RAW形式
      arw: "image/x-sony-arw",
      cr2: "image/x-canon-cr2",
      cr3: "image/x-canon-cr3",
      dng: "image/x-adobe-dng",
      nef: "image/x-nikon-nef",
      orf: "image/x-olympus-orf",
      pef: "image/x-pentax-pef",
      raf: "image/x-fuji-raf",
      rw2: "image/x-panasonic-rw2",
      x3f: "image/x-sigma-x3f",
    };

    return mimeMap[extension] || "application/octet-stream";
  };

  // アップロード完了後の自動リロード
  useEffect(() => {
    // グローバルイベントリスナーを設定
    const handleUploadComplete = () => {
      console.log("アップロード完了を検出、ディレクトリを再読み込みします");

      // 一定時間後に自動的にディレクトリを更新（Lambda処理の完了を待つ）
      const reloadTimer = setTimeout(() => {
        if (currentPath) {
          loadDirectoryFiles(currentPath);
        } else {
          // ルートディレクトリの場合はディレクトリツリーも再読み込み
          const loadDirectoryTree = async () => {
            if (!userId) return;
            try {
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
              console.error("ディレクトリツリーの再読み込みエラー:", err);
            }
          };

          loadDirectoryTree();
        }
      }, AUTO_RELOAD_INTERVAL);

      return () => clearTimeout(reloadTimer);
    };

    window.addEventListener("upload-complete", handleUploadComplete);

    return () => {
      window.removeEventListener("upload-complete", handleUploadComplete);
    };
  }, [userId, currentPath]);

  // ファイル削除処理
  const handleFileDelete = async (fileKey: string) => {
    try {
      console.log(`ファイル削除開始: ${fileKey}`);

      // 削除処理
      await S3ClientAPI.deleteFile(fileKey);

      // 削除成功後、ファイルリストから削除
      setFiles((prevFiles) => prevFiles.filter((f) => f.key !== fileKey));

      // 選択ファイルリストからも削除
      setSelectedFiles((prev) => prev.filter((f) => f.key !== fileKey));

      console.log(`ファイル削除完了: ${fileKey}`);
    } catch (error) {
      console.error("ファイル削除エラー:", error);
      setError("ファイルの削除中にエラーが発生しました。");
    }
  };

  // ファイルの復元リクエスト処理
  const handleRequestRestore = async (key: string) => {
    try {
      console.log(`ファイル復元リクエスト: ${key}`);
      // 既に復元リクエスト処理は FileCard 内で完了しているため、ここでの追加処理は不要
      // UI更新のために状態を更新
      setFiles((prevFiles) =>
        prevFiles.map((file) =>
          file.key === key
            ? { ...file, restoreStatus: "IN_PROGRESS" as const }
            : file
        )
      );
    } catch (error) {
      console.error("復元リクエストエラー:", error);
      showToast("エラー", `復元リクエストに失敗しました: ${error}`, "error");
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* 左側のサイドバー（ファイル階層） */}
      <div className="w-full md:w-64 bg-gray-100 dark:bg-gray-800 p-4 overflow-y-auto">
        <h2 className="text-lg font-medium mb-2">ファイル階層</h2>

        {/* ストレージ使用量の表示 */}
        <div className="mb-4 bg-white dark:bg-gray-700 rounded-lg p-3 shadow-sm">
          <p className="text-sm font-medium mb-1">ストレージ使用量:</p>
          <div className="flex items-center justify-between text-xs">
            <span>
              {formatStorageSize(storageUsage.used)} /{" "}
              {formatStorageSize(storageUsage.limit)}
            </span>
            <span className="text-gray-500">
              {Math.round((storageUsage.used / storageUsage.limit) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
            <div
              className="bg-blue-600 h-1.5 rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  (storageUsage.used / storageUsage.limit) * 100
                )}%`,
              }}
            />
          </div>
        </div>

        {isLoading && directories.length === 0 ? (
          <div className="text-gray-500">読み込み中...</div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : directories.length === 0 ? (
          <div className="text-gray-500">ディレクトリがありません</div>
        ) : (
          <ul className="pl-4">
            {directories.map((item) => {
              const isRootLevelDir = item.path.split("/").length <= 4;
              const isCurrentPath = item.path === currentPath;
              const hasChildren = item.children && item.children.length > 0;
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
                        <span className="mr-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 transition-colors duration-200">
                          {item.isExpanded ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          )}
                        </span>
                      )}
                      <span>{item.name}</span>
                    </button>
                  </div>

                  {item.isExpanded &&
                    item.children &&
                    item.children.length > 0 && (
                      <ul className="pl-4">
                        {item.children.map((child) => (
                          <li key={child.path} className="py-1">
                            <div className="flex items-center">
                              <button
                                onClick={() => toggleDirectory(child.path)}
                                className={`flex items-center ${
                                  child.path === currentPath
                                    ? "text-blue-500"
                                    : "hover:text-blue-500"
                                }`}
                              >
                                {child.children &&
                                  child.children.length > 0 && (
                                    <span className="mr-1">
                                      {child.isExpanded ? "▼" : "▶"}
                                    </span>
                                  )}
                                <span>{child.name}</span>
                              </button>
                            </div>

                            {child.isExpanded &&
                              child.children &&
                              child.children.length > 0 && (
                                <ul className="pl-4">
                                  {child.children.map((grandchild) => (
                                    <li key={grandchild.path} className="py-1">
                                      <div className="flex items-center">
                                        <button
                                          onClick={() =>
                                            toggleDirectory(grandchild.path)
                                          }
                                          className={`flex items-center ${
                                            grandchild.path === currentPath
                                              ? "text-blue-500"
                                              : "hover:text-blue-500"
                                          }`}
                                        >
                                          {grandchild.children &&
                                            grandchild.children.length > 0 && (
                                              <span className="mr-1">
                                                {grandchild.isExpanded
                                                  ? "▼"
                                                  : "▶"}
                                              </span>
                                            )}
                                          <span>{grandchild.name}</span>
                                        </button>
                                      </div>

                                      {/* 日ディレクトリの表示（ひ孫階層） */}
                                      {grandchild.isExpanded &&
                                        grandchild.children &&
                                        grandchild.children.length > 0 && (
                                          <ul className="pl-4">
                                            {grandchild.children.map(
                                              (greatGrandchild) => (
                                                <li
                                                  key={greatGrandchild.path}
                                                  className="py-1"
                                                >
                                                  <button
                                                    onClick={() =>
                                                      toggleDirectory(
                                                        greatGrandchild.path
                                                      )
                                                    }
                                                    className={`flex items-center ${
                                                      greatGrandchild.path ===
                                                      currentPath
                                                        ? "text-blue-500"
                                                        : "hover:text-blue-500"
                                                    }`}
                                                  >
                                                    <span>
                                                      {greatGrandchild.name}
                                                    </span>
                                                  </button>
                                                </li>
                                              )
                                            )}
                                          </ul>
                                        )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                          </li>
                        ))}
                      </ul>
                    )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 右側のコンテンツエリア */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ファイルリスト */}
        <div className="flex-grow overflow-auto px-4 pt-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="text-red-500 p-4">{error}</div>
          ) : files.length === 0 ? (
            <div className="text-gray-500 p-4">
              {currentPath
                ? "このディレクトリにはファイルがありません"
                : "写真をアップロードするとここに表示されます"}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {files.map((file) => (
                  <FileCard
                    key={file.key}
                    file={file}
                    onClick={handleFileClick}
                    selectedFiles={selectedFiles}
                    onSelect={toggleFileSelection}
                    showCheckbox={enableSelect}
                    onDoubleClick={handleFileClick}
                    onDelete={handleFileDelete}
                    onRequestRestore={handleRequestRestore}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* 選択ファイルのアクション */}
        {selectedFiles.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border-t p-2 flex justify-between items-center">
            <div className="text-sm">
              {selectedFiles.length}個のファイルを選択中
            </div>
          </div>
        )}

        {/* 写真プレビューモーダル */}
        {isPreviewOpen && selectedFile && (
          <PhotoModal
            fileKey={selectedFile.key}
            url={selectedFile.url}
            onClose={handlePreviewClose}
          />
        )}
      </div>
    </div>
  );
};

export default FileBrowser;
