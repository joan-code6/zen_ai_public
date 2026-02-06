import React, { useRef, useState } from 'react';
import { X, Upload, File, Image, FileText } from 'lucide-react';

export interface FileWithPreview extends File {
  preview?: string;
}

interface FileInputProps {
  onFilesSelected: (files: File[]) => void;
  maxFileSize?: number; // in bytes, default 10MB
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}

export default function FileInput({
  onFilesSelected,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  accept,
  multiple = true,
  disabled = false,
}: FileInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFiles = (files: FileList | null): File[] => {
    if (!files) return [];

    const validFiles: File[] = [];
    setError(null);

    Array.from(files).forEach((file) => {
      // Check file size
      if (file.size > maxFileSize) {
        setError(`File "${file.name}" exceeds ${(maxFileSize / 1024 / 1024).toFixed(0)}MB limit`);
        return;
      }

      validFiles.push(file);
    });

    return validFiles;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = validateFiles(e.target.files);
    if (files.length > 0) {
      const newFiles = multiple ? [...selectedFiles, ...files] : files;
      setSelectedFiles(newFiles);
      onFilesSelected(newFiles);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = validateFiles(e.dataTransfer.files);
    if (files.length > 0) {
      const newFiles = multiple ? [...selectedFiles, ...files] : files;
      setSelectedFiles(newFiles);
      onFilesSelected(newFiles);
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-2">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-2 cursor-pointer transition-all ${
          isDragging
            ? 'border-primary bg-primary/10'
            : 'border-muted-foreground/30 hover:border-muted-foreground/50 bg-transparent'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="hidden"
        />

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Upload className="w-3.5 h-3.5" />
          <span>{isDragging ? 'Drop files here' : 'Drag files or click to upload'}</span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
          </p>
          <div className="space-y-1">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between bg-muted/30 p-2 rounded-lg text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getFileIcon(file.type)}
                  <span className="truncate text-muted-foreground">{file.name}</span>
                  <span className="text-muted-foreground/60 ml-auto ml-2">
                    {formatFileSize(file.size)}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile(index);
                  }}
                  className="ml-1 p-1 hover:bg-muted rounded transition-colors"
                  aria-label="Remove file"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
