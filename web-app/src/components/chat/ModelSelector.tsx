
import React, { useEffect, useMemo, useState } from 'react';
import { ChatService, AIModel, AIModelsResponse } from '@/services';
import { X } from 'lucide-react';
// Import all provider icons from svgl or a central icon registry
import { QwenLight } from '@/components/ui/svgs/qwenLight';
import { QwenDark } from '@/components/ui/svgs/qwenDark';
import { Openai } from '@/components/ui/svgs/openai';
import { OpenaiDark } from '@/components/ui/svgs/openaiDark';
import { Google } from '@/components/ui/svgs/google';
import { Deepseek } from '@/components/ui/svgs/deepseek';
import { NvidiaIconLight } from '@/components/ui/svgs/nvidiaIconLight';
import { NvidiaIconDark } from '@/components/ui/svgs/nvidiaIconDark';
import { XaiLight } from '@/components/ui/svgs/xaiLight';
import { XaiDark } from '@/components/ui/svgs/xaiDark';
import { AnthropicBlack } from '@/components/ui/svgs/anthropicBlack';
import { AnthropicWhite } from '@/components/ui/svgs/anthropicWhite';
import { Meta } from '@/components/ui/svgs/meta';
import { MistralAiLogo } from '@/components/ui/svgs/mistralAiLogo';
import { MistralAiWordmark } from '@/components/ui/svgs/mistralAiWordmark';
import { Zai } from '@/components/ui/svgs/zai';
import { MinimaxColor } from '@/components/ui/svgs/minimaxColor';
import { BytedanceColor } from '@/components/ui/svgs/bytedanceColor';

