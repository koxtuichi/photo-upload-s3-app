import React, { useState } from "react";
import { Tag } from "@/store/tagStore";

interface TagSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (tags: Tag[]) => void;
  existingTags: Tag[];
  selectedTags: Tag[];
}

const TagSelectionModal: React.FC<TagSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  existingTags,
  selectedTags,
}) => {
  const [localSelectedTags, setLocalSelectedTags] =
    useState<Tag[]>(selectedTags);

  if (!isOpen) return null;

  const handleTagClick = (tag: Tag) => {
    setLocalSelectedTags((prev) => {
      const isSelected = prev.some((t) => t.id === tag.id);
      if (isSelected) {
        return prev.filter((t) => t.id !== tag.id);
      } else {
        return [...prev, tag];
      }
    });
  };

  const handleSubmit = () => {
    onSelect(localSelectedTags);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg w-full max-w-md">
        <h3 className="text-lg font-medium mb-4">タグを選択</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {existingTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => handleTagClick(tag)}
              className={`px-3 py-1 rounded-full text-sm ${
                localSelectedTags.some((t) => t.id === tag.id)
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              {tag.name}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
};

export default TagSelectionModal;
