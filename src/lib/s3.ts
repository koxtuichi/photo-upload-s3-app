import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
});

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
    Prefix: `users/${userId}/`,
  });

  try {
    const response = await s3Client.send(command);
    return response.Contents || [];
  } catch (error) {
    console.error("S3からのファイル一覧取得エラー:", error);
    // エラーをスローする代わりに空の配列を返す
    return [];
  }
}

/**
 * S3にファイルをアップロードする関数
 * @param userId ユーザーID
 * @param file アップロードするファイル
 * @param metadata メタデータ（オプション）
 */
export async function uploadFileToS3(
  userId: string,
  file: File,
  metadata?: Record<string, string>
) {
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS認証情報が設定されていません。環境変数を確認してください。"
    );
  }

  // ファイル名にタイムスタンプを追加して一意にする
  const timestamp = new Date().getTime();
  const key = `users/${userId}/${timestamp}_${file.name}`;

  // ファイルをArrayBufferではなく、Uint8Arrayに変換する
  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = new Uint8Array(arrayBuffer);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: file.type,
    Metadata: metadata,
  });

  try {
    await s3Client.send(command);
    return key;
  } catch (error) {
    console.error("S3へのアップロードエラー:", error);
    throw error;
  }
}

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
