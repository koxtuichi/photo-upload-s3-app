import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { S3ClientAPI } from "@/lib/s3";
import ExifReader from "exifreader";
import PhotoModal from "./PhotoModal";
import { processRawForDisplay } from "@/lib/rawDecoder";
import { useInView } from "react-intersection-observer";
import {
  FolderIcon,
  DocumentIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import prettyBytes from "pretty-bytes";
import { format } from "date-fns";
import { requestObjectRestore } from "@/lib/s3";

export interface FileInfo {
  key: string;
  size: number;
  lastModified?: Date;
  contentType?: string;
  url?: string;
  isRawFile?: boolean;
  isDirectory?: boolean;
  isSelected?: boolean;
  isLoading?: boolean;
  storageClass?: string;
  restoreStatus?: "IN_PROGRESS" | "COMPLETED" | "NOT_RESTORED";
}

interface FileCardProps {
  file: FileInfo;
  onClick?: (file: FileInfo) => void;
  selectedFiles?: FileInfo[];
  onSelect?: (file: FileInfo) => void;
  showCheckbox?: boolean;
  onDoubleClick?: (file: FileInfo) => void;
  onDelete?: (key: string) => void;
  onOpenModal?: (url: string) => void;
  onRequestRestore?: (key: string) => void;
}

// RAWファイル拡張子のリスト
const RAW_EXTENSIONS_LIST = [
  ".arw", // Sony
  ".cr2",
  ".cr3", // Canon
  ".dng", // Adobe DNG
  ".nef", // Nikon
  ".nrw", // Nikon
  ".orf", // Olympus
  ".pef", // Pentax
  ".raf", // Fuji
  ".rw2", // Panasonic
  ".x3f", // Sigma
  ".srw", // Samsung
  ".kdc", // Kodak
  ".dcr", // Kodak
  ".raw", // Generic
  ".tiff",
  ".tif", // TIFF formats
  ".3fr", // Hasselblad
  ".ari", // ARRI
  ".bay", // Casio
  ".braw", // Blackmagic
  ".cap", // Phase One
  ".ce1", // Phase One
  ".ce2", // Phase One
  ".cib", // Sinar
  ".craw", // Canon
  ".crw", // Canon
  ".dcs", // Kodak
  ".drf", // Kodak
  ".eip", // Phase One
  ".erf", // Epson
  ".fff", // Hasselblad/Imacon
  ".gpr", // GoPro
  ".iiq", // Phase One
  ".k25", // Kodak
  ".kc2", // Kodak
  ".mdc", // Minolta, Agfa
  ".mef", // Mamiya
  ".mos", // Leaf
  ".mrw", // Minolta
  ".nex", // Sony
  ".ptx", // Pentax
  ".pxn", // Logitech
  ".r3d", // RED
  ".ra2", // Leica
  ".rwl", // Leica
  ".rwz", // Rawzor
  ".sd1", // Sigma
  ".srf", // Sony
  ".srw", // Samsung
];

// 最大処理バッファサイズ（メモリ使用量制限）
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB

// RAWという文字を中央に表示するデフォルトサムネイルを生成
const createRawPlaceholderThumbnail = (): string => {
  try {
    // キャンバス要素の作成
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      console.error("Canvas 2D contextを取得できません");
      return "/file.svg";
    }

    // 背景色を設定
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // RAWテキストのスタイル設定
    ctx.fillStyle = "#333333";
    ctx.font = "bold 36px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // RAWテキストを描画
    ctx.fillText("RAW", canvas.width / 2, canvas.height / 2);

    // 枠線を追加
    ctx.strokeStyle = "#999999";
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // DataURLとして取得
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("RAWプレースホルダー生成エラー:", error);
    return "/file.svg";
  }
};

// ファイルパスから撮影日時文字列を抽出する関数
const extractDateFromPath = (path: string): string | null => {
  // パスの例: user/userId/raw/2025/03/24/DSCF2678.RAF
  const parts = path.split("/");
  if (parts.length >= 6) {
    const year = parts[parts.length - 4];
    const month = parts[parts.length - 3];
    const day = parts[parts.length - 2];

    // 年月日の形式チェック
    if (
      /^\d{4}$/.test(year) &&
      /^\d{1,2}$/.test(month) &&
      /^\d{1,2}$/.test(day)
    ) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }
  return null;
};

