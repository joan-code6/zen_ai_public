import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import CacheService from '@/services/cacheService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import FilesService, { type FileItem } from '@/services/filesService';
import { 
  FileText, 
  Download, 
  Upload, 
  Search, 
  Grid,
  List,
  Eye,
  Trash2,
  MoreHorizontal,
  HardDrive,
  FileImage,
  FileCode,
  File,
  X
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';



export default function FilesView() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'createdAt' | 'fileName' | 'size'>('createdAt');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewedFile, setPreviewedFile] = useState<FileItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const previewObjectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      loadFiles();
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

  const loadFiles = async () => {
    try {
      const cacheKey = 'files:all';
      let userFiles = CacheService.get<FileItem[]>(cacheKey);
      
      if (!userFiles) {
        userFiles = await FilesService.getAllFiles();
        CacheService.set(cacheKey, userFiles, 5 * 60 * 1000);
      }
      
      setFiles(userFiles);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (file: FileItem) => {
    try {
      if (!user) return;
      
      const blob = await FilesService.downloadFile(file.chat.id, file.id, user.uid);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download file:', error);
      alert('Failed to download file. The file may no longer exist on the server.');
    }
  };

  const handlePreview = async (file: FileItem) => {
    try {
      if (!user) return;
      
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
      
      const url = await FilesService.getFilePreview(file.chat.id, file.id, user.uid);
      previewObjectUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewedFile(file);
    } catch (error) {
      console.error('Failed to preview file:', error);
      alert('Failed to preview file. The file may no longer exist on the server.');
    }
  };

  const closePreview = () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewedFile(null);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0 || !user) return;

    setUploading(true);
    try {
      // Note: For FilesView, we're uploading to a "General" or default chat
      // In a real app, you might want to let users choose which chat to upload to
      // For now, we'll create a new chat or use an existing one
      // Actually, files should be uploaded through ChatWindow in the context of a chat
      // So we'll show a message to the user to use the chat interface instead
      alert('Please use the chat window to upload files. Files are organized within conversations.');
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert('Failed to upload file');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (file: FileItem) => {
    if (!confirm(`Are you sure you want to delete "${file.fileName}"?`) || !user) return;

    try {
      // Extract chatId from file object
      const pathParts = file.downloadPath.split('/');
      const chatId = pathParts[pathParts.indexOf('chats') + 1];
      
      if (chatId) {
        await FilesService.deleteFile(chatId, file.id, user.uid);
        CacheService.invalidateView('files');
        setFiles(files.filter(f => f.id !== file.id));
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  const filteredFiles = files.filter(file =>
    file.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    file.chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    switch (sortBy) {
      case 'fileName':
        return a.fileName.localeCompare(b.fileName);
      case 'size':
        return b.size - a.size;
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <FileImage className="w-8 h-8 text-green-500" />;
    if (mimeType.includes('text/') || mimeType.includes('json') || mimeType.includes('xml')) return <FileCode className="w-8 h-8 text-blue-500" />;
    if (mimeType.includes('pdf')) return <FileText className="w-8 h-8 text-red-500" />;
    return <File className="w-8 h-8 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' }) + ` at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const getFileStats = () => {
    const totalFiles = files.length;
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    const imageFiles = files.filter(file => file.mimeType.startsWith('image/')).length;
    const textFiles = files.filter(file => file.mimeType.includes('text/')).length;

    return { totalFiles, totalSize, imageFiles, textFiles };
  };

  const stats = getFileStats();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading files...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <HardDrive className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">Files</h2>
          </div>
          
          <Button 
            className="gap-2" 
            onClick={handleUploadClick}
            disabled={uploading}
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload File'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            multiple
          />
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'createdAt' | 'fileName' | 'size')}
            className="px-3 py-2 border border-border rounded-lg bg-background text-sm"
          >
            <option value="createdAt">Sort by Date</option>
            <option value="fileName">Sort by Name</option>
            <option value="size">Sort by Size</option>
          </select>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="border-b border-border bg-muted/20 p-4">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Total Files:</span>
            <Badge variant="secondary">{stats.totalFiles}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Total Size:</span>
            <Badge variant="secondary">{formatFileSize(stats.totalSize)}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <FileImage className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Images:</span>
            <Badge variant="secondary">{stats.imageFiles}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Documents:</span>
            <Badge variant="secondary">{stats.textFiles}</Badge>
          </div>
        </div>
      </div>

      {/* Files Display */}
      <div className="flex-1 overflow-auto p-6">
        {sortedFiles.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <HardDrive className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No files found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? 'Try adjusting your search terms' : 'Upload your first file to get started'}
            </p>
            <Button className="gap-2">
              <Upload className="w-4 h-4" />
              Upload File
            </Button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedFiles.map((file) => (
              <Card 
                key={file.id} 
                className="group hover:shadow-lg transition-all duration-200 cursor-pointer border-border/50 bg-card/50 backdrop-blur-sm"
              >
                <div className="p-5">
                  {/* File Icon */}
                  <div className="flex items-center justify-center mb-4">
                    {getFileIcon(file.mimeType)}
                  </div>

                  {/* File Name */}
                  <h4 className="font-medium text-foreground text-sm mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                    {file.fileName}
                  </h4>

                  {/* File Info */}
                  <div className="space-y-2 mb-4">
                    <div className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(file.createdAt)}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {file.chat.title}
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-8"
                      onClick={() => handleDownload(file)}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Download
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDownload(file)}>
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePreview(file)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleDelete(file)}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {sortedFiles.map((file) => (
              <Card 
                key={file.id} 
                className="group hover:shadow-md transition-all duration-200 border-border/50 bg-card/50 backdrop-blur-sm"
              >
                <div className="p-4">
                  <div className="flex items-center gap-4">
                    {/* File Icon */}
                    <div className="flex-shrink-0">
                      {getFileIcon(file.mimeType)}
                    </div>

                    {/* File Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {file.fileName}
                        </h4>
                        <Badge variant="outline" className="text-xs">
                          {file.chat.title}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{formatFileSize(file.size)}</span>
                        <span>{formatDate(file.createdAt)}</span>
                        <span>{file.mimeType}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(file)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleDownload(file)}>
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePreview(file)}>
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDelete(file)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={closePreview}>
          <div 
            className="relative w-full max-w-5xl max-h-[90vh] bg-background rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="text-lg font-semibold text-foreground">File Preview</h3>
              <Button variant="ghost" size="sm" onClick={closePreview}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <img 
                src={previewUrl} 
                alt="Preview" 
                className="max-w-full h-auto mx-auto"
              />
            </div>
            <div className="border-t border-border p-4 flex justify-end gap-2">
              <Button variant="outline" onClick={closePreview}>
                Close
              </Button>
              <Button onClick={() => {
                if (previewedFile) {
                  handleDownload(previewedFile);
                  closePreview();
                }
              }}>
                Download
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}