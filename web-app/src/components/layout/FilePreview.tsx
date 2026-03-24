import React, { useState } from 'react';
import { File, Image, FileText, Download, Copy, AlertCircle, X } from 'lucide-react';
import { ChatFile } from '@/services';
import { useImageUrl } from '@/hooks/useImageUrl';

interface FilePreviewProps {
  file: ChatFile;
  onDownload?: (file: ChatFile) => void;
}

export default function FilePreview({ file, onDownload }: FilePreviewProps) {
  const [showImageInfo, setShowImageInfo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const imageUrl = useImageUrl(file.mimeType.startsWith('image/') ? file.downloadPath : null);

  // Handle Esc key to close fullscreen
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isFullscreen]);

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

  const handleCopyImage = async () => {
    if (!imageUrl) return;
    
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  };

  // Check if it's an image that can be displayed inline
  const isImage = file.mimeType.startsWith('image/') && file.downloadPath;

  if (isImage) {
    return (
      <div className="mt-2">
        {/* Image Display with Top-Right Action Buttons on Hover */}
        {imageUrl ? (
          <>
            <div className="relative rounded-lg overflow-hidden border border-border/50 shadow-sm group max-w-2xl cursor-pointer">
              <img
                src={imageUrl}
                alt={file.fileName}
                className="w-full h-auto object-contain bg-muted/20"
                onClick={() => setIsFullscreen(true)}
              />
              {/* Top-right buttons on hover */}
              <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {onDownload && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(file);
                    }}
                    className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white shadow transition-colors"
                    aria-label="Download image"
                    title="Download image"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyImage();
                  }}
                  className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white shadow transition-colors"
                  aria-label="Copy image"
                  title="Copy image to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              {/* Copy feedback indicator */}
              {copyFeedback && (
                <div className="absolute bottom-2 left-2 px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-medium">
                  Copied!
                </div>
              )}
            </div>

            {/* Image Info (collapsed by default) */}
            {showImageInfo && (
              <div className="mt-2 flex items-center gap-2 bg-muted/30 rounded-lg p-2 text-xs">
                <div className="flex-shrink-0 text-muted-foreground">
                  {getFileIcon(file.mimeType)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-foreground">{file.fileName}</p>
                  <p className="text-muted-foreground text-xs">{formatFileSize(file.size)}</p>
                </div>
              </div>
            )}

            {/* Fullscreen Modal */}
            {isFullscreen && (
              <div
                className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
                onClick={() => setIsFullscreen(false)}
              >
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
                  aria-label="Close fullscreen"
                  title="Close fullscreen (Esc to close)"
                >
                  <X className="w-6 h-6" />
                </button>
                <img
                  src={imageUrl}
                  alt={file.fileName}
                  className="max-h-[90vh] max-w-[90vw] object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white/70 text-sm">
                  Click to close • Press Esc to close
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg overflow-hidden border border-border/50 shadow-sm max-w-2xl bg-muted/20 flex items-center justify-center h-48">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <AlertCircle className="w-6 h-6" />
              <p className="text-sm">Loading image...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Non-image files: show file card
  return (
    <div className="mt-2">
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
