import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Tag {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TagState {
  tags: Tag[];
  selectedTags: string[];
  filterMode: "AND" | "OR";
  addTag: (name: string) => void;
  editTag: (id: string, newName: string) => void;
  deleteTag: (id: string) => void;
  setSelectedTags: (tags: string[]) => void;
  setFilterMode: (mode: "AND" | "OR") => void;
  clearFilters: () => void;
}

export const useTagStore = create<TagState>()(
  persist(
    (set) => ({
      tags: [],
      selectedTags: [],
      filterMode: "AND",
      addTag: (name) =>
        set((state) => ({
          tags: [
            ...state.tags,
            {
              id: crypto.randomUUID(),
              name,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        })),
      editTag: (id, newName) =>
        set((state) => ({
          tags: state.tags.map((tag) =>
            tag.id === id
              ? { ...tag, name: newName, updatedAt: new Date() }
              : tag
          ),
        })),
      deleteTag: (id) =>
        set((state) => ({
          tags: state.tags.filter((tag) => tag.id !== id),
        })),
      setSelectedTags: (tags) => set({ selectedTags: tags }),
      setFilterMode: (mode) => set({ filterMode: mode }),
      clearFilters: () => set({ selectedTags: [], filterMode: "AND" }),
    }),
    {
      name: "tag-storage",
    }
  )
);
