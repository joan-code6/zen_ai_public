import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import CacheService from '@/services/cacheService';
import NotesService, { type Note } from '@/services/notesService';
import NotesList from './NotesList';
import NoteEditor from './NoteEditor';
import NoteSearch from './NoteSearch';
import NoteHistory from './NoteHistory';
import { Plus, Search, Clock, Brain, FileText, Hash, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

type View = 'list' | 'editor' | 'search' | 'history';

export default function NotesView() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<View>('list');
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<Note[]>([]);
  const [aiChanges, setAiChanges] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadNotes();
    }
  }, [user]);

  const loadNotes = async () => {
    if (!user) return;
    
    try {
      const cacheKey = `notes:${user.uid}`;
      let userNotes = CacheService.get<Note[]>(cacheKey);
      
      if (!userNotes) {
        userNotes = await NotesService.getNotes(user.uid, 100);
        CacheService.set(cacheKey, userNotes, 5 * 60 * 1000);
      }
      
      setNotes(userNotes);
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = () => {
    setSelectedNote(null);
    setCurrentView('editor');
  };

  const handleEditNote = (note: Note) => {
    setSelectedNote(note);
    setCurrentView('editor');
  };

  const handleNoteSaved = (note: Note) => {
    if (user) CacheService.invalidateView(`notes:${user.uid}`);
    loadNotes();
    setSelectedNote(note);
  };

  const handleNoteDeleted = () => {
    if (user) CacheService.invalidateView(`notes:${user.uid}`);
    loadNotes();
    setSelectedNote(null);
    setCurrentView('list');
  };

  const handleSearch = async (query: string, options: any) => {
    if (!user) return;
    
    try {
      const results = await NotesService.searchNotes({
        uid: user.uid,
        q: query,
        semantic: options.semantic,
        keywords: options.keywords,
        triggerWords: options.triggerWords,
        limit: 50
      });
      setSearchResults(results);
      setCurrentView('search');
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const loadAiChanges = async () => {
    if (!user) return;
    
    try {
      const changes = await NotesService.getAiChanges(user.uid, 50);
      setAiChanges(changes);
      setCurrentView('history');
    } catch (error) {
      console.error('Failed to load AI changes:', error);
    }
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'editor':
        return (
          <NoteEditor
            note={selectedNote}
            onSaved={handleNoteSaved}
            onDeleted={handleNoteDeleted}
            onCancel={() => setCurrentView('list')}
          />
        );
      case 'search':
        return (
          <NoteSearch
            results={searchResults}
            onEditNote={handleEditNote}
            onBack={() => setCurrentView('list')}
          />
        );
      case 'history':
        return (
          <NoteHistory
            changes={aiChanges}
            onEditNote={handleEditNote}
            onBack={() => setCurrentView('list')}
          />
        );
      default:
        return (
          <NotesList
            notes={notes}
            onEditNote={handleEditNote}
            loading={loading}
            onRefresh={loadNotes}
          />
        );
    }
  };

  const getStats = () => {
    const totalNotes = notes.length;
    const recentNotes = notes.filter(note => {
      const updatedAt = new Date(note.updatedAt);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return updatedAt >= weekAgo;
    }).length;
    const totalKeywords = [...new Set(notes.flatMap(note => note.keywords))].length;
    const totalTriggers = [...new Set(notes.flatMap(note => note.triggerWords))].length;

    return { totalNotes, recentNotes, totalKeywords, totalTriggers };
  };

  const stats = getStats();

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-80 border-r border-border bg-card/50">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground">Notes</h2>
            <Button
              onClick={handleCreateNote}
              size="sm"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              New
            </Button>
          </div>

          {/* Quick Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Quick search..."
              className="pl-10"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  handleSearch(e.currentTarget.value.trim(), { semantic: true });
                }
              }}
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="p-4 space-y-2">
          <Button
            variant={currentView === 'list' ? 'secondary' : 'ghost'}
            className="w-full justify-start gap-3"
            onClick={() => setCurrentView('list')}
          >
            <FileText className="w-4 h-4" />
            All Notes
            <Badge variant="outline" className="ml-auto">
              {stats.totalNotes}
            </Badge>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            onClick={() => handleSearch('', { semantic: true })}
          >
            <Brain className="w-4 h-4" />
            Semantic Search
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            onClick={loadAiChanges}
          >
            <Clock className="w-4 h-4" />
            AI Changes
          </Button>
        </div>

        {/* Stats */}
        <div className="p-4 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">Statistics</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Notes</span>
              <Badge variant="secondary">{stats.totalNotes}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Recent (7 days)</span>
              <Badge variant="secondary">{stats.recentNotes}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Keywords</span>
              <Badge variant="secondary">{stats.totalKeywords}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Triggers</span>
              <Badge variant="secondary">{stats.totalTriggers}</Badge>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="p-4 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => handleSearch('important', { keywords: ['important'] })}
            >
              <Hash className="w-3 h-3" />
              Find Important Notes
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => handleSearch('', { triggerWords: ['todo', 'follow up'] })}
            >
              <Target className="w-3 h-3" />
              Find Action Items
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {renderCurrentView()}
      </div>
    </div>
  );
}