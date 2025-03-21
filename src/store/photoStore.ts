import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  listUserFiles,
  getSignedImageUrl,
  uploadFileToS3,
  deleteFileFromS3,
} from "@/lib/s3";

export interface PhotoItem {
  key: string;
  url?: string;
  uploadDate: Date;
  name: string;
  size?: number;
  isLoading?: boolean;
}

interface PhotoStore {
  photos: PhotoItem[];
  isLoading: boolean;
  error: string | null;

  // アクション
  fetchUserPhotos: (userId: string) => Promise<void>;
  uploadPhoto: (userId: string, file: File) => Promise<void>;
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
      uploadPhoto: async (userId: string, file: File) => {
        set({ isLoading: true, error: null });
        try {
          const key = await uploadFileToS3(userId, file);
          const fileName = file.name;

          // アップロードした写真を追加
          const newPhoto: PhotoItem = {
            key,
            uploadDate: new Date(),
            name: fileName,
            size: file.size,
            isLoading: true,
          };

          set((state) => ({
            photos: [newPhoto, ...state.photos],
            isLoading: false,
          }));

          // 署名付きURLを取得して更新
          try {
            const url = await getSignedImageUrl(key);
            set((state) => ({
              photos: state.photos.map((p) =>
                p.key === key ? { ...p, url, isLoading: false } : p
              ),
            }));
          } catch (error) {
            console.error(`アップロード写真URLの取得エラー:`, error);
          }
        } catch (error: any) {
          set({ isLoading: false, error: error.message });
          console.error("写真のアップロードエラー:", error);
        }
      },

      // 写真を削除
      deletePhoto: async (key: string) => {
        set({ isLoading: true, error: null });
        try {
          await deleteFileFromS3(key);
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
