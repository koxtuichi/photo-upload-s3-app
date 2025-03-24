import React, { useState } from "react";
import { useTagStore, Tag } from "@/store/tagStore";

const TagList: React.FC = () => {
  const {
    tags,
    selectedTags,
    setSelectedTags,
    setFilterMode,
    filterMode,
    clearFilters,
  } = useTagStore();
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  const handleAddTag = () => {
    if (newTagName.trim()) {
      useTagStore.getState().addTag(newTagName.trim());
      setNewTagName("");
      setIsAddingTag(false);
    }
  };

  const handleEditTag = (tag: Tag) => {
    setEditingTag(tag);
  };

  const handleSaveEdit = () => {
    if (editingTag && newTagName.trim()) {
      useTagStore.getState().editTag(editingTag.id, newTagName.trim());
      setEditingTag(null);
      setNewTagName("");
    }
  };

  const handleDeleteTag = (id: string) => {
    if (window.confirm("このタグを削除しますか？")) {
      useTagStore.getState().deleteTag(id);
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags(
      selectedTags.includes(tagId)
        ? selectedTags.filter((id) => id !== tagId)
        : [...selectedTags, tagId]
    );
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">タグ</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterMode(filterMode === "AND" ? "OR" : "AND")}
            className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded"
          >
            {filterMode === "AND" ? "AND" : "OR"}
          </button>
          {selectedTags.length > 0 && (
            <button
              onClick={clearFilters}
              className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded"
            >
              クリア
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag) => (
          <div
            key={tag.id}
            className={`px-3 py-1 rounded-full text-sm cursor-pointer transition-colors ${
              selectedTags.includes(tag.id)
                ? "bg-blue-500 text-white"
                : "bg-gray-200 dark:bg-gray-700"
            }`}
            onClick={() => toggleTag(tag.id)}
          >
            {editingTag?.id === tag.id ? (
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="bg-transparent border-none focus:outline-none"
                onBlur={handleSaveEdit}
                onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
              />
            ) : (
              <span>{tag.name}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {isAddingTag ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="新しいタグ"
              className="px-3 py-1 border rounded"
              onBlur={handleAddTag}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
            />
            <button
              onClick={() => setIsAddingTag(false)}
              className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded"
            >
              キャンセル
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingTag(true)}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded"
          >
            タグを追加
          </button>
        )}
      </div>
    </div>
  );
};

export default TagList;
