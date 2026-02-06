import BaseApiService from './api';
import { apiFetch } from '@/lib/backend';

export interface FileItem {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  downloadPath: string;
  textPreview?: string;
  createdAt: string;
  chat: {
    id: string;
    title: string;
    uid: string;
    systemPrompt?: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface FileUploadRequest {
  uid: string;
  file: File;
}

export interface FileUploadResponse {
  file: {
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    downloadPath: string;
    textPreview?: string;
    createdAt: string;
  };
}

export interface FilesListResponse {
  items: Array<{
    chat: {
      id: string;
      title: string;
      uid: string;
      systemPrompt?: string;
      createdAt: string;
      updatedAt: string;
    };
    file: {
      id: string;
      fileName: string;
      mimeType: string;
      size: number;
      downloadPath: string;
      textPreview?: string;
      createdAt: string;
    };
  }>;
}

class FilesService {
  private static instance: FilesService;

  static getInstance(): FilesService {
    if (!FilesService.instance) {
      FilesService.instance = new FilesService();
    }
    return FilesService.instance;
  }

  async getAllFiles(): Promise<FileItem[]> {
    const response = await BaseApiService.get<FilesListResponse>('/files');
    if (response.error) {
      throw new Error(response.error.message);
    }
    
    // Transform the response to match our FileItem interface
    return (response.data?.items || []).map(item => ({
      ...item.file,
      chat: item.chat
    }));
  }

  async uploadFile(chatId: string, uid: string, file: File): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append('uid', uid);
    formData.append('file', file);

    const response = await BaseApiService.post<FileUploadResponse>(`/chats/${chatId}/files`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getChatFiles(chatId: string, uid: string): Promise<FileItem[]> {
    const response = await BaseApiService.get<{ items: any[] }>(`/chats/${chatId}/files?uid=${encodeURIComponent(uid)}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    
    return response.data?.items || [];
  }

  async downloadFile(chatId: string, fileId: string, uid: string): Promise<Blob> {
    const response = await BaseApiService.request<Blob>(`/chats/${chatId}/files/${fileId}/download?uid=${encodeURIComponent(uid)}`, {
      method: 'GET',
      isBlob: true
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
    
    return response.data as Blob;
  }

  async deleteFile(chatId: string, fileId: string, uid: string): Promise<void> {
    const response = await BaseApiService.delete(`/chats/${chatId}/files/${fileId}?uid=${encodeURIComponent(uid)}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async getFilePreview(chatId: string, fileId: string, uid: string): Promise<string> {
    const file = await this.downloadFile(chatId, fileId, uid);
    return URL.createObjectURL(file);
  }

  // Utility methods
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  isImageFile(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  isTextFile(mimeType: string): boolean {
    return mimeType.includes('text/') || 
           mimeType.includes('json') || 
           mimeType.includes('xml') || 
           mimeType.includes('csv');
  }

  isPdfFile(mimeType: string): boolean {
    return mimeType.includes('pdf');
  }

  getFileIcon(mimeType: string): string {
    if (this.isImageFile(mimeType)) return 'image';
    if (this.isTextFile(mimeType)) return 'text';
    if (this.isPdfFile(mimeType)) return 'pdf';
    return 'file';
  }

  // Batch operations
  async deleteMultipleFiles(files: Array<{ chatId: string; fileId: string; uid: string }>): Promise<void> {
    const deletePromises = files.map(({ chatId, fileId, uid }) => 
      this.deleteFile(chatId, fileId, uid)
    );
    
    await Promise.all(deletePromises);
  }

  // Search files by name or content
  async searchFiles(query: string): Promise<FileItem[]> {
    const allFiles = await this.getAllFiles();
    
    if (!query.trim()) {
      return allFiles;
    }
    
    const lowercaseQuery = query.toLowerCase();
    return allFiles.filter(file => 
      file.fileName.toLowerCase().includes(lowercaseQuery) ||
      file.chat.title.toLowerCase().includes(lowercaseQuery) ||
      (file.textPreview && file.textPreview.toLowerCase().includes(lowercaseQuery))
    );
  }

  // Get files by type
  async getFilesByType(mimeType: string): Promise<FileItem[]> {
    const allFiles = await this.getAllFiles();
    return allFiles.filter(file => file.mimeType === mimeType);
  }

  // Get image files
  async getImageFiles(): Promise<FileItem[]> {
    const allFiles = await this.getAllFiles();
    return allFiles.filter(file => this.isImageFile(file.mimeType));
  }

  // Get text files
  async getTextFiles(): Promise<FileItem[]> {
    const allFiles = await this.getAllFiles();
    return allFiles.filter(file => this.isTextFile(file.mimeType));
  }

  // Get files sorted by various criteria
  async getFilesSortedBy(sortBy: 'name' | 'size' | 'date' = 'date'): Promise<FileItem[]> {
    const allFiles = await this.getAllFiles();
    
    return [...allFiles].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.fileName.localeCompare(b.fileName);
        case 'size':
          return b.size - a.size;
        case 'date':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }

  // Get file statistics
  async getFileStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    imageFiles: number;
    textFiles: number;
    pdfFiles: number;
    otherFiles: number;
  }> {
    const allFiles = await this.getAllFiles();
    
    const stats = {
      totalFiles: allFiles.length,
      totalSize: allFiles.reduce((acc, file) => acc + file.size, 0),
      imageFiles: allFiles.filter(file => this.isImageFile(file.mimeType)).length,
      textFiles: allFiles.filter(file => this.isTextFile(file.mimeType)).length,
      pdfFiles: allFiles.filter(file => this.isPdfFile(file.mimeType)).length,
      otherFiles: 0
    };
    
    stats.otherFiles = stats.totalFiles - stats.imageFiles - stats.textFiles - stats.pdfFiles;
    
    return stats;
  }
}

export default FilesService.getInstance();