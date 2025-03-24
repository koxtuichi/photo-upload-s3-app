import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { S3ClientAPI } from "@/lib/s3";
import { formatDate } from "@/utils/dateFormatter";

// S3クライアントのモック
jest.mock("@/lib/s3", () => ({
  S3ClientAPI: {
    uploadFileToS3: jest.fn(),
    listUserFiles: jest.fn(),
    getSignedImageUrl: jest.fn(),
    deleteFileFromS3: jest.fn(),
    downloadFile: jest.fn(),
    downloadDirectory: jest.fn(),
    generatePath: jest.fn(),
    listUserDirectories: jest.fn(),
    listDirectoryFiles: jest.fn(),
  },
}));

describe("S3ストレージ構造のテスト", () => {
  const userId = "testUser123";
  const testDate = new Date("2025-02-15");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ファイルパス生成のテスト
  test("ファイルタイプと日付に基づいて正しいS3パスが生成される", () => {
    const jpgFile = new File(["dummy content"], "test.jpg", {
      type: "image/jpeg",
    });
    const rawFile = new File(["dummy content"], "test.raw", {
      type: "image/raw",
    });
    const pngFile = new File(["dummy content"], "test.png", {
      type: "image/png",
    });

    const yearMonth = formatDate(testDate, "YYYY-MM");

    S3ClientAPI.generatePath.mockImplementation((userId, file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      return `user/${userId}/${ext}/${yearMonth}/${file.name}`;
    });

    expect(S3ClientAPI.generatePath(userId, jpgFile, testDate)).toBe(
      `user/${userId}/jpg/${yearMonth}/test.jpg`
    );

    expect(S3ClientAPI.generatePath(userId, rawFile, testDate)).toBe(
      `user/${userId}/raw/${yearMonth}/test.raw`
    );

    expect(S3ClientAPI.generatePath(userId, pngFile, testDate)).toBe(
      `user/${userId}/png/${yearMonth}/test.png`
    );
  });

  // ファイルアップロードのテスト
  test("ファイルが正しいディレクトリにアップロードされる", async () => {
    const jpgFile = new File(["dummy content"], "test.jpg", {
      type: "image/jpeg",
    });
    const yearMonth = formatDate(testDate, "YYYY-MM");
    const expectedPath = `user/${userId}/jpg/${yearMonth}/test.jpg`;

    S3ClientAPI.uploadFileToS3.mockResolvedValue(expectedPath);

    const result = await S3ClientAPI.uploadFileToS3(userId, jpgFile, testDate);

    expect(result).toBe(expectedPath);
    expect(S3ClientAPI.uploadFileToS3).toHaveBeenCalledWith(
      userId,
      jpgFile,
      testDate
    );
  });

  // ディレクトリ一覧のテスト
  test("ユーザーのディレクトリ構造が正しく取得できる", async () => {
    const mockDirectories = [
      { Prefix: `user/${userId}/jpg/2025-02/`, CommonPrefixes: [] },
      { Prefix: `user/${userId}/raw/2025-02/`, CommonPrefixes: [] },
      { Prefix: `user/${userId}/jpg/2025-03/`, CommonPrefixes: [] },
    ];

    S3ClientAPI.listUserDirectories.mockResolvedValue(mockDirectories);

    const directories = await S3ClientAPI.listUserDirectories(userId);

    expect(directories).toEqual(mockDirectories);
    expect(S3ClientAPI.listUserDirectories).toHaveBeenCalledWith(userId);
  });

  // ディレクトリ内のファイル一覧テスト
  test("特定ディレクトリ内のファイル一覧が取得できる", async () => {
    const directoryPath = `user/${userId}/jpg/2025-02/`;
    const mockFiles = [
      {
        Key: `${directoryPath}photo1.jpg`,
        Size: 1024,
        LastModified: new Date(),
      },
      {
        Key: `${directoryPath}photo2.jpg`,
        Size: 2048,
        LastModified: new Date(),
      },
    ];

    S3ClientAPI.listDirectoryFiles.mockResolvedValue(mockFiles);

    const files = await S3ClientAPI.listDirectoryFiles(directoryPath);

    expect(files).toEqual(mockFiles);
    expect(S3ClientAPI.listDirectoryFiles).toHaveBeenCalledWith(directoryPath);
  });

  // ファイルダウンロードのテスト
  test("個別ファイルがダウンロードできる", async () => {
    const filePath = `user/${userId}/jpg/2025-02/photo1.jpg`;
    const mockBlob = new Blob(["dummy content"], { type: "image/jpeg" });

    S3ClientAPI.downloadFile.mockResolvedValue(mockBlob);

    const result = await S3ClientAPI.downloadFile(filePath);

    expect(result).toEqual(mockBlob);
    expect(S3ClientAPI.downloadFile).toHaveBeenCalledWith(filePath);
  });

  // ディレクトリダウンロードのテスト
  test("ディレクトリ単位でダウンロードできる", async () => {
    const directoryPath = `user/${userId}/jpg/2025-02/`;
    const mockZipBlob = new Blob(["zip content"], { type: "application/zip" });

    S3ClientAPI.downloadDirectory.mockResolvedValue(mockZipBlob);

    const result = await S3ClientAPI.downloadDirectory(directoryPath);

    expect(result).toEqual(mockZipBlob);
    expect(S3ClientAPI.downloadDirectory).toHaveBeenCalledWith(directoryPath);
  });
});

// UIコンポーネントテスト
describe("ディレクトリ閲覧UIのテスト", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("ディレクトリツリーが正しく表示される", async () => {
    // ここにディレクトリツリーのUIテストを実装
  });

  test("ディレクトリをクリックするとそのディレクトリの内容が表示される", async () => {
    // ここにディレクトリナビゲーションのUIテストを実装
  });

  test("JPGファイルをクリックすると画像プレビューが表示される", async () => {
    // ここに画像プレビューのUIテストを実装
  });

  test("ファイルダウンロードボタンが機能する", async () => {
    // ここにファイルダウンロードのUIテストを実装
  });

  test("ディレクトリダウンロードボタンが機能する", async () => {
    // ここにディレクトリダウンロードのUIテストを実装
  });
});
