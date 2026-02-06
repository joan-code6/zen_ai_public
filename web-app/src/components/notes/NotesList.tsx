import { useState } from 'react';
import { type Note } from '@/services/notesService';
import NotesService from '@/services/notesService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Edit3, 
  Trash2, 
  Clock, 
  Tag, 
  Target, 
  MoreHorizontal,
  Star,
  Archive
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  loading: boolean;
  onEditNote: (note: Note) => void;
  onRefresh: () => void;
}

export default function NotesList({ notes, loading, onEditNote, onRefresh }: NotesListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [sortBy, setSortBy] = useState<'updatedAt' | 'createdAt' | 'title'>('updatedAt');

  const sortedNotes = [...notes].sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'createdAt':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      default:
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  });

  const handleDeleteNote = (note: Note) => {
    setNoteToDelete(note);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!noteToDelete) return;

    try {
      // Delete the note using the service
      await fetch('/api/notes/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: noteToDelete.id, uid: noteToDelete.uid })
      });
      
      onRefresh();
    } catch (error) {
      console.error('Failed to delete note:', error);
    } finally {
      setDeleteDialogOpen(false);
      setNoteToDelete(null);
    }
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

  const getExcerpt = (content: string, maxLength: number = 150) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength).trim() + '...';
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading notes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-foreground">
            All Notes ({notes.length})
          </h3>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            Refresh
          </Button>
        </div>

        {/* Sort Options */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <div className="flex gap-1">
            {(['updatedAt', 'createdAt', 'title'] as const).map((sort) => (
              <Button
                key={sort}
                variant={sortBy === sort ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSortBy(sort)}
                className="text-xs"
              >
                {sort === 'updatedAt' ? 'Modified' : sort === 'createdAt' ? 'Created' : 'Title'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Notes Grid */}
      <div className="flex-1 overflow-auto p-6">
        {sortedNotes.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Tag className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No notes yet</h3>
            <p className="text-muted-foreground mb-4">Create your first note to get started</p>
            <Button onClick={() => {}}>
              Create Note
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedNotes.map((note) => (
              <Card 
                key={note.id} 
                className="group hover:shadow-lg transition-all duration-200 cursor-pointer border-border/50 bg-card/50 backdrop-blur-sm"
              >
                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {note.title}
                    </h4>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="opacity-0 group-hover:opacity-100 transition-opacity -mr-2 -mt-2"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditNote(note)}>
                          <Edit3 className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Star className="w-4 h-4 mr-2" />
                          Favorite
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Archive className="w-4 h-4 mr-2" />
                          Archive
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleDeleteNote(note)}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Content Excerpt */}
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                    {getExcerpt(note.content || note.excerpt)}
                  </p>

                  {/* Keywords and Triggers */}
                  <div className="space-y-2 mb-4">
                    {note.keywords && note.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {note.keywords.slice(0, 3).map((keyword) => (
                          <Badge key={keyword} variant="secondary" className="text-xs">
                            <Tag className="w-3 h-3 mr-1" />
                            {keyword}
                          </Badge>
                        ))}
                        {note.keywords.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{note.keywords.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    {note.triggerWords && note.triggerWords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {note.triggerWords.slice(0, 2).map((trigger) => (
                          <Badge key={trigger} variant="outline" className="text-xs">
                            <Target className="w-3 h-3 mr-1" />
                            {trigger}
                          </Badge>
                        ))}
                        {note.triggerWords.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{note.triggerWords.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(note.updatedAt)}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onEditNote(note)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{noteToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}