// ファイル名からタイムスタンプを抽出する関数
const extractTimestampFromFilename = (filename: string): number | null => {
  try {
    // 一般的なカメラのファイル名パターン (例: IMG_20230415_123045.ARW など)
    // タイムスタンプを含む部分を正規表現で抽出

    // 数字のみのパターン (例: 12345678.ARW)
    const numericPattern = /(\d{8,14})/;

    // 日付のパターン (例: 2023-04-15_123045.ARW)
    const datePattern = /(\d{4}[-_]?\d{2}[-_]?\d{2}[-_]?\d{6})/;

    // DSC/IMG後の数字 (例: DSC01234.ARW, IMG_1234.ARW)
    const dscPattern = /(?:DSC|IMG)[-_]?(\d{4,6})/i;

    // X-T1で撮影したRAFファイル (例: DSCF2678.RAF)
    const dscfPattern = /DSCF(\d{4})/i;

    // パターンを順に試す
    const match =
      filename.match(datePattern) ||
      filename.match(numericPattern) ||
      filename.match(dscPattern) ||
      filename.match(dscfPattern);

    if (match && match[1]) {
      // 数値化できる場合は数値として返す
      return parseInt(match[1].replace(/[-_]/g, ""));
    }

    return null;
  } catch (error) {
    console.error("ファイル名からのタイムスタンプ抽出エラー:", error);
    return null;
  }
};

