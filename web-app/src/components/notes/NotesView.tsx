import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTypedTranslation } from '@/hooks/useTranslation';
import CacheService from '@/services/cacheService';
import NotesService, { type Note } from '@/services/notesService';
import NotesList from './NotesList';
import NoteEditor from './NoteEditor';
import NotePreview from './NotePreview';
import { Plus, Search, FileText, Hash, StickyNote, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export default function NotesView() {
  const { user } = useAuth();
  const { t } = useTypedTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadNotes = useCallback(async (forceRefresh = false) => {
    if (!user) return;
    
    try {
      const cacheKey = `notes:${user.uid}`;
      
      if (forceRefresh) {
        CacheService.invalidateView(cacheKey);
      }
      
      let userNotes = CacheService.get<Note[]>(cacheKey);
      
      if (!userNotes || forceRefresh) {
        userNotes = await NotesService.getNotes(user.uid, 100);
        CacheService.set(cacheKey, userNotes, 5 * 60 * 1000);
      }
      
      setNotes(userNotes);
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadNotes();
    }
  }, [user, loadNotes]);

  useEffect(() => {
    if (params.noteId && notes.length > 0) {
      const note = notes.find(n => n.id === params.noteId);
      if (note) {
        setSelectedNote(note);
      }
    } else if (!params.noteId && !isEditing && !isCreating) {
      setSelectedNote(null);
    }
  }, [params.noteId, notes, isEditing, isCreating]);

  const handleNoteSelect = (note: Note) => {
    setSelectedNote(note);
    setIsEditing(false);
    navigate(`/notes/${note.id}`);
  };

  const handleNoteSaved = (note: Note) => {
    setIsEditing(false);
    setIsCreating(false);
    setSelectedNote(note);
    navigate(`/notes/${note.id}`);
    loadNotes(true);
  };

  const handleNoteDeleted = async () => {
    if (!selectedNote) return;
    try {
      await NotesService.deleteNote(selectedNote.id, selectedNote.uid);
      setSelectedNote(null);
      setIsEditing(false);
      navigate('/notes');
      loadNotes(true);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const handleBack = () => {
    setSelectedNote(null);
    setIsEditing(false);
    setIsCreating(false);
    navigate('/notes');
  };

  const handleCreateNote = () => {
    setSelectedNote(null);
    setIsEditing(true);
    setIsCreating(true);
  };

  const handleEditNote = () => {
    setIsEditing(true);
  };

  const filteredNotes = searchQuery.trim()
    ? notes.filter(note => 
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.keywords?.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : notes;

  const sortedNotes = [...filteredNotes].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const topKeywords = Array.from(new Set(notes.flatMap(n => n.keywords || []))).slice(0, 5);
  const showMobileDetailPane = isEditing || !!selectedNote;

  return (
    <div className="h-full flex bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="hidden md:flex w-64 border-r border-border flex-col bg-sidebar overflow-y-auto">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-foreground" />
              <span className="font-semibold text-foreground">{t('navigation.notes')}</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                setSearchQuery('');
                loadNotes(true);
              }}
              className="h-8 w-8"
            >
              <Search className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
          <Button
            onClick={handleCreateNote}
            className="w-full bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('notes.newNote')}
          </Button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedNote(null);
              navigate('/notes');
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              !selectedNote && !isEditing
                ? "bg-sidebar-accent text-foreground font-medium" 
                : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground"
            )}
          >
            <FileText className="w-4 h-4" />
            <span className="flex-1 text-left">{t('notes.allNotes')}</span>
            <span className="text-xs text-muted-foreground">{notes.length}</span>
          </button>

          {notes.some(n => n.keywords?.length > 0) && (
            <div className="pt-2">
              <p className="px-3 py-2 text-xs text-muted-foreground uppercase tracking-wider">
                {t('notes.keywords')}
              </p>
              {Array.from(new Set(notes.flatMap(n => n.keywords || []))).slice(0, 5).map(keyword => (
                <button
                  key={keyword}
                  onClick={() => setSearchQuery(keyword)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    searchQuery === keyword
                      ? "bg-sidebar-accent text-foreground font-medium" 
                      : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground"
                  )}
                >
                  <Hash className="w-4 h-4" />
                  <span className="flex-1 text-left truncate">{keyword}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-foreground/80">{notes.length} {t('notes.notes')}</span>
          </div>
        </div>
      </div>

      {/* Notes List */}
      <div
        className={cn(
          'w-full md:w-80 border-r border-border flex-col bg-background overflow-hidden',
          showMobileDetailPane ? 'hidden md:flex' : 'flex'
        )}
      >
        <div className="p-3 pl-16 md:pl-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between gap-2 md:hidden">
            <div className="flex items-center gap-2 min-w-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t('navigation.notes')}>
                    <Menu className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>{t('navigation.notes')}</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedNote(null);
                      navigate('/notes');
                    }}
                  >
                    <FileText className="w-4 h-4" />
                    <span>{t('notes.allNotes')}</span>
                    <Badge variant="secondary">{notes.length}</Badge>
                  </DropdownMenuItem>

                  {topKeywords.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>{t('notes.keywords')}</DropdownMenuLabel>
                      {topKeywords.map((keyword) => (
                        <DropdownMenuItem key={keyword} onClick={() => setSearchQuery(keyword)}>
                          <Hash className="w-4 h-4" />
                          <span className="truncate">{keyword}</span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleCreateNote}>
                    <Plus className="w-4 h-4" />
                    <span>{t('notes.newNote')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <h2 className="font-semibold text-foreground truncate">{t('navigation.notes')}</h2>
            </div>

            <Button onClick={handleCreateNote} size="icon" className="h-8 w-8 bg-foreground text-background hover:bg-foreground/90">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('notes.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-muted/50 border-0"
            />
          </div>
        </div>

        <NotesList
          notes={sortedNotes}
          selectedNote={selectedNote}
          onNoteSelect={handleNoteSelect}
          loading={loading}
          onRefresh={() => loadNotes(true)}
        />
      </div>

      {/* Note Detail / Editor */}
      <div
        className={cn(
          'flex-1 flex-col bg-background overflow-hidden',
          showMobileDetailPane ? 'flex' : 'hidden md:flex'
        )}
      >
        {isEditing ? (
          <NoteEditor
            note={isCreating ? null : selectedNote}
            onSaved={handleNoteSaved}
            onDeleted={isCreating ? handleBack : handleNoteDeleted}
            onCancel={handleBack}
          />
        ) : selectedNote ? (
          <NotePreview
            note={selectedNote}
            onEdit={handleEditNote}
            onDelete={handleNoteDeleted}
            onBack={handleBack}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {searchQuery ? t('notes.noResults') : t('notes.selectNote')}
            </h2>
            <p className="text-muted-foreground">
              {searchQuery ? t('notes.noResultsDesc') : t('notes.selectNoteDesc')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
