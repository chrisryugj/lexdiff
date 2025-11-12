/**
 * Gemini File Search Admin API Wrapper
 *
 * 이 파일은 Google Gemini File Search API를 관리하기 위한 클라이언트 라이브러리입니다.
 * 서버 환경에서만 사용해야 합니다 (API Key 보호).
 */

import { GoogleGenAI } from '@google/genai';
import type {
  FileSearchStore,
  GeminiFile,
  StorageStats,
  StoreStats,
} from './types';

export class GeminiAdmin {
  private ai: GoogleGenAI;

  constructor(apiKey?: string) {
    if (!apiKey && !process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required');
    }

    this.ai = new GoogleGenAI({
      apiKey: apiKey || process.env.GEMINI_API_KEY!,
    });
  }

  // ==================== File Search Stores ====================

  /**
   * 모든 File Search Store 목록 조회 (페이지네이션 처리)
   */
  async listStores(): Promise<FileSearchStore[]> {
    const stores: FileSearchStore[] = [];
    const pager = await this.ai.fileSearchStores.list({
      config: { pageSize: 20 }, // max 20
    });

    let page = pager.page;

    while (true) {
      for (const store of page) {
        stores.push({
          name: store.name,
          displayName: store.displayName,
          createTime: store.createTime,
          updateTime: store.updateTime,
        });
      }

      if (!pager.hasNextPage()) break;
      page = await pager.nextPage();
    }

    return stores;
  }

  /**
   * Display name으로 Store 검색
   */
  async findStoreByName(displayName: string): Promise<FileSearchStore | null> {
    const stores = await this.listStores();
    return stores.find((s) => s.displayName === displayName) || null;
  }

  /**
   * Store 상세 정보 조회
   */
  async getStore(storeName: string): Promise<FileSearchStore> {
    const store = await this.ai.fileSearchStores.get({ name: storeName });

    return {
      name: store.name,
      displayName: store.displayName,
      createTime: store.createTime,
      updateTime: store.updateTime,
    };
  }

  /**
   * 새 File Search Store 생성
   */
  async createStore(displayName: string): Promise<FileSearchStore> {
    const createOp = await this.ai.fileSearchStores.create({
      config: { displayName },
    });

    return {
      name: createOp.name,
      displayName: createOp.displayName || displayName,
      createTime: new Date().toISOString(),
    };
  }

  /**
   * Store 삭제
   * @param force true이면 파일이 있어도 강제 삭제
   */
  async deleteStore(storeName: string, force = false): Promise<void> {
    await this.ai.fileSearchStores.delete({
      name: storeName,
      config: { force },
    });
  }

  // ==================== Files ====================

  /**
   * 모든 파일 목록 조회
   */
  async listFiles(): Promise<GeminiFile[]> {
    const filesRaw = await this.ai.files.list();

    return filesRaw.map((f: any) => ({
      name: f.name,
      displayName: f.displayName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      createTime: f.createTime,
      updateTime: f.updateTime,
      expirationTime: f.expirationTime,
      uri: f.uri,
      state: f.state,
      metadata: f.metadata,
    }));
  }

  /**
   * 파일 상세 정보 조회
   */
  async getFile(fileName: string): Promise<GeminiFile> {
    const file = await this.ai.files.get({ name: fileName });

    return {
      name: file.name,
      displayName: file.displayName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      createTime: file.createTime,
      updateTime: file.updateTime,
      expirationTime: file.expirationTime,
      uri: file.uri,
      state: file.state,
      metadata: file.metadata,
    };
  }

  /**
   * 파일 업로드 (로컬 파일 경로)
   */
  async uploadFile(
    filePath: string,
    displayName?: string,
    mimeType?: string,
    metadata?: Record<string, string>
  ): Promise<GeminiFile> {
    const uploadedFile = await this.ai.files.upload({
      file: filePath,
      config: {
        displayName,
        mimeType,
        ...(metadata && { metadata }),
      },
    });

    return {
      name: uploadedFile.name,
      displayName: uploadedFile.displayName,
      uri: uploadedFile.uri,
      sizeBytes: uploadedFile.sizeBytes,
      mimeType: uploadedFile.mimeType,
      createTime: uploadedFile.createTime,
      expirationTime: uploadedFile.expirationTime,
      state: uploadedFile.state,
      metadata: uploadedFile.metadata,
    };
  }

