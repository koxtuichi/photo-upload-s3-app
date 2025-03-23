import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { S3RequestPresigner } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { lookup } from "mime-types";
import { createHash } from "crypto";
import JSZip from "jszip";
import ExifReader from "exifreader";
import { Upload } from "@aws-sdk/lib-storage";

// 環境変数の取得
const region = process.env.NEXT_PUBLIC_AWS_REGION || "ap-northeast-1";
const accessKeyId = process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY || "";
const BUCKET_NAME =
  process.env.NEXT_PUBLIC_S3_BUCKET_NAME || "photo-upload-s3-app";

// S3クライアントの設定
const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  customUserAgent: "photo-upload-s3-app/1.0.0",
});

// CORSポリシーに関する注意事項
/**
 * 注意: S3バケットのCORS設定が必要です
 * AWS Management Consoleでの設定方法:
 * 1. S3バケットの「アクセス許可」タブを開く
 * 2. 「CORS設定」を編集し、以下の設定を追加:
 * [
 *   {
 *     "AllowedHeaders": ["*"],
 *     "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
 *     "AllowedOrigins": [
 *       "http://localhost:3000",
 *       "https://photo-upload-s3-app.web.app"
 *     ],
 *     "ExposeHeaders": ["ETag"]
 *   }
 * ]
 */

/**
 * 日付を指定された形式でフォーマットする関数
 * @param date 日付
 * @param format フォーマット（デフォルトは 'YYYY/MM/DD'）
 * @returns フォーマットされた日付文字列
 */
export function formatDate(date: Date, format: string = "YYYY/MM/DD"): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return format
    .replace("YYYY", String(year))
    .replace("MM", month)
    .replace("DD", day);
}

/**
 * ファイルの拡張子からディレクトリ名を取得する関数
 * @param fileName ファイル名
 * @returns ディレクトリ名
 */
export function getDirectoryFromFileType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  // 一般的な画像形式
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }

  // RAW形式 - 幅広いカメラメーカーに対応
  const rawExtensions = [
    "raw",
    "arw",
    "cr2",
    "cr3",
    "nef",
    "nrw",
    "orf",
    "rw2",
    "pef",
    "dng",
    "raf",
    "sr2",
    "3fr",
    "ari",
    "bay",
    "braw",
    "cap",
    "ce1",
    "ce2",
    "cib",
    "craw",
    "crw",
    "dcr",
    "dcs",
    "drf",
    "eip",
    "erf",
    "fff",
    "gpr",
    "iiq",
    "k25",
    "kc2",
    "kdc",
    "mdc",
    "mef",
    "mos",
    "mrw",
    "nex",
    "ptx",
    "pxn",
    "r3d",
    "ra2",
    "rwl",
    "srw",
    "x3f",
  ];
  if (rawExtensions.includes(ext)) {
    return "raw";
  }

  // 動画形式
  if (["mp4", "mov", "avi", "wmv"].includes(ext)) {
    return "video";
  }

  // その他は'other'ディレクトリに
  return "other";
}

/**
 * ファイルからEXIF情報を読み取り、撮影日を取得する
 * @param file 画像ファイル
 * @returns 撮影日が含まれていればDateオブジェクト、なければnull
 */
export const getPhotoTakenDate = async (file: File): Promise<Date | null> => {
  try {
    // 画像ファイル以外はnullを返す
    if (!file.type.startsWith("image/")) {
      return null;
    }

    // FileオブジェクトをArrayBufferに変換
    const buffer = await file.arrayBuffer();

    // EXIF情報を読み取る
    const tags = ExifReader.load(buffer);

    // DateTimeOriginalが存在すれば、それを使用
    if (tags.DateTimeOriginal) {
      const dateStr = tags.DateTimeOriginal.description;
      // YYYY:MM:DD HH:MM:SS フォーマットを解析
      const [datePart, timePart] = dateStr.split(" ");
      const [year, month, day] = datePart.split(":");
      const [hour, minute, second] = timePart
        ? timePart.split(":")
        : ["0", "0", "0"];

      // 月は0始まりなので-1する
      return new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
        parseInt(second, 10)
      );
    }

    // DateTimeOriginalがなくてもCreateDateまたはDateTimeがあれば使用
    if (tags.CreateDate) {
      const dateStr = tags.CreateDate.description;
      const [datePart, timePart] = dateStr.split(" ");
      const [year, month, day] = datePart.split(":");
      const [hour, minute, second] = timePart
        ? timePart.split(":")
        : ["0", "0", "0"];

      return new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
        parseInt(second, 10)
      );
    }

    if (tags.DateTime) {
      const dateStr = tags.DateTime.description;
      const [datePart, timePart] = dateStr.split(" ");
      const [year, month, day] = datePart.split(":");
      const [hour, minute, second] = timePart
        ? timePart.split(":")
        : ["0", "0", "0"];

      return new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
        parseInt(second, 10)
      );
    }

    return null;
  } catch (error) {
    console.error("EXIF情報の読み取りに失敗しました:", error);
    return null;
  }
};

