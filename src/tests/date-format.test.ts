import { formatDate, generatePath, getDirectoryFromFileType } from "@/lib/s3";

describe("ディレクトリ構造テスト", () => {
  /**
   * 日付フォーマットテスト
   */
  describe("日付フォーマット", () => {
    // 旧形式: YYYY-MM
    test("旧形式のフォーマット: YYYY-MM", () => {
      const date = new Date("2025-03-15");
      const formattedDate = formatDate(date, "YYYY-MM");
      expect(formattedDate).toBe("2025-03");
    });

    // 新形式: YYYY/MM/DD
    test("新形式のフォーマット: YYYY/MM/DD", () => {
      const date = new Date("2025-03-15");
      const formattedDate = formatDate(date, "YYYY/MM/DD");
      expect(formattedDate).toBe("2025/03/15");
    });

    // 年だけを取得
    test("年だけを取得: YYYY", () => {
      const date = new Date("2025-03-15");
      const formattedDate = formatDate(date, "YYYY");
      expect(formattedDate).toBe("2025");
    });

    // 月だけを取得
    test("月だけを取得: MM", () => {
      const date = new Date("2025-03-15");
      const formattedDate = formatDate(date, "MM");
      expect(formattedDate).toBe("03");
    });

    // 日だけを取得
    test("日だけを取得: DD", () => {
      const date = new Date("2025-03-15");
      const formattedDate = formatDate(date, "DD");
      expect(formattedDate).toBe("15");
    });

    // デフォルト形式のテスト
    test("デフォルト形式は YYYY/MM/DD", () => {
      const date = new Date("2025-03-15");
      const formattedDate = formatDate(date);
      expect(formattedDate).toBe("2025/03/15");
    });
  });

  /**
   * ファイルタイプディレクトリの判定テスト
   */
  describe("ファイルタイプディレクトリの判定", () => {
    test("JPG画像", () => {
      expect(getDirectoryFromFileType("photo.jpg")).toBe("jpg");
      expect(getDirectoryFromFileType("photo.jpeg")).toBe("jpg");
    });

    test("PNG画像", () => {
      expect(getDirectoryFromFileType("photo.png")).toBe("png");
    });

    test("RAW画像", () => {
      expect(getDirectoryFromFileType("photo.raw")).toBe("raw");
      expect(getDirectoryFromFileType("photo.pef")).toBe("raw");
      expect(getDirectoryFromFileType("photo.arw")).toBe("raw");
    });

    test("その他の形式", () => {
      expect(getDirectoryFromFileType("document.pdf")).toBe("other");
    });
  });

  /**
   * パス生成テスト
   */
  describe("パス生成", () => {
    const userId = "test-user-123";

    // 旧形式のパスは現在の実装では生成されない
    test("旧形式のパスではなく新形式のパスが生成される", () => {
      const file = new File(["content"], "photo.jpg", { type: "image/jpeg" });
      const date = new Date("2025-03-15");

      const path = generatePath(userId, file, date);
      // 旧形式のパス（このテストは失敗するはず）
      // expect(path).toBe("user/test-user-123/jpg/2025-03/photo.jpg");

      // 新形式のパス（このテストは成功するはず）
      expect(path).toBe("user/test-user-123/jpg/2025/03/15/photo.jpg");
    });

    // 新形式のパス (YYYY/MM/DD)
    test("新形式のパス: user/userId/fileType/YYYY/MM/DD/filename", () => {
      const file = new File(["content"], "photo.jpg", { type: "image/jpeg" });
      const date = new Date("2025-03-15");

      // 新形式のパス
      const expectedPath = "user/test-user-123/jpg/2025/03/15/photo.jpg";
      expect(generatePath(userId, file, date)).toBe(expectedPath);
    });

    // RAWファイルのパス生成
    test("RAWファイルのパス生成", () => {
      const file = new File(["content"], "photo.pef", {
        type: "application/octet-stream",
      });
      const date = new Date("2025-03-15");

      const path = generatePath(userId, file, date);
      // 旧形式のパス（このテストは失敗するはず）
      // expect(path).toBe("user/test-user-123/raw/2025-03/photo.pef");

      // 新形式のパス
      expect(path).toBe("user/test-user-123/raw/2025/03/15/photo.pef");
    });

    // 現在の日付を使用した場合のテスト
    test("日付未指定の場合は現在の日付が使用される", () => {
      const file = new File(["content"], "photo.jpg", { type: "image/jpeg" });

      // 現在の日付をモック
      const originalDate = global.Date;
      const mockDate = new Date("2025-03-15T12:00:00Z");
      global.Date = class extends Date {
        constructor() {
          super();
          return mockDate;
        }
      } as any;

      const path = generatePath(userId, file);

      // モックを元に戻す
      global.Date = originalDate;

      expect(path).toBe("user/test-user-123/jpg/2025/03/15/photo.jpg");
    });
  });
});
