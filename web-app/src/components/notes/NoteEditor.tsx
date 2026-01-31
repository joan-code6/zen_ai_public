import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import NotesService, { type Note, type CreateNoteRequest, type UpdateNoteRequest } from '@/services/notesService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Save, 
  Trash2, 
  X, 
  Plus, 
  Hash, 
  Target,
  Brain,
  Lightbulb
} from 'lucide-react';

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
  const [triggerWords, setTriggerWords] = useState<string[]>(note?.triggerWords || []);
  const [newKeyword, setNewKeyword] = useState('');
  const [newTriggerWord, setNewTriggerWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content || note.excerpt || '');
      setKeywords(note.keywords || []);
      setTriggerWords(note.triggerWords || []);
    } else {
      setTitle('');
      setContent('');
      setKeywords([]);
      setTriggerWords([]);
    }
  }, [note]);

  const generateAiSuggestions = async () => {
    if (!content.trim()) return;

    try {
      // This would call the AI service to suggest keywords/triggers
      // For now, we'll use a simple mock implementation
      const words = content.toLowerCase().split(/\s+/);
      const importantWords = words.filter(word => 
        word.length > 4 && 
        !['this', 'that', 'with', 'from', 'they', 'have', 'been'].includes(word)
      );
      
      setAiSuggestions(importantWords.slice(0, 5));
    } catch (error) {
      console.error('Failed to generate AI suggestions:', error);
    }
  };

  const handleSave = async () => {
    if (!user || (!title.trim() && !content.trim())) return;

    try {
      setLoading(true);
      
      if (note) {
        // Update existing note
        const updateRequest: UpdateNoteRequest = {
          uid: user.uid,
          title: title.trim() || 'Untitled Note',
          content: content.trim(),
          keywords,
          triggerWords
        };
        
        const updatedNote = await NotesService.updateNote(note.id, updateRequest);
        onSaved(updatedNote);
      } else {
        // Create new note
        const createRequest: CreateNoteRequest = {
          uid: user.uid,
          title: title.trim() || 'New Note',
          content: content.trim(),
          keywords,
          triggerWords
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

  const handleDelete = async () => {
    if (!note || !user) return;

    try {
      setLoading(true);
      await NotesService.deleteNote(note.id, user.uid);
      onDeleted();
    } catch (error) {
      console.error('Failed to delete note:', error);
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

  const addTriggerWord = () => {
    const trigger = newTriggerWord.trim().toLowerCase();
    if (trigger && !triggerWords.includes(trigger)) {
      setTriggerWords([...triggerWords, trigger]);
      setNewTriggerWord('');
    }
  };

  const removeTriggerWord = (trigger: string) => {
    setTriggerWords(triggerWords.filter(t => t !== trigger));
  };

  const addAiSuggestion = (suggestion: string) => {
    const word = suggestion.toLowerCase();
    if (!keywords.includes(word) && !triggerWords.includes(word)) {
      if (Math.random() > 0.5) {
        setKeywords([...keywords, word]);
      } else {
        setTriggerWords([...triggerWords, word]);
      }
    }
    setAiSuggestions(aiSuggestions.filter(s => s !== suggestion));
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground">
              {note ? 'Edit Note' : 'New Note'}
            </h2>
          </div>
          
          <div className="flex items-center gap-2">
            {note && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={loading}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
            
            <Button
              onClick={handleSave}
              disabled={loading || (!title.trim() && !content.trim())}
              className="min-w-[80px]"
            >
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Title */}
          <div>
            <Label htmlFor="title" className="text-sm font-medium text-foreground mb-2 block">
              Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter note title..."
              className="text-lg font-medium"
            />
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="content" className="text-sm font-medium text-foreground">
                Content
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={generateAiSuggestions}
                className="text-xs"
              >
                <Brain className="w-3 h-3 mr-1" />
                AI Suggestions
              </Button>
            </div>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start writing your note..."
              rows={12}
              className="resize-none"
            />
          </div>

          {/* AI Suggestions */}
          {aiSuggestions.length > 0 && (
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">AI Suggestions</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {aiSuggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    onClick={() => addAiSuggestion(suggestion)}
                    className="text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {suggestion}
                  </Button>
                ))}
              </div>
            </Card>
          )}

          <Separator />

          {/* Keywords */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-2 block">
              Keywords
            </Label>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Add keyword..."
                  onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                  className="flex-1"
                />
                <Button onClick={addKeyword} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="gap-1">
                      <Hash className="w-3 h-3" />
                      {keyword}
                      <button
                        onClick={() => removeKeyword(keyword)}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Trigger Words */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-2 block">
              Trigger Words
            </Label>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newTriggerWord}
                  onChange={(e) => setNewTriggerWord(e.target.value)}
                  placeholder="Add trigger word..."
                  onKeyDown={(e) => e.key === 'Enter' && addTriggerWord()}
                  className="flex-1"
                />
                <Button onClick={addTriggerWord} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              {triggerWords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {triggerWords.map((trigger) => (
                    <Badge key={trigger} variant="outline" className="gap-1">
                      <Target className="w-3 h-3" />
                      {trigger}
                      <button
                        onClick={() => removeTriggerWord(trigger)}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tips */}
          <Card className="p-4 bg-muted/30">
            <h4 className="text-sm font-medium text-foreground mb-2">Tips</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Keywords help organize and categorize your notes</li>
              <li>• Trigger words help the AI find relevant notes during conversations</li>
              <li>• Use AI suggestions to automatically identify important terms</li>
              <li>• Notes with trigger words are automatically injected into chat context</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}