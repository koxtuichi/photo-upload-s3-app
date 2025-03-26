export interface FileType {
  key: string;
  size: number;
  lastModified: string;
  contentType: string;
  url: string;
}

export interface UserPlan {
  userId: string;
  planId: string;
  storageUsed: number;
  createdAt: string;
  updatedAt: string;
}
