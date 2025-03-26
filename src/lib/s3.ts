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
 * 日付をフォーマットする（YYYY/MM/DD形式）
 */
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
};

/**
 * ファイルタイプに基づいてS3のディレクトリを取得する
 */
export const getDirectoryFromFileType = (fileName: string): string => {
  const fileExt = fileName.split(".").pop()?.toLowerCase() || "";

  // 画像ファイル（JPG、JPEG、PNG、GIF、WEBP）
  if (/^(jpg|jpeg|png|gif|webp)$/i.test(fileExt)) {
    return "jpg";
  }
  // RAW形式の写真ファイル
  else if (
    /^(arw|cr2|cr3|nef|dng|orf|rw2|raf|x3f|pef|3fr|ari|bay|braw|cap|ce1|ce2|cib|craw|crw|dcr|dcs|drf|eip|erf|fff|gpr|iiq|k25|kc2|kdc|mdc|mef|mos|mrw|nex|ptx|pxn|r3d|ra2|rwl|srw)$/i.test(
      fileExt
    )
  ) {
    return "raw";
  }
  // 動画ファイル
  else if (/^(mp4|mov|avi|wmv|flv|mkv|webm)$/i.test(fileExt)) {
    return "video";
  }
  // PDFファイル
  else if (/^pdf$/i.test(fileExt)) {
    return "pdf";
  }
  // その他のファイル
  else {
    return "other";
  }
};

/**
 * ファイルの日付からS3のパスを生成する
 * @param file アップロードするファイル
 * @param userId ユーザーID
 * @returns S3のパス
 */
export const generateS3PathFromDate = async (
  file: File,
  userId: string
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

  // 日付の優先順位:
  // 1. ファイルの最終更新日 (file.lastModified)
  // 2. 現在の日付 (fallback)
  let date: Date;

  if (file.lastModified) {
    // 1. ファイルの最終更新日を使用
    date = new Date(file.lastModified);
    console.log(
      `${file.name}: ファイル最終更新日を使用 (${date.toISOString()})`
    );
  } else {
    // 2. どちらもなければ現在の日付
    date = new Date();
    console.log(`${file.name}: 現在の日付を使用 (${date.toISOString()})`);
  }

  // YYYY/MM/DD 形式に整形
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  // S3のパスを生成: user/{userId}/{fileType}/{year}/{month}/{day}/{fileName}
  return `user/${userId}/${fileType}/${year}/${month}/${day}/${file.name}`;
};

/**
 * rawThumbnailかどうかを判定
 * @param path S3のパスまたはディレクトリ名
 * @returns rawThumbnailなら true
 */
export const isRawThumbnailPath = (path: string): boolean => {
  // 完全なパス（例: user/userId/rawThumbnail/2023/02/01/）またはディレクトリ名（例: rawThumbnail）を処理
  return (
    path.includes("/rawThumbnail/") ||
    path === "rawThumbnail" ||
    path.endsWith("/rawThumbnail")
  );
};

/**
 * jpgThumbnailかどうかを判定
 * @param path S3のパスまたはディレクトリ名
 * @returns jpgThumbnailなら true
 */
export const isJpgThumbnailPath = (path: string): boolean => {
  // 完全なパス（例: user/userId/jpgThumbnail/2023/02/01/）またはディレクトリ名（例: jpgThumbnail）を処理
  return (
    path.includes("/jpgThumbnail/") ||
    path === "jpgThumbnail" ||
    path.endsWith("/jpgThumbnail")
  );
};

/**
 * サムネイルディレクトリかどうかを判定
 * @param path S3のパスまたはディレクトリ名
 * @returns サムネイルディレクトリなら true
 */
export const isThumbnailPath = (path: string): boolean => {
  return isRawThumbnailPath(path) || isJpgThumbnailPath(path);
};

/**
 * 特定のユーザーのディレクトリ一覧を取得する関数
 * @param userId ユーザーID
 * @returns ディレクトリPrefix一覧
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
    // サムネイルディレクトリをフィルタリング
    return (response.CommonPrefixes || []).filter(
      (prefix) => prefix.Prefix && !isThumbnailPath(prefix.Prefix)
    );
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
 * ファイルをS3にアップロードする
 * @param file アップロードするファイル
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

    // ファイルパスを生成（日付を使用）
    const key = await generateS3PathFromDate(file, userId);

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

    // 進捗状況を監視
    upload.on("httpUploadProgress", (progress) => {
      // 進捗率を計算 (0～100%)
      const progressPercentage = Math.round(
        ((progress.loaded || 0) / (progress.total || 1)) * 99
      );
      // 99%までの進捗を報告（100%はアップロード完了後に設定）
      if (onProgress) onProgress(progressPercentage);
    });

    // アップロード実行
    const result = await upload.done();

    // 進捗100%を報告
    if (onProgress) onProgress(100);

    // 署名付きURLを取得
    const url = await getSignedImageUrl(key);

    return { key, url };
  } catch (error) {
    console.error("S3アップロードエラー:", error);
    throw error;
  }
};

/**
 * 画像の署名付きURLを取得する
 */
