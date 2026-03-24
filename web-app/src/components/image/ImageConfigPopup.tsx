import React, { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { useTypedTranslation } from '@/hooks/useTranslation';
import ImageService, { ImageModel } from '@/services/imageService';

export interface ImageConfig {
  model: string;
  size: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality: 'standard' | 'hd';
}

interface ImageConfigPopupProps {
  isOpen: boolean;
  config: ImageConfig;
  onChange: (config: ImageConfig) => void;
  onApply: () => void;
  onClose: () => void;
}

const SIZE_OPTIONS = [
  { value: '1024x1024', label: '1024 × 1024 (Square)' },
  { value: '1792x1024', label: '1792 × 1024 (Wide)' },
  { value: '1024x1792', label: '1024 × 1792 (Tall)' },
  { value: '512x512', label: '512 × 512' },
  { value: '256x256', label: '256 × 256' },
] as const;

const QUALITY_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'hd', label: 'HD' },
] as const;

export default function ImageConfigPopup({
  isOpen,
  config,
  onChange,
  onApply,
  onClose,
}: ImageConfigPopupProps) {
  const { t } = useTypedTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [imageModels, setImageModels] = useState<ImageModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingModels(true);
    ImageService.getImageModels()
      .then((models) => {
        setImageModels(models);
        // Only set a default model if none is currently selected
        if (models.length > 0 && !config.model) {
          onChange({ ...config, model: models[0].id });
        }
      })
      .catch(() => setImageModels([]))
      .finally(() => setLoadingModels(false));
    // We intentionally only re-run this when the popup opens (isOpen), not on every config change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Small delay so the same click that opens the popup doesn't close it immediately
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 80);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-0 z-40 w-64 bg-card border border-border/80 rounded-xl shadow-xl p-3 space-y-3"
      role="dialog"
      aria-label={t('imageGenerator.settings')}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
          {t('imageGenerator.settings')}
        </span>
        <button
          onClick={onClose}
          className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('common.close')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Model */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{t('imageGenerator.model')}</label>
        {loadingModels ? (
          <div className="w-full h-8 rounded-lg border border-border/60 bg-background flex items-center px-2.5">
            <span className="text-xs text-muted-foreground">{t('common.loading') || 'Loading...'}</span>
          </div>
        ) : imageModels.length > 0 ? (
          <select
            value={config.model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
            className="w-full h-8 rounded-lg border border-border/60 bg-background text-xs px-2 focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
          >
            {imageModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name || m.id}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={config.model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
            className="w-full h-8 rounded-lg border border-border/60 bg-background text-xs px-2.5 focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
            placeholder="openai/dall-e-3"
          />
        )}
      </div>

      {/* Size */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{t('imageGenerator.size')}</label>
        <select
          value={config.size}
          onChange={(e) => onChange({ ...config, size: e.target.value as ImageConfig['size'] })}
          className="w-full h-8 rounded-lg border border-border/60 bg-background text-xs px-2 focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
        >
          {SIZE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Quality */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{t('imageGenerator.quality')}</label>
        <div className="flex gap-2">
          {QUALITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange({ ...config, quality: opt.value })}
              className={`flex-1 h-8 rounded-lg text-xs font-medium border transition-colors ${
                config.quality === opt.value
                  ? 'border-primary/60 text-primary bg-primary/10'
                  : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Apply */}
      <button
        onClick={onApply}
        className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-primary/90 text-primary-foreground text-xs font-medium hover:shadow-md transition-all"
      >
        <Check className="w-3.5 h-3.5" />
        {t('imageGenerator.apply')}
      </button>
    </div>
  );
}
