export interface S3FileInfo {
  key: string;
  size?: number;
  lastModified?: Date;
  contentType?: string;
  etag?: string;
  isDirectory?: boolean;
  isSelected?: boolean;
  takenDate?: string;
  url?: string;
}
