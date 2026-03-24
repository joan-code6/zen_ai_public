import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import NotesService, { type Note, type CreateNoteRequest, type UpdateNoteRequest } from '@/services/notesService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { X, Trash2, Plus, Hash } from 'lucide-react';

interface NoteEditorProps {
  note: Note | null;
  onSaved: (note: Note) => void;
  onDeleted: () => void;
  onCancel: () => void;
}

export default function NoteEditor({ note, onSaved, onDeleted, onCancel }: NoteEditorProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || note?.excerpt || '');
  const [keywords, setKeywords] = useState<string[]>(note?.keywords || []);
  const [newKeyword, setNewKeyword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content || note.excerpt || '');
      setKeywords(note.keywords || []);
    } else {
      setTitle('');
      setContent('');
      setKeywords([]);
    }
  }, [note]);

  const handleSave = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      if (note) {
        const updateRequest: UpdateNoteRequest = {
          uid: user.uid,
          title: title.trim() || 'Untitled Note',
          content: content.trim(),
          keywords
        };
        
        const updatedNote = await NotesService.updateNote(note.id, updateRequest);
        onSaved(updatedNote);
      } else {
        const createRequest: CreateNoteRequest = {
          uid: user.uid,
          title: title.trim() || 'Untitled Note',
          content: content.trim(),
          keywords
        };
        
        const newNote = await NotesService.createNote(createRequest);
        onSaved(newNote);
      }
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setLoading(false);
    }
  };

  const addKeyword = () => {
    const keyword = newKeyword.trim().toLowerCase();
    if (keyword && !keywords.includes(keyword)) {
      setKeywords([...keywords, keyword]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k !== keyword));
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b border-border">
        <div className="px-4 pl-16 sm:pl-4 py-3 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8">
              <X className="w-5 h-5" />
            </Button>
            <h2 className="font-medium text-foreground text-sm">
              {note ? 'Edit Note' : 'New Note'}
            </h2>
          </div>
          
          <div className="flex items-center gap-2">
            {note && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDeleted}
                disabled={loading}
                className="h-8 w-8 hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={loading || (!title.trim() && !content.trim())}
              className="bg-foreground text-background hover:bg-foreground/90"
            >
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title..."
            className="text-lg font-medium border-0 focus:ring-0 px-0 h-auto"
          />

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start writing..."
            rows={15}
            className="resize-none text-base leading-relaxed border-0 focus:ring-0 px-0"
          />

          <div className="pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Keywords</span>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-3">
              {keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="inline-flex items-center gap-1 text-sm px-2 py-1 bg-muted rounded-md"
                >
                  {keyword}
                  <button
                    onClick={() => removeKeyword(keyword)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="Add keyword..."
                onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                className="h-9"
              />
              <Button onClick={addKeyword} size="sm" variant="outline" className="h-9">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
