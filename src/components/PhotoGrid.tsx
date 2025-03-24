import React, { useState } from "react";
import { PhotoItem } from "@/store/photoStore";
import { Tag, useTagStore } from "@/store/tagStore";
import PhotoCard from "./PhotoCard";

interface PhotoGridProps {
  photos: PhotoItem[];
}

const PhotoGrid: React.FC<PhotoGridProps> = ({ photos }) => {
  const { tags, deleteTag } = useTagStore();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // タグの選択/解除
  const handleTagClick = (tag: Tag) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag.id)) {
        return prev.filter((id) => id !== tag.id);
      } else {
        return [...prev, tag.id];
      }
    });
  };

  // タグの削除
  const handleDeleteTag = async (tagId: string) => {
    const photoCount = photos.filter((photo) =>
      photo.tags?.some((tag) => tag.id === tagId)
    ).length;
    if (
      window.confirm(
        `${photoCount}枚の写真が紐づいていますが、削除していいですか？`
      )
    ) {
      try {
        await deleteTag(tagId);
      } catch (error) {
        console.error("タグの削除エラー:", error);
        alert("タグの削除中にエラーが発生しました。");
      }
    }
  };

  // 写真のフィルタリング
  const filteredPhotos =
    selectedTags.length > 0
      ? photos.filter((photo) =>
          selectedTags.every((tagId) =>
            photo.tags?.some((tag) => tag.id === tagId)
          )
        )
      : photos;

  return (
    <div className="space-y-4">
      {/* タグ一覧 */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-full text-sm flex items-center"
          >
            <span
              onClick={() => handleTagClick(tag)}
              className={`cursor-pointer ${
                selectedTags.includes(tag.id)
                  ? "text-blue-500 font-medium"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              {tag.name}
            </span>
            <button
              onClick={() => handleDeleteTag(tag.id)}
              className="ml-2 w-4 h-4 flex items-center justify-center text-gray-500 hover:text-red-500"
              aria-label="タグを削除"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* 写真グリッド */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredPhotos.map((photo) => (
          <PhotoCard key={photo.key} photo={photo} />
        ))}
      </div>
    </div>
  );
};

export default PhotoGrid;
