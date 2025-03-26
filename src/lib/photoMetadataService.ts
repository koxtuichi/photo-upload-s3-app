import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp,
  QueryConstraint,
  limit,
} from "firebase/firestore";
import { db } from "./firebase";
import { PhotoMetadata } from "@/models/PhotoMetadata";
import ExifReader from "exifreader";

// コレクション名
const PHOTOS_COLLECTION = "photos";

/**
 * 写真メタデータをFirestoreに保存
 */
export const savePhotoMetadata = async (
  metadata: PhotoMetadata
): Promise<void> => {
  try {
    // タイムスタンプに変換
    const data = {
      ...metadata,
      uploadDate: Timestamp.fromDate(
        metadata.uploadDate instanceof Date
          ? metadata.uploadDate
          : new Date(metadata.uploadDate)
      ),
    };

    // ドキュメントIDとしてS3キーを使用（/はエスケープする）
    const docId = metadata.key.replace(/\//g, "_");
    const docRef = doc(db, PHOTOS_COLLECTION, docId);

    await setDoc(docRef, data);
    console.log("メタデータを保存しました:", docId);
  } catch (error) {
    console.error("メタデータ保存エラー:", error);
    throw error;
  }
};

/**
 * 写真メタデータをS3キーで取得
 */
export const getPhotoMetadataByKey = async (
  key: string
): Promise<PhotoMetadata | null> => {
  try {
    const docId = key.replace(/\//g, "_");
    const docRef = doc(db, PHOTOS_COLLECTION, docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();

      // タイムスタンプをDateに変換
      return {
        ...data,
        uploadDate: data.uploadDate?.toDate() || new Date(),
      } as PhotoMetadata;
    }

    return null;
  } catch (error) {
    console.error("メタデータ取得エラー:", error);
    return null;
  }
};

/**
 * 同じ撮影日時のJPG写真を検索（シンプル版）
 * 複合インデックスが不要なシンプルなクエリで実装
 */
export const findMatchingJpgByDateTime = async (
  dateTimeOriginal: string,
  userId: string
): Promise<string | null> => {
  try {
    if (!dateTimeOriginal) return null;

    // 簡易実装：単一条件での検索に制限
    // 複合インデックスが不要になり、すぐに実装可能
    const jpgQuery = query(
      collection(db, PHOTOS_COLLECTION),
      where("dateTimeOriginal", "==", dateTimeOriginal),
      limit(10)
    );

    const querySnapshot = await getDocs(jpgQuery);

    if (!querySnapshot.empty) {
      // 結果の中からJPGを抽出
      for (const doc of querySnapshot.docs) {
        const data = doc.data() as PhotoMetadata;

        // ユーザーIDが一致しかつ非RAWファイル（JPG）を探す
        if (
          data.userId === userId &&
          !data.isRaw &&
          data.key.includes("/jpg/")
        ) {
          console.log("同じ撮影日時のJPGを発見:", data.key);
          return data.key;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("JPG検索エラー:", error);
    return null;
  }
};

/**
 * 同じ日のJPG写真を検索
 */
export const findJpgsOnSameDay = async (
  dateTimeOriginal: string,
  userId: string
): Promise<PhotoMetadata[]> => {
  try {
    if (!dateTimeOriginal) return [];

    // 日付部分だけを取得 (YYYY:MM:DD)
    const datePart = dateTimeOriginal.split(" ")[0];

    // 開始日と終了日を設定
    const startDate = datePart + " 00:00:00";
    const endDate = datePart + " 23:59:59";

    // クエリ条件を作成
    const constraints: QueryConstraint[] = [
      where("userId", "==", userId),
      where("dateTimeOriginal", ">=", startDate),
      where("dateTimeOriginal", "<=", endDate),
      where("isRaw", "==", false),
      where("key", ">=", "users/" + userId + "/jpg/"),
      where("key", "<=", "users/" + userId + "/jpg/\uf8ff"),
      limit(20), // 最大20件に制限
    ];

    // 同じ日付のJPGを検索
    const q = query(collection(db, PHOTOS_COLLECTION), ...constraints);

    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      return querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          uploadDate: data.uploadDate?.toDate() || new Date(),
        } as PhotoMetadata;
      });
    }

    return [];
  } catch (error) {
    console.error("JPG検索エラー:", error);
    return [];
  }
};

/**
 * ファイルからExifメタデータを抽出
 */
export const extractExifMetadata = async (
  file: File
): Promise<Partial<PhotoMetadata>> => {
  try {
    // ArrayBufferとして読み込み
    const arrayBuffer = await file.arrayBuffer();

    // ExifReaderでメタデータを抽出
    const tags = ExifReader.load(arrayBuffer, { expanded: true });

    const metadata: Partial<PhotoMetadata> = {};

    // 撮影日時
    if (tags.exif?.DateTimeOriginal?.description) {
      metadata.dateTimeOriginal = tags.exif.DateTimeOriginal.description;
    }

    // カメラ情報
    if (tags.exif?.Make?.description) {
      metadata.make = tags.exif.Make.description;
    }

    if (tags.exif?.Model?.description) {
      metadata.model = tags.exif.Model.description;
    }

    // 解像度
    if (tags.exif?.PixelXDimension?.value) {
      metadata.width = tags.exif.PixelXDimension.value;
    }

    if (tags.exif?.PixelYDimension?.value) {
      metadata.height = tags.exif.PixelYDimension.value;
    }

    // 撮影設定
    if (tags.exif?.ISOSpeedRatings?.value) {
      metadata.iso = Number(tags.exif.ISOSpeedRatings.value);
    }

    if (tags.exif?.ExposureTime?.description) {
      metadata.exposureTime = tags.exif.ExposureTime.description;
    }

    if (tags.exif?.FNumber?.description) {
      const fNumberStr = tags.exif.FNumber.description.replace("f/", "");
      metadata.fNumber = Number(fNumberStr);
    }

    if (tags.exif?.FocalLength?.description) {
      const focalLengthStr = tags.exif.FocalLength.description.replace(
        "mm",
        ""
      );
      metadata.focalLength = Number(focalLengthStr);
    }

    return metadata;
  } catch (error) {
    console.error("Exif抽出エラー:", error);
    return {};
  }
};
