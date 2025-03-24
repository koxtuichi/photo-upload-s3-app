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
  },
}));

// モックの型アサーション
const mockedS3ClientAPI = S3ClientAPI as jest.Mocked<typeof S3ClientAPI> & {
  listUserDirectories: jest.Mock;
  listDirectoryFiles: jest.Mock;
  getSignedImageUrl: jest.Mock;
  downloadFile: jest.Mock;
  downloadDirectory: jest.Mock;
};

// グローバルなURL.createObjectURLのモック
global.URL.createObjectURL = jest.fn();
global.URL.revokeObjectURL = jest.fn();

describe("ファイルブラウザUIテスト", () => {
  const userId = "test-user-123";

  // テスト用のモックデータ
  const mockDirectories = [
    { Prefix: `user/${userId}/jpg/`, CommonPrefixes: [] },
  ];

  const mockFiles = [
    {
      Key: `user/${userId}/jpg/file1.jpg`,
      Size: 1024,
      LastModified: new Date(),
    },
    {
      Key: `user/${userId}/jpg/file2.jpg`,
      Size: 2048,
      LastModified: new Date(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // モックの実装
    mockedS3ClientAPI.listUserDirectories.mockResolvedValue(mockDirectories);
    mockedS3ClientAPI.listDirectoryFiles.mockResolvedValue(mockFiles);
    mockedS3ClientAPI.getSignedImageUrl.mockResolvedValue(
      "https://example.com/mock-image.jpg"
    );
    mockedS3ClientAPI.downloadFile.mockResolvedValue(
      new Blob(["dummy-content"])
    );
    mockedS3ClientAPI.downloadDirectory.mockResolvedValue(
      new Blob(["dummy-zip-content"])
    );
  });

  // テスト1: ファイルカードにダウンロードリンクテキストが表示されないこと
  test("ファイルカードにダウンロードリンクテキストが表示されないこと", async () => {
    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // ディレクトリをクリックしてファイル一覧を表示
    fireEvent.click(screen.getByText("jpg"));

    // ファイル一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("file1.jpg")).toBeInTheDocument();
    });

    // ダウンロードリンクテキストが存在しないことを確認
    expect(screen.queryByText("ダウンロード")).not.toBeInTheDocument();
  });

  // テスト2: チェックボックスをクリックするとファイルが選択されること
  test("チェックボックスをクリックするとファイルが選択されること", async () => {
    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // ディレクトリをクリックしてファイル一覧を表示
    fireEvent.click(screen.getByText("jpg"));

    // ファイル一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("file1.jpg")).toBeInTheDocument();
    });

    // ファイルのチェックボックスを取得
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);

    // チェックボックスをクリック
    fireEvent.click(checkboxes[0]);

    // ファイルが選択され、選択状態のUIが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/個のファイルを選択中/)).toBeInTheDocument();
    });
  });

  // テスト3: 複数のファイルが選択できること
  test("複数のファイルが選択できること", async () => {
    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // ディレクトリをクリックしてファイル一覧を表示
    fireEvent.click(screen.getByText("jpg"));

    // ファイル一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("file1.jpg")).toBeInTheDocument();
      expect(screen.getByText("file2.jpg")).toBeInTheDocument();
    });

    // すべてのチェックボックスを取得
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(2);

    // 両方のチェックボックスをクリック
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    // 2つのファイルが選択されていることを確認
    await waitFor(() => {
      expect(screen.getByText("2個のファイルを選択中")).toBeInTheDocument();
    });
  });

  // テスト4: 選択したファイルをまとめてダウンロードできること
  test("選択したファイルをまとめてダウンロードできること", async () => {
    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // ディレクトリをクリックしてファイル一覧を表示
    fireEvent.click(screen.getByText("jpg"));

    // ファイル一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("file1.jpg")).toBeInTheDocument();
    });

    // ファイルのチェックボックスを取得してクリック
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    // 選択されたことを確認
    await waitFor(() => {
      expect(screen.getByText(/個のファイルを選択中/)).toBeInTheDocument();
    });

    // ダウンロードボタンをクリック
    const downloadButton = screen.getByText("ダウンロード", {
      selector: "button",
    });
    fireEvent.click(downloadButton);

    // ダウンロード処理が呼ばれることを確認
    await waitFor(() => {
      expect(mockedS3ClientAPI.downloadFile).toHaveBeenCalled();
    });
  });

  // テスト5: ファイルカード自体をクリックしてもファイルが選択されること
  test("ファイルカード自体をクリックしてもファイルが選択されること", async () => {
    render(<FileBrowser userId={userId} />);

    // ディレクトリ一覧の読み込み完了を待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // ディレクトリをクリックしてファイル一覧を表示
    fireEvent.click(screen.getByText("jpg"));

    // ファイル一覧の読み込み完了を待機
    await waitFor(() => {
      expect(
        screen.getByText("file1.jpg", { selector: ".font-medium.truncate" })
      ).toBeInTheDocument();
    });

    // ファイル名を含むファイルカードの要素を取得してクリック
    const fileCard = screen
      .getByText("file1.jpg", { selector: ".font-medium.truncate" })
      .closest(".border");
    if (fileCard) {
      fireEvent.click(fileCard);

      // ファイルが選択されることを確認（タイムアウトを長めに設定）
      await waitFor(
        () => {
          expect(screen.getByText("1個のファイルを選択中")).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    }
  });
});
