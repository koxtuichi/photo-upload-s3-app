import { S3ClientAPI } from "./s3";

/**
 * アップロードハンドラー
 * ファイルをS3にアップロードする処理
 * - RAWファイルの場合は、S3イベント通知でLambda関数が自動的にサムネイルを生成
 */

interface UploadOptions {
  file: File;
  userId: string;
  path?: string;
  onProgress?: (progress: number) => void;
  onComplete?: (url: string) => void;
  onError?: (error: Error) => void;
}

// S3アップロード結果の型定義
interface S3UploadResult {
  key: string;
  url: string;
}

/**
 * ファイルをS3にアップロードする
 * RAWファイルの場合はS3イベント通知でLambda関数が自動的にサムネイルを生成する
 */
export const uploadFile = async ({
  file,
  userId,
  path = "",
  onProgress,
  onComplete,
  onError,
}: UploadOptions): Promise<string> => {
  try {
    // ファイルサイズが0の場合はエラー
    if (file.size === 0) {
      throw new Error("ファイルサイズが0です");
    }

    // アップロード先のパスを決定
    const uploadPath =
      path ||
      `user/${userId}/raw/${new Date().getFullYear()}/${(
        new Date().getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}/${new Date()
        .getDate()
        .toString()
        .padStart(2, "0")}/${file.name}`;

    console.log(`ファイルアップロード開始: ${file.name}, パス: ${uploadPath}`);

    // S3にファイルをアップロード
    const uploadResult = await S3ClientAPI.uploadFile(
      file,
      uploadPath,
      (progress) => {
        if (onProgress) onProgress(progress);
      }
    );

    console.log(`ファイルアップロード完了: ${uploadResult.key}`);

    // 完了コールバック
    if (onComplete) onComplete(uploadResult.url);

    return uploadResult.key;
  } catch (error) {
    console.error("アップロードエラー:", error);
    if (onError) onError(error as Error);
    throw error;
  }
};

/**
 * フォルダをS3にアップロードする（フォルダの場合は0バイトのオブジェクトを作成）
 */
export const uploadFolder = async (
  folderName: string,
  userId: string,
  parentPath: string = ""
): Promise<string> => {
  try {
    const folderPath = `${parentPath}${folderName}/`;
    console.log(`フォルダ作成: ${folderPath}`);

    // S3は実際にはフォルダという概念がないため、0バイトのオブジェクトを作成
    const emptyFile = new Blob([""], { type: "text/plain" });
    const uploadResult = await S3ClientAPI.uploadFile(
      new File([emptyFile], ".folder", { type: "text/plain" }),
      folderPath
    );

    return folderPath;
  } catch (error) {
    console.error("フォルダ作成エラー:", error);
    throw error;
  }
};
