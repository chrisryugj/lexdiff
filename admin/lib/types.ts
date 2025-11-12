// Gemini File Search Store Types

export interface FileSearchStore {
  name: string; // "fileSearchStores/abc123xyz"
  displayName?: string;
  createTime?: string;
  updateTime?: string;
}

export interface FileSearchStoreListResponse {
  success: boolean;
  stores: FileSearchStore[];
  total: number;
  limit: number;
  error?: string;
}

export interface FileSearchStoreResponse {
  success: boolean;
  store?: FileSearchStore;
  message?: string;
  error?: string;
}

// Gemini File Types

export interface GeminiFile {
  name: string; // "files/abc123xyz"
  displayName?: string;
  mimeType?: string;
  sizeBytes?: number;
  createTime?: string;
  updateTime?: string;
  expirationTime?: string;
  uri?: string;
  state?: 'STATE_UNSPECIFIED' | 'PROCESSING' | 'ACTIVE' | 'FAILED';
  error?: string;
  videoMetadata?: any;
  metadata?: Record<string, string>;
}

export interface FileListResponse {
  success: boolean;
  files: GeminiFile[];
  total: number;
  error?: string;
}

export interface FileResponse {
  success: boolean;
  file?: GeminiFile;
  message?: string;
  error?: string;
}

// Upload Types

export interface UploadFileRequest {
  file: File;
  displayName?: string;
  storeName?: string; // "fileSearchStores/abc123xyz"
  metadata?: Record<string, string>;
}

export interface UploadProgressEvent {
  fileName: string;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'indexing' | 'completed' | 'failed';
  error?: string;
}

// UI State Types

export interface StoreCardProps {
  store: FileSearchStore;
  onDelete: (storeName: string) => void;
  onView: (storeName: string) => void;
}

export interface FileCardProps {
  file: GeminiFile;
  onDelete: (fileName: string) => void;
  selected?: boolean;
  onSelect?: (fileName: string, selected: boolean) => void;
}

export interface FileUploadFormProps {
  stores: FileSearchStore[];
  onUploadComplete: (files: GeminiFile[]) => void;
}

// Filter Types

export interface FileFilter {
  storeName?: string;
  mimeType?: string;
  dateFrom?: string;
  dateTo?: string;
  searchQuery?: string;
}

// Statistics Types

export interface StorageStats {
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeGB: number;
  maxSizeGB: number;
  usagePercent: number;
  filesExpiringIn24h: number;
}

export interface StoreStats {
  storeName: string;
  displayName?: string;
  fileCount: number;
  totalSizeBytes: number;
}
