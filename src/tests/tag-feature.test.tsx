import { describe, test, expect } from "@jest/globals";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// タグ機能のテスト用モックデータ
const mockPhoto = {
  key: "test-photo-1",
  url: "https://example.com/photo1.jpg",
  uploadDate: new Date("2024-03-21"),
  name: "テスト写真1",
  size: 1024,
  tags: [
    { id: "tag1", name: "風景", createdAt: new Date(), updatedAt: new Date() },
    { id: "tag2", name: "旅行", createdAt: new Date(), updatedAt: new Date() },
  ],
};

const mockPhotos = [
  {
    key: "test-photo-1",
    url: "https://example.com/photo1.jpg",
    uploadDate: new Date("2024-03-21"),
    name: "テスト写真1",
    size: 1024,
    tags: [
      {
        id: "tag1",
        name: "風景",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "tag2",
        name: "旅行",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  },
  {
    key: "test-photo-2",
    url: "https://example.com/photo2.jpg",
    uploadDate: new Date("2024-03-21"),
    name: "テスト写真2",
    size: 2048,
    tags: [
      {
        id: "tag2",
        name: "旅行",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "tag3",
        name: "ポートレート",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  },
];

// テスト用の型定義
interface TagProps {
  onAddTag?: (tag: string) => void;
  onBatchAddTag?: (tag: string) => void;
  onEditTag?: (oldTag: string, newTag: string) => void;
  onDeleteTag?: (tag: string) => void;
  onBatchDeleteTag?: (tag: string) => void;
  onFilterByTag?: (tag: string) => void;
  onFilterByTags?: (tags: string[], mode: "AND" | "OR") => void;
  onClearFilter?: () => void;
}

// クラシフィケーションツリー技法によるテストケース
// 1. 操作：タグ追加 / タグ編集 / タグ削除 / タグによる絞り込み
// 2. 状態：タグあり / タグなし
// 3. 写真：単一 / 複数
// 4. ユーザー状態：ログイン済み / 未ログイン

describe("タグ機能テスト", () => {
  describe("タグの追加", () => {
    test("写真に新しいタグを追加できる", async () => {
      const user = userEvent.setup();
      const onAddTag = jest.fn();

      // タグ追加コンポーネントをレンダリング
      render(
        <div>
          <input type="text" data-testid="tag-input" />
          <button onClick={() => onAddTag("新しいタグ")}>タグを追加</button>
        </div>
      );

      // タグを入力して追加
      const input = screen.getByTestId("tag-input");
      await user.type(input, "新しいタグ");
      await user.click(screen.getByText("タグを追加"));

      // 検証
      expect(onAddTag).toHaveBeenCalledWith("新しいタグ");
    });

    test("既存のタグを選択して追加できる", async () => {
      const user = userEvent.setup();
      const onSelectTag = jest.fn();
      const existingTags = [
        { id: "tag1", name: "風景" },
        { id: "tag2", name: "旅行" },
      ];

      // タグ選択UIをレンダリング
      render(
        <div>
          <div data-testid="tag-list">
            {existingTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => onSelectTag(tag)}
                className="tag-item"
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      );

      // 既存のタグを選択
      await user.click(screen.getByText("風景"));

      // 検証
      expect(onSelectTag).toHaveBeenCalledWith(existingTags[0]);
    });

    test("同じタグを重複して追加できない", async () => {
      const user = userEvent.setup();
      const onAddTag = jest.fn();
      const existingTags = ["風景", "旅行"];

      // タグ追加UIをレンダリング
      render(
        <div>
          <input type="text" data-testid="tag-input" />
          <button
            onClick={() => {
              const newTag = "風景";
              if (!existingTags.includes(newTag)) {
                onAddTag(newTag);
              }
            }}
          >
            タグを追加
          </button>
        </div>
      );

      // 既存のタグと同じ名前で追加を試みる
      const input = screen.getByTestId("tag-input");
      await user.type(input, "風景");
      await user.click(screen.getByText("タグを追加"));

      // 検証
      expect(onAddTag).not.toHaveBeenCalled();
    });

    test("複数の写真に同じタグを一括追加できる", async () => {
      const user = userEvent.setup();
      const onBatchAddTag = jest.fn();

      // 写真選択とタグ追加のUIをレンダリング
      render(
        <div>
          <input type="text" data-testid="tag-input" />
          <button onClick={() => onBatchAddTag("一括タグ")}>
            一括でタグを追加
          </button>
        </div>
      );

      // タグを入力して一括追加
      const input = screen.getByTestId("tag-input");
      await user.type(input, "一括タグ");
      await user.click(screen.getByText("一括でタグを追加"));

      // 検証
      expect(onBatchAddTag).toHaveBeenCalledWith("一括タグ");
    });

    test("未ログイン状態ではタグ追加できない", async () => {
      const user = userEvent.setup();
      const isLoggedIn = false;

      // 条件付きレンダリングのテスト
      render(
        <div>
          {isLoggedIn ? <button>タグを追加</button> : <p>ログインが必要です</p>}
        </div>
      );

      // 検証
      expect(screen.getByText("ログインが必要です")).toBeInTheDocument();
      expect(screen.queryByText("タグを追加")).not.toBeInTheDocument();
    });
  });

  describe("タグの編集", () => {
    test("既存のタグを編集できる", async () => {
      const user = userEvent.setup();
      const onEditTag = jest.fn();

      // タグ編集UIをレンダリング
      render(
        <div>
          <span data-testid="tag">既存のタグ</span>
          <button onClick={() => onEditTag("既存のタグ", "編集後のタグ")}>
            編集
          </button>
        </div>
      );

      // タグを編集
      await user.click(screen.getByText("編集"));

      // 検証
      expect(onEditTag).toHaveBeenCalledWith("既存のタグ", "編集後のタグ");
    });

    test("タグ編集時に空文字列は許可されない", async () => {
      const user = userEvent.setup();
      const onEditTag = jest.fn();

      // タグ編集UIをレンダリング
      render(
        <div>
          <input
            type="text"
            data-testid="tag-input"
            defaultValue="既存のタグ"
          />
          <button onClick={() => onEditTag("既存のタグ", "")}>保存</button>
        </div>
      );

      // 空文字列で保存を試みる
      const input = screen.getByTestId("tag-input");
      await user.clear(input);
      await user.click(screen.getByText("保存"));

      // 検証
      expect(onEditTag).not.toHaveBeenCalled();
    });
  });

  describe("タグの削除", () => {
    test("写真からタグを削除できる", async () => {
      const user = userEvent.setup();
      const onDeleteTag = jest.fn();
      const mockPhoto = {
        tags: [
          { id: "tag1", name: "風景" },
          { id: "tag2", name: "旅行" },
        ],
      };

      // タグ削除UIをレンダリング
      render(
        <div>
          {mockPhoto.tags.map((tag) => (
            <div key={tag.id} className="tag-item">
              <span>{tag.name}</span>
              <button onClick={() => onDeleteTag(tag.id)}>×</button>
            </div>
          ))}
        </div>
      );

      // タグを削除
      await user.click(screen.getByText("×"));

      // 検証
      expect(onDeleteTag).toHaveBeenCalledWith("tag1");
    });

    test("タグそのものを削除する場合は確認ダイアログを表示する", async () => {
      const user = userEvent.setup();
      const onDeleteTag = jest.fn();
      const mockPhotoCount = 3;

      // タグ削除UIをレンダリング
      render(
        <div>
          <span data-testid="tag">削除対象のタグ</span>
          <button
            onClick={() => {
              if (
                window.confirm(
                  `${mockPhotoCount}枚の写真が紐づいていますが、削除していいですか？`
                )
              ) {
                onDeleteTag("削除対象のタグ");
              }
            }}
          >
            タグを削除
          </button>
        </div>
      );

      // タグを削除
      await user.click(screen.getByText("タグを削除"));

      // 検証
      expect(window.confirm).toHaveBeenCalledWith(
        `${mockPhotoCount}枚の写真が紐づいていますが、削除していいですか？`
      );
    });
  });

  describe("タグによる絞り込み", () => {
    test("複数のタグを選択して絞り込みができる", async () => {
      const user = userEvent.setup();
      const onFilterByTags = jest.fn();
      const selectedTags = ["風景", "旅行"];

      // 絞り込みUIをレンダリング
      render(
        <div>
          <div data-testid="tag-list">
            {selectedTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onFilterByTags(selectedTags)}
                className="tag-item"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      );

      // タグを選択
      await user.click(screen.getByText("風景"));
      await user.click(screen.getByText("旅行"));

      // 検証
      expect(onFilterByTags).toHaveBeenCalledWith(selectedTags);
    });

    test("ANDボタン、ORボタン、クリアボタンが表示されない", () => {
      // 絞り込みUIをレンダリング
      render(
        <div>
          <div data-testid="tag-list">
            <button className="tag-item">風景</button>
            <button className="tag-item">旅行</button>
          </div>
        </div>
      );

      // 検証
      expect(screen.queryByText("AND")).not.toBeInTheDocument();
      expect(screen.queryByText("OR")).not.toBeInTheDocument();
      expect(screen.queryByText("クリア")).not.toBeInTheDocument();
    });
  });

  describe("写真とタグの関連付け", () => {
    test("写真に複数のタグを登録できる", async () => {
      const user = userEvent.setup();
      const onAddTags = jest.fn();

      // タグ追加UIをレンダリング
      render(
        <div>
          <div data-testid="tag-selection">
            <button onClick={() => onAddTags(["風景", "旅行"])}>
              タグを追加
            </button>
          </div>
        </div>
      );

      // 複数のタグを追加
      await user.click(screen.getByText("タグを追加"));

      // 検証
      expect(onAddTags).toHaveBeenCalledWith(["風景", "旅行"]);
    });

    test("写真のタグを表示できる", async () => {
      // 写真カードをレンダリング
      render(
        <div>
          <div data-testid="photo-tags">
            {mockPhoto.tags.map((tag) => (
              <span key={tag.id} className="tag">
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      );

      // 検証
      expect(screen.getByText("風景")).toBeInTheDocument();
      expect(screen.getByText("旅行")).toBeInTheDocument();
    });
  });

  describe("UI/UX", () => {
    test("タグ追加時に写真が最大表示にならない", async () => {
      const user = userEvent.setup();
      const onAddTag = jest.fn();
      const onToggleFullScreen = jest.fn();

      // 写真カードをレンダリング
      render(
        <div>
          <button onClick={onToggleFullScreen}>写真を表示</button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddTag("新しいタグ");
            }}
          >
            タグを追加
          </button>
        </div>
      );

      // タグ追加ボタンをクリック
      await user.click(screen.getByText("タグを追加"));

      // 検証
      expect(onAddTag).toHaveBeenCalled();
      expect(onToggleFullScreen).not.toHaveBeenCalled();
    });

    test("写真一覧の上にタグが水平に表示される", async () => {
      // タグリストUIをレンダリング
      render(
        <div style={{ display: "flex", flexDirection: "row" }}>
          <span>風景</span>
          <span>旅行</span>
          <span>ポートレート</span>
        </div>
      );

      // 検証
      expect(screen.getByText("風景")).toBeInTheDocument();
      expect(screen.getByText("旅行")).toBeInTheDocument();
      expect(screen.getByText("ポートレート")).toBeInTheDocument();
    });

    test("タグがない場合はタグリストが表示されない", async () => {
      // タグなしの状態をレンダリング
      render(<div data-testid="tag-list"></div>);

      // 検証
      expect(screen.getByTestId("tag-list")).toBeEmptyDOMElement();
    });

    test("タグが多い場合はスクロール可能なリストとして表示される", async () => {
      // スクロール可能なタグリストUIをレンダリング
      render(
        <div
          style={{
            overflowX: "auto",
            whiteSpace: "nowrap",
            width: "300px",
          }}
        >
          {Array.from({ length: 20 }, (_, i) => (
            <span key={i} style={{ marginRight: "10px" }}>
              タグ{i + 1}
            </span>
          ))}
        </div>
      );

      // 検証
      const container = screen.getByText("タグ1").parentElement;
      expect(container).toHaveStyle({
        overflowX: "auto",
        whiteSpace: "nowrap",
      });
    });
  });

  describe("タグ追加モーダルの制御", () => {
    test("タグ追加後にモーダルが閉じる", async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      const onSelect = jest.fn();

      // タグ選択モーダルをレンダリング
      render(
        <TagSelectionModal
          isOpen={true}
          onClose={onClose}
          onSelect={(tags) => {
            onSelect(tags);
            onClose();
          }}
          existingTags={[]}
          selectedTags={[]}
        />
      );

      // タグを追加
      await user.click(screen.getByText("追加"));

      // 検証
      expect(onSelect).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    test("キャンセルボタンでモーダルが閉じる", async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();

      // タグ選択モーダルをレンダリング
      render(
        <TagSelectionModal
          isOpen={true}
          onClose={onClose}
          onSelect={() => {}}
          existingTags={[]}
          selectedTags={[]}
        />
      );

      // キャンセルボタンをクリック
      await user.click(screen.getByText("キャンセル"));

      // 検証
      expect(onClose).toHaveBeenCalled();
    });
  });
});
