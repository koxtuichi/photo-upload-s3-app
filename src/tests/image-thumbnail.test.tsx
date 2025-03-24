import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import FileBrowser from "@/components/FileBrowser";
import { S3ClientAPI } from "@/lib/s3";

// S3ClientAPIをモック
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

// Next/imageをモック
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => {
    return <img {...props} />;
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

// グローバルなURL.createObjectURLとrevokeObjectURLのモック
global.URL.createObjectURL = jest.fn(() => "mock-blob-url");
global.URL.revokeObjectURL = jest.fn();

describe("画像サムネイル表示機能テスト", () => {
  const userId = "test-user-123";

  // モックデータ
  const mockDirectories = [{ Prefix: "user/test-user-123/jpg/" }];

  // JPGファイルとその他のファイルが混在するモックデータ
  const mockFiles = [
    {
      Key: "user/test-user-123/jpg/sample1.jpg",
      Size: 1024,
      LastModified: new Date("2025/03/24"),
    },
    {
      Key: "user/test-user-123/jpg/sample2.jpg",
      Size: 2048,
      LastModified: new Date("2025/03/24"),
    },
    {
      Key: "user/test-user-123/jpg/document.pdf",
      Size: 3072,
      LastModified: new Date("2025/03/24"),
    },
    {
      Key: "user/test-user-123/jpg/archive.zip",
      Size: 4096,
      LastModified: new Date("2025/03/24"),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // モックの実装
    mockedS3ClientAPI.listUserDirectories.mockResolvedValue(mockDirectories);
    mockedS3ClientAPI.listDirectoryFiles.mockResolvedValue(mockFiles);
    mockedS3ClientAPI.getSignedImageUrl.mockResolvedValue(
      "https://example.com/sample-image.jpg"
    );
    mockedS3ClientAPI.downloadFile.mockResolvedValue(
      new Blob(["dummy-content"])
    );
    mockedS3ClientAPI.downloadDirectory.mockResolvedValue(
      new Blob(["dummy-zip-content"])
    );
    mockedS3ClientAPI.downloadMultipleFiles.mockResolvedValue(
      new Blob(["dummy-multiple-files-content"])
    );
  });

  /**
   * テストケース1: JPGファイルの場合はサムネイルが表示される
   * - 入力: JPGファイル
   * - 期待結果: サムネイルが表示される
   */
  test("JPGファイルの場合はサムネイルが表示される", async () => {
    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // ディレクトリをクリックしてファイル一覧を表示
    fireEvent.click(screen.getByText("jpg"));

    // ファイル一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("sample1.jpg")).toBeInTheDocument();
    });

    // getSignedImageUrlが呼ばれたことを確認（サムネイル取得）
    expect(mockedS3ClientAPI.getSignedImageUrl).toHaveBeenCalled();

    // 画像タグが存在することを確認
    await waitFor(() => {
      // サムネイル用の画像要素を確認
      const thumbnailImages = screen.getAllByRole("img");
      expect(thumbnailImages.length).toBeGreaterThan(0);
    });
  });

  /**
   * テストケース2: 非JPGファイルの場合はサムネイルではなくアイコンが表示される
   * - 入力: PDFファイル
   * - 期待結果: サムネイルではなくファイルタイプアイコンが表示される
   */
  test("非JPGファイルの場合はサムネイルではなくアイコンが表示される", async () => {
    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // ディレクトリをクリックしてファイル一覧を表示
    fireEvent.click(screen.getByText("jpg"));

    // ファイル一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("document.pdf")).toBeInTheDocument();
    });

    // PDFファイルのカードを見つける
    const pdfCard = screen.getByText("document.pdf").closest(".border");

    // PDFファイルのカード内にある画像がアイコンであることを確認
    // 実際の実装ではアイコン用のクラスや属性を確認する
    expect(pdfCard).not.toContainHTML("https://example.com");
  });

  /**
   * テストケース3: 画像をクリックすると大きいプレビューが表示される
   * - 入力: JPG画像のクリック
   * - 期待結果: 画像プレビューが表示される
   */
  test("画像をクリックすると大きいプレビューが表示される", async () => {
    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // ディレクトリをクリックしてファイル一覧を表示
    fireEvent.click(screen.getByText("jpg"));

    // ファイル一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("sample1.jpg")).toBeInTheDocument();
    });

    // 画像ファイルをクリック
    fireEvent.click(screen.getByText("sample1.jpg"));

    // プレビューセクションに画像が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText("プレビュー: sample1.jpg")).toBeInTheDocument();
      // プレビュー用の大きい画像が表示されていることを確認
      const previewImage = screen
        .getAllByRole("img")
        .find((img) => img.getAttribute("alt") === "sample1.jpg");
      expect(previewImage).toBeInTheDocument();
    });
  });

  /**
   * テストケース4: 画像読み込み中は読み込み状態が表示される
   * - 入力: 画像読み込み中の状態
   * - 期待結果: ローディング表示が出る
   */
  test("画像読み込み中は読み込み状態が表示される", async () => {
    // 画像URL取得を遅延させる
    mockedS3ClientAPI.getSignedImageUrl.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve("https://example.com/delayed-image.jpg"),
            100
          )
        )
    );

    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // ディレクトリをクリックしてファイル一覧を表示
    fireEvent.click(screen.getByText("jpg"));

    // ファイル一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("sample1.jpg")).toBeInTheDocument();
    });

    // 画像の読み込み状態が表示されていることを確認
    // 実際の実装によってはローディングスピナーやプレースホルダーのテスト方法が変わります
    const loading = screen.getAllByText(/読み込み中/i);
    expect(loading.length).toBeGreaterThan(0);
  });
});
