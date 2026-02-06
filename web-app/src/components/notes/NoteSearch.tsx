import { type Note } from '@/services/notesService';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Edit3, Search, Hash, Target, Clock } from 'lucide-react';

interface NoteSearchProps {
  results: Note[];
  onEditNote: (note: Note) => void;
  onBack: () => void;
}

export default function NoteSearch({ results, onEditNote, onBack }: NoteSearchProps) {
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

  const getExcerpt = (content: string, maxLength: number = 200) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength).trim() + '...';
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-primary/20 text-primary px-1 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Search Results
            </h2>
            <p className="text-sm text-muted-foreground">
              {results.length} {results.length === 1 ? 'note' : 'notes'} found
            </p>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-6">
        {results.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No results found</h3>
            <p className="text-muted-foreground mb-4">Try adjusting your search terms or filters</p>
            <Button onClick={onBack}>
              Back to Notes
            </Button>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {results.map((note) => (
              <Card 
                key={note.id} 
                className="group hover:shadow-lg transition-all duration-200 border-border/50 bg-card/50 backdrop-blur-sm"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-foreground text-lg line-clamp-2 group-hover:text-primary transition-colors">
                      {note.title}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onEditNote(note)}
                    >
                      <Edit3 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  </div>

                  {/* Content Excerpt */}
                  <p className="text-muted-foreground mb-4 leading-relaxed">
                    {getExcerpt(note.content || note.excerpt)}
                  </p>

                  {/* Keywords and Triggers */}
                  <div className="space-y-2 mb-4">
                    {note.keywords && note.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-muted-foreground font-medium">Keywords:</span>
                        {note.keywords.map((keyword) => (
                          <Badge key={keyword} variant="secondary" className="text-xs">
                            <Hash className="w-3 h-3 mr-1" />
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {note.triggerWords && note.triggerWords.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-muted-foreground font-medium">Triggers:</span>
                        {note.triggerWords.map((trigger) => (
                          <Badge key={trigger} variant="outline" className="text-xs">
                            <Target className="w-3 h-3 mr-1" />
                            {trigger}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border/50">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Modified: {formatDate(note.updatedAt)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Created: {formatDate(note.createdAt)}</span>
                      </div>
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-3 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onEditNote(note)}
                    >
                      Open Note
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}