// JPGディレクトリパスを生成（未使用の変数のリンターエラー修正）
const getJpgDirectoryPath = (rawPath: string): string => {
  // RAWファイルパスからJPGディレクトリパスに変換
  // 例: user/123/raw/2023/01/01/file.raw → user/123/jpg/2023/01/01/
  return rawPath.replace(/\/raw\//, "/jpg/").replace(/\/[^\/]+$/, "/");
};

// 同じパスにある可能性のあるJPGのパスを生成
const getExactJpgPath = (rawPath: string): string => {
  // 例: user/userId/raw/2025/03/24/file.RAF -> user/userId/jpg/2025/03/24/file.jpg
  return rawPath.replace("/raw/", "/jpg/").replace(/\.[^.]+$/, ".jpg");
};

// APIを使わず、日付やタイムスタンプで一致するJPGを探す関数
const findMatchingJpgByTimestamp = async (
  rawFilePath: string
): Promise<string | null> => {
  try {
    // RAWファイルのディレクトリパスを取得
    const dirPath = rawFilePath.substring(0, rawFilePath.lastIndexOf("/"));
    const rawFileName = rawFilePath.split("/").pop() || "";
    const rawFileTimestamp = extractTimestampFromFilename(rawFileName);

    console.log(
      `JPG検索: ディレクトリ=${dirPath}, ファイル=${rawFileName}, タイムスタンプ=${rawFileTimestamp}`
    );

    // ディレクトリ内のファイル一覧を取得
    let filesData;
    try {
      filesData = await S3ClientAPI.listUserFiles(dirPath);
    } catch (error) {
      console.error(`ファイル一覧取得エラー:`, error);
      return null;
    }

    // ファイル一覧が配列でない場合はエラー
    if (!Array.isArray(filesData)) {
      console.error("API応答が配列ではありません:", typeof filesData);
      return null;
    }

    // JPGファイルのみをフィルタリング
    const jpgFiles = filesData.filter((file: any) => {
      // S3の戻り値は様々な形式がありうるので安全に処理
      if (!file || typeof file !== "object") return false;
      const key = (file as any).Key;
      return (
        key && typeof key === "string" && key.toLowerCase().endsWith(".jpg")
      );
    });

    if (jpgFiles.length === 0) {
      console.log("JPGファイルが見つかりません");
      return null;
    }

    console.log(`JPGファイル数: ${jpgFiles.length}`);

    // タイムスタンプによる検索
    if (rawFileTimestamp) {
      for (const file of jpgFiles) {
        const jpgKey = (file as any).Key;
        if (!jpgKey) continue;
        const jpgFileName = jpgKey.split("/").pop() || "";
        const jpgTimestamp = extractTimestampFromFilename(jpgFileName);

        if (jpgTimestamp && Math.abs(jpgTimestamp - rawFileTimestamp) < 10) {
          // 10秒以内のタイムスタンプの差
          console.log(`タイムスタンプが一致するJPGを発見: ${jpgKey}`);

          // 署名付きURLを取得
          try {
            const signedUrl = await S3ClientAPI.getSignedImageUrl(jpgKey);
            if (signedUrl) {
              console.log(`JPGの署名付きURL取得成功`);
              return signedUrl;
            }
          } catch (error) {
            console.error("署名付きURL取得失敗:", error);
            continue;
          }
        }
      }
    }

    // RAWファイルのパス（ディレクトリ）から日付を取得
    const rawPathDate = extractDateFromPath(rawFilePath);
    if (rawPathDate) {
      for (const file of jpgFiles) {
        const jpgKey = (file as any).Key;
        if (!jpgKey) continue;
        // JPGのパスから日付を抽出
        const jpgPathDate = extractDateFromPath(jpgKey);

        if (jpgPathDate && jpgPathDate === rawPathDate) {
          console.log(`同日のJPGを発見: ${jpgKey}`);

          // 署名付きURLを取得
          try {
            const signedUrl = await S3ClientAPI.getSignedImageUrl(jpgKey);
            if (signedUrl) {
              console.log(`JPGの署名付きURL取得成功`);
              return signedUrl;
            }
          } catch (error) {
            console.error("署名付きURL取得失敗:", error);
            continue;
          }
        }
      }
    }

    // どれも一致しなければ、最初のJPGを返す
    if (jpgFiles.length > 0) {
      const firstJpgKey = (jpgFiles[0] as any).Key;
      if (firstJpgKey) {
        console.log(`最初のJPGを使用: ${firstJpgKey}`);

        // 署名付きURLを取得
        try {
          const signedUrl = await S3ClientAPI.getSignedImageUrl(firstJpgKey);
          if (signedUrl) {
            console.log(`JPGの署名付きURL取得成功`);
            return signedUrl;
          }
        } catch (error) {
          console.error("署名付きURL取得失敗:", error);
        }
      }
    }

    return null;
  } catch (error) {
    console.error("JPG検索エラー:", error);
    return null;
  }
};

// DNG形式のサムネイル抽出処理
const extractDNGThumbnail = async (
  arrayBuffer: ArrayBuffer
): Promise<ArrayBuffer | null> => {
  try {
    // DNG/TIFFファイルの最初の数バイトをチェック
    const dataView = new DataView(arrayBuffer);

    // TIFFヘッダーチェック (0x4949="II" or 0x4D4D="MM")
    const byteOrder = dataView.getUint16(0);
    if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) {
      console.log("無効なDNGファイル形式");
      return null;
    }

    // JPEGのスタートマーカーを探す (0xFFD8)
    const searchPattern = new Uint8Array([0xff, 0xd8]);

    for (
      let i = 0;
      i <
      Math.min(arrayBuffer.byteLength, MAX_BUFFER_SIZE) - searchPattern.length;
      i++
    ) {
      let found = true;
      for (let j = 0; j < searchPattern.length; j++) {
        if (new Uint8Array(arrayBuffer)[i + j] !== searchPattern[j]) {
          found = false;
          break;
        }
      }

      if (found) {
        // JPEGデータの終わりを探す (0xFFD9)
        for (
          let k = i;
          k < Math.min(arrayBuffer.byteLength, MAX_BUFFER_SIZE) - 1;
          k++
        ) {
          if (
            new Uint8Array(arrayBuffer)[k] === 0xff &&
            new Uint8Array(arrayBuffer)[k + 1] === 0xd9
          ) {
            // JPEGデータを切り出す
            console.log(
              `DNG: JPEG見つかった, 開始位置=${i}, 終了位置=${k + 2}`
            );
            return arrayBuffer.slice(i, k + 2);
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error("DNGサムネイル抽出エラー:", error);
    return null;
  }
};

// X3F形式のサムネイル抽出処理
const extractX3FThumbnail = async (
  arrayBuffer: ArrayBuffer
): Promise<ArrayBuffer | null> => {
  try {
    // X3Fヘッダーを確認 (X3F_)
    const signature = new Uint8Array(arrayBuffer, 0, 4);
    const signatureStr = String.fromCharCode(...signature);

    if (signatureStr !== "X3F_") {
      console.log("無効なX3Fファイル形式");
      return null;
    }

    // JPEGヘッダーとフッターのパターン
    const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff]);
    const jpegFooter = new Uint8Array([0xff, 0xd9]);

    // 処理する最大バイト数を制限
    const maxSize = Math.min(arrayBuffer.byteLength, MAX_BUFFER_SIZE);
    const buffer = new Uint8Array(arrayBuffer, 0, maxSize);

    // JPEGヘッダーを検索
    let startIdx = -1;
    for (let i = 0; i < maxSize - jpegHeader.length; i++) {
      if (
        buffer[i] === jpegHeader[0] &&
        buffer[i + 1] === jpegHeader[1] &&
        buffer[i + 2] === jpegHeader[2]
      ) {
        startIdx = i;
        break;
      }
    }

    if (startIdx === -1) {
      console.log("X3F: JPEGヘッダーが見つかりません");
      return null;
    }

    // JPEGフッターを検索
    let endIdx = -1;
    for (let i = startIdx; i < maxSize - jpegFooter.length; i++) {
      if (buffer[i] === jpegFooter[0] && buffer[i + 1] === jpegFooter[1]) {
        endIdx = i + 2; // フッターサイズを含める
        break;
      }
    }

    if (endIdx === -1) {
      console.log("X3F: JPEGフッターが見つかりません");
      return null;
    }

    console.log(
      `X3F: JPEG見つかった, 開始位置=${startIdx}, 終了位置=${endIdx}`
    );
    return arrayBuffer.slice(startIdx, endIdx);
  } catch (error) {
    console.error("X3Fサムネイル抽出エラー:", error);
    return null;
  }
};

// RAWファイルからサムネイルを抽出する関数
const extractRawThumbnail = async (
  arrayBuffer: ArrayBuffer,
  extension: string
): Promise<string | null> => {
  try {
    // 処理するバッファサイズを制限（メモリ使用量削減）
    const optimizedBuffer =
      arrayBuffer.byteLength > MAX_BUFFER_SIZE
        ? arrayBuffer.slice(0, MAX_BUFFER_SIZE)
        : arrayBuffer;

    // 1. まずExifReaderで標準的なサムネイル抽出を試みる
    try {
      const tags = ExifReader.load(optimizedBuffer, { expanded: true });

      if (tags.Thumbnail && tags.Thumbnail.image) {
        console.log("Exifからサムネイル発見");
        const blob = new Blob(
          [new Uint8Array(tags.Thumbnail.image as ArrayBuffer)],
          { type: "image/jpeg" }
        );
        return URL.createObjectURL(blob);
      }
    } catch (exifError) {
      console.log("Exif処理エラー:", exifError);
    }

    // 2. DNG特殊処理
    if (extension.toLowerCase() === ".dng") {
      console.log("DNG形式固有の処理を試行");
      const thumbnailBuffer = await extractDNGThumbnail(optimizedBuffer);

      if (thumbnailBuffer) {
        const blob = new Blob([new Uint8Array(thumbnailBuffer)], {
          type: "image/jpeg",
        });
        return URL.createObjectURL(blob);
      }
    }

    // 3. X3F特殊処理
    if (extension.toLowerCase() === ".x3f") {
      console.log("X3F形式固有の処理を試行");
      const thumbnailBuffer = await extractX3FThumbnail(optimizedBuffer);

      if (thumbnailBuffer) {
        const blob = new Blob([new Uint8Array(thumbnailBuffer)], {
          type: "image/jpeg",
        });
        return URL.createObjectURL(blob);
      }
    }

    // 4. 他の形式への特殊対応をここに追加できます

    return null;
  } catch (error) {
    console.error("RAWサムネイル抽出エラー:", error);
    return null;
  }
};

// 特殊ファイル拡張子
const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".heic",
];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".webm", ".m4v", ".wmv"];

