export interface Email {
  id: string;
  from: {
    name: string;
    email: string;
    avatar?: string;
  };
  to: {
    name: string;
    email: string;
  }[];
  subject: string;
  preview: string;
  content: string;
  contentType: 'text' | 'html';
  timestamp: Date;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  aiAnalysis: string;
  attachments?: {
    name: string;
    size: number;
    type: string;
  }[];
}

export interface EmailFolder {
  id: string;
  name: string;
  count: number;
  icon: React.ReactNode;
}

export interface EmailFilter {
  query: string;
  folder: string;
  isRead?: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
}