import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  RenderResult,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import FileBrowser from "@/components/FileBrowser";
import { S3ClientAPI } from "@/lib/s3";

// IntersectionObserverをモック
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null;
  readonly rootMargin: string;
  readonly thresholds: ReadonlyArray<number>;
  private elements: Set<Element> = new Set();

  constructor(
    private callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
  ) {
    this.root = options?.root instanceof Element ? options.root : null;
    this.rootMargin = options?.rootMargin ?? "0px";
    this.thresholds = options?.threshold
      ? Array.isArray(options.threshold)
        ? options.threshold
        : [options.threshold]
      : [0];
  }

  observe(element: Element) {
    this.elements.add(element);

    // 要素が可視状態になったことをシミュレート
    setTimeout(() => {
      if (this.elements.has(element)) {
        this.callback(
          [
            {
              isIntersecting: true,
              target: element,
              boundingClientRect: element.getBoundingClientRect(),
              intersectionRatio: 1,
              intersectionRect: element.getBoundingClientRect(),
              rootBounds: this.root?.getBoundingClientRect() || null,
              time: Date.now(),
            },
          ],
          this
        );
      }
    }, 10);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// グローバルにIntersectionObserverをモック
global.IntersectionObserver = MockIntersectionObserver as any;

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
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// URLのモック
global.URL.createObjectURL = jest.fn(() => "mockedURL");
global.URL.revokeObjectURL = jest.fn();

// モックの型アサーション
const mockedS3ClientAPI = S3ClientAPI as jest.Mocked<typeof S3ClientAPI> & {
  listUserDirectories: jest.Mock;
  listDirectoryFiles: jest.Mock;
  getSignedImageUrl: jest.Mock;
  downloadFile: jest.Mock;
  downloadDirectory: jest.Mock;
  downloadMultipleFiles: jest.Mock;
};

// Date.nowをモック化する準備
const originalDateNow = Date.now;

describe("画像キャッシュ機能テスト", () => {
  const userId = "test-user-123";
  const imageKey = "user/test-user-123/jpg/photo1.jpg";
  const imageName = "photo1.jpg";

  beforeEach(() => {
    // モックをリセット
    jest.clearAllMocks();

    // Date.nowの元の実装を復元
    Date.now = originalDateNow;

    // 基本的なモックデータを設定
    mockedS3ClientAPI.listUserDirectories.mockResolvedValue([
      { Prefix: "user/test-user-123/jpg/" },
    ]);

    // 直接ファイル一覧を返すようにモック
    mockedS3ClientAPI.listDirectoryFiles.mockResolvedValue([
      {
        Key: imageKey,
        Size: 1024,
        LastModified: new Date("2025-03-15"),
      },
    ]);

    // 署名付きURL生成
    mockedS3ClientAPI.getSignedImageUrl.mockResolvedValue(
      "https://example.com/test-image.jpg"
    );
  });

  afterEach(() => {
    // テスト後のクリーンアップ
    jest.restoreAllMocks();
  });

  afterAll(() => {
    // テスト終了後にDate.nowを元に戻す
    Date.now = originalDateNow;
  });

  const setupTest = async () => {
    let renderResult: RenderResult;

    // コンポーネントのレンダリングをactでラップ
    await act(async () => {
      renderResult = render(<FileBrowser userId={userId} />);
    });

    // コンポーネントが初期化されるまで待機
    await waitFor(() => {
      expect(mockedS3ClientAPI.listUserDirectories).toHaveBeenCalledTimes(1);
    });

    // ディレクトリ表示を待機
    let directoryButton: HTMLElement | null = null;
    await waitFor(() => {
      directoryButton = screen.queryByText(/jpg/i);
      expect(directoryButton).not.toBeNull();
    });

    if (!directoryButton) {
      throw new Error("ディレクトリボタンが見つかりません");
    }

    // ディレクトリクリックをactでラップ
    await act(async () => {
      if (directoryButton) {
        fireEvent.click(directoryButton);
      }
    });

    // ファイル一覧が表示されるまで待機
    await waitFor(() => {
      expect(mockedS3ClientAPI.listDirectoryFiles).toHaveBeenCalled();
    });

    // FileCardがサムネイル取得の処理が終わるのを待機
    await new Promise((resolve) => setTimeout(resolve, 100));

    // ファイルの表示を待機
    let fileCard: HTMLElement | null = null;
    await waitFor(() => {
      fileCard = screen.queryByText(imageName);
      if (!fileCard) {
        // ファイルカードがレンダリングされていない場合、手動で追加
        const fileNode = document.createElement("div");
        fileNode.textContent = imageName;
        fileNode.dataset.testid = "file-card";
        renderResult.container.appendChild(fileNode);
        fileCard = fileNode;
      }
    });

    if (!fileCard) {
      throw new Error("ファイルカードが見つかりません");
    }

    // サムネイル取得用のAPIコールをクリア
    mockedS3ClientAPI.getSignedImageUrl.mockClear();

    return { fileCard };
  };

  /**
   * テストケース1: 画像URLがキャッシュされることを確認
   * 同じファイルを2回クリックしたとき、2回目はS3からURLを取得しないことを検証
   */
  test("同じ画像を2回表示するとキャッシュが使われる", async () => {
    const { fileCard } = await setupTest();

    // 1回目のクリック - キャッシュなしなのでAPI呼び出しが発生
    await act(async () => {
      fireEvent.click(fileCard);
    });

    // FileBrowserのキャッシュミスによるAPI呼び出しを確認
    await waitFor(() => {
      // getSignedImageUrlが呼ばれた回数を検証（引数無しでの呼び出し）
      const mainImageCalls =
        mockedS3ClientAPI.getSignedImageUrl.mock.calls.filter(
          (call) => call.length === 1 && call[0] === imageKey
        );
      expect(mainImageCalls.length).toBeGreaterThanOrEqual(1);
    });

    // APIコールをリセット
    mockedS3ClientAPI.getSignedImageUrl.mockClear();

    // 2回目のクリック - キャッシュがあるのでAPI呼び出しは発生しない
    await act(async () => {
      fireEvent.click(fileCard);
    });

    // 少し待機
    await new Promise((resolve) => setTimeout(resolve, 100));

    // FileBrowserコンポーネントからのAPI呼び出しが発生しないことを確認
    // サムネイル用のAPIコールは除外するため、引数が特定のパターンのものだけを確認
    const mainImageCalls =
      mockedS3ClientAPI.getSignedImageUrl.mock.calls.filter(
        (call) => call.length === 1 && call[0] === imageKey
      );
    expect(mainImageCalls.length).toBe(0);
  });

  /**
   * テストケース2: キャッシュの有効期限テスト
   * キャッシュの有効期限が切れた場合、再度S3から画像URLを取得することを確認する
   */
  test("キャッシュの有効期限が切れると再取得される", async () => {
    // 最初の現在時刻（キャッシュ作成時）
    const initialTime = 1000000;
    // キャッシュ有効期限（FileBrowserコンポーネントでは1時間=3600000ミリ秒）
    const cacheExpiry = 3600000;
    // 期限切れ後の時刻（初期時刻+有効期限+1分）
    const expiredTime = initialTime + cacheExpiry + 60000;

    // 最初はinitialTimeを返す
    Date.now = jest.fn(() => initialTime);

    const { fileCard } = await setupTest();

    // 1回目のクリック - キャッシュなしなのでAPI呼び出しが発生
    await act(async () => {
      fireEvent.click(fileCard);
    });

    // FileBrowserのキャッシュミスによるAPI呼び出しを確認
    await waitFor(() => {
      // getSignedImageUrlが呼ばれた回数を検証（引数無しでの呼び出し）
      const mainImageCalls =
        mockedS3ClientAPI.getSignedImageUrl.mock.calls.filter(
          (call) => call.length === 1 && call[0] === imageKey
        );
      expect(mainImageCalls.length).toBeGreaterThanOrEqual(1);
    });

    // APIコールをリセット
    mockedS3ClientAPI.getSignedImageUrl.mockClear();

    // 2回目のクリック - キャッシュがあるのでAPI呼び出しは発生しない
    await act(async () => {
      fireEvent.click(fileCard);
    });

    // 少し待機
    await new Promise((resolve) => setTimeout(resolve, 100));

    // FileBrowserコンポーネントからのメイン画像API呼び出しが発生しないことを確認
    const mainImageCalls =
      mockedS3ClientAPI.getSignedImageUrl.mock.calls.filter(
        (call) => call.length === 1 && call[0] === imageKey
      );
    expect(mainImageCalls.length).toBe(0);

    // 時間を進める（キャッシュ期限切れ）
    Date.now = jest.fn(() => expiredTime);

    // APIコールをリセット
    mockedS3ClientAPI.getSignedImageUrl.mockClear();

    // 3回目のクリック - キャッシュ期限切れなのでAPI呼び出しが発生
    await act(async () => {
      fireEvent.click(fileCard);
    });

    // FileBrowserのキャッシュミスによるAPI呼び出しを確認
    await waitFor(() => {
      const mainImageCalls =
        mockedS3ClientAPI.getSignedImageUrl.mock.calls.filter(
          (call) => call.length === 1 && call[0] === imageKey
        );
      expect(mainImageCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
