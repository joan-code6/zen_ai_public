import React from 'react';
import { File, Image, FileText, Download } from 'lucide-react';
import { ChatFile } from '@/services';

interface FilePreviewProps {
  file: ChatFile;
  onDownload?: (file: ChatFile) => void;
}

export default function FilePreview({ file, onDownload }: FilePreviewProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <Image className="w-4 h-4" />;
    }
    if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('text')) {
      return <FileText className="w-4 h-4" />;
    }
    return <File className="w-4 h-4" />;
  };

  // Check if it's an image that can be displayed inline
  const isImage = file.mimeType.startsWith('image/') && file.downloadPath;

  return (
    <div className="mt-2 space-y-2">
      {/* Image Preview */}
      {isImage && (
        <div className="rounded-lg overflow-hidden max-w-xs border border-border/50">
          <img
            src={file.downloadPath}
            alt={file.fileName}
            className="w-full h-auto object-cover max-h-64"
          />
        </div>
      )}

      {/* File Card */}
      <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-2 text-xs">
        <div className="flex-shrink-0 text-muted-foreground">
          {getFileIcon(file.mimeType)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-foreground">{file.fileName}</p>
          <p className="text-muted-foreground text-xs">{formatFileSize(file.size)}</p>
        </div>
        {onDownload && (
          <button
            onClick={() => onDownload(file)}
            className="flex-shrink-0 p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Download file"
            title="Download file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