export const getSignedImageUrl = async (key: string): Promise<string> => {
  try {
    // keyが無効な場合は早期リターン
    if (!key || typeof key !== "string") {
      console.error("無効なキーが指定されました:", key);
      return "/file.svg"; // フォールバックイメージ
    }

    // S3クライアントと認証情報が有効か確認
    if (!s3Client || !BUCKET_NAME) {
      console.error("S3クライアントまたはバケット名が設定されていません");
      return "/file.svg"; // フォールバックイメージ
    }

    // URLディレクトリトラバーサル対策
    const sanitizedKey = key.replace(/\.\.\//g, "");

    // GetObjectCommandの設定オプション
    const commandOptions = {
      Bucket: BUCKET_NAME,
      Key: sanitizedKey,
    };

    // 署名付きURLを生成 (有効期限を短めに設定)
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand(commandOptions),
      {
        expiresIn: 3600, // 1時間
      }
    );

    return signedUrl;
  } catch (error) {
    console.error(`署名付きURL生成エラー (${key}):`, error);
    return "/file.svg"; // エラー時のフォールバック
  }
};

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
 * @param onProgress 進捗状況コールバック関数 (完了数, 合計数)
 * @returns ZIPファイルのBlob
 */
export async function downloadMultipleFiles(
  keys: string[],
  zipName: string = "download",
  onProgress?: (completed: number, total: number) => void
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
    const totalFiles = keys.length;
    let completedFiles = 0;

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);

      // バッチ内での並列ダウンロード
      const batchPromise = Promise.all(
        batch.map(async (key) => {
          try {
            const fileBlob = await downloadFile(key);
            const fileName = key.split("/").pop() || "unknown";

            // 1ファイルのダウンロードが完了したら進捗を更新
            completedFiles++;
            if (onProgress) {
              onProgress(completedFiles, totalFiles);
            }

            return { fileName, fileBlob };
          } catch (error) {
            console.error(`ファイル ${key} のダウンロードに失敗:`, error);

            // エラーが発生しても進捗はカウント
            completedFiles++;
            if (onProgress) {
              onProgress(completedFiles, totalFiles);
            }

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

/**
 * 通常のファイルパスからサムネイルパスに変換する
 * @param path 元のファイルパス（jpg/またはraw/を含む）
 * @returns サムネイルパス
 */
export const getFilePathToThumbnailPath = (path: string): string => {
  // パスがjpgディレクトリを含む場合
  if (path.includes("/jpg/")) {
    return path.replace("/jpg/", "/jpgThumbnail/");
  }
  // パスがrawディレクトリを含む場合
  if (path.includes("/raw/")) {
    return path.replace("/raw/", "/rawThumbnail/");
  }
  return path; // 変換できない場合は元のパスを返す
};

/**
 * サムネイルパスから通常のファイルパスに変換する
 * @param thumbnailPath サムネイルパス（jpgThumbnail/またはrawThumbnail/を含む）
 * @returns 元のファイルパス
 */
export const getThumbnailPathToFilePath = (thumbnailPath: string): string => {
  // パスがjpgThumbnailディレクトリを含む場合
  if (thumbnailPath.includes("/jpgThumbnail/")) {
    return thumbnailPath.replace("/jpgThumbnail/", "/jpg/");
  }
  // パスがrawThumbnailディレクトリを含む場合
  if (thumbnailPath.includes("/rawThumbnail/")) {
    return thumbnailPath.replace("/rawThumbnail/", "/raw/");
  }
  return thumbnailPath; // 変換できない場合は元のパスを返す
};

/**
 * サムネイルパスを生成する
 * @param rawFilePath RAWファイルのパス
 * @returns サムネイルのパス
 */
const getThumbnailPath = (filePath: string): string | null => {
  try {
    // ファイルパスからサムネイルパスへの変換
    return getFilePathToThumbnailPath(filePath);
  } catch (error) {
    console.error("サムネイルパス生成エラー:", error);
    return null;
  }
};

/**
 * RAWファイル用のサムネイルURLを取得
 * @param filePath RAWファイルのパス
 * @returns サムネイルの署名付きURL
 */
const getRawThumbnailUrl = async (filePath: string): Promise<string> => {
  try {
    console.log(`サムネイルURL取得開始: ${filePath}`);

    // パスが空または無効な場合は早期リターン
    if (!filePath || typeof filePath !== "string") {
      console.error("無効なファイルパス:", filePath);
      return "/file.svg";
    }

    // ファイル名からサムネイル名に変換する関数
    const getThumbFilename = (filename: string) => {
      const baseName = filename.substring(0, filename.lastIndexOf("."));
      return `${baseName}_thumb.jpg`;
    };

    // ファイルパスからサムネイルパスを生成
    let thumbnailPath = "";
    const pathParts = filePath.split("/");
    const fileName = pathParts[pathParts.length - 1];

    if (filePath.includes("/raw/")) {
      // RAWファイルの場合
      thumbnailPath = filePath
        .replace("/raw/", "/rawThumbnail/")
        .replace(/\/[^\/]+$/, `/${getThumbFilename(fileName)}`);
    } else if (filePath.includes("/jpg/")) {
      // JPGファイルの場合
      thumbnailPath = filePath
        .replace("/jpg/", "/jpgThumbnail/")
        .replace(/\/[^\/]+$/, `/${getThumbFilename(fileName)}`);
    } else {
      // その他のファイルタイプはサポート外
      console.log(`サポート外のファイルパス: ${filePath}`);
      return "/file.svg";
    }

    console.log(`生成したサムネイルパス: ${thumbnailPath}`);

    // サムネイルの署名付きURLを取得
    try {
      const signedUrl = await getSignedImageUrl(thumbnailPath);

      // URLが取得できたか確認
      if (!signedUrl) {
        console.warn(`サムネイルURLの取得失敗 (空のURL): ${thumbnailPath}`);
        return "/file.svg";
      }

      console.log(`サムネイルURL取得成功: ${signedUrl}`);
      return signedUrl;
    } catch (error) {
      console.warn(`サムネイルURLの取得に失敗: ${thumbnailPath}`, error);
      return "/file.svg";
    }
  } catch (error) {
    console.error("サムネイルURL取得エラー:", error);
    return "/file.svg";
  }
};

// S3のAPIs
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
  getFilePathToThumbnailPath,
  getThumbnailPathToFilePath,
  getThumbnailPath,
  getRawThumbnailUrl,

  // オブジェクトのメタデータを取得
  async getObjectMetadata(key: string): Promise<any> {
    try {
      const response = await fetch(
        `/api/s3/metadata?key=${encodeURIComponent(key)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to get object metadata: ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Error getting object metadata:", error);
      throw error;
    }
  },

  // 指定ディレクトリ内のオブジェクト一覧を取得
  async listObjects(prefix: string): Promise<string[]> {
    try {
      const response = await fetch(
        `/api/s3/list?prefix=${encodeURIComponent(prefix)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to list objects: ${response.statusText}`);
      }

      const data = await response.json();
      return data.keys || [];
    } catch (error) {
      console.error("Error listing objects:", error);
      throw error;
    }
  },

  deleteFile: async (fileKey: string): Promise<void> => {
    try {
      console.log(`S3から削除: ${fileKey}`);

      // メインファイルの削除
      const deleteCommand = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileKey,
      });
      await s3Client.send(deleteCommand);

      // サムネイルパスを生成
      let thumbnailKey = "";
      if (fileKey.includes("/raw/")) {
        thumbnailKey = fileKey
          .replace("/raw/", "/rawThumbnail/")
          .replace(/\.[^.]+$/, "_thumb.jpg");
      } else if (fileKey.includes("/jpg/")) {
        thumbnailKey = fileKey
          .replace("/jpg/", "/jpgThumbnail/")
          .replace(/\.[^.]+$/, "_thumb.jpg");
      }

      if (thumbnailKey) {
        console.log(`サムネイルを削除: ${thumbnailKey}`);
        // サムネイルの削除
        const deleteThumbnailCommand = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: thumbnailKey,
        });
        await s3Client.send(deleteThumbnailCommand);
      }

      console.log(`削除完了: ${fileKey}`);
    } catch (error) {
      console.error("ファイル削除エラー:", error);
      throw error;
    }
  },
};
