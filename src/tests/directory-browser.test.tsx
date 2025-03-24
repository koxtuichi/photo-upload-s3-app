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

describe("ディレクトリ構造表示テスト", () => {
  const userId = "test-user-123";

  /**
   * テストケース1: 新しいディレクトリ構造の表示
   * - 入力: 年/月/日ディレクトリ構造
   * - 期待結果: 階層構造が正しく表示される
   */
  test("新しい年/月/日ディレクトリ構造が正しく表示される", async () => {
    // ファイルタイプディレクトリ
    const mockDirectories = [
      { Prefix: "user/test-user-123/jpg/" },
      { Prefix: "user/test-user-123/raw/" },
    ];

    // JPGディレクトリ内の年ディレクトリ
    const mockYearDirs = [{ Key: "user/test-user-123/jpg/2025/" }];

    // 年ディレクトリ内の月ディレクトリ
    const mockMonthDirs = [
      { Key: "user/test-user-123/jpg/2025/03/" },
      { Key: "user/test-user-123/jpg/2025/04/" },
    ];

    // 月ディレクトリ内の日ディレクトリ
    const mockDayDirs = [
      { Key: "user/test-user-123/jpg/2025/03/01/" },
      { Key: "user/test-user-123/jpg/2025/03/15/" },
    ];

    // 日ディレクトリ内のファイル
    const mockFiles = [
      {
        Key: "user/test-user-123/jpg/2025/03/15/photo1.jpg",
        Size: 1024,
        LastModified: new Date("2025-03-15"),
      },
      {
        Key: "user/test-user-123/jpg/2025/03/15/photo2.jpg",
        Size: 2048,
        LastModified: new Date("2025-03-15"),
      },
    ];

    // リクエストパスに応じて異なるレスポンスを返すモック
    mockedS3ClientAPI.listUserDirectories.mockResolvedValue(mockDirectories);
    mockedS3ClientAPI.listDirectoryFiles.mockImplementation((path) => {
      if (path === "user/test-user-123/jpg/") {
        return Promise.resolve(mockYearDirs);
      } else if (path === "user/test-user-123/jpg/2025/") {
        return Promise.resolve(mockMonthDirs);
      } else if (path === "user/test-user-123/jpg/2025/03/") {
        return Promise.resolve(mockDayDirs);
      } else if (path === "user/test-user-123/jpg/2025/03/15/") {
        return Promise.resolve(mockFiles);
      }
      return Promise.resolve([]);
    });

    mockedS3ClientAPI.getSignedImageUrl.mockResolvedValue(
      "https://example.com/image.jpg"
    );

    render(<FileBrowser userId={userId} />);

    // ファイルタイプディレクトリ（jpg）が表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // jpgディレクトリをクリック
    fireEvent.click(screen.getByText("jpg"));

    // 年ディレクトリが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText("2025")).toBeInTheDocument();
    });

    // 年ディレクトリをクリック
    fireEvent.click(screen.getByText("2025"));

    // 月ディレクトリが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText("03")).toBeInTheDocument();
      expect(screen.getByText("04")).toBeInTheDocument();
    });

    // 3月のディレクトリをクリック
    fireEvent.click(screen.getByText("03"));

    // 日ディレクトリが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText("01")).toBeInTheDocument();
      expect(screen.getByText("15")).toBeInTheDocument();
    });

    // 15日のディレクトリをクリック
    fireEvent.click(screen.getByText("15"));

    // ファイルが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText("photo1.jpg")).toBeInTheDocument();
      expect(screen.getByText("photo2.jpg")).toBeInTheDocument();
    });
  });

  /**
   * テストケース2: 年月日ディレクトリ間の移動
   * - 入力: ディレクトリ階層のクリック操作
   * - 期待結果: 適切なディレクトリ内容が表示される
   */
  test("ディレクトリ間の移動が正しく機能する", async () => {
    // テストケース1と同じモックデータを使用

    const mockDirectories = [{ Prefix: "user/test-user-123/jpg/" }];

    const mockYearDirs = [{ Key: "user/test-user-123/jpg/2025/" }];

    const mockMonthDirs = [{ Key: "user/test-user-123/jpg/2025/03/" }];

    const mockDayDirs = [{ Key: "user/test-user-123/jpg/2025/03/15/" }];

    const mockFiles = [
      {
        Key: "user/test-user-123/jpg/2025/03/15/photo1.jpg",
        Size: 1024,
        LastModified: new Date("2025-03-15"),
      },
    ];

    // モックの設定
    mockedS3ClientAPI.listUserDirectories.mockResolvedValue(mockDirectories);
    mockedS3ClientAPI.listDirectoryFiles.mockImplementation((path) => {
      if (path === "user/test-user-123/jpg/") {
        return Promise.resolve(mockYearDirs);
      } else if (path === "user/test-user-123/jpg/2025/") {
        return Promise.resolve(mockMonthDirs);
      } else if (path === "user/test-user-123/jpg/2025/03/") {
        return Promise.resolve(mockDayDirs);
      } else if (path === "user/test-user-123/jpg/2025/03/15/") {
        return Promise.resolve(mockFiles);
      }
      return Promise.resolve([]);
    });

    render(<FileBrowser userId={userId} />);

    // ファイルタイプディレクトリが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText("jpg")).toBeInTheDocument();
    });

    // jpgをクリック → 年表示
    fireEvent.click(screen.getByText("jpg"));
    await waitFor(() => {
      expect(screen.getByText("2025")).toBeInTheDocument();
    });

    // 年をクリック → 月表示
    fireEvent.click(screen.getByText("2025"));
    await waitFor(() => {
      expect(screen.getByText("03")).toBeInTheDocument();
    });

    // 月をクリック → 日表示
    fireEvent.click(screen.getByText("03"));
    await waitFor(() => {
      expect(screen.getByText("15")).toBeInTheDocument();
    });

    // 日をクリック → ファイル表示
    fireEvent.click(screen.getByText("15"));
    await waitFor(() => {
      expect(screen.getByText("photo1.jpg")).toBeInTheDocument();
    });

    // パンくずリストが正しく表示されていることを確認
    await waitFor(() => {
      const breadcrumb = screen.getByText(
        "user / test-user-123 / jpg / 2025 / 03 / 15"
      );
      expect(breadcrumb).toBeInTheDocument();
    });
  });
});
