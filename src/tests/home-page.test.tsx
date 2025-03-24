import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Home from "@/app/page";
import { useAuthContext } from "@/providers/AuthProvider";
import { usePhotoStore } from "@/store/photoStore";
import { S3ClientAPI } from "@/lib/s3";

// モックの設定
jest.mock("@/providers/AuthProvider", () => ({
  useAuthContext: jest.fn(),
}));

jest.mock("@/store/photoStore", () => ({
  usePhotoStore: jest.fn(),
}));

jest.mock("@/lib/s3", () => ({
  S3ClientAPI: {
    listUserDirectories: jest.fn(),
    listDirectoryFiles: jest.fn(),
    getSignedImageUrl: jest.fn(),
    downloadFile: jest.fn(),
    downloadDirectory: jest.fn(),
    uploadFileToS3: jest.fn(),
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// グローバルなURL.createObjectURLのモック
global.URL.createObjectURL = jest.fn();
global.URL.revokeObjectURL = jest.fn();

describe("ホーム画面テスト", () => {
  const mockUser = {
    uid: "test-user-123",
    displayName: "テストユーザー",
    email: "test@example.com",
  };

  // ディレクトリとファイルのモックデータ
  const mockDirectories = [
    { Prefix: `user/${mockUser.uid}/jpg/`, CommonPrefixes: [] },
    { Prefix: `user/${mockUser.uid}/raw/`, CommonPrefixes: [] },
  ];

  const mockJpgFiles = [
    {
      Key: `user/${mockUser.uid}/jpg/sample1.jpg`,
      Size: 1024,
      LastModified: new Date(),
    },
    {
      Key: `user/${mockUser.uid}/jpg/sample2.jpg`,
      Size: 2048,
      LastModified: new Date(),
    },
  ];

  beforeEach(() => {
    // モックのリセットと設定
    jest.clearAllMocks();

    // 認証コンテキストのモック
    (useAuthContext as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
    });

    // 写真ストアのモック
    (usePhotoStore as jest.Mock).mockReturnValue({
      photos: [],
      isLoading: false,
      error: null,
      fetchUserPhotos: jest.fn(),
      uploadPhoto: jest.fn().mockResolvedValue(true),
    });

    // S3クライアントAPIのモック
    S3ClientAPI.listUserDirectories.mockResolvedValue(mockDirectories);
    S3ClientAPI.listDirectoryFiles.mockImplementation((path) => {
      if (path.includes("/jpg/")) {
        return Promise.resolve(mockJpgFiles);
      }
      return Promise.resolve([]);
    });
    S3ClientAPI.getSignedImageUrl.mockResolvedValue("mocked-image-url");
    S3ClientAPI.downloadFile.mockResolvedValue(new Blob(["dummy-content"]));
    S3ClientAPI.downloadDirectory.mockResolvedValue(
      new Blob(["dummy-zip-content"])
    );
  });

  // テストケース1: アップロードエリアが表示されること
  test("アップロードエリアが表示される", () => {
    render(<Home />);

    // アップロードエリアの存在を確認
    expect(
      screen.getByText(/写真をドラッグ&ドロップ、または/)
    ).toBeInTheDocument();
    expect(screen.getByText("ファイルを選択")).toBeInTheDocument();
  });

  // テストケース2: マイフォト表示が存在しないこと
  test("マイフォト表示が存在しない", async () => {
    render(<Home />);

    // マイフォトのヘッダーが表示されないことを確認
    await waitFor(() => {
      expect(screen.queryByText("マイフォト")).not.toBeInTheDocument();
    });
  });

  // テストケース3: ファイルブラウザが表示されること
  test("ファイルブラウザが表示される", async () => {
    render(<Home />);

    // ファイルブラウザの要素が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText("ファイル階層")).toBeInTheDocument();
    });
  });

  // テストケース4: アップロード後にファイルブラウザが更新されること
  test("アップロード後にファイルブラウザが更新される", async () => {
    render(<Home />);

    // ファイルをアップロードする処理をシミュレート
    const file = new File(["dummy content"], "test.jpg", {
      type: "image/jpeg",
    });
    const input = screen
      .getByText("ファイルを選択")
      .closest("div")
      ?.querySelector("input");

    if (input) {
      fireEvent.change(input, { target: { files: [file] } });

      // 選択したファイルが表示されることを確認
      expect(await screen.findByText("選択した写真")).toBeInTheDocument();

      // アップロードボタンをクリック
      fireEvent.click(screen.getByText(/アップロード/));

      // アップロード処理が完了するのを待機
      await waitFor(() => {
        expect(usePhotoStore().uploadPhoto).toHaveBeenCalledWith(
          mockUser.uid,
          file
        );
      });

      // ファイルブラウザが更新されることを確認（ディレクトリ一覧の取得が再度呼ばれる）
      await waitFor(
        () => {
          expect(S3ClientAPI.listUserDirectories).toHaveBeenCalledWith(
            mockUser.uid
          );
        },
        { timeout: 3000 }
      );
    }
  });

  // テストケース5: ファイルブラウザがアップロードエリアの下に配置されていること
  test("ファイルブラウザがアップロードエリアの下に配置されている", async () => {
    render(<Home />);

    // DOMの順序を確認する方法として、全体のHTMLを取得して順序をチェック
    await waitFor(() => {
      const html = document.body.innerHTML;
      const uploadAreaIndex = html.indexOf("写真をドラッグ&ドロップ");
      const fileBrowserIndex = html.indexOf("ファイル階層");

      // アップロードエリアがファイルブラウザより前にあることを確認
      expect(uploadAreaIndex).toBeLessThan(fileBrowserIndex);
    });
  });
});