// 画像・動画・RAWファイルの種類を判定する関数
const isImageFile = (ext: string): boolean => {
  return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"].includes(
    ext.toLowerCase()
  );
};

const isVideoFile = (ext: string): boolean => {
  return [
    ".mp4",
    ".webm",
    ".ogg",
    ".mov",
    ".avi",
    ".wmv",
    ".flv",
    ".mkv",
  ].includes(ext.toLowerCase());
};

// ファイルパスから拡張子を取得する関数
const getFileExtension = (filePath: string): string => {
  const parts = filePath.split(".");
  return parts.length > 1 ? `.${parts[parts.length - 1].toLowerCase()}` : "";
};

const isRawFile = (ext: string): boolean => {
  return [
    ".raw",
    ".arw",
    ".cr2",
    ".cr3",
    ".nef",
    ".dng",
    ".orf",
    ".rw2",
    ".raf",
    ".x3f",
    ".pef",
    ".3fr",
    ".ari",
    ".bay",
    ".braw",
    ".cap",
    ".ce1",
    ".ce2",
    ".cib",
    ".craw",
    ".crw",
    ".dcr",
    ".dcs",
    ".drf",
    ".eip",
    ".erf",
    ".fff",
    ".gpr",
    ".iiq",
    ".k25",
    ".kc2",
    ".kdc",
    ".mdc",
    ".mef",
    ".mos",
    ".mrw",
    ".nex",
    ".ptx",
    ".pxn",
    ".r3d",
    ".ra2",
    ".rwl",
    ".srw",
  ].includes(ext.toLowerCase());
};

