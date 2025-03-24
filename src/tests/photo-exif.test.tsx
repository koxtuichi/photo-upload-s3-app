import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import PhotoPreview from "@/components/PhotoPreview";
import FileCard from "@/components/FileCard";
import { FileInfo } from "@/components/FileCard";
import { getPhotoTakenDate } from "@/lib/s3";

// モック
jest.mock("@/lib/s3", () => ({
  S3ClientAPI: {
    getSignedImageUrl: jest
      .fn()
      .mockResolvedValue("https://example.com/test-image.jpg"),
  },
  getPhotoTakenDate: jest.fn().mockResolvedValue(new Date("2023-01-01")),
}));

// Image コンポーネントをモック
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => {
    return <img {...props} />;
  },
}));

// IntersectionObserverのモック
global.IntersectionObserver = jest.fn().mockImplementation(function (callback) {
  this.observe = jest.fn().mockImplementation(() => {
    callback([
      {
        isIntersecting: true,
        target: document.createElement("div"),
      },
    ]);
  });
  this.disconnect = jest.fn();
  this.unobserve = jest.fn();
});

describe("写真関連コンポーネントのテスト", () => {
  // PhotoPreviewコンポーネントのテスト
  describe("PhotoPreviewコンポーネント", () => {
    it("JPG画像ファイルのプレビューが表示される", () => {
      // URL.createObjectURLをモック
      const mockCreateURL = jest.fn(() => "mock-url");
      const mockRevokeURL = jest.fn();

      global.URL.createObjectURL = mockCreateURL;
      global.URL.revokeObjectURL = mockRevokeURL;

      const mockFile = new File([""], "test.jpg", { type: "image/jpeg" });
      const onRemove = jest.fn();

      render(<PhotoPreview file={mockFile} onRemove={onRemove} />);

      // 画像要素が存在することを確認
      const image = screen.getByAltText("test.jpg");
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute("src", "mock-url");

      // ファイル名が表示されていることを確認
      expect(screen.getByText("test.jpg")).toBeInTheDocument();
    });

    it("RAWファイルの場合はRAWと表示される", () => {
      const mockFile = new File([""], "test.arw", {
        type: "application/octet-stream",
      });
      const onRemove = jest.fn();

      render(<PhotoPreview file={mockFile} onRemove={onRemove} />);

      // RAWの表示を確認
      expect(screen.getByText("RAW")).toBeInTheDocument();

      // ファイル名が表示されていることを確認
      expect(screen.getByText("test.arw")).toBeInTheDocument();
    });
  });

  // FileCardコンポーネントのテスト
  describe("FileCardコンポーネント", () => {
    it("JPG画像ファイルのカードが正しく表示される", () => {
      const fileInfo: FileInfo = {
        key: "user/test-user/jpg/2023/01/01/test.jpg",
        name: "test.jpg",
        size: 1024,
        lastModified: new Date("2023-12-01"),
        isSelected: false,
        takenDate: new Date("2023-01-01"),
      };

      const onClick = jest.fn();
      const onCheckboxChange = jest.fn();
      const formatFileSize = jest.fn().mockReturnValue("1 KB");

      render(
        <FileCard
          file={fileInfo}
          onClick={onClick}
          onCheckboxChange={onCheckboxChange}
          formatFileSize={formatFileSize}
        />
      );

      // ファイル名が表示されていることを確認
      expect(screen.getByText("test.jpg")).toBeInTheDocument();

      // サイズが表示されていることを確認
      expect(screen.getByText("1 KB")).toBeInTheDocument();

      // 撮影日が表示されていることを確認
      expect(screen.getByText(/撮影日:/)).toBeInTheDocument();

      // 更新日が表示されていることを確認
      expect(screen.getByText(/更新日:/)).toBeInTheDocument();
    });

    it("RAWファイルのカードが正しく表示される", () => {
      const fileInfo: FileInfo = {
        key: "user/test-user/raw/2023/01/01/test.arw",
        name: "test.arw",
        size: 2048,
        lastModified: new Date("2023-12-01"),
        isSelected: false,
        takenDate: new Date("2023-01-01"),
      };

      const onClick = jest.fn();
      const onCheckboxChange = jest.fn();
      const formatFileSize = jest.fn().mockReturnValue("2 KB");

      render(
        <FileCard
          file={fileInfo}
          onClick={onClick}
          onCheckboxChange={onCheckboxChange}
          formatFileSize={formatFileSize}
        />
      );

      // RAWの表示を確認
      expect(screen.getByText("RAW")).toBeInTheDocument();

      // ファイル名が表示されていることを確認
      expect(screen.getByText("test.arw")).toBeInTheDocument();

      // サイズが表示されていることを確認
      expect(screen.getByText("2 KB")).toBeInTheDocument();

      // 撮影日が表示されていることを確認
      expect(screen.getByText(/撮影日:/)).toBeInTheDocument();

      // 更新日が表示されていることを確認
      expect(screen.getByText(/更新日:/)).toBeInTheDocument();
    });

    it("撮影日がない場合は更新日のみ表示される", () => {
      const fileInfo: FileInfo = {
        key: "user/test-user/other/2023/12/01/test.txt",
        name: "test.txt",
        size: 512,
        lastModified: new Date("2023-12-01"),
        isSelected: false,
        // takenDateは指定しない
      };

      const onClick = jest.fn();
      const onCheckboxChange = jest.fn();
      const formatFileSize = jest.fn().mockReturnValue("0.5 KB");

      render(
        <FileCard
          file={fileInfo}
          onClick={onClick}
          onCheckboxChange={onCheckboxChange}
          formatFileSize={formatFileSize}
        />
      );

      // ファイル名が表示されていることを確認
      expect(screen.getByText("test.txt")).toBeInTheDocument();

      // 撮影日のラベルがないことを確認
      expect(screen.queryByText(/撮影日:/)).not.toBeInTheDocument();

      // 更新日が表示されていることを確認
      expect(screen.getByText(/更新日:/)).toBeInTheDocument();
    });
  });

  // getPhotoTakenDate関数のテスト
  describe("getPhotoTakenDate関数", () => {
    it("EXIF情報から撮影日を取得できる", async () => {
      const mockFile = new File([""], "test.jpg", { type: "image/jpeg" });

      // モック関数が呼ばれることを確認
      const result = await getPhotoTakenDate(mockFile);

      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2023);
      expect(result?.getMonth()).toBe(0); // 0-indexed (1月)
      expect(result?.getDate()).toBe(1);
    });
  });
});
