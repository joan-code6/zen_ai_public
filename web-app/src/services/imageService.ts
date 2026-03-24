import BaseApiService from './api';

export interface GenerateImageRequest {
  prompt: string;
  model?: string;
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  n?: number;
  chat_id?: string;  // Optional: chat ID to register generated image with chat
}

export interface GeneratedImage {
  url?: string;  // For backward compatibility with old API
  file_id?: string;  // New format: file ID for generated image
  filename?: string;  // New format: filename of generated image
  revised_prompt?: string;
}

export interface GenerateImageResponse {
  images: GeneratedImage[];
  prompt: string;
}

export interface ImageModel {
  id: string;
  name: string;
  description?: string;
}

export interface ImageModelsResponse {
  items: ImageModel[];
}

class ImageService {
  async generateImages(params: GenerateImageRequest): Promise<GenerateImageResponse> {
    const response = await BaseApiService.post<GenerateImageResponse>('/images/generate', params);
    if (response.error) {
      throw new Error(response.error.message || 'Image generation failed');
    }
    return response.data!;
  }

  async getImageModels(): Promise<ImageModel[]> {
    const response = await BaseApiService.get<ImageModelsResponse>('/images/models');
    if (response.error) {
      return [];
    }
    return response.data?.items ?? [];
  }
}

export default new ImageService();
