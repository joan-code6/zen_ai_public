import BaseApiService from './api';

export interface Note {
  id: string;
  uid: string;
  title: string;
  content: string;
  excerpt: string;
  keywords: string[];
  triggerWords: string[];
  triggerwords: string[]; // Backend includes both
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteRequest {
  uid: string;
  title?: string;
  content?: string;
  keywords?: string[];
  triggerWords?: string[];
}

export interface UpdateNoteRequest {
  uid: string;
  title?: string;
  content?: string;
  excerpt?: string;
  keywords?: string[];
  triggerWords?: string[];
}

export interface SearchNotesRequest {
  uid: string;
  q?: string;
  trigger?: string[];
  triggerWords?: string[];
  keyword?: string[];
  keywords?: string[];
  semantic?: boolean;
  limit?: number;
}

export interface SearchNotesResponse {
  items: Note[];
}

export interface NoteHistoryRecord {
  id: string;
  noteId: string;
  uid: string;
  operation: 'create' | 'update' | 'delete';
  aiInitiated: boolean;
  timestamp: string;
  previousState?: Partial<Note>;
  newState?: Partial<Note>;
  chatId?: string;
  messageId?: string;
}

class NotesService {
  private static instance: NotesService;

  static getInstance(): NotesService {
    if (!NotesService.instance) {
      NotesService.instance = new NotesService();
    }
    return NotesService.instance;
  }

  async getNotes(uid: string, limit?: number): Promise<Note[]> {
    const params = new URLSearchParams({
      ...(limit && { limit: limit.toString() }),
    });

    const response = await BaseApiService.get<SearchNotesResponse>(`/notes?uid=${encodeURIComponent(uid)}&${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data?.items || [];
  }

  async createNote(request: CreateNoteRequest): Promise<Note> {
    const response = await BaseApiService.post<Note>('/notes', request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getNote(noteId: string, uid: string): Promise<Note> {
    const response = await BaseApiService.get<Note>(`/notes/${noteId}?uid=${encodeURIComponent(uid)}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async updateNote(noteId: string, request: UpdateNoteRequest): Promise<Note> {
    const response = await BaseApiService.patch<Note>(`/notes/${noteId}`, request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async deleteNote(noteId: string, uid: string): Promise<void> {
    const response = await BaseApiService.delete(`/notes/${noteId}`, {
      body: JSON.stringify({ uid }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async searchNotes(request: SearchNotesRequest): Promise<Note[]> {
    const params = new URLSearchParams({
      uid: request.uid,
      ...(request.q && { q: request.q }),
      ...(request.semantic !== undefined && { semantic: request.semantic.toString() }),
      ...(request.limit && { limit: request.limit.toString() }),
    });

    // Handle array parameters
    if (request.trigger && request.trigger.length > 0) {
      request.trigger.forEach(trigger => params.append('trigger', trigger));
    }
    if (request.triggerWords && request.triggerWords.length > 0) {
      request.triggerWords.forEach(triggerWord => params.append('triggerWords', triggerWord));
    }
    if (request.keyword && request.keyword.length > 0) {
      request.keyword.forEach(keyword => params.append('keyword', keyword));
    }
    if (request.keywords && request.keywords.length > 0) {
      request.keywords.forEach(keyword => params.append('keywords', keyword));
    }

    const response = await BaseApiService.get<SearchNotesResponse>(`/notes/search?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data?.items || [];
  }

  async backfillEmbeddings(uid: string): Promise<{ updated: number }> {
    const response = await BaseApiService.post<{ updated: number }>('/notes/backfill-embeddings', {
      uid,
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getNoteHistory(noteId: string, uid: string, limit?: number): Promise<NoteHistoryRecord[]> {
    const params = new URLSearchParams({
      uid: encodeURIComponent(uid),
      ...(limit && { limit: limit.toString() }),
    });

    const response = await BaseApiService.get<{ items: NoteHistoryRecord[] }>(`/notes/${noteId}/history?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data?.items || [];
  }

  async getAiChanges(uid: string, limit?: number): Promise<NoteHistoryRecord[]> {
    const params = new URLSearchParams({
      uid: encodeURIComponent(uid),
      ...(limit && { limit: limit.toString() }),
    });

    const response = await BaseApiService.get<{ items: NoteHistoryRecord[] }>(`/notes/history/ai-changes?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data?.items || [];
  }

  // Convenience methods
  async createQuickNote(uid: string, content: string, title?: string): Promise<Note> {
    return this.createNote({
      uid,
      title: title || 'Quick Note',
      content,
    });
  }

  async findNotesByKeywords(uid: string, keywords: string[]): Promise<Note[]> {
    return this.searchNotes({
      uid,
      keywords,
      semantic: false,
    });
  }

  async findNotesByTriggers(uid: string, triggerWords: string[]): Promise<Note[]> {
    return this.searchNotes({
      uid,
      triggerWords,
      semantic: false,
    });
  }

  async semanticSearch(uid: string, query: string, limit: number = 50): Promise<Note[]> {
    return this.searchNotes({
      uid,
      q: query,
      semantic: true,
      limit,
    });
  }

  async getRecentNotes(uid: string, days: number = 7): Promise<Note[]> {
    const notes = await this.getNotes(uid, 100);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return notes.filter(note => new Date(note.updatedAt) >= cutoffDate);
  }
}

export default NotesService.getInstance();