/**
 * 撮影日付に基づいてS3のパスを生成する
 * @param file ファイル
 * @param userId ユーザーID
 * @param takenDate 撮影日
 * @returns S3のパス
 */
export const generateS3PathFromDate = async (
  file: File,
  userId: string,
  takenDate?: Date | null
): Promise<string> => {
  // ファイル拡張子を取得
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  // ファイルタイプによってフォルダを分ける
  let fileType = "other";
  if (/^(jpg|jpeg)$/i.test(extension)) {
    fileType = "jpg";
  } else if (
    /^(raw|arw|cr2|cr3|nef|nrw|orf|rw2|pef|dng|raf|sr2|3fr|ari|bay|braw|cap|ce1|ce2|cib|craw|crw|dcr|dcs|drf|eip|erf|fff|gpr|iiq|k25|kc2|kdc|mdc|mef|mos|mrw|nex|ptx|pxn|r3d|ra2|rwl|srw|x3f)$/i.test(
      extension
    )
  ) {
    fileType = "raw";
  }

  // 撮影日がなければ現在の日付を使用
  const date = takenDate || new Date();

  // YYYY/MM/DD 形式に整形
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  // S3のパスを生成: user/{userId}/{fileType}/{year}/{month}/{day}/{fileName}
  return `user/${userId}/${fileType}/${year}/${month}/${day}/${file.name}`;
};

/**
 * 特定のユーザーのディレクトリ構造を取得する関数
 * @param userId ユーザーID
 * @returns ディレクトリ構造
 */
export async function listUserDirectories(userId: string) {
  if (!accessKeyId || !secretAccessKey) {
    console.error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
    return [];
  }

  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: `user/${userId}/`,
    Delimiter: "/",
  });

  try {
    const response = await s3Client.send(command);
    return response.CommonPrefixes || [];
  } catch (error) {
    console.error("S3からのディレクトリ一覧取得エラー:", error);
    return [];
  }
}

/**
 * 特定のディレクトリ内のファイル一覧を取得する関数
 * @param directoryPath ディレクトリパス
 * @returns ファイル一覧
 */
export async function listDirectoryFiles(directoryPath: string) {
  if (!accessKeyId || !secretAccessKey) {
    console.error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
    return [];
  }

  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: directoryPath,
  });

  try {
    const response = await s3Client.send(command);
    return response.Contents || [];
  } catch (error) {
    console.error("S3からのファイル一覧取得エラー:", error);
    return [];
  }
}

/**
 * 特定のユーザーのファイルリストを取得する関数
 * @param userId ユーザーID
 * @returns オブジェクトリスト
 */
export async function listUserFiles(userId: string) {
  if (!accessKeyId || !secretAccessKey) {
    console.error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
    return [];
  }

  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: `user/${userId}/`,
  });

  try {
    const response = await s3Client.send(command);
    return response.Contents || [];
  } catch (error) {
    console.error("S3からのファイル一覧取得エラー:", error);
    return [];
  }
}

/**
 * 特定のユーザーの年ディレクトリを取得する関数
 * 例: user/userId/jpg/ 内の年ディレクトリ（2025/など）を取得
 * @param userId ユーザーID
 * @param fileType ファイルタイプ（jpg, raw など）
 * @returns 年ディレクトリ一覧
 */
export async function listYearDirectories(userId: string, fileType: string) {
  if (!accessKeyId || !secretAccessKey) {
    console.error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
    return [];
  }

  const prefix = `user/${userId}/${fileType}/`;
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    Delimiter: "/",
  });

  try {
    const response = await s3Client.send(command);
    return response.CommonPrefixes || [];
  } catch (error) {
    console.error("S3からの年ディレクトリ一覧取得エラー:", error);
    return [];
  }
}

/**
 * 特定の年ディレクトリ内の月ディレクトリを取得する関数
 * 例: user/userId/jpg/2025/ 内の月ディレクトリ（03/など）を取得
 * @param yearDirectoryPath 年ディレクトリパス
 * @returns 月ディレクトリ一覧
 */
export async function listMonthDirectories(yearDirectoryPath: string) {
  if (!accessKeyId || !secretAccessKey) {
    console.error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
    return [];
  }

  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: yearDirectoryPath,
    Delimiter: "/",
  });

  try {
    const response = await s3Client.send(command);
    return response.CommonPrefixes || [];
  } catch (error) {
    console.error("S3からの月ディレクトリ一覧取得エラー:", error);
    return [];
  }
}

/**
 * 特定の月ディレクトリ内の日ディレクトリを取得する関数
 * 例: user/userId/jpg/2025/03/ 内の日ディレクトリ（15/など）を取得
 * @param monthDirectoryPath 月ディレクトリパス
 * @returns 日ディレクトリ一覧
 */
export async function listDayDirectories(monthDirectoryPath: string) {
  if (!accessKeyId || !secretAccessKey) {
    console.error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
    return [];
  }

  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: monthDirectoryPath,
    Delimiter: "/",
  });

  try {
    const response = await s3Client.send(command);
    return response.CommonPrefixes || [];
  } catch (error) {
    console.error("S3からの日ディレクトリ一覧取得エラー:", error);
    return [];
  }
}

/**
 * S3にファイルをアップロードする
 * @param file ファイル
 * @param userId ユーザーID
 * @param onProgress 進捗状況コールバック (0～100の数値)
 * @returns アップロード結果
 */
export const uploadFile = async (
  file: File,
  userId: string,
  onProgress?: (progress: number) => void
): Promise<{ key: string; url: string }> => {
  try {
    // 進捗状況の初期値を設定（1%から開始して視覚的にフィードバックを示す）
    if (onProgress) onProgress(1);

    // ファイルをArrayBufferに変換
    const fileArrayBuffer = await file.arrayBuffer();

    // ファイルをArrayBufferではなく、Uint8Arrayに変換する
    // (S3 Client SDKが要求するフォーマット)
    const fileData = new Uint8Array(fileArrayBuffer);

    // EXIFから撮影日を取得
    const takenDate = await getPhotoTakenDate(file);

    // ファイルパスを生成（撮影日がある場合はそれを使用）
    const key = await generateS3PathFromDate(file, userId, takenDate);

    // Content-Typeを自動検出
    const contentType = file.type || "application/octet-stream";

    // S3へのアップロードパラメータ
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileData,
      ContentType: contentType,
    };

    // ManagedUploadは進捗状況をサポート
    const upload = new Upload({
      client: s3Client,
      params,
      queueSize: 4, // 同時アップロードの最大数
      partSize: 5 * 1024 * 1024, // パートサイズを5MBに設定
      leavePartsOnError: false, // エラー発生時にアップロード済みのパートを削除
    });

    // 進捗状況の監視を設定
    upload.on(
      "httpUploadProgress",
      (progress: { loaded?: number; total?: number }) => {
        if (progress.loaded && progress.total && onProgress) {
          // 1%から始めて100%まで進捗を計算（最初の1%は既に表示済み）
          const percentage = Math.min(
            99,
            Math.floor((progress.loaded / progress.total) * 99) + 1
          );
          onProgress(percentage);
        }
      }
    );

    // アップロードを実行
    await upload.done();

    // 完了時に100%を設定
    if (onProgress) onProgress(100);

    // 署名付きURLを生成（24時間有効）
    const url = await getSignedImageUrl(key, 86400);

    // 成功結果を返す
    return { key, url };
  } catch (error) {
    console.error("ファイルアップロードエラー:", error);
    throw error;
  }
};

/**
 * 署名付きURLを生成して画像を取得する関数
 * @param key S3のオブジェクトキー
 * @param expiresIn 有効期限（秒）
 * @returns 署名付きURL
 */