// MoonshotAI SVG as React component
const MoonshotIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg fill="currentColor" fillRule="evenodd" height="1em" style={{flex: 'none', lineHeight: 1}} viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg" {...props}>
    <title>MoonshotAI</title>
    <path d="M1.052 16.916l9.539 2.552a21.007 21.007 0 00.06 2.033l5.956 1.593a11.997 11.997 0 01-5.586.865l-.18-.016-.044-.004-.084-.009-.094-.01a11.605 11.605 0 01-.157-.02l-.107-.014-.11-.016a11.962 11.962 0 01-.32-.051l-.042-.008-.075-.013-.107-.02-.07-.015-.093-.019-.075-.016-.095-.02-.097-.023-.094-.022-.068-.017-.088-.022-.09-.024-.095-.025-.082-.023-.109-.03-.062-.02-.084-.025-.093-.028-.105-.034-.058-.019-.08-.026-.09-.031-.066-.024a6.293 6.293 0 01-.044-.015l-.068-.025-.101-.037-.057-.022-.08-.03-.087-.035-.088-.035-.079-.032-.095-.04-.063-.028-.063-.027a5.655 5.655 0 01-.041-.018l-.066-.03-.103-.047-.052-.024-.096-.046-.062-.03-.084-.04-.086-.044-.093-.047-.052-.027-.103-.055-.057-.03-.058-.032a6.49 6.49 0 01-.046-.026l-.094-.053-.06-.034-.051-.03-.072-.041-.082-.05-.093-.056-.052-.032-.084-.053-.061-.039-.079-.05-.07-.047-.053-.035a7.785 7.785 0 01-.054-.036l-.044-.03-.044-.03a6.066 6.066 0 01-.04-.028l-.057-.04-.076-.054-.069-.05-.074-.054-.056-.042-.076-.057-.076-.059-.086-.067-.045-.035-.064-.052-.074-.06-.089-.073-.046-.039-.046-.039a7.516 7.516 0 01-.043-.037l-.045-.04-.061-.053-.07-.062-.068-.06-.062-.058-.067-.062-.053-.05-.088-.084a13.28 13.28 0 01-.099-.097l-.029-.028-.041-.042-.069-.07-.05-.051-.05-.053a6.457 6.457 0 01-.168-.179l-.08-.088-.062-.07-.071-.08-.042-.049-.053-.062-.058-.068-.046-.056a7.175 7.175 0 01-.027-.033l-.045-.055-.066-.082-.041-.052-.05-.064-.02-.025a11.99 11.99 0 01-1.44-2.402zm-1.02-5.794l11.353 3.037a20.468 20.468 0 00-.469 2.011l10.817 2.894a12.076 12.076 0 01-1.845 2.005L.657 15.923l-.016-.046-.035-.104a11.965 11.965 0 01-.05-.153l-.007-.023a11.896 11.896 0 01-.207-.741l-.03-.126-.018-.08-.021-.097-.018-.081-.018-.09-.017-.084-.018-.094c-.026-.141-.05-.283-.071-.426l-.017-.118-.011-.083-.013-.102a12.01 12.01 0 01-.019-.161l-.005-.047a12.12 12.12 0 01-.034-2.145zm1.593-5.15l11.948 3.196c-.368.605-.705 1.231-1.01 1.875l11.295 3.022c-.142.82-.368 1.612-.668 2.365l-11.55-3.09L.124 10.26l.015-.1.008-.049.01-.067.015-.087.018-.098c.026-.148.056-.295.088-.442l.028-.124.02-.085.024-.097c.022-.09.045-.18.07-.268l.028-.102.023-.083.03-.1.025-.082.03-.096.026-.082.031-.095a11.896 11.896 0 011.01-2.232zm4.442-4.4L17.352 4.59a20.77 20.77 0 00-1.688 1.721l7.823 2.093c.267.852.442 1.744.513 2.665L2.106 5.213l.045-.065.027-.04.04-.055.046-.065.055-.076.054-.072.064-.086.05-.065.057-.073.055-.07.06-.074.055-.069.065-.077.054-.066.066-.077.053-.06.072-.082.053-.06.067-.074.054-.058.073-.078.058-.06.063-.067.168-.17.1-.098.059-.056.076-.071a12.084 12.084 0 012.272-1.677zM12.017 0h.097l.082.001.069.001.054.002.068.002.046.001.076.003.047.002.06.003.054.002.087.005.105.007.144.011.088.007.044.004.077.008.082.008.047.005.102.012.05.006.108.014.081.01.042.006.065.01.207.032.07.012.065.011.14.026.092.018.11.022.046.01.075.016.041.01L14.7.3l.042.01.065.015.049.012.071.017.096.024.112.03.113.03.113.032.05.015.07.02.078.024.073.023.05.016.05.016.076.025.099.033.102.036.048.017.064.023.093.034.11.041.116.045.1.04.047.02.06.024.041.018.063.026.04.018.057.025.11.048.1.046.074.035.075.036.06.028.092.046.091.045.102.052.053.028.049.026.046.024.06.033.041.022.052.029.088.05.106.06.087.051.057.034.053.032.096.059.088.055.098.062.036.024.064.041.084.056.04.027.062.042.062.043.023.017c.054.037.108.075.161.114l.083.06.065.048.056.043.086.065.082.064.04.03.05.041.086.069.079.065.085.071c.712.6 1.353 1.283 1.909 2.031L7.222.994l.062-.027.065-.028.081-.034.086-.035c.113-.045.227-.09.341-.131l.096-.035.093-.033.084-.03.096-.031c.087-.03.176-.058.264-.085l.091-.027.086-.025.102-.03.085-.023.1-.026L9.04.37l.09-.023.091-.022.095-.022.09-.02.098-.021.091-.02.095-.018.092-.018.1-.018.091-.016.098-.017.092-.014.097-.015.092-.013.102-.013.091-.012.105-.012.09-.01.105-.01c.093-.01.186-.018.28-.024l.106-.008.09-.005.11-.006.093-.004.1-.004.097-.002.099-.002.197-.002z" />
  </svg>
);

interface ModelSelectorProps {
  selectedModel?: string;
  onModelChange: (model: AIModel) => void;
  isOpen: boolean;
  onClose: () => void;
}



const PROVIDER_ICONS: Record<string, { light: React.ComponentType; dark?: React.ComponentType } | null> = {
  'qwen': { light: QwenLight, dark: QwenDark },
  'openai': { light: Openai, dark: OpenaiDark },
  'google': { light: Google },
  'deepseek': { light: Deepseek },
  'nvidia': { light: NvidiaIconLight, dark: NvidiaIconDark },
  'x-ai': { light: XaiLight, dark: XaiDark },
  'anthropic': { light: AnthropicBlack, dark: AnthropicWhite },
  'meta-llama': { light: Meta },
  'mistralai': { light: MistralAiLogo },
  'moonshotai': { light: MoonshotIcon },
  'z-ai': { light: Zai },
  'minimax': { light: MinimaxColor },
  'bytedance-seed': { light: BytedanceColor },
};

function getProvider(modelId: string) {
  return modelId.split('/')[0] || 'other';
}

function groupByProvider(models: AIModel[]) {
  const map: Record<string, AIModel[]> = {};
  for (const m of models) {
    const p = getProvider(m.id);
    if (!map[p]) map[p] = [];
    map[p].push(m);
  }
  return map;
}

