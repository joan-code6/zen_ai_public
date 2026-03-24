import { useState } from 'react';
import { type Note } from '@/services/notesService';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  ChevronLeft, 
  Edit3, 
  Trash2,
  Hash,
} from 'lucide-react';

interface NotePreviewProps {
  note: Note;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
}

export default function NotePreview({ note, onEdit, onDelete, onBack }: NotePreviewProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b border-border">
        <div className="px-4 pl-16 sm:pl-4 py-3 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onEdit}
                className="gap-2 bg-foreground text-background hover:bg-foreground/90"
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowDeleteConfirm(true)}
                className="h-8 w-8 hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <h1 className="text-2xl font-semibold text-foreground mb-2 leading-tight">
            {note.title || 'Untitled'}
          </h1>
          
          <p className="text-sm text-muted-foreground mb-6">
            Updated {formatDate(note.updatedAt)}
          </p>

          {note.keywords && note.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {note.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="inline-flex items-center gap-1 text-sm px-2 py-1 bg-muted rounded-md"
                >
                  <Hash className="w-3 h-3" />
                  {keyword}
                </span>
              ))}
            </div>
          )}

          <div className="text-base leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {note.content || note.excerpt}
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2">Delete Note</h3>
            <p className="text-muted-foreground mb-4">
              Are you sure you want to delete "{note.title}"? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete();
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
