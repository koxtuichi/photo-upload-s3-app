export interface PhotoMetadata {
  // ファイル情報
  key: string; // S3のキー
  origFilename: string; // 元のファイル名
  size: number; // ファイルサイズ
  contentType: string; // MIMEタイプ

  // 撮影情報
  dateTimeOriginal?: string; // 撮影日時（EXIF）
  make?: string; // カメラメーカー
  model?: string; // カメラモデル

  // 追加メタデータ
  width?: number; // 画像幅
  height?: number; // 画像高さ
  iso?: number; // ISO感度
  exposureTime?: string; // 露出時間
  fNumber?: number; // F値
  focalLength?: number; // 焦点距離

  // ユーザー情報
  userId: string; // 所有者ID
  uploadDate: Date; // アップロード日時

  // サムネイル/JPG参照情報
  hasThumbnail: boolean; // サムネイルがあるか
  thumbnailKey?: string; // サムネイルのS3キー
  matchingJpgKey?: string; // 対応するJPGのS3キー（RAWの場合）

  // ファイルタイプ情報
  isRaw: boolean; // RAWファイルかどうか
}

export const createEmptyMetadata = (
  key: string,
  userId: string
): PhotoMetadata => {
  return {
    key,
    origFilename: key.split("/").pop() || "unknown",
    size: 0,
    contentType: "application/octet-stream",
    userId,
    uploadDate: new Date(),
    hasThumbnail: false,
    isRaw: false,
  };
};
