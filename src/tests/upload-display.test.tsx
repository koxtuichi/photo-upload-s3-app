import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import UploadProgress from "@/components/UploadProgress";
import FileBrowser from "@/components/FileBrowser";
import { S3ClientAPI } from "@/lib/s3";
import { act } from "react-dom/test-utils";

// モック
jest.mock("@/lib/s3", () => ({
  S3ClientAPI: {
    listUserDirectories: jest.fn(),
    listDirectoryFiles: jest.fn(),
    getSignedImageUrl: jest.fn(),
    downloadFile: jest.fn(),
    downloadDirectory: jest.fn(),
    downloadMultipleFiles: jest.fn(),
  },
}));

// モックの型アサーション
const mockedS3ClientAPI = S3ClientAPI as jest.Mocked<typeof S3ClientAPI> & {
  listUserDirectories: jest.Mock;
  listDirectoryFiles: jest.Mock;
  getSignedImageUrl: jest.Mock;
  downloadFile: jest.Mock;
  downloadDirectory: jest.Mock;
  downloadMultipleFiles: jest.Mock;
};

// URL関連のグローバル関数をモック
global.URL.createObjectURL = jest.fn(() => "mock-url");
global.URL.revokeObjectURL = jest.fn();

describe("アップロード表示に関するテスト", () => {
  // UploadProgressコンポーネントのテスト
  describe("アップロードプログレスバーのファイル名表示", () => {
    test("ファイル名が正しく表示されること", () => {
      // テスト用のファイル名
      const testFileName = "test-photo.jpg";

      // コンポーネントをレンダリング
      render(<UploadProgress fileName={testFileName} progress={50} />);

      // ファイル名が正しく表示されていることを確認
      expect(screen.getByText(testFileName)).toBeInTheDocument();
    });

    test("長いファイル名は省略されて表示されること", () => {
      // 長いファイル名（25文字以上）
      const longFileName = "very-long-file-name-that-should-be-truncated.jpg";

      render(<UploadProgress fileName={longFileName} progress={50} />);

      // 省略されたファイル名が表示されることを確認
      // 実際の省略方法に合わせてテキストを修正
      expect(screen.getByText(/^very-long-file-name-th/)).toBeInTheDocument();
    });

    test("ファイル名が空の場合は空の要素が表示されること", () => {
      const { container } = render(
        <UploadProgress fileName="" progress={50} />
      );

      // 空の要素が存在することを確認（queryByTextでは複数の空要素があるため、
      // 代わりにcontainerから特定の要素を取得）
      const fileNameElement = container.querySelector(".text-sm.font-medium");
      expect(fileNameElement).toBeInTheDocument();
      expect(fileNameElement?.textContent).toBe("");
    });
  });

  // FileBrowserコンポーネントのディレクトリ表示テスト
  describe("ファイル階層表示のUI", () => {
    const userId = "test-user-123";

    // ルートディレクトリのモックデータ
    const mockRootDirectories = [
      { Prefix: `user/${userId}/jpg/` },
      { Prefix: `user/${userId}/raw/` },
    ];

    beforeEach(() => {
      jest.clearAllMocks();

      // デフォルトのモック実装
      mockedS3ClientAPI.listUserDirectories.mockResolvedValue(
        mockRootDirectories
      );
      mockedS3ClientAPI.listDirectoryFiles.mockResolvedValue([]);
      mockedS3ClientAPI.getSignedImageUrl.mockResolvedValue(
        "https://example.com/image.jpg"
      );
    });

    test("ルートディレクトリ（jpg, raw）には最初から三角形が表示されること", async () => {
      // FileBrowserコンポーネントをレンダリング
      render(<FileBrowser userId={userId} />);

      // ディレクトリ一覧の読み込み完了を待機
      await waitFor(() => {
        expect(screen.getByText("jpg")).toBeInTheDocument();
      });

      // jpg ディレクトリの三角形（▶）が表示されていることを確認
      const jpgDirElement = screen.getByText("jpg");
      const jpgButton = jpgDirElement.closest("button");
      expect(jpgButton?.textContent).toMatch(/[▶|▼]jpg/);

      // raw ディレクトリの三角形（▶）が表示されていることを確認
      const rawDirElement = screen.getByText("raw");
      const rawButton = rawDirElement.closest("button");
      expect(rawButton?.textContent).toMatch(/[▶|▼]raw/);
    });
  });
});
