import React, { useState } from 'react';
import { X, Image, Download, Loader2, Sparkles } from 'lucide-react';
import { ImageService, GeneratedImage } from '@/services';
import { useTypedTranslation } from '@/hooks/useTranslation';

interface ImageGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
}

const SIZE_OPTIONS = [
  { value: '1024x1024', label: '1024 × 1024' },
  { value: '1792x1024', label: '1792 × 1024 (Wide)' },
  { value: '1024x1792', label: '1024 × 1792 (Tall)' },
  { value: '512x512', label: '512 × 512' },
  { value: '256x256', label: '256 × 256' },
] as const;

const QUALITY_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'hd', label: 'HD' },
] as const;

export default function ImageGenerator({ isOpen, onClose }: ImageGeneratorProps) {
  const { t } = useTypedTranslation();
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<typeof SIZE_OPTIONS[number]['value']>('1024x1024');
  const [quality, setQuality] = useState<'standard' | 'hd'>('standard');
  const [isGenerating, setIsGenerating] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revisedPrompt, setRevisedPrompt] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleGenerate() {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setImages([]);
    setRevisedPrompt(null);

    try {
      const result = await ImageService.generateImages({
        prompt: prompt.trim(),
        size,
        quality,
        n: 1,
      });
      setImages(result.images);
      if (result.images[0]?.revised_prompt) {
        setRevisedPrompt(result.images[0].revised_prompt);
      }
    } catch (err: any) {
      setError(err.message || t('imageGenerator.generationFailed'));
    } finally {
      setIsGenerating(false);
    }
  }

  function handleDownload(image: GeneratedImage, index: number) {
    const urlPath = image.url.split('?')[0];
    const ext = urlPath.split('.').pop()?.toLowerCase();
    const validExts = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
    const fileExt = ext && validExts.has(ext) ? ext : 'png';
    const link = document.createElement('a');
    link.href = image.url;
    link.download = `generated-image-${index + 1}.${fileExt}`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerate();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-generator-title"
        className="relative w-full max-w-2xl mx-4 bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Image className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h2 id="image-generator-title" className="text-base font-semibold text-foreground">{t('imageGenerator.title')}</h2>
              <p className="text-xs text-muted-foreground">{t('imageGenerator.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Prompt Input */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t('imageGenerator.prompt')}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('imageGenerator.promptPlaceholder')}
              rows={3}
              className="w-full resize-none px-3 py-2 rounded-xl border border-border/60 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/60"
              disabled={isGenerating}
            />
            <p className="text-xs text-muted-foreground mt-1">{t('imageGenerator.ctrlEnterHint')}</p>
          </div>

          {/* Options Row */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('imageGenerator.size')}</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as typeof size)}
                disabled={isGenerating}
                className="w-full h-9 rounded-lg border border-border/60 bg-background text-sm px-2 focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                {SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('imageGenerator.quality')}</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as 'standard' | 'hd')}
                disabled={isGenerating}
                className="w-full h-9 rounded-lg border border-border/60 bg-background text-sm px-2 focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                {QUALITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Generated Images */}
          {images.length > 0 && (
            <div className="space-y-3">
              {revisedPrompt && (
                <div className="px-3 py-2 rounded-xl bg-muted/50 border border-border/40 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{t('imageGenerator.revisedPrompt')}: </span>
                  {revisedPrompt}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                {images.map((img, idx) => (
                  <div key={idx} className="relative group rounded-xl overflow-hidden border border-border/60">
                    <img
                      src={img.url}
                      alt={prompt}
                      className="w-full object-contain bg-muted/20"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => handleDownload(img, idx)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-black text-sm font-medium shadow hover:bg-white transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        {t('imageGenerator.download')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Placeholder when no images yet */}
          {images.length === 0 && !isGenerating && !error && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-sm">{t('imageGenerator.enterPromptHint')}</p>
            </div>
          )}

          {/* Loading State */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary" />
              <p className="text-sm">{t('imageGenerator.generating')}</p>
            </div>
          )}
        </div>

        {/* Footer / Generate Button */}
        <div className="p-4 border-t border-border/60">
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-primary-foreground font-medium text-sm hover:shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('imageGenerator.generating')}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t('imageGenerator.generate')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
