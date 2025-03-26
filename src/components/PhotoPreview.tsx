"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import ExifReader from "exifreader";

interface PhotoPreviewProps {
  file: File;
  onRemove: () => void;
}

// RAWファイルの拡張子リスト
const RAW_EXTENSIONS = [
  ".arw", // Sony
  ".cr2", // Canon
  ".cr3", // Canon
  ".nef", // Nikon
  ".raf", // Fujifilm
  ".rw2", // Panasonic
  ".orf", // Olympus
  ".pef", // Pentax
  ".srw", // Samsung
  ".dng", // Adobe Digital Negative
  ".x3f", // Sigma
  ".3fr", // Hasselblad
  ".mef", // Mamiya
  ".mrw", // Minolta
  ".kdc", // Kodak
  ".dcr", // Kodak
  ".raw", // Panasonic/Leica
  ".r3d", // RED
  ".rwl", // Leica
  ".rw2", // Panasonic
  ".srw", // Samsung
];

// 最大処理バッファサイズ（メモリ使用量制限）
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB

// DNG形式のサムネイル抽出処理（DNG形式はTIFFベース）
const extractDNGThumbnail = async (
  arrayBuffer: ArrayBuffer
): Promise<ArrayBuffer | null> => {
  try {
    // DNG/TIFFファイルの最初の数バイトをチェック
    const dataView = new DataView(arrayBuffer);

    // TIFFヘッダーチェック (0x4949="II" or 0x4D4D="MM")
    const byteOrder = dataView.getUint16(0);
    if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) {
      console.log("無効なDNGファイル形式");
      return null;
    }

    // JPEGのスタートマーカーを探す (0xFFD8)
    const searchPattern = new Uint8Array([0xff, 0xd8]);

    for (
      let i = 0;
      i <
      Math.min(arrayBuffer.byteLength, MAX_BUFFER_SIZE) - searchPattern.length;
      i++
    ) {
      let found = true;
      for (let j = 0; j < searchPattern.length; j++) {
        if (new Uint8Array(arrayBuffer)[i + j] !== searchPattern[j]) {
          found = false;
          break;
        }
      }

      if (found) {
        // JPEGデータの終わりを探す (0xFFD9)
        for (
          let k = i;
          k < Math.min(arrayBuffer.byteLength, MAX_BUFFER_SIZE) - 1;
          k++
        ) {
          if (
            new Uint8Array(arrayBuffer)[k] === 0xff &&
            new Uint8Array(arrayBuffer)[k + 1] === 0xd9
          ) {
            // JPEGデータを切り出す
            console.log(
              `DNG: JPEG見つかった, 開始位置=${i}, 終了位置=${k + 2}`
            );
            return arrayBuffer.slice(i, k + 2);
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error("DNGサムネイル抽出エラー:", error);
    return null;
  }
};

// Sigmaカメラ(X3F)のサムネイル抽出を試みる特殊関数（改良版）
const extractX3FThumbnail = async (
  arrayBuffer: ArrayBuffer
): Promise<ArrayBuffer | null> => {
  try {
    // X3Fヘッダーを確認 (X3F_)
    const signature = new Uint8Array(arrayBuffer, 0, 4);
    const signatureStr = String.fromCharCode(...signature);

    if (signatureStr !== "X3F_") {
      console.log("無効なX3Fファイル形式");
      return null;
    }

    // JPEGヘッダーとフッターのパターン
    const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff]);
    const jpegFooter = new Uint8Array([0xff, 0xd9]);

    // 処理する最大バイト数を制限
    const maxSize = Math.min(arrayBuffer.byteLength, MAX_BUFFER_SIZE);
    const buffer = new Uint8Array(arrayBuffer, 0, maxSize);

    // JPEGヘッダーを検索
    let startIdx = -1;
    for (let i = 0; i < maxSize - jpegHeader.length; i++) {
      if (
        buffer[i] === jpegHeader[0] &&
        buffer[i + 1] === jpegHeader[1] &&
        buffer[i + 2] === jpegHeader[2]
      ) {
        startIdx = i;
        break;
      }
    }

    if (startIdx === -1) {
      console.log("X3F: JPEGヘッダーが見つかりません");
      return null;
    }

    // JPEGフッターを検索
    let endIdx = -1;
    for (let i = startIdx; i < maxSize - jpegFooter.length; i++) {
      if (buffer[i] === jpegFooter[0] && buffer[i + 1] === jpegFooter[1]) {
        endIdx = i + 2; // フッターサイズを含める
        break;
      }
    }

    if (endIdx === -1) {
      console.log("X3F: JPEGフッターが見つかりません");
      return null;
    }

    console.log(
      `X3F: JPEG見つかった, 開始位置=${startIdx}, 終了位置=${endIdx}`
    );
    return arrayBuffer.slice(startIdx, endIdx);
  } catch (error) {
    console.error("X3Fサムネイル抽出エラー:", error);
    return null;
  }
};

// 拡張サムネイル抽出関数
const extractRawThumbnail = async (
  arrayBuffer: ArrayBuffer,
  extension: string
): Promise<string | null> => {
  try {
    // 処理するバッファサイズを制限（メモリ使用量削減）
    const optimizedBuffer =
      arrayBuffer.byteLength > MAX_BUFFER_SIZE
        ? arrayBuffer.slice(0, MAX_BUFFER_SIZE)
        : arrayBuffer;

    // 1. まずExifReaderで標準的なサムネイル抽出を試みる
    try {
      const tags = ExifReader.load(optimizedBuffer, { expanded: true });

      if (tags.Thumbnail && tags.Thumbnail.image) {
        console.log("Exifからサムネイル発見");
        const blob = new Blob(
          [new Uint8Array(tags.Thumbnail.image as ArrayBuffer)],
          { type: "image/jpeg" }
        );
        return URL.createObjectURL(blob);
      }
    } catch (exifError) {
      console.log("Exif処理エラー:", exifError);
    }

    // 2. DNG特殊処理
    if (extension.toLowerCase() === ".dng") {
      console.log("DNG形式固有の処理を試行");
      const thumbnailBuffer = await extractDNGThumbnail(optimizedBuffer);

      if (thumbnailBuffer) {
        const blob = new Blob([new Uint8Array(thumbnailBuffer)], {
          type: "image/jpeg",
        });
        return URL.createObjectURL(blob);
      }
    }

    // 3. X3F特殊処理
    if (extension.toLowerCase() === ".x3f") {
      console.log("X3F形式固有の処理を試行");
      const thumbnailBuffer = await extractX3FThumbnail(optimizedBuffer);

      if (thumbnailBuffer) {
        const blob = new Blob([new Uint8Array(thumbnailBuffer)], {
          type: "image/jpeg",
        });
        return URL.createObjectURL(blob);
      }
    }

    // 3. 他のRAW形式向け特殊処理をここに追加できます

    return null;
  } catch (error) {
    console.error("RAWサムネイル抽出エラー:", error);
    return null;
  }
};

// ファイル名からタイムスタンプを抽出する関数
const extractTimestampFromFilename = (filename: string): number | null => {
  try {
    // 一般的なカメラのファイル名パターン (例: IMG_20230415_123045.ARW など)
    // タイムスタンプを含む部分を正規表現で抽出

    // 数字のみのパターン (例: 12345678.ARW)
    const numericPattern = /(\d{8,14})/;

    // 日付のパターン (例: 2023-04-15_123045.ARW)
    const datePattern = /(\d{4}[-_]?\d{2}[-_]?\d{2}[-_]?\d{6})/;

    // DSC/IMG後の数字 (例: DSC01234.ARW, IMG_1234.ARW)
    const dscPattern = /(?:DSC|IMG)[-_]?(\d{4,6})/i;

    // パターンを順に試す
    let match =
      filename.match(datePattern) ||
      filename.match(numericPattern) ||
      filename.match(dscPattern);

    if (match && match[1]) {
      // 数値化できる場合は数値として返す
      return parseInt(match[1].replace(/[-_]/g, ""));
    }

    return null;
  } catch (error) {
    console.error("ファイル名からのタイムスタンプ抽出エラー:", error);
    return null;
  }
};

// RAWという文字を中央に表示するデフォルトサムネイルを生成
const createRawPlaceholderThumbnail = (): string => {
  try {
    // キャンバス要素の作成
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      console.error("Canvas 2D contextを取得できません");
      return "/file.svg";
    }

    // 背景色を設定
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // RAWテキストのスタイル設定
    ctx.fillStyle = "#333333";
    ctx.font = "bold 36px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // RAWテキストを描画
    ctx.fillText("RAW", canvas.width / 2, canvas.height / 2);

    // 枠線を追加
    ctx.strokeStyle = "#999999";
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // DataURLとして取得
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("RAWプレースホルダー生成エラー:", error);
    return "/file.svg";
  }
};