/**
 * ファイルカードコンポーネント
 */
const FileCard: React.FC<FileCardProps> = ({
  file,
  onClick,
  selectedFiles = [],
  onSelect,
  showCheckbox = false,
  onDoubleClick,
  onDelete,
  onOpenModal,
  onRequestRestore,
}) => {
  // 状態管理
  const [imgSrc, setImgSrc] = useState<string>("");
  const [imgError, setImgError] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const isSelected = selectedFiles.some((f) => f.key === file.key);
  const cardRef = useRef<HTMLDivElement>(null);
  const [restoreStatus, setRestoreStatus] = useState<
    "IN_PROGRESS" | "COMPLETED" | "NOT_RESTORED" | undefined
  >(file.restoreStatus);

  // Intersection Observerを使用して可視性を監視
  const { ref: inViewRef, inView } = useInView({
    triggerOnce: false,
    rootMargin: "200px 0px",
    threshold: 0,
  });

  // 参照をマージ
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (cardRef.current !== node) {
        cardRef.current = node || null;
      }
      inViewRef(node);
    },
    [inViewRef]
  );

  // 表示する画像/サムネイルのURLを取得
  const getFileUrl = async () => {
    if (!file.key) return;

    console.log(`getFileUrl開始: ${file.key}`);
    setProcessing(true);

    try {
      const fileExtension =
        "." + file.key.split(".").pop()?.toLowerCase() || "";
      const isJpgFile =
        isImageFile(fileExtension) && /\.(jpg|jpeg)$/i.test(file.key);
      const isRaw = isRawFile(fileExtension);

      console.log(
        `ファイル種別判定: extension=${fileExtension}, isJpg=${isJpgFile}, isRaw=${isRaw}`
      );

      if (isJpgFile || isRaw) {
        console.log(`サムネイル取得開始: ${file.key}`);
        const thumbnailUrl = await S3ClientAPI.getRawThumbnailUrl(file.key);
        console.log(`取得したサムネイルURL: ${thumbnailUrl}`);

        if (thumbnailUrl && thumbnailUrl !== "/file.svg") {
          console.log(`有効なサムネイルURLを設定: ${thumbnailUrl}`);
          setImgSrc(thumbnailUrl);
          setShowPlaceholder(false);
        } else {
          console.log(`サムネイルが見つからないため通常のURLを試行`);
          const url = await S3ClientAPI.getSignedImageUrl(file.key);
          console.log(`通常の署名付きURL: ${url}`);
          setImgSrc(url || "");
          setShowPlaceholder(false);
        }
      } else if (isImageFile(fileExtension) || isVideoFile(fileExtension)) {
        console.log(`通常の画像/動画ファイル処理: ${file.key}`);
        const url = await S3ClientAPI.getSignedImageUrl(file.key);
        setImgSrc(url || "");
        setShowPlaceholder(false);
      } else {
        console.log(`その他のファイル: ${file.key}`);
        setImgSrc("");
        setShowPlaceholder(false);
      }
    } catch (error) {
      console.error("ファイル処理エラー:", error);
      setImgSrc("");
      setShowPlaceholder(false);
    } finally {
      setProcessing(false);
      console.log(
        `getFileUrl完了: imgSrc=${imgSrc}, showPlaceholder=${showPlaceholder}`
      );
    }
  };

  // 削除処理
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation(); // イベント伝播を止める

    if (!file.key || !onDelete) return;

    try {
      if (window.confirm("このファイルを削除してもよろしいですか？")) {
        console.log(`ファイル削除開始: ${file.key}`);
        await S3ClientAPI.deleteFile(file.key);
        console.log(`ファイル削除完了: ${file.key}`);
        onDelete(file.key);
      }
    } catch (error) {
      console.error("ファイル削除エラー:", error);
      alert("ファイルの削除に失敗しました。");
    }
  };

  const handleOpenModal = async () => {
    if (!file.key || !onOpenModal) return;

    try {
      console.log(`モーダル表示開始: ファイル=${file.key}`);
      const fileExtension = getFileExtension(file.key);
      const isRaw = isRawFile(fileExtension);

      let url = "";

      if (isRaw) {
        // 1. まずサムネイルを試す（ファイルパスをベースにして正しいサムネイルパスを構築）
        console.log(`RAWファイルのサムネイル取得開始`);
        const rawFilePath = file.key;
        const filename = rawFilePath.split("/").pop() || "";
        const filenameWithoutExt = filename.substring(
          0,
          filename.lastIndexOf(".")
        );
        const thumbnailPath = rawFilePath
          .replace("/raw/", "/rawThumbnail/")
          .replace(/\/[^\/]+$/, `/${filenameWithoutExt}_thumb.jpg`);

        console.log(`構築したサムネイルパス: ${thumbnailPath}`);

        try {
          url = await S3ClientAPI.getSignedImageUrl(thumbnailPath);
          console.log(`サムネイルURL取得結果: ${url}`);
        } catch (thumbError) {
          console.log(`サムネイル取得失敗: ${thumbError}`);
          url = "";
        }

        // サムネイルが取得できなかった場合
        if (!url) {
          // 2. 対応するJPGパスを探す
          console.log(`サムネイルが見つからないためJPG検索開始`);
          try {
            // RAW: user/userId/raw/2025/03/22/IMGP0953.PEF
            // JPG: user/userId/jpg/2025/03/22/IMGP0953.jpg
            const jpgPath = file.key
              .replace("/raw/", "/jpg/")
              .replace(/\.[^.]+$/, ".jpg");
            console.log(`推測したJPGのパス: ${jpgPath}`);

            url = await S3ClientAPI.getSignedImageUrl(jpgPath);
            console.log(`JPGのURL取得結果: ${url}`);
          } catch (jpgError) {
            console.log(`JPG取得失敗: ${jpgError}`);

            // 3. それでもダメなら直接RAWを取得
            try {
              console.log(`RAWファイルから直接URL取得を試行`);
              url = await S3ClientAPI.getSignedImageUrl(file.key);
              console.log(`RAW直接URL: ${url}`);
            } catch (rawError) {
              console.error(`RAW直接取得も失敗: ${rawError}`);

              // 4. 最終手段：ダミー画像を設定
              url = "/raw_placeholder.jpg";
              console.log(`ダミー画像を使用: ${url}`);
            }
          }
        }
      } else {
        // 通常の画像ファイルは直接URLを取得
        console.log(`通常画像のURL取得`);
        url = await S3ClientAPI.getSignedImageUrl(file.key);
        console.log(`取得したURL: ${url}`);
      }

      // この時点でURLが空でないことを確認
      if (!url) {
        console.error("URL取得失敗: 空のURLが返されました");
        return;
      }

      console.log(`モーダル表示用の最終URL: ${url}`);
      onOpenModal(url);
    } catch (error) {
      console.error("モーダル表示エラー:", error);
    }
  };

  // 可視領域に入った時にロード
  useEffect(() => {
    if (inView && !imgSrc && showPlaceholder) {
      getFileUrl();
    }
  }, [inView, file.key, imgSrc, showPlaceholder]);

  // コンポーネントがアンマウントされる時にリソースを解放
  useEffect(() => {
    return () => {
      if (imgSrc && imgSrc.startsWith("blob:")) {
        URL.revokeObjectURL(imgSrc);
      }
    };
  }, [imgSrc]);

  // カードクリック時のハンドラ (選択機能は含まない)
  const handleClick = () => {
    if (onClick) onClick(file);
  };

  // ダブルクリック時のハンドラ
  const handleDoubleClick = () => {
    if (file.isDirectory) {
      if (onDoubleClick) onDoubleClick(file);
    } else {
      // ディレクトリでなければモーダルを開く
      handleOpenModal();
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (onSelect) onSelect(file);
  };

  // 復元リクエストの処理
  const handleRequestRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();

    console.log(`復元リクエスト開始: ${file.key}`);

    try {
      setProcessing(true);
      console.log(`S3への復元リクエスト送信: ${file.key}`);

      const result = await requestObjectRestore(file.key);
      console.log(`復元リクエスト結果: ${result.success ? "成功" : "失敗"}`);

      if (result.success) {
        setRestoreStatus("IN_PROGRESS");
        alert(
          "復元リクエストを送信しました。復元完了までしばらくお待ちください。復元が完了しましたらお客様のメールアドレスへダウンロード可能なURLをお送りいたします"
        );

        if (onRequestRestore) {
          onRequestRestore(file.key);
        }
      } else if (result.alreadyInProgress) {
        alert(
          "復元中です。復元完了しましたらダウンロードURLをお客様のメールアドレスに送信させていただきますので、今しばらくお待ちください。"
        );
      } else {
        alert("復元リクエストに失敗しました。");
      }
    } catch (error) {
      console.error("復元リクエストエラー:", error);
      alert("復元リクエストに失敗しました。");
    } finally {
      setProcessing(false);
    }
  };

  // ファイルアクションボタンの部分
  const renderFileActions = () => {
    if (file.isDirectory) return null;

    return (
      <div className="absolute bottom-0 right-0 p-1 bg-opacity-75 bg-gray-800 rounded-tl-md">
        <div className="flex space-x-1">
          {/* 復元リクエストボタン */}
          {onRequestRestore && (
            <button
              onClick={handleRequestRestore}
              className="p-1 rounded-full text-white hover:bg-gray-700"
              title="アーカイブから復元"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
            </button>
          )}

          {/* 既存の削除ボタン */}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="p-1 text-white rounded-full hover:bg-gray-700"
              title="削除"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={setRefs}
      className={`relative ${
        isSelected ? "ring-2 ring-blue-500" : ""
      } group rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700 transition-shadow hover:shadow-lg bg-white dark:bg-gray-800`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* チェックボックス（選択用） */}
      {showCheckbox && (
        <div className="absolute top-1 left-1 z-10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            className="h-4 w-4 text-blue-600 rounded"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ファイルサムネイル */}
      <div className="aspect-square relative bg-gray-50 dark:bg-gray-800">
        {showPlaceholder ? (
          <div className="w-full h-full flex items-center justify-center">
            {file.isDirectory ? (
              <FolderIcon className="h-16 w-16 text-gray-400" />
            ) : (
              <DocumentIcon className="h-16 w-16 text-gray-400" />
            )}
          </div>
        ) : (
          <img
            src={imgSrc}
            alt={file.key}
            className="object-cover"
            style={{
              position: "absolute",
              height: "100%",
              width: "100%",
              inset: 0,
              color: "transparent",
            }}
            loading="lazy"
            decoding="async"
            onError={() => {
              setImgError(true);
              setShowPlaceholder(true);
            }}
          />
        )}

        {/* ファイルアクションボタン */}
        {renderFileActions()}
      </div>

      {/* ファイルメタデータ表示 */}
      <div className="p-2 text-xs text-gray-600 dark:text-gray-300">
        <div className="truncate">{file.key.split("/").pop()}</div>
        <div className="flex justify-between items-center">
          <span>{prettyBytes(file.size)}</span>
        </div>
      </div>
    </div>
  );
};

export default FileCard;
