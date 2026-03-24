import { useState } from 'react';
import { type Note } from '@/services/notesService';
import { useTypedTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileText, Hash, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface NotesListProps {
  notes: Note[];
  selectedNote: Note | null;
  loading: boolean;
  onNoteSelect: (note: Note) => void;
  onRefresh: () => void;
}

export default function NotesList({ notes, selectedNote, loading, onNoteSelect, onRefresh }: NotesListProps) {
  const { t } = useTypedTranslation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getExcerpt = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength).trim() + '...';
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center p-6">
          <FileText className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No notes found
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {notes.map((note) => {
            const isSelected = selectedNote?.id === note.id;
            
            return (
              <div
                key={note.id}
                onClick={() => onNoteSelect(note)}
                className={cn(
                  "flex gap-3 px-4 py-3 cursor-pointer transition-colors",
                  isSelected 
                    ? "bg-sidebar-accent" 
                    : "hover:bg-muted/30"
                )}
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm text-muted-foreground flex-shrink-0">
                  {note.title.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground truncate">
                      {note.title || 'Untitled'}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(note.updatedAt)}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground truncate mb-1">
                    {getExcerpt(note.content || note.excerpt)}
                  </p>

                  {note.keywords && note.keywords.length > 0 && (
                    <div className="flex items-center gap-1">
                      {note.keywords.slice(0, 3).map((keyword) => (
                        <span
                          key={keyword}
                          className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground"
                        >
                          <Hash className="w-3 h-3" />
                          {keyword}
                        </span>
                      ))}
                      {note.keywords.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{note.keywords.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notes.deleteNote')}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{noteToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                if (!noteToDelete) return;
                try {
                  await import('@/services/notesService').then(m => m.default.deleteNote(noteToDelete.id, noteToDelete.uid));
                  onRefresh();
                } catch (error) {
                  console.error('Failed to delete note:', error);
                }
              }} 
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
