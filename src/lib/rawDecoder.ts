/**
 * RAWファイル処理ユーティリティ
 * 各種RAW形式からサムネイルまたは画像データを抽出
 */

import ExifReader from "exifreader";

// RAWファイル拡張子のリスト
export const RAW_EXTENSIONS = [
  ".arw", // Sony
  ".cr2",
  ".cr3", // Canon
  ".dng", // Adobe DNG
  ".nef", // Nikon
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
  ".mef", // Mamiya
  ".mrw", // Minolta
  ".rwl", // Leica
  ".iiq", // Phase One
  ".erf", // Epson
  ".mos", // Leaf
  ".nrw", // Nikon
  ".rwz", // Rawzor
  ".srw", // Samsung
];

// メーカー別のRAW形式の特徴
interface RawFormatInfo {
  name: string;
  extensions: string[];
  jpegOffsets?: number[];
  signatureBytes?: number[];
  signatureString?: string;
  thumbnailOffsetRange?: [number, number];
}

// 主要なRAW形式の情報
const RAW_FORMATS: RawFormatInfo[] = [
  {
    name: "SIGMA X3F",
    extensions: [".x3f"],
    signatureString: "FOVb",
    thumbnailOffsetRange: [1024, 5242880], // 1KB〜5MB
    jpegOffsets: [0x4000, 0x8000, 0x10000, 0x20000], // 特定のオフセット位置
  },
  {
    name: "SONY ARW",
    extensions: [".arw"],
    signatureBytes: [0x49, 0x49, 0x2a, 0x00], // リトルエンディアンTIFF
    thumbnailOffsetRange: [0, 524288], // 先頭から512KB
  },
  {
    name: "NIKON NEF",
    extensions: [".nef", ".nrw"],
    signatureBytes: [0x4d, 0x4d, 0x00, 0x2a], // ビッグエンディアンTIFF
    thumbnailOffsetRange: [0, 1048576], // 先頭から1MB
  },
  {
    name: "CANON CR2/CR3",
    extensions: [".cr2", ".cr3"],
    signatureBytes: [0x49, 0x49, 0x2a, 0x00], // CR2はTIFFベース
    thumbnailOffsetRange: [0, 524288], // 先頭から512KB
  },
  {
    name: "FUJI RAF",
    extensions: [".raf"],
    signatureString: "FUJIFILMCCD-RAW",
    thumbnailOffsetRange: [0, 1048576], // 先頭から1MB
  },
  {
    name: "ADOBE DNG",
    extensions: [".dng"],
    signatureBytes: [0x49, 0x49, 0x2a, 0x00], // TIFF形式
    thumbnailOffsetRange: [0, 524288], // 先頭から512KB
  },
];

// 最大処理バッファサイズ（メモリ使用量制限）
const MAX_BUFFER_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * バッファサイズを制限する
 */
const limitBufferSize = (
  buffer: ArrayBuffer,
  maxSize: number = MAX_BUFFER_SIZE
): ArrayBuffer => {
  if (buffer.byteLength <= maxSize) return buffer;
  console.log(`バッファサイズ制限: ${buffer.byteLength} → ${maxSize} バイト`);
  return buffer.slice(0, maxSize);
};

/**
 * RAW形式を判定する
 */
const identifyRawFormat = (buffer: ArrayBuffer): RawFormatInfo | null => {
  try {
    const headerView = new Uint8Array(buffer, 0, 16);

    // シグネチャ文字列による判定
    const signatureStr = String.fromCharCode(...headerView.slice(0, 4));
    const matchByStr = RAW_FORMATS.find(
      (format) =>
        format.signatureString &&
        signatureStr.startsWith(format.signatureString)
    );
    if (matchByStr) return matchByStr;

    // バイナリシグネチャによる判定
    const matchByBytes = RAW_FORMATS.find((format) => {
      if (!format.signatureBytes) return false;
      return format.signatureBytes.every((byte, i) => headerView[i] === byte);
    });
    if (matchByBytes) return matchByBytes;

    return null;
  } catch (error) {
    console.error("RAW形式判定エラー:", error);
    return null;
  }
};

/**
 * JPEG形式のヘッダーとフッターのパターン
 */
const JPEG_PATTERNS = {
  headers: [
    [0xff, 0xd8, 0xff, 0xe0], // JFIF
    [0xff, 0xd8, 0xff, 0xe1], // Exif
    [0xff, 0xd8, 0xff, 0xdb], // 量子化テーブル
    [0xff, 0xd8, 0xff], // 基本SOI + マーカー
  ],
  footer: [0xff, 0xd9], // EOIマーカー
};