  /**
   * 파일 삭제
   */
  async deleteFile(fileName: string): Promise<void> {
    await this.ai.files.delete({ name: fileName });
  }

  /**
   * 파일을 File Search Store에 업로드 및 인덱싱
   */
  async uploadToStore(
    filePath: string,
    storeName: string,
    displayName?: string,
    mimeType?: string,
    metadata?: Record<string, string>
  ): Promise<GeminiFile> {
    const operation = await this.ai.fileSearchStores.uploadToFileSearchStore({
      file: filePath,
      fileSearchStoreName: storeName,
      config: {
        displayName,
        mimeType,
        ...(metadata && { metadata }),
      },
    });

    // 업로드 및 인덱싱 완료 대기
    let op = operation;
    while (!op.done) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      op = await this.ai.operations.get({ name: op.name });
    }

    // 업로드된 파일 정보 반환
    // Note: operation.result에 파일 정보가 포함되어야 하는데,
    // 실제 구조는 API 응답에 따라 조정 필요
    return {
      name: op.name || '',
      displayName: displayName,
      mimeType: mimeType,
      state: 'ACTIVE',
    };
  }

  /**
   * 이미 업로드된 파일을 Store에 Import
   */
  async importFileToStore(
    fileName: string,
    storeName: string
  ): Promise<void> {
    const operation = await this.ai.fileSearchStores.importFile({
      fileSearchStoreName: storeName,
      fileName: fileName,
    });

    // Import 완료 대기
    let op = operation;
    while (!op.done) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      op = await this.ai.operations.get({ name: op.name });
    }
  }

  // ==================== Statistics ====================

  /**
   * 저장소 통계 조회
   */
  async getStorageStats(): Promise<StorageStats> {
    const files = await this.listFiles();

    const totalSizeBytes = files.reduce(
      (sum, f) => sum + (f.sizeBytes || 0),
      0
    );
    const totalSizeGB = totalSizeBytes / (1024 ** 3);
    const maxSizeGB = 20; // Gemini limit

    // 24시간 내 만료 파일 수
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const filesExpiringIn24h = files.filter((f) => {
      if (!f.expirationTime) return false;
      const expiry = new Date(f.expirationTime);
      return expiry <= in24h;
    }).length;

    return {
      totalFiles: files.length,
      totalSizeBytes,
      totalSizeGB: parseFloat(totalSizeGB.toFixed(2)),
      maxSizeGB,
      usagePercent: parseFloat(((totalSizeGB / maxSizeGB) * 100).toFixed(1)),
      filesExpiringIn24h,
    };
  }

  /**
   * Store별 통계 조회
   * Note: API에서 직접 지원하지 않으므로, 메타데이터 기반 추정
   */
  async getStoreStats(): Promise<StoreStats[]> {
    const stores = await this.listStores();
    const files = await this.listFiles();

    // Note: 실제로는 각 파일이 어느 Store에 속하는지 알 수 없음
    // 메타데이터에 store 정보를 저장하거나, 별도 DB가 필요
    // 여기서는 기본 구조만 제공

    return stores.map((store) => ({
      storeName: store.name,
      displayName: store.displayName,
      fileCount: 0, // 실제 구현 필요
      totalSizeBytes: 0, // 실제 구현 필요
    }));
  }

  /**
   * 파일 상태 확인 (업로드/인덱싱 완료 여부)
   */
  async isFileReady(fileName: string): Promise<boolean> {
    const file = await this.getFile(fileName);
    return file.state === 'ACTIVE';
  }

  /**
   * 만료 임박 파일 목록 (24시간 이내)
   */
  async getExpiringFiles(): Promise<GeminiFile[]> {
    const files = await this.listFiles();
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return files.filter((f) => {
      if (!f.expirationTime) return false;
      const expiry = new Date(f.expirationTime);
      return expiry <= in24h && expiry > now;
    });
  }

  /**
   * 만료된 파일 목록
   */
  async getExpiredFiles(): Promise<GeminiFile[]> {
    const files = await this.listFiles();
    const now = new Date();

    return files.filter((f) => {
      if (!f.expirationTime) return false;
      const expiry = new Date(f.expirationTime);
      return expiry <= now;
    });
  }
}

// Singleton instance for server-side use
let adminInstance: GeminiAdmin | null = null;

export function getGeminiAdmin(): GeminiAdmin {
  if (!adminInstance) {
    adminInstance = new GeminiAdmin();
  }
  return adminInstance;
}
