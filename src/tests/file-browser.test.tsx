import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import FileBrowser from "@/components/FileBrowser";
import { S3ClientAPI } from "@/lib/s3";

// S3クライアントAPIのモック
jest.mock("@/lib/s3", () => ({
  S3ClientAPI: {
    listUserDirectories: jest.fn(),
    listDirectoryFiles: jest.fn(),
    getSignedImageUrl: jest.fn(),
    downloadFile: jest.fn(),
    downloadDirectory: jest.fn(),
  },
}));

// グローバルなURL.createObjectURLのモック
global.URL.createObjectURL = jest.fn();
global.URL.revokeObjectURL = jest.fn();

describe("FileBrowser コンポーネントのテスト", () => {
  const userId = "test-user-123";

  // テスト用のモックデータ
  const mockDirectories = [
    { Prefix: `user/${userId}/jpg/`, CommonPrefixes: [] },
    { Prefix: `user/${userId}/raw/`, CommonPrefixes: [] },
  ];

  const mockJpgFiles = [
    {
      Key: `user/${userId}/jpg/sample1.jpg`,
      Size: 1024,
      LastModified: new Date(),
    },
    {
      Key: `user/${userId}/jpg/sample2.jpg`,
      Size: 2048,
      LastModified: new Date(),
    },
  ];

  const mockRawFiles = [
    {
      Key: `user/${userId}/raw/sample1.raw`,
      Size: 5120,
      LastModified: new Date(),
    },
    {
      Key: `user/${userId}/raw/sample2.pef`,
      Size: 6144,
      LastModified: new Date(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // モックの実装
    S3ClientAPI.listUserDirectories.mockResolvedValue(mockDirectories);
    S3ClientAPI.listDirectoryFiles.mockImplementation((path) => {
      if (path.includes("/jpg/")) {
        return Promise.resolve(mockJpgFiles);
      } else if (path.includes("/raw/")) {
        return Promise.resolve(mockRawFiles);
      }
      return Promise.resolve([]);
    });
    S3ClientAPI.getSignedImageUrl.mockResolvedValue("mocked-image-url");
    S3ClientAPI.downloadFile.mockResolvedValue(new Blob(["dummy-content"]));
    S3ClientAPI.downloadDirectory.mockResolvedValue(
      new Blob(["dummy-zip-content"])
    );
  });

  test("ディレクトリ一覧が正しく表示される", async () => {
    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込みを待機
    await waitFor(() => {
      expect(S3ClientAPI.listUserDirectories).toHaveBeenCalledWith(userId);
    });

    // ディレクトリ名が表示されることを確認
    expect(screen.getByText("jpg")).toBeInTheDocument();
    expect(screen.getByText("raw")).toBeInTheDocument();
  });

  test("ディレクトリをクリックすると、そのディレクトリのファイルが表示される", async () => {
    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込みを待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // jpgディレクトリをクリック
    fireEvent.click(screen.getByText("jpg"));

    // ファイル一覧の読み込みを待機
    await waitFor(() => {
      expect(S3ClientAPI.listDirectoryFiles).toHaveBeenCalledWith(
        expect.stringContaining("/jpg/")
      );
    });

    // ファイル名が表示されることを確認
    expect(screen.getByText("sample1.jpg")).toBeInTheDocument();
    expect(screen.getByText("sample2.jpg")).toBeInTheDocument();
  });

  test("画像ファイルをクリックすると、プレビューが表示される", async () => {
    render(<FileBrowser userId={userId} />);

    // jpgディレクトリの選択とファイル一覧の読み込みを待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("jpg"));

    await waitFor(() => {
      expect(screen.getByText("sample1.jpg")).toBeInTheDocument();
    });

    // 画像ファイルをクリック
    fireEvent.click(screen.getByText("sample1.jpg"));

    // 署名付きURLの取得を待機
    await waitFor(() => {
      expect(S3ClientAPI.getSignedImageUrl).toHaveBeenCalledWith(
        expect.stringContaining("sample1.jpg")
      );
    });

    // プレビューが表示されることを確認
    expect(screen.getByText(/プレビュー/)).toBeInTheDocument();
  });

  test("ファイルのダウンロードボタンをクリックすると、ファイルがダウンロードされる", async () => {
    render(<FileBrowser userId={userId} />);

    // jpgディレクトリの選択とファイル一覧の読み込みを待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("jpg"));

    await waitFor(() => {
      expect(screen.getByText("sample1.jpg")).toBeInTheDocument();
    });

    // ダウンロードボタンをクリック
    const downloadButtons = screen.getAllByText("ダウンロード");
    fireEvent.click(downloadButtons[0]);

    // ダウンロード処理が呼ばれることを確認
    await waitFor(() => {
      expect(S3ClientAPI.downloadFile).toHaveBeenCalledWith(
        expect.stringContaining("sample1.jpg")
      );
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    });
  });

  test("ディレクトリのダウンロードボタンをクリックすると、ディレクトリがダウンロードされる", async () => {
    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込みを待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // ディレクトリダウンロードボタンをクリック
    const directoryDownloadButtons =
      screen.getAllByTitle("ディレクトリをダウンロード");
    fireEvent.click(directoryDownloadButtons[0]);

    // ディレクトリダウンロード処理が呼ばれることを確認
    await waitFor(() => {
      expect(S3ClientAPI.downloadDirectory).toHaveBeenCalledWith(
        expect.stringContaining("/jpg/")
      );
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    });
  });
});
