import BaseApiService from './api';

export type SearchResultType = 'chat' | 'message' | 'email' | 'calendar' | 'note';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  preview: string;
  url: string;
  createdAt: string;
  metadata?: {
    chatId?: string;
    messageId?: string;
    from?: string;
    date?: string;
    location?: string;
  };
}

export interface SearchRequest {
  q: string;
  types?: SearchResultType[];
  limit?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}

class SearchService {
  private static instance: SearchService;

  static getInstance(): SearchService {
    if (!SearchService.instance) {
      SearchService.instance = new SearchService();
    }
    return SearchService.instance;
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const params = new URLSearchParams({
      q: request.q,
      ...(request.limit && { limit: request.limit.toString() }),
    });

    if (request.types && request.types.length > 0) {
      request.types.forEach(type => params.append('type', type));
    }

    const response = await BaseApiService.get<SearchResponse>(`/search?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data || { results: [], total: 0 };
  }
}

export default SearchService.getInstance();
