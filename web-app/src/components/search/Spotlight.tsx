import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchService, { SearchResult } from '@/services/searchService';
import { Command, Search as SearchIcon, MessageCircle, Mail, Calendar, FileText, ArrowRight, X, Clock, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebounce } from '@/hooks/useDebounce';

interface SpotlightProps {
  isOpen: boolean;
  onClose: () => void;
}

type Category = 'all' | 'chats' | 'emails' | 'calendar' | 'notes';

const categoryConfig: Record<Category, { label: string; icon: any; color: string }> = {
  all: { label: 'All', icon: Sparkles, color: 'text-violet-400' },
  chats: { label: 'Chats', icon: MessageCircle, color: 'text-blue-400' },
  emails: { label: 'Emails', icon: Mail, color: 'text-rose-400' },
  calendar: { label: 'Calendar', icon: Calendar, color: 'text-emerald-400' },
  notes: { label: 'Notes', icon: FileText, color: 'text-amber-400' },
};

const resultTypeConfig: Record<string, { icon: any; color: string; bgColor: string }> = {
  chat: { icon: MessageCircle, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  message: { icon: MessageCircle, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  email: { icon: Mail, color: 'text-rose-400', bgColor: 'bg-rose-500/10' },
  calendar: { icon: Calendar, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  note: { icon: FileText, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
};

export default function Spotlight({ isOpen, onClose }: SpotlightProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showNoResults, setShowNoResults] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const debouncedSearch = useDebounce(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setShowNoResults(false);
      return;
    }

    try {
      setLoading(true);
      const types = category === 'all' ? undefined : [category === 'chats' ? 'chat' as any : category as any];
      const response = await SearchService.search({
        q: searchQuery,
        types,
        limit: 20,
      });
      
      setResults(response.results);
      setShowNoResults(response.results.length === 0);
      setSelectedIndex(0);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, 300);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setShowNoResults(false);
    }
  }, [isOpen]);

  useEffect(() => {
    debouncedSearch(query);
  }, [query, category]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev, results.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev, 0));
      return;
    }

    if (e.key === 'Enter' && results.length > 0 && selectedIndex < results.length) {
      e.preventDefault();
      handleResultClick(results[selectedIndex]);
      return;
    }
  }, [isOpen, results, selectedIndex, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleResultClick = (result: SearchResult) => {
    navigate(result.url);
    onClose();
  };

  const getCategoryFromType = (type: string): Category => {
    if (type === 'chat' || type === 'message') return 'chats';
    if (type === 'email') return 'emails';
    if (type === 'calendar') return 'calendar';
    if (type === 'note') return 'notes';
    return 'all';
  };

  const formatPreview = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const groupedResults = results.reduce((acc, result, index) => {
    const type = result.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push({ ...result, originalIndex: index });
    return acc;
  }, {} as Record<string, (SearchResult & { originalIndex: number })[]>);

  if (!isOpen) return null;

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50"
        >
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ 
              type: "spring",
              stiffness: 300,
              damping: 30,
              mass: 0.8
            }}
            className="absolute left-1/2 top-[20%] -translate-x-1/2 w-full max-w-2xl"
          >
            <div className="bg-[#1a1a1f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <SearchIcon className="w-5 h-5 text-white/40 flex-shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search chats, emails, calendar, notes..."
                    className="flex-1 bg-transparent text-white text-base placeholder:text-white/40 outline-none"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="p-1 rounded-md hover:bg-white/10 transition-colors"
                    >
                      <X className="w-4 h-4 text-white/40" />
                    </button>
                  )}
                </div>

                <div className="flex gap-2 mt-3">
                  {(Object.keys(categoryConfig) as Category[]).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                        category === cat
                          ? 'bg-white/10 text-white'
                          : 'text-white/50 hover:bg-white/5'
                      }`}
                    >
                      {React.createElement(categoryConfig[cat].icon, { 
                        className: `w-3.5 h-3.5 ${category === cat ? '' : 'opacity-60'}` 
                      })}
                      {categoryConfig[cat].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                {loading ? (
                  <div className="p-8 text-center">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 border-white/20 border-t-white/60 animate-spin">
                      <div className="w-2 h-2 bg-white/40 rounded-full" />
                    </div>
                    <p className="mt-4 text-sm text-white/40">Searching...</p>
                  </div>
                ) : showNoResults && query.trim() ? (
                  <div className="p-12 text-center">
                    <SearchIcon className="w-12 h-12 text-white/20 mx-auto mb-4" />
                    <p className="text-white/60 text-base mb-2">No results found</p>
                    <p className="text-white/40 text-sm">Try adjusting your search terms</p>
                  </div>
                ) : !query.trim() ? (
                  <div className="p-8">
                    <div className="flex items-center justify-center gap-2 mb-6">
                      <Command className="w-5 h-5 text-white/60" />
                      <span className="text-white/60 text-sm">Keyboard shortcuts</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-white/80">↓</kbd>
                        <span className="text-xs text-white/50">Navigate down</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-white/80">↑</kbd>
                        <span className="text-xs text-white/50">Navigate up</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-white/80">Enter</kbd>
                        <span className="text-xs text-white/50">Open result</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                        <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-white/80">Esc</kbd>
                        <span className="text-xs text-white/50">Close</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-2">
                    {Object.entries(groupedResults).map(([type, typeResults]) => (
                      <div key={type} className="mb-3 last:mb-0">
                        <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                          <div className={`w-4 h-4 rounded-md flex items-center justify-center ${resultTypeConfig[type]?.bgColor || 'bg-white/10'}`}>
                            {React.createElement(resultTypeConfig[type]?.icon || SearchIcon, { 
                              className: `w-2.5 h-2.5 ${resultTypeConfig[type]?.color || 'text-white/60'}` 
                            })}
                          </div>
                          <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                            {type.charAt(0).toUpperCase() + type.slice(1)}s
                          </span>
                        </div>

                        {typeResults.map((result) => {
                          const config = resultTypeConfig[result.type] || resultTypeConfig[result.type.split(':')[0] || 'chat'];
                          const isSelected = selectedIndex === result.originalIndex;
                          
                          return (
                            <motion.button
                              key={result.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: result.originalIndex * 0.03 }}
                              onClick={() => handleResultClick(result)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                                isSelected 
                                  ? 'bg-white/10 text-white' 
                                  : 'hover:bg-white/5 text-white/80'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bgColor}`}>
                                {React.createElement(config.icon, { 
                                  className: `w-4 h-4 ${config.color}` 
                                })}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-white/90'}`}>
                                    {result.title}
                                  </p>
                                  <span className="text-xs text-white/40 flex-shrink-0 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDate(result.createdAt)}
                                  </span>
                                </div>
                                <p className="text-xs text-white/50 truncate">
                                  {formatPreview(result.preview)}
                                </p>
                              </div>

                              <ArrowRight className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-white/60' : 'text-white/30'}`} />
                            </motion.button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between">
                <p className="text-xs text-white/40">
                  {query.trim() ? `${results.length} result${results.length !== 1 ? 's' : ''} found` : 'Start typing to search'}
                </p>
                <div className="flex items-center gap-1 text-xs text-white/40">
                  <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs font-mono">Cmd</kbd>
                  <span>+</span>
                  <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs font-mono">K</kbd>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