export async function getSignedImageUrl(key: string, expiresIn = 3600) {
  if (!accessKeyId || !secretAccessKey) {
    console.error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
    // ダミーURL（エラー表示用）を返す
    return "/next.svg";
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  try {
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error("署名付きURL生成エラー:", error);
    // エラー時はダミーのURLを返す
    return "/next.svg";
  }
}

/**
 * S3からファイルを削除する関数
 * @param key S3のオブジェクトキー
 */
export async function deleteFileFromS3(key: string) {
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
  }

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  try {
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error("S3からのファイル削除エラー:", error);
    throw error;
  }
}

/**
 * ファイルをダウンロードする関数
 * @param key S3のオブジェクトキー
 * @returns ファイルのBlob
 */
export async function downloadFile(key: string): Promise<Blob> {
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  try {
    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error("ファイル本文が空です");
    }

    // レスポンスのBodyからBlobを生成
    const arrayBuffer = await response.Body.transformToByteArray();
    const contentType = response.ContentType || "application/octet-stream";

    return new Blob([arrayBuffer], { type: contentType });
  } catch (error) {
    console.error("ファイルダウンロードエラー:", error);
    throw error;
  }
}

/**
 * ディレクトリをZIPファイルとしてダウンロードする関数
 * @param directoryPath ディレクトリパス
 * @returns ZIPファイルのBlob
 */
export async function downloadDirectory(directoryPath: string): Promise<Blob> {
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
  }

  try {
    // ディレクトリ内のファイル一覧を取得
    const files = await listDirectoryFiles(directoryPath);

    if (files.length === 0) {
      throw new Error("ディレクトリが空です");
    }

    // ZIPファイルを作成
    const zip = new JSZip();

    // 各ファイルをダウンロードしてZIPに追加
    const downloadPromises = files.map(async (file) => {
      if (!file.Key) return;

      const fileBlob = await downloadFile(file.Key);
      const fileName = file.Key.split("/").pop() || "unknown";

      zip.file(fileName, fileBlob);
    });

    await Promise.all(downloadPromises);

    // ZIPファイルを生成
    return await zip.generateAsync({ type: "blob" });
  } catch (error) {
    console.error("ディレクトリダウンロードエラー:", error);
    throw error;
  }
}

/**
 * 複数ファイルを並列でダウンロードしてZIPファイルにまとめる関数
 * @param keys ダウンロードするファイルのキー配列
 * @param zipName ZIPファイルの名前（拡張子なし）
 * @returns ZIPファイルのBlob
 */
export async function downloadMultipleFiles(
  keys: string[],
  zipName: string = "download"
): Promise<Blob> {
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
  }

  if (keys.length === 0) {
    throw new Error("ダウンロードするファイルが指定されていません");
  }

  try {
    // ZIPファイルを作成
    const zip = new JSZip();

    // 最大10件ずつの並列ダウンロードを実行
    const batchSize = 10;
    const batches = [];

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);

      // バッチ内での並列ダウンロード
      const batchPromise = Promise.all(
        batch.map(async (key) => {
          try {
            const fileBlob = await downloadFile(key);
            const fileName = key.split("/").pop() || "unknown";
            return { fileName, fileBlob };
          } catch (error) {
            console.error(`ファイル ${key} のダウンロードに失敗:`, error);
            return null;
          }
        })
      );

      batches.push(batchPromise);
    }

    // 全バッチの処理を待機
    const results = await Promise.all(batches);

    // 成功したダウンロードをZIPに追加
    results.flat().forEach((result) => {
      if (result) {
        zip.file(result.fileName, result.fileBlob);
      }
    });

    // ZIPファイルを生成
    return await zip.generateAsync({ type: "blob" });
  } catch (error) {
    console.error("複数ファイルのダウンロードエラー:", error);
    throw error;
  }
}

// 外部から使用するための関数をエクスポート
export const S3ClientAPI = {
  formatDate,
  getDirectoryFromFileType,
  generateS3PathFromDate,
  listUserDirectories,
  listDirectoryFiles,
  listUserFiles,
  listYearDirectories,
  listMonthDirectories,
  listDayDirectories,
  uploadFile,
  getSignedImageUrl,
  deleteFileFromS3,
  downloadFile,
  downloadDirectory,
  downloadMultipleFiles,
};