// 同じタイムスタンプを持つJPGファイルを探す関数（アップロード前用）
const findMatchingJpgInFiles = (
  rawFile: File,
  allFiles: FileList | null
): File | null => {
  if (!allFiles || allFiles.length <= 1) return null;

  // RAWファイルのベース名（拡張子なし）
  const rawFilename = rawFile.name;
  const rawBaseName = rawFilename.substring(0, rawFilename.lastIndexOf("."));

  // 同じベース名のJPGを最初に確認
  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    if (file === rawFile) continue; // 自分自身はスキップ

    const isJpg =
      file.type === "image/jpeg" || file.name.toLowerCase().endsWith(".jpg");
    if (!isJpg) continue;

    const jpgBaseName = file.name.substring(0, file.name.lastIndexOf("."));
    if (jpgBaseName === rawBaseName) {
      // 完全一致のJPGを発見
      console.log("完全一致のJPGを発見:", file.name);
      return file;
    }
  }

  return null;
};

export default function PhotoPreview({ file, onRemove }: PhotoPreviewProps) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // ファイルの拡張子を取得
  const fileExtension = file.name
    .substring(file.name.lastIndexOf("."))
    .toLowerCase();

  // RAWファイルかどうかを判定
  const isRawFile = RAW_EXTENSIONS.some(
    (ext) => fileExtension.toLowerCase() === ext.toLowerCase()
  );

  useEffect(() => {
    // RAWファイルの場合
    if (isRawFile) {
      const processRawFile = async () => {
        try {
          setIsLoading(true);

          // 同じフォーム内で選択された他のファイルから同じベース名のJPGを検索
          const fileInput = document.querySelector(
            'input[type="file"]'
          ) as HTMLInputElement;
          const matchingJpg = findMatchingJpgInFiles(
            file,
            fileInput?.files || null
          );

          if (matchingJpg) {
            // 一致するJPGが見つかった場合、そのJPGを表示
            const matchingUrl = URL.createObjectURL(matchingJpg);
            setImageUrl(matchingUrl);
            console.log("一致するJPGを使用:", matchingJpg.name);
          } else {
            // 一致するJPGがない場合、RAWプレースホルダーを使用
            console.log(
              "一致するJPGが見つかりません。RAWプレースホルダーを使用します"
            );
            setImageUrl(createRawPlaceholderThumbnail());
          }

          setIsLoading(false);
        } catch (error) {
          console.error("RAWファイル処理エラー:", error);
          // エラー時はプレースホルダーを表示
          setImageUrl(createRawPlaceholderThumbnail());
          setIsLoading(false);
        }
      };

      processRawFile();
    } else {
      // 通常の画像ファイルの場合
      setIsLoading(true);
      const objectUrl = URL.createObjectURL(file);
      setImageUrl(objectUrl);
      setIsLoading(false);
    }

    // クリーンアップ関数
    return () => {
      if (imageUrl && imageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [file, isRawFile, fileExtension]);

  return (
    <div className="relative w-full h-full group">
      {isLoading ? (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
          <span className="text-gray-400">Loading...</span>
        </div>
      ) : (
        <>
          <Image
            src={imageUrl}
            alt={file.name}
            fill
            className="object-cover rounded-lg"
            unoptimized={true}
            loading="lazy"
            priority={false}
          />
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
            <button
              onClick={onRemove}
              className="bg-red-500 text-white p-2 rounded-full"
              aria-label="写真を削除"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs truncate p-1">
            {file.name}
          </div>
        </>
      )}
    </div>
  );
}
