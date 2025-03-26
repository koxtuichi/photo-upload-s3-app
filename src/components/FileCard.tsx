import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { S3ClientAPI } from "@/lib/s3";
import ExifReader from "exifreader";
import PhotoModal from "./PhotoModal";
import { processRawForDisplay } from "@/lib/rawDecoder";
import { useInView } from "react-intersection-observer";
import { FolderIcon, DocumentIcon } from "@heroicons/react/24/outline";
import prettyBytes from "pretty-bytes";
import { format } from "date-fns";

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
  onDownload?: (key: string) => void;
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
  onDownload,
}) => {
  // 状態管理
  const [imgSrc, setImgSrc] = useState<string>("");
  const [imgError, setImgError] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const isSelected = selectedFiles.some((f) => f.key === file.key);
  const cardRef = useRef<HTMLDivElement>(null);

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

  // ファイル名から拡張子を取得
  const getFileExtension = (filename: string): string => {
    return "." + filename.split(".").pop()?.toLowerCase() || "";
  };

  // 拡張子からファイルタイプを判断
  const fileExtension = getFileExtension(file.key || "");

  // 表示する画像/サムネイルのURLを取得
  const getFileUrl = async () => {
    if (!file.key) return;

    console.log(`getFileUrl開始: ${file.key}`);
    setProcessing(true);
    setImgError(false);

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
          setShowPlaceholder(!url);
        }
      } else if (isImageFile(fileExtension) || isVideoFile(fileExtension)) {
        console.log(`通常の画像/動画ファイル処理: ${file.key}`);
        const url = await S3ClientAPI.getSignedImageUrl(file.key);
        setImgSrc(url || "");
        setShowPlaceholder(false);
      } else {
        console.log(`その他のファイル: ${file.key}`);
        setImgSrc("");
        setShowPlaceholder(true);
      }
    } catch (error) {
      console.error("ファイル処理エラー:", error);
      setImgError(true);
      setShowPlaceholder(true);
    } finally {
      setProcessing(false);
      console.log(
        `getFileUrl完了: imgSrc=${imgSrc}, showPlaceholder=${showPlaceholder}`
      );
    }
  };

  const handleDelete = async () => {
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

  const handleDownload = async () => {
    if (!file.key || !onDownload) return;

    try {
      console.log(`ファイルダウンロード開始: ${file.key}`);
      // コールバック関数を呼び出し（FileBrowser側でダウンロード処理を実行）
      onDownload(file.key);
    } catch (error) {
      console.error("ファイルダウンロードエラー:", error);
      alert("ファイルのダウンロードに失敗しました。もう一度お試しください。");
    }
  };

  // 可視領域に入った時にロード
  useEffect(() => {
    if (inView && !loaded) {
      getFileUrl();
      setLoaded(true);
    }

    // 可視領域から外れた時にリソースを解放
    if (!inView && loaded && imgSrc && imgSrc.startsWith("blob:")) {
      URL.revokeObjectURL(imgSrc);
    }
  }, [inView, file.key, loaded]);

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

  return (
    <div
      ref={setRefs}
      className={`relative ${
        isSelected ? "ring-2 ring-blue-500" : ""
      } border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 border-gray-200 dark:border-gray-700`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {showCheckbox && (
        <div className="absolute top-2 left-2 z-10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            className="h-4 w-4 text-blue-600 rounded"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <div className="aspect-square relative bg-gray-50 dark:bg-gray-800">
        {showPlaceholder ? (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              className="w-12 h-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
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
      </div>
      <div className="p-2 text-center">
        <p className="text-xs font-medium truncate text-gray-700 dark:text-gray-300">
          {file.key.split("/").pop()}
        </p>
        {file.size && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {(file.size / (1024 * 1024)).toFixed(1)} MB
          </p>
        )}
      </div>
      {isSelected && (
        <div className="absolute bottom-2 right-2 flex space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation(); // イベント伝播を停止
              handleDelete();
            }}
            className="flex items-center justify-center p-1.5 bg-white rounded-full shadow-md text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-200 transform hover:-translate-y-0.5"
            title="削除"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
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
          <button
            onClick={(e) => {
              e.stopPropagation(); // イベント伝播を停止
              handleDownload();
            }}
            className="flex items-center justify-center p-1.5 bg-white rounded-full shadow-md text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 transform hover:-translate-y-0.5"
            title="ダウンロード"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
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
          </button>
        </div>
      )}
    </div>
  );
};

export default FileCard;