function formatProviderName(provider: string) {
  return provider
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getProviderIcon(provider: string, theme: 'light' | 'dark' = 'light') {
  const iconSet = PROVIDER_ICONS[provider];
  if (iconSet) {
    return iconSet[theme] || iconSet.light;
  }
  // fallback: render nothing or a generic icon
  return null;
}

export default function ModelSelector({ selectedModel, onModelChange, isOpen, onClose }: ModelSelectorProps) {
  const [models, setModels] = useState<AIModel[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    ChatService.getModels()
      .then((res: AIModelsResponse) => {
        if (mounted) {
          setModels(res.items || []);
          setDefaultModel(res.defaultModel || undefined);
          setLoading(false);
        }
      })
      .catch(e => {
        setError('Failed to load models');
        setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const grouped = useMemo(() => groupByProvider(models), [models]);
  const providers = useMemo(() => Object.keys(grouped), [grouped]);

  useEffect(() => {
    if (selectedModel) return;
    if (defaultModel) {
      const model = models.find((m) => m.id === defaultModel);
      if (model) {
        onModelChange(model);
      } else {
        onModelChange({ id: defaultModel, name: defaultModel });
      }
    }
  }, [defaultModel, models, onModelChange, selectedModel]);

  useEffect(() => {
    if (!providers.length) return;
    const selectedProvider = selectedModel ? getProvider(selectedModel) : null;
    if (selectedProvider && providers.includes(selectedProvider)) {
      setActiveProvider(selectedProvider);
      return;
    }
    setActiveProvider(prev => (prev && providers.includes(prev) ? prev : providers[0]));
  }, [providers, selectedModel]);

  if (!isOpen) return null;

  const modelsForProvider = activeProvider ? grouped[activeProvider] || [] : [];

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-auto mt-10 h-[80vh] w-[92vw] max-w-5xl rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Model selector</div>
            <div className="text-lg font-semibold text-foreground">Choose your model</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-border/70 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition"
            aria-label="Close model selector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex h-[calc(80vh-64px)]">
          <aside className="w-[240px] border-r border-border bg-muted/20">
            <div className="h-full overflow-auto p-4 space-y-2">
              {loading && <div className="text-xs text-muted-foreground">Loading providers...</div>}
              {error && <div className="text-xs text-destructive">{error}</div>}
              {!loading && !error && providers.map(provider => {
                const isActive = provider === activeProvider;
                return (
                  <button
                    key={provider}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition text-sm
                      ${isActive ? 'bg-foreground text-background border-foreground' : 'bg-background border-border/60 hover:border-border'}`}
                    onClick={() => setActiveProvider(provider)}
                  >
                    <div className="flex items-center gap-2">
                                  <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white border border-black">
                                    {(() => {
                                      // Always use the black (light) icon variant
                                      const Icon = getProviderIcon(provider, 'light');
                                      // Force black for icons that rely on currentColor
                                      const forceBlack = ['moonshotai', 'qwen', 'z-ai', 'minimax', 'bytedance-seed'].includes(provider);
                                      const iconSizeClass = provider === 'minimax' ? 'w-6 h-6' : 'w-5 h-5';
                                      return Icon ? (
                                        <div className={`${iconSizeClass} flex items-center justify-center ${forceBlack ? 'text-black' : ''}`}>
                                          <Icon />
                                        </div>
                                      ) : null;
                                    })()}
                                  </span>
                      <span className="font-medium truncate">{formatProviderName(provider)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="flex-1">
            <div className="h-full overflow-auto p-4">
              {loading && <div className="text-sm text-muted-foreground">Loading models...</div>}
              {error && <div className="text-sm text-destructive">{error}</div>}
              {!loading && !error && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {modelsForProvider.map(model => {
                    const isActive = model.id === selectedModel;
                    return (
                      <button
                        key={model.id}
                          className={`flex flex-col items-start justify-start h-full text-left p-3 rounded-xl border transition
                            ${isActive ? 'bg-primary border-primary text-black dark:text-primary-foreground' : 'bg-card border-border/60 hover:border-border'}`}
                        onClick={() => {
                          onModelChange(model);
                          onClose();
                        }}
                      >
                        <div className="font-semibold text-foreground leading-tight">
                          {model.name || model.id.split('/')[1] || model.id}
                        </div>
                        {model.description && (
                          <div className={`text-xs mt-1 ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                            {model.description}
                          </div>
                        )}
                        {model.contextLength && (
                          <div className={`text-[11px] mt-2 ${isActive ? 'text-primary-foreground/70' : 'text-muted-foreground/80'}`}>
                            {(model.contextLength / 1000).toFixed(0)}k context
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
