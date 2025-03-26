/**
 * photo-upload-s3-app Lambda関数
 * S3にアップロードされたRAWファイルからサムネイル画像を抽出し、指定パスに保存する
 */

import { S3 } from "aws-sdk";
import sharp from "sharp";
import ExifReader from "exifreader";

const s3 = new S3();

// サポートするRAW拡張子のリスト
const RAW_EXTENSIONS = [
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
const RAW_FORMATS = [
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
 * ファイルの拡張子を取得
 */
function getFileExtension(fileName) {
  return fileName.includes(".")
    ? "." + fileName.split(".").pop().toLowerCase()
    : "";
}

/**
 * RAWファイルかどうかを判定
 */
function isRawFile(fileName) {
  const extension = getFileExtension(fileName);
  return RAW_EXTENSIONS.includes(extension);
}

/**
 * S3パスからファイル名を抽出
 */
function getFileNameFromKey(key) {
  return key.split("/").pop();
}

/**
 * S3パスから年月日を抽出する
 */
function extractDateFromPath(path) {
  // パスの例: user/abc123/raw/2023/04/15/file.x3f
  const parts = path.split("/");
  if (parts.length >= 4) {
    // 下から数えて4番目, 3番目, 2番目の部分が年月日の可能性が高い
    const candidate1 = parts[parts.length - 4];
    const candidate2 = parts[parts.length - 3];
    const candidate3 = parts[parts.length - 2];

    // 年月日のパターンチェック (年は4桁、月日は1-2桁)
    if (
      /^\d{4}$/.test(candidate1) &&
      /^\d{1,2}$/.test(candidate2) &&
      /^\d{1,2}$/.test(candidate3)
    ) {
      return {
        year: candidate1,
        month: candidate2.padStart(2, "0"), // 1桁の場合は0埋め
        day: candidate3.padStart(2, "0"), // 1桁の場合は0埋め
      };
    }
  }
  return null;
}

/**
 * S3パスからユーザーIDを抽出
 */
function extractUserIdFromPath(path) {
  // パスの例: user/abc123/raw/2023/04/15/file.x3f
  const match = path.match(/^user\/([^\/]+)\//);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

/**
 * サムネイル保存先のS3パスを生成
 */
function generateThumbnailPath(sourceKey) {
  const userId = extractUserIdFromPath(sourceKey);
  const dateInfo = extractDateFromPath(sourceKey);
  const fileName = getFileNameFromKey(sourceKey);

  if (!userId || !dateInfo || !fileName) {
    console.error("パス情報の抽出に失敗しました", {
      sourceKey,
      userId,
      dateInfo,
      fileName,
    });
    return null;
  }

  // ファイルタイプに基づいてサムネイルディレクトリを決定
  const isJpegFile = /\.(jpg|jpeg)$/i.test(fileName);
  const thumbnailDir = isJpegFile ? "jpgThumbnail" : "rawThumbnail";

  // サムネイル用のファイル名を生成（拡張子をjpgに変更）
  const thumbnailFileName = fileName.replace(/\.[^.]+$/, "") + "_thumb.jpg";

  // サムネイル保存先のパスを生成
  return `user/${userId}/${thumbnailDir}/${dateInfo.year}/${dateInfo.month}/${dateInfo.day}/${thumbnailFileName}`;
}

/**
 * バッファサイズを制限する
 */
function limitBufferSize(buffer, maxSize = MAX_BUFFER_SIZE) {
  if (buffer.length <= maxSize) return buffer;
  console.log(`バッファサイズ制限: ${buffer.length} → ${maxSize} バイト`);
  return buffer.slice(0, maxSize);
}

/**
 * RAW形式を判定する
 */
function identifyRawFormat(buffer) {
  try {
    const headerView = buffer.slice(0, 16);

    // シグネチャ文字列による判定
    const signatureStr = headerView.slice(0, 4).toString("ascii");
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
}

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
function findPattern(data, pattern, startOffset = 0, endOffset) {
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
}

/**
 * バッファからJPEGデータを抽出する
 */
function extractJpegFromBuffer(
  buffer,
  startOffset = 0,
  endOffset,
  specificOffsets
) {
  try {
    const data = buffer;
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
      console.log("JPEGヘッダーが見つかりません");
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
}

/**
 * 抽出したJPEGデータを修復・整形する
 */
function fixJpegData(jpegData) {
  // ヘッダーとフッターを確認して必要に応じて修正
  const hasValidHeader = jpegData[0] === 0xff && jpegData[1] === 0xd8;
  const hasValidFooter =
    jpegData[jpegData.length - 2] === 0xff &&
    jpegData[jpegData.length - 1] === 0xd9;

  if (hasValidHeader && hasValidFooter) {
    return jpegData; // 既に有効なJPEG
  }

  // 修正が必要
  let fixedData;
  const additionalBytes = (!hasValidHeader ? 2 : 0) + (!hasValidFooter ? 2 : 0);

  fixedData = Buffer.alloc(jpegData.length + additionalBytes);
  let offset = 0;

  // ヘッダーがない場合は追加
  if (!hasValidHeader) {
    fixedData[0] = 0xff;
    fixedData[1] = 0xd8;
    offset = 2;
  }

  // 元のデータをコピー
  jpegData.copy(fixedData, offset);

  // フッターがない場合は追加
  if (!hasValidFooter) {
    fixedData[fixedData.length - 2] = 0xff;
    fixedData[fixedData.length - 1] = 0xd9;
  }

  console.log(`JPEG修復: ${jpegData.length}→${fixedData.length}バイト`);
  return fixedData;
}

/**
 * X3F形式からサムネイルを抽出
 */
async function extractX3FThumbnail(buffer) {
  try {
    const limitedBuffer = limitBufferSize(buffer);
    const formatInfo = RAW_FORMATS.find((f) => f.name === "SIGMA X3F");

    if (!formatInfo) {
      console.error("X3F形式情報が見つかりません");
      return null;
    }

    // シグネチャ確認
    const signature = limitedBuffer.slice(0, 4).toString("ascii");

    const isValidSignature = signature === "FOVb" || signature === "X3F_";
    if (!isValidSignature) {
      console.log(`無効なX3Fシグネチャ: ${signature}`);
      return null;
    }

    // サムネイル検索範囲
    const [startOffset, endOffset] = formatInfo.thumbnailOffsetRange || [
      0,
      limitedBuffer.length,
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

    return fixedJpegData;
  } catch (error) {
    console.error("X3Fサムネイル抽出エラー:", error);
    return null;
  }
}

/**
 * ExifReaderを使用してサムネイルを抽出する
 */
async function extractThumbnailWithExifReader(buffer) {
  try {
    const tags = ExifReader.load(buffer, { expanded: true });
    if (tags.Thumbnail && tags.Thumbnail.image) {
      console.log("Exifからサムネイル抽出成功");
      return Buffer.from(tags.Thumbnail.image);
    }
    return null;
  } catch (error) {
    console.log("Exifからのサムネイル抽出に失敗:", error);
    return null;
  }
}

/**
 * RAW形式に基づいて適切なサムネイル抽出関数を実行
 */
async function extractThumbnailFromRaw(buffer, extension) {
  try {
    console.log(
      `RAW処理開始: 形式=${extension}, サイズ=${buffer.length}バイト`
    );

    // まずExifReaderで抽出を試みる
    const exifThumbnail = await extractThumbnailWithExifReader(buffer);
    if (exifThumbnail) {
      return exifThumbnail;
    }

    // X3F形式の場合は専用処理
    if (extension === ".x3f") {
      return await extractX3FThumbnail(buffer);
    }

    // 汎用JPEG検索
    const formatInfo = identifyRawFormat(buffer) || {
      thumbnailOffsetRange: [0, buffer.length],
    };
    const [startOffset, endOffset] = formatInfo.thumbnailOffsetRange;

    const { data: jpegData } = extractJpegFromBuffer(
      buffer,
      startOffset,
      endOffset
    );
    if (jpegData) {
      return fixJpegData(jpegData);
    }

    console.log(`${extension}形式からのサムネイル抽出に失敗しました`);
    return null;
  } catch (error) {
    console.error("サムネイル抽出エラー:", error);
    return null;
  }
}

/**
 * 抽出したサムネイルをリサイズする
 */
async function resizeThumbnail(buffer, maxWidth = 1200, maxHeight = 1200) {
  try {
    if (!buffer) return null;

    // Sharpを使ってリサイズと最適化
    const resized = await sharp(buffer)
      .rotate() // Exif情報に基づいて自動回転
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();

    console.log(
      `サムネイルリサイズ: ${buffer.length}バイト → ${resized.length}バイト`
    );
    return resized;
  } catch (error) {
    console.error("サムネイルリサイズエラー:", error);
    return buffer; // 元のバッファを返す
  }
}

/**
 * JPG画像からサムネイルを生成
 */
async function createJpgThumbnail(
  buffer,
  maxWidth = 800,
  maxHeight = 800,
  quality = 80
) {
  try {
    // Sharpを使用して画像をリサイズ
    const thumbnail = await sharp(buffer)
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: "inside", // アスペクト比を維持
        withoutEnlargement: true, // 元画像より大きくしない
      })
      .jpeg({ quality }) // 品質を下げる（ファイルサイズを小さくするため）
      .toBuffer();

    console.log(
      `JPGサムネイル生成成功: 元サイズ=${buffer.length}バイト, サムネイルサイズ=${thumbnail.length}バイト`
    );
    return thumbnail;
  } catch (error) {
    console.error("JPGサムネイル生成エラー:", error);
    throw error;
  }
}

/**
 * ファイルタイプに基づいて適切なサムネイル処理を行う
 */
async function extractAndSaveThumbnail(bucket, key) {
  try {
    const fileName = getFileNameFromKey(key);
    console.log(`処理開始: ${fileName}`);

    // S3からファイルを取得
    const data = await s3.getObject({ Bucket: bucket, Key: key }).promise();

    let thumbnailBuffer;
    const isJpegFile = /\.(jpg|jpeg)$/i.test(fileName);

    if (isJpegFile) {
      console.log(`JPGファイル検出: ${fileName}`);
      // JPGファイルの場合はリサイズしてサムネイル生成
      thumbnailBuffer = await createJpgThumbnail(data.Body);
    } else if (isRawFile(fileName)) {
      console.log(`RAWファイル検出: ${fileName}`);
      // RAWファイルの場合は埋め込みサムネイル抽出
      const extension = getFileExtension(fileName);
      thumbnailBuffer = await extractThumbnailFromRaw(
        limitBufferSize(data.Body),
        extension
      );
    } else {
      console.log(`未対応ファイル形式: ${fileName}`);
      return;
    }

    if (!thumbnailBuffer) {
      console.error(`サムネイル抽出失敗: ${fileName}`);
      return;
    }

    // サムネイル保存先パスを生成
    const thumbnailKey = generateThumbnailPath(key);
    if (!thumbnailKey) {
      console.error(`サムネイルパス生成失敗: ${key}`);
      return;
    }

    // サムネイルをリサイズして最適化
    const optimizedThumbnail = await resizeThumbnail(thumbnailBuffer);

    // サムネイルのサイズ確認とログ出力
    console.log(
      `サムネイルサイズ: ${optimizedThumbnail.length} バイト, 保存先: ${thumbnailKey}`
    );

    // S3にサムネイルをアップロード
    await s3
      .putObject({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: optimizedThumbnail,
        ContentType: "image/jpeg",
      })
      .promise();

    console.log(`サムネイル保存成功: ${thumbnailKey}`);
    return thumbnailKey;
  } catch (error) {
    console.error("サムネイル抽出と保存中のエラー:", error);
    throw error;
  }
}

/**
 * Lambda関数のエントリポイント
 */
exports.handler = async (event) => {
  try {
    console.log("イベント受信:", JSON.stringify(event));

    // S3イベントからバケット名とオブジェクトキーを取得
    for (const record of event.Records) {
      if (
        record.eventSource === "aws:s3" &&
        record.eventName.startsWith("ObjectCreated")
      ) {
        const bucket = record.s3.bucket.name;
        const key = decodeURIComponent(
          record.s3.object.key.replace(/\+/g, " ")
        );

        console.log(`S3オブジェクト検出: ${bucket}/${key}`);

        // キーを確認し、サムネイルディレクトリのファイルは処理しない
        if (key.includes("/rawThumbnail/") || key.includes("/jpgThumbnail/")) {
          console.log(
            `サムネイルディレクトリのファイルはスキップします: ${key}`
          );
          continue;
        }

        // ファイルに対してサムネイル処理を実行
        const thumbnailKey = await extractAndSaveThumbnail(bucket, key);
        console.log(`処理完了: ${key} → ${thumbnailKey || "失敗"}`);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify("処理完了"),
    };
  } catch (error) {
    console.error("Lambda実行エラー:", error);
    return {
      statusCode: 500,
      body: JSON.stringify(`エラー: ${error.message}`),
    };
  }
};
