import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  listUserFiles,
  getSignedImageUrl,
  uploadFile,
  deleteFileFromS3,
} from "@/lib/s3";
import { Tag } from "./tagStore";
import {
  updateStorageUsed,
  checkStorageLimit,
} from "@/lib/subscriptionService";

export interface PhotoItem {
  key: string;
  url?: string;
  uploadDate: Date;
  name: string;
  size?: number;
  isLoading?: boolean;
  tags?: Tag[];
}

interface PhotoStore {
  photos: PhotoItem[];
  isLoading: boolean;
  error: string | null;

  // アクション
  fetchUserPhotos: (userId: string) => Promise<void>;
  uploadPhoto: (
    userId: string,
    file: File,
    onProgress?: (progress: number) => void
  ) => Promise<void>;
  deletePhoto: (key: string) => Promise<void>;
  clearPhotos: () => void;
}

export const usePhotoStore = create<PhotoStore>()(
  persist(
    (set, get) => ({
      photos: [],
      isLoading: false,
      error: null,

      // ユーザーの写真を取得
      fetchUserPhotos: async (userId: string) => {
        set({ isLoading: true, error: null });
        try {
          const objects = await listUserFiles(userId);

          // ユーザーの写真がない場合は早期リターン
          if (!objects || objects.length === 0) {
            set({ photos: [], isLoading: false });
            return;
          }

          // S3オブジェクトから写真アイテムに変換
          const photos: PhotoItem[] = objects
            .filter(
              (obj) => obj.Key && obj.Key.match(/\.(jpg|jpeg|png|gif|webp)$/i)
            ) // 画像ファイルのみフィルター
            .map((obj) => {
              const keyParts = obj.Key?.split("/") || [];
              const fileName = keyParts[keyParts.length - 1] || "";

              return {
                key: obj.Key || "",
                uploadDate: obj.LastModified || new Date(),
                name: fileName,
                size: obj.Size,
                isLoading: true, // URLロード中のフラグ
              };
            });

          set({ photos, isLoading: false });

          // 署名付きURLを非同期で取得
          photos.forEach(async (photo, index) => {
            try {
              const url = await getSignedImageUrl(photo.key);
              set((state) => ({
                photos: state.photos.map((p, i) =>
                  i === index ? { ...p, url, isLoading: false } : p
                ),
              }));
            } catch (error) {
              console.error(`写真URLの取得エラー (${photo.key}):`, error);
              // エラー時にもローディング状態を解除
              set((state) => ({
                photos: state.photos.map((p, i) =>
                  i === index ? { ...p, isLoading: false } : p
                ),
              }));
            }
          });
        } catch (error: any) {
          const errorMsg =
            error.message || "写真の取得中にエラーが発生しました";
          set({ isLoading: false, error: errorMsg });
          console.error("写真の取得エラー:", error);
        }
      },

      // 写真をアップロード
      uploadPhoto: async (
        userId: string,
        file: File,
        onProgress?: (progress: number) => void
      ) => {
        set({ isLoading: true, error: null });
        try {
          // ストレージ制限のチェック
          const hasEnoughStorage = await checkStorageLimit(userId, file.size);
          if (!hasEnoughStorage) {
            throw new Error(
              "ストレージ容量が不足しています。プランをアップグレードしてください。"
            );
          }

          // 新しいuploadFile関数を使用
          const { key, url } = await uploadFile(file, userId, onProgress);
          const fileName = file.name;

          // ストレージ使用量の更新
          await updateStorageUsed(userId, file.size);

          // アップロードした写真を追加
          const newPhoto: PhotoItem = {
            key,
            url, // 署名付きURLはすでに返されている
            uploadDate: new Date(),
            name: fileName,
            size: file.size,
            isLoading: false, // URLは既に取得済み
          };

          set((state) => ({
            photos: [newPhoto, ...state.photos],
            isLoading: false,
          }));
        } catch (error: any) {
          set({ isLoading: false, error: error.message });
          console.error("写真のアップロードエラー:", error);
          throw error; // エラーを伝播させる
        }
      },

      // 写真を削除
      deletePhoto: async (key: string) => {
        set({ isLoading: true, error: null });
        try {
          // 削除前に写真のサイズを記録
          const photoToDelete = get().photos.find((photo) => photo.key === key);
          const fileSize = photoToDelete?.size || 0;

          // S3から削除
          await deleteFileFromS3(key);

          // 削除に成功したらストレージ使用量を減らす
          // keyからユーザーIDを抽出（形式: users/USER_ID/...）
          const userId = key.split("/")[1];
          if (userId && fileSize > 0) {
            // 負の値を渡してストレージ使用量を減らす
            await updateStorageUsed(userId, -fileSize);
          }

          set((state) => ({
            photos: state.photos.filter((photo) => photo.key !== key),
            isLoading: false,
          }));
        } catch (error: any) {
          set({ isLoading: false, error: error.message });
          console.error("写真の削除エラー:", error);
        }
      },

      // 写真を全てクリア（ログアウト時など）
      clearPhotos: () => {
        set({ photos: [], error: null });
      },
    }),
    {
      name: "photo-storage", // ローカルストレージのキー
      partialize: (state) => ({ photos: state.photos }), // 保存する状態の一部
    }
  )
);
