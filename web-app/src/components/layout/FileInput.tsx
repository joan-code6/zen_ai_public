import React, { useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { X, File, Image, FileText, Plus } from 'lucide-react';

export interface FileWithPreview extends File {
  preview?: string;
}

export interface FileInputHandle {
  openFilePicker: () => void;
}

interface FileInputProps {
  onFilesSelected: (files: File[]) => void;
  files?: File[];
  maxFileSize?: number;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}

const FileInput = forwardRef<FileInputHandle, FileInputProps>(({
  onFilesSelected,
  files: controlledFiles,
  maxFileSize = 10 * 1024 * 1024,
  accept,
  multiple = true,
  disabled = false,
}, ref) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedFiles = controlledFiles !== undefined ? controlledFiles : internalFiles;

  useImperativeHandle(ref, () => ({
    openFilePicker: () => {
      if (!disabled) {
        fileInputRef.current?.click();
      }
    }
  }));

  const validateFiles = (files: FileList | null): File[] => {
    if (!files) return [];
    const validFiles: File[] = [];
    setError(null);

    Array.from(files).forEach((file) => {
      if (file.size > maxFileSize) {
        setError(`"${file.name}" exceeds ${(maxFileSize / 1024 / 1024).toFixed(0)}MB limit`);
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
      setInternalFiles(newFiles);
      onFilesSelected(newFiles);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setInternalFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <Image className="w-3 h-3" />;
    }
    if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('text')) {
      return <FileText className="w-3 h-3" />;
    }
    return <File className="w-3 h-3" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + sizes[i];
  };

  if (selectedFiles.length === 0 && !error) {
    return (
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
      />

      {error && (
        <p className="text-xs text-destructive px-1">{error}</p>
      )}

      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="group flex items-center gap-1.5 bg-muted/50 hover:bg-muted/70 pl-2 pr-1 py-1 rounded-lg text-xs transition-colors"
            >
              <span className="text-muted-foreground">
                {getFileIcon(file.type)}
              </span>
              <span className="truncate max-w-[120px] text-foreground/80">{file.name}</span>
              <span className="text-muted-foreground/60 text-[10px]">
                {formatFileSize(file.size)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile(index);
                }}
                disabled={disabled}
                className="p-0.5 hover:bg-muted-foreground/20 rounded transition-colors disabled:opacity-50"
                aria-label="Remove file"
              >
                <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          ))}
          {multiple && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 px-2 py-1 rounded-lg text-xs transition-colors disabled:opacity-50"
              aria-label="Add more files"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
});

FileInput.displayName = 'FileInput';

export default FileInput;