/**
 * バイナリデータ内のパターンを検索する
 */
const findPattern = (
  data: Uint8Array,
  pattern: number[],
  startOffset: number = 0,
  endOffset?: number
): number => {
  const end = endOffset || data.length - pattern.length;

  for (let i = startOffset; i < end; i++) {
    if (data[i] === pattern[0]) {
      // 高速化: 最初のバイトだけ先にチェック
      let found = true;
      for (let j = 1; j < pattern.length; j++) {
        if (data[i + j] !== pattern[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
  }

  return -1; // 見つからなかった
};

/**
 * バッファからJPEGデータを抽出する共通関数
 */
const extractJpegFromBuffer = (
  buffer: ArrayBuffer,
  startOffset: number = 0,
  endOffset?: number,
  specificOffsets?: number[]
): { data: Uint8Array | null; startPos: number; endPos: number } => {
  try {
    const data = new Uint8Array(buffer);
    const searchEndOffset =
      endOffset || Math.min(data.length, 10 * 1024 * 1024); // 最大10MBまで

    // JPEGヘッダー検索
    let jpegStartPos = -1;

    // 1. 通常の検索
    for (const pattern of JPEG_PATTERNS.headers) {
      jpegStartPos = findPattern(data, pattern, startOffset, searchEndOffset);
      if (jpegStartPos !== -1) {
        console.log(
          `JPEGヘッダー検出: パターン=[${pattern
            .map((b) => "0x" + b.toString(16))
            .join(",")}], 位置=${jpegStartPos}`
        );
        break;
      }
    }

    // 2. 特定のオフセット位置での検索
    if (jpegStartPos === -1 && specificOffsets && specificOffsets.length > 0) {
      for (const offset of specificOffsets) {
        if (offset + 2 >= data.length) continue;

        // JPEGの最低条件: SOIマーカー (0xFF, 0xD8)
        if (data[offset] === 0xff && data[offset + 1] === 0xd8) {
          jpegStartPos = offset;
          console.log(`JPEGヘッダー検出(特定オフセット): 位置=${jpegStartPos}`);
          break;
        }
      }
    }

    if (jpegStartPos === -1) {
      console.log("JPEGヘッダーが見つかりませんでした");
      return { data: null, startPos: -1, endPos: -1 };
    }

    // JPEGフッター検索
    let jpegEndPos = findPattern(data, JPEG_PATTERNS.footer, jpegStartPos + 2);

    if (jpegEndPos === -1) {
      console.log("JPEGフッターが見つかりません - サイズ推定使用");

      // フッターが見つからない場合は推定サイズを使用
      const estimatedSize = Math.min(1024 * 1024, data.length - jpegStartPos); // 最大1MB
      jpegEndPos = jpegStartPos + estimatedSize;
    } else {
      jpegEndPos += 2; // フッターの長さを含める
    }

    // JPEGデータの切り出し
    const jpegData = data.slice(jpegStartPos, jpegEndPos);
    console.log(`JPEG抽出: サイズ=${jpegData.length}バイト`);

    // 最小サイズチェック
    if (jpegData.length < 100) {
      console.log("抽出したJPEGデータが小さすぎます");
      return { data: null, startPos: jpegStartPos, endPos: jpegEndPos };
    }

    // JPEG形式の検証
    if (jpegData[0] !== 0xff || jpegData[1] !== 0xd8) {
      console.log("不正なJPEGヘッダー");
      return { data: null, startPos: jpegStartPos, endPos: jpegEndPos };
    }

    return { data: jpegData, startPos: jpegStartPos, endPos: jpegEndPos };
  } catch (error) {
    console.error("JPEG抽出エラー:", error);
    return { data: null, startPos: -1, endPos: -1 };
  }
};

/**
 * 抽出したJPEGデータを修復・整形する
 */
const fixJpegData = (jpegData: Uint8Array): Uint8Array => {
  // ヘッダーとフッターを確認して必要に応じて修正
  const hasValidHeader = jpegData[0] === 0xff && jpegData[1] === 0xd8;
  const hasValidFooter =
    jpegData[jpegData.length - 2] === 0xff &&
    jpegData[jpegData.length - 1] === 0xd9;

  if (hasValidHeader && hasValidFooter) {
    return jpegData; // 既に有効なJPEG
  }

  // 修正が必要
  let fixedData: Uint8Array;
  const additionalBytes = (!hasValidHeader ? 2 : 0) + (!hasValidFooter ? 2 : 0);

  fixedData = new Uint8Array(jpegData.length + additionalBytes);
  let offset = 0;

  // ヘッダーがない場合は追加
  if (!hasValidHeader) {
    fixedData[0] = 0xff;
    fixedData[1] = 0xd8;
    offset = 2;
  }

  // 元のデータをコピー
  fixedData.set(jpegData, offset);

  // フッターがない場合は追加
  if (!hasValidFooter) {
    fixedData[fixedData.length - 2] = 0xff;
    fixedData[fixedData.length - 1] = 0xd9;
  }

  console.log(`JPEG修復: ${jpegData.length}→${fixedData.length}バイト`);
  return fixedData;
};

/**
 * X3F形式からサムネイルを抽出
 */
export const extractX3FThumbnail = async (
  buffer: ArrayBuffer
): Promise<string | null> => {
  try {
    const limitedBuffer = limitBufferSize(buffer);
    const formatInfo = RAW_FORMATS.find((f) => f.name === "SIGMA X3F");

    if (!formatInfo) {
      console.error("X3F形式情報が見つかりません");
      return null;
    }

    // シグネチャ確認
    const data = new Uint8Array(limitedBuffer);
    const signature = String.fromCharCode(...data.slice(0, 4));

    const isValidSignature = signature === "FOVb" || signature === "X3F_";
    if (!isValidSignature) {
      console.log(`無効なX3Fシグネチャ: ${signature}`);
      return null;
    }

    // サムネイル検索範囲
    const [startOffset, endOffset] = formatInfo.thumbnailOffsetRange || [
      0,
      data.length,
    ];

    // JPEGデータ抽出
    const { data: jpegData } = extractJpegFromBuffer(
      limitedBuffer,
      startOffset,
      endOffset,
      formatInfo.jpegOffsets
    );

    if (!jpegData) {
      console.log("X3FからJPEGデータを抽出できませんでした");
      return null;
    }

    // JPEGデータの修復・整形
    const fixedJpegData = fixJpegData(jpegData);

    // Blobに変換してURLを生成
    const blob = new Blob([fixedJpegData], { type: "image/jpeg" });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("X3Fサムネイル抽出エラー:", error);
    return null;
  }
};

/**
 * Sony ARW形式からサムネイルを抽出
 */
export const extractArwThumbnail = async (
  buffer: ArrayBuffer
): Promise<string | null> => {
  try {
    // まずExifReaderでの抽出を試みる
    try {
      const tags = ExifReader.load(buffer, { expanded: true });
      if (tags.Thumbnail && tags.Thumbnail.image) {
        console.log("ARW: Exifからサムネイル抽出成功");
        const blob = new Blob(
          [new Uint8Array(tags.Thumbnail.image as ArrayBuffer)],
          {
            type: "image/jpeg",
          }
        );
        return URL.createObjectURL(blob);
      }
    } catch (exifError) {
      console.log("ARW: Exif抽出に失敗、バイナリ検索に進みます");
    }

    // バイナリ検索による抽出
    const limitedBuffer = limitBufferSize(buffer);
    const { data: jpegData } = extractJpegFromBuffer(
      limitedBuffer,
      0,
      1024 * 1024
    );

    if (!jpegData) {
      console.log("ARWからJPEGデータを抽出できませんでした");
      return null;
    }

    const fixedJpegData = fixJpegData(jpegData);
    const blob = new Blob([fixedJpegData], { type: "image/jpeg" });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("ARWサムネイル抽出エラー:", error);
    return null;
  }
};

/**
 * Nikon NEF形式からサムネイルを抽出
 */
export const extractNefThumbnail = async (
  buffer: ArrayBuffer
): Promise<string | null> => {
  try {
    // まずExifReaderでの抽出を試みる
    try {
      const tags = ExifReader.load(buffer, { expanded: true });
      if (tags.Thumbnail && tags.Thumbnail.image) {
        console.log("NEF: Exifからサムネイル抽出成功");
        const blob = new Blob(
          [new Uint8Array(tags.Thumbnail.image as ArrayBuffer)],
          {
            type: "image/jpeg",
          }
        );
        return URL.createObjectURL(blob);
      }
    } catch (exifError) {
      console.log("NEF: Exif抽出に失敗、バイナリ検索に進みます");
    }

    // バイナリ検索による抽出
    const limitedBuffer = limitBufferSize(buffer);
    const { data: jpegData } = extractJpegFromBuffer(
      limitedBuffer,
      0,
      1024 * 1024
    );

    if (!jpegData) {
      console.log("NEFからJPEGデータを抽出できませんでした");
      return null;
    }

    const fixedJpegData = fixJpegData(jpegData);
    const blob = new Blob([fixedJpegData], { type: "image/jpeg" });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("NEFサムネイル抽出エラー:", error);
    return null;
  }
};

/**
 * Canon CR2/CR3形式からサムネイルを抽出
 */
export const extractCanonRawThumbnail = async (
  buffer: ArrayBuffer
): Promise<string | null> => {
  try {
    // まずExifReaderでの抽出を試みる
    try {
      const tags = ExifReader.load(buffer, { expanded: true });
      if (tags.Thumbnail && tags.Thumbnail.image) {
        console.log("Canon RAW: Exifからサムネイル抽出成功");
        const blob = new Blob(
          [new Uint8Array(tags.Thumbnail.image as ArrayBuffer)],
          {
            type: "image/jpeg",
          }
        );
        return URL.createObjectURL(blob);
      }
    } catch (exifError) {
      console.log("Canon RAW: Exif抽出に失敗、バイナリ検索に進みます");
    }

    // バイナリ検索による抽出
    const limitedBuffer = limitBufferSize(buffer);

    // CR2ファイルの場合のJPEGオフセット（通常はファイル先頭から12バイト）
    const data = new Uint8Array(limitedBuffer.slice(0, 16));
    let startOffset = 0;

    // CR2シグネチャチェック
    if (data[8] === 0x43 && data[9] === 0x52 && data[10] === 0x02) {
      // "CR2"
      startOffset = 12; // CR2ファイルの場合
      console.log("CR2形式を検出: JPEGオフセット=12");
    }

    const { data: jpegData } = extractJpegFromBuffer(
      limitedBuffer,
      startOffset,
      1024 * 1024
    );

    if (!jpegData) {
      console.log("Canon RAWからJPEGデータを抽出できませんでした");
      return null;
    }

    const fixedJpegData = fixJpegData(jpegData);
    const blob = new Blob([fixedJpegData], { type: "image/jpeg" });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Canon RAWサムネイル抽出エラー:", error);
    return null;
  }
};

/**
 * Fujifilm RAF形式からサムネイルを抽出
 */
export const extractRafThumbnail = async (
  buffer: ArrayBuffer
): Promise<string | null> => {
  try {
    // まずExifReaderでの抽出を試みる
    try {
      const tags = ExifReader.load(buffer, { expanded: true });
      if (tags.Thumbnail && tags.Thumbnail.image) {
        console.log("RAF: Exifからサムネイル抽出成功");
        const blob = new Blob(
          [new Uint8Array(tags.Thumbnail.image as ArrayBuffer)],
          {
            type: "image/jpeg",
          }
        );
        return URL.createObjectURL(blob);
      }
    } catch (exifError) {
      console.log("RAF: Exif抽出に失敗、バイナリ検索に進みます");
    }

    // バイナリ検索による抽出（RAFは通常160バイト以降にJPEG埋め込み）
    const limitedBuffer = limitBufferSize(buffer);
    const { data: jpegData } = extractJpegFromBuffer(
      limitedBuffer,
      160,
      1024 * 1024
    );

    if (!jpegData) {
      console.log("RAFからJPEGデータを抽出できませんでした");
      return null;
    }

    const fixedJpegData = fixJpegData(jpegData);
    const blob = new Blob([fixedJpegData], { type: "image/jpeg" });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("RAFサムネイル抽出エラー:", error);
    return null;
  }
};

/**
 * Adobe DNG形式からサムネイルを抽出
 */
export const extractDngThumbnail = async (
  buffer: ArrayBuffer
): Promise<string | null> => {
  try {
    // まずExifReaderでの抽出を試みる
    try {
      const tags = ExifReader.load(buffer, { expanded: true });
      if (tags.Thumbnail && tags.Thumbnail.image) {
        console.log("DNG: Exifからサムネイル抽出成功");
        const blob = new Blob(
          [new Uint8Array(tags.Thumbnail.image as ArrayBuffer)],
          {
            type: "image/jpeg",
          }
        );
        return URL.createObjectURL(blob);
      }
    } catch (exifError) {
      console.log("DNG: Exif抽出に失敗、バイナリ検索に進みます");
    }

    // バイナリ検索による抽出
    const limitedBuffer = limitBufferSize(buffer);
    const { data: jpegData } = extractJpegFromBuffer(
      limitedBuffer,
      0,
      1024 * 1024
    );

    if (!jpegData) {
      console.log("DNGからJPEGデータを抽出できませんでした");
      return null;
    }

    const fixedJpegData = fixJpegData(jpegData);
    const blob = new Blob([fixedJpegData], { type: "image/jpeg" });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("DNGサムネイル抽出エラー:", error);
    return null;
  }
};

/**
 * その他のRAW形式からサムネイルを抽出（汎用）
 */
export const extractGenericRawThumbnail = async (
  buffer: ArrayBuffer
): Promise<string | null> => {
  try {
    // まずExifReaderでの抽出を試みる
    try {
      const tags = ExifReader.load(buffer, { expanded: true });
      if (tags.Thumbnail && tags.Thumbnail.image) {
        console.log("Generic RAW: Exifからサムネイル抽出成功");
        const blob = new Blob(
          [new Uint8Array(tags.Thumbnail.image as ArrayBuffer)],
          {
            type: "image/jpeg",
          }
        );
        return URL.createObjectURL(blob);
      }
    } catch (exifError) {
      console.log("Generic RAW: Exif抽出に失敗、バイナリ検索に進みます");
    }

    // バイナリ検索による抽出
    const limitedBuffer = limitBufferSize(buffer);
    const { data: jpegData } = extractJpegFromBuffer(
      limitedBuffer,
      0,
      5 * 1024 * 1024
    );

    if (!jpegData) {
      console.log("RAWファイルからJPEGデータを抽出できませんでした");
      return null;
    }

    const fixedJpegData = fixJpegData(jpegData);
    const blob = new Blob([fixedJpegData], { type: "image/jpeg" });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("汎用RAWサムネイル抽出エラー:", error);
    return null;
  }
};

/**
 * 拡張子に基づいて適切なRAW処理関数を選択
 */
const selectRawProcessor = (
  extension: string
): ((buffer: ArrayBuffer) => Promise<string | null>) => {
  const ext = extension.toLowerCase();

  if (ext === ".x3f") return extractX3FThumbnail;
  if (ext === ".arw") return extractArwThumbnail;
  if (ext === ".nef" || ext === ".nrw") return extractNefThumbnail;
  if (ext === ".cr2" || ext === ".cr3") return extractCanonRawThumbnail;
  if (ext === ".raf") return extractRafThumbnail;
  if (ext === ".dng" || ext === ".tif" || ext === ".tiff")
    return extractDngThumbnail;

  // その他の形式は汎用処理
  return extractGenericRawThumbnail;
};

/**
 * RAWデータからプレビュー用の画像を生成
 * @param buffer RAWファイルのArrayBuffer
 * @param fileExtension RAWファイルの拡張子
 * @returns 画像のURLまたはnull
 */
export const processRawForDisplay = async (
  buffer: ArrayBuffer,
  fileExtension: string
): Promise<string | null> => {
  try {
    console.log(
      `RAW処理開始: 形式=${fileExtension}, サイズ=${buffer.byteLength}バイト`
    );

    // 拡張子をもとに適切なプロセッサを選択
    const rawProcessor = selectRawProcessor(fileExtension);

    // サムネイル抽出処理
    const thumbnailUrl = await rawProcessor(buffer);
    if (thumbnailUrl) {
      console.log(`${fileExtension}からサムネイル抽出成功`);
      return thumbnailUrl;
    }

    // すべての処理に失敗した場合はプレースホルダー画像を返す
    console.log(`${fileExtension}形式のRAW処理に失敗、プレースホルダー使用`);
    return createRawPlaceholderImage(fileExtension);
  } catch (error) {
    console.error("RAW処理エラー:", error);
    return createRawPlaceholderImage(fileExtension);
  }
};

/**
 * プレースホルダー画像を生成
 */
const createRawPlaceholderImage = (extension: string): string => {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "/file.svg";

    // 拡張子から背景色を決定（各メーカーのイメージカラー）
    let bgColor = "#f0f0f0";
    let textColor = "#666666";

    const ext = extension.toLowerCase();
    if (ext === ".arw") bgColor = "#F58220"; // Sony
    else if (ext === ".nef") bgColor = "#FFCC00"; // Nikon
    else if (ext === ".cr2" || ext === ".cr3") bgColor = "#CC0000"; // Canon
    else if (ext === ".raf") bgColor = "#00539F"; // Fuji
    else if (ext === ".x3f") bgColor = "#47A7D5"; // Sigma

    // 暗い背景色の場合はテキスト色を白に
    if (bgColor !== "#f0f0f0") textColor = "#FFFFFF";

    // 背景
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 枠線
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

    // テキスト
    ctx.fillStyle = textColor;
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("RAW", canvas.width / 2, canvas.height / 2 - 15);

    // 拡張子
    ctx.font = "bold 16px Arial";
    ctx.fillText(
      extension.toUpperCase(),
      canvas.width / 2,
      canvas.height / 2 + 15
    );

    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("プレースホルダー生成エラー:", error);
    return "/file.svg";
  }
};
