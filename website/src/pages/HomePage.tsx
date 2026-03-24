import { Github, Plus, Minus, ExternalLink, Download, BookOpen, BarChart3 } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';

type BenchmarkSummary = {
  questions: number;
  zen_score: number;
  normal_score: number;
  zen_total_tokens: number;
  normal_total_tokens: number;
  zen_total_cost: number;
  normal_total_cost: number;
};

type BenchmarkPayload = {
  summary: BenchmarkSummary;
};

function HomePage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkPayload | null>(null);
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash;
      if (!h) return;
      const target = h.replace(/^#\/?/, '');
      if (!target) return;
      navigate(`/${target}`, { replace: true });
    };

    // handle hash on mount
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [navigate]);

  const faqs = useMemo(() => {
    const items: { question: string; answer: string }[] = [];
    for (let i = 1; i <= 100; i++) {
      const qKey = `faq.${i}.question`;
      const aKey = `faq.${i}.answer`;
      const q = t(qKey);
      const a = t(aKey);
      // if both return the raw key, assume no more entries
      if (q === qKey && a === aKey) break;
      items.push({ question: q === qKey ? '' : q, answer: a === aKey ? '' : a });
    }
    return items;
  }, [t]);

  const helpItems = useMemo(() => {
    const items: { question: string; answer: string }[] = [];
    for (let i = 1; i <= 100; i++) {
      const qKey = `help.${i}.question`;
      const aKey = `help.${i}.answer`;
      const q = t(qKey);
      const a = t(aKey);
      if (q === qKey && a === aKey) break;
      items.push({ question: q === qKey ? '' : q, answer: a === aKey ? '' : a });
    }
    return items;
  }, [t]);

  const [openHelpIndex, setOpenHelpIndex] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadBenchmark = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}result.json`);
        if (!response.ok) return;
        const json = (await response.json()) as BenchmarkPayload;
        if (isMounted) {
          setBenchmarkData(json);
        }
      } catch {
        // Keep homepage resilient if benchmark data is unavailable.
      }
    };

    void loadBenchmark();
    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    if (!benchmarkData) return null;

    const { summary } = benchmarkData;
    const tokenReduction =
      ((summary.normal_total_tokens - summary.zen_total_tokens) /
        Math.max(summary.normal_total_tokens, 1)) *
      100;

    const costReduction =
      ((summary.normal_total_cost - summary.zen_total_cost) /
        Math.max(summary.normal_total_cost, 0.000001)) *
      100;

    const zenAccuracy = (summary.zen_score / Math.max(summary.questions, 1)) * 100;
    const baselineAccuracy = (summary.normal_score / Math.max(summary.questions, 1)) * 100;

    return {
      // keep the original summary so the UI can reference raw numbers if needed
      summary,
      tokenReduction,
      costReduction,
      zenAccuracy,
      baselineAccuracy,
      zenTokenRelative: (summary.zen_total_tokens / Math.max(summary.normal_total_tokens, 1)) * 100,
      zenCostRelative: (summary.zen_total_cost / Math.max(summary.normal_total_cost, 0.000001)) * 100,
      qualityLead: zenAccuracy - baselineAccuracy,
    };
  }, [benchmarkData]);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const features = [
    { titleKey: 'features.clean_ui.title', img: `${import.meta.env.BASE_URL}images/ZenAIDesktop-Home.png`, descKey: 'features.clean_ui.description' },
    { titleKey: 'features.notes.title', img: `${import.meta.env.BASE_URL}images/ZenAIDesktop-notes.png`, descKey: 'features.notes.description' },
    { titleKey: 'features.customizable.title', img: `${import.meta.env.BASE_URL}images/ZenAIDesktop-customizable.png`, descKey: 'features.customizable.description' },
    { titleKey: 'features.calendar.title', img: `${import.meta.env.BASE_URL}images/ZenAIDesktop-calendar.png`, descKey: 'features.calendar.description' },
    { titleKey: 'features.email.title', img: `${import.meta.env.BASE_URL}images/ZenAIDesktop-email.png`, descKey: 'features.email.description' },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900 to-black"></div> */}
        {/* <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-700/20 via-black to-black"></div> */}

        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          <div className="mb-4 relative flex items-center justify-center w-full h-80">
            <div className="w-full h-[28rem] flex items-center justify-center relative">
              <div className="gradient-ball ball1"></div>
              <div className="gradient-ball ball2"></div>
              <div className="gradient-ball ball3"></div> 
              <img
                src={`${import.meta.env.BASE_URL}fulllogo.png`}
                alt="ZEN AI Logo"
                className="h-48 mx-auto relative z-10 select-none"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                style={{ zIndex: 2, userSelect: 'none' }}
              />
            </div>
            </div>


          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            {t('home.title_line1')}
            <br />
            {t('home.title_line2')}
          </h1>
            <p className="text-3xl md:text-5xl text-gray-400 mb-8">
            {t('home.subtitle')}
            </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link
              to="/documentation"
              className="px-8 py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-all transform hover:scale-105 border border-gray-700 flex items-center gap-2 shadow-lg"
            >
              <BookOpen size={20} />
              {t('home.btn.documentation')}
            </Link>
            <Link
              to="/download"
              className="px-8 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-all transform hover:scale-105 flex items-center gap-2 shadow-lg"
            >
              <Download size={20} />
              {t('home.btn.download')}
            </Link>
            <Link
              to="/benchmark"
              className="px-8 py-3 bg-cyan-200 text-black font-semibold rounded-lg hover:bg-cyan-100 transition-all transform hover:scale-105 flex items-center gap-2 shadow-lg"
            >
              <BarChart3 size={20} />
              {t('home.btn.benchmark')}
            </Link>
<a
              href="https://zen.arg-server.de"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-all transform hover:scale-105 flex items-center gap-2 shadow-lg"
            >
              <ExternalLink size={20} />
              {t('home.btn.webapp')}
            </a>
            <a
              href="https://github.com/joan-code6/zen_ai_public"
              className="px-8 py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-all transform hover:scale-105 border border-gray-700 flex items-center gap-2 shadow-lg"
            >
              <Github size={20} />
              Github
            </a>
          </div>
        </div>
      </section>

      <section id="faq" className="py-20 px-6 bg-black">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-4xl md:text-5xl font-bold mb-12 pb-4 border-b-4 border-white">
            {t('home.faq.title')}
          </h2>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden transition-all duration-300 hover:border-gray-700"
              >
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-800/50 transition-colors"
                  aria-expanded={openFaqIndex === index}
                >
                  <span className="text-lg font-semibold text-white pr-4">{faq.question}</span>
                  <span className="flex-shrink-0 text-gray-400">
                    {openFaqIndex === index ? <Minus size={20} /> : <Plus size={20} />}
                  </span>
                </button>

                <div
                  className={`transition-all duration-300 ease-in-out ${
                    openFaqIndex === index
                      ? 'max-h-96 opacity-100'
                      : 'max-h-0 opacity-0'
                  } overflow-hidden`}
                >
                  <div className="px-6 pb-4 pt-2">
                    <p className="text-gray-300 leading-relaxed" style={{whiteSpace: 'pre-line'}}>{faq.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {stats && (
        <section id="statistics" className="py-20 px-6 bg-black">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-4xl md:text-5xl font-bold mb-12 pb-4 border-b-4 border-white">
              {t('home.statistics.title')}
            </h2>
            
            {[
              {
                title: t('home.statistics.tokens'),
                desc: t('home.statistics.reduction'),
                zenLabel: `${stats.tokenReduction.toFixed(0)}%`,
                baseLabel: `${stats.zenTokenRelative.toFixed(0)}%`,
                detail: t('home.statistics.tokenDetails', {
                  zenTokens: stats.summary.zen_total_tokens.toLocaleString(),
                  baseTokens: stats.summary.normal_total_tokens.toLocaleString(),
                }),
                zenVisual: Math.max(4, Math.min(100, stats.tokenReduction)),
                baseVisual: Math.max(4, Math.min(100, stats.zenTokenRelative)),
              },
              {
                title: t('home.statistics.price'),
                desc: t('home.statistics.moreEfficient'),
                zenLabel: `${stats.costReduction.toFixed(0)}%`,
                baseLabel: `${stats.zenCostRelative.toFixed(0)}%`,
                // show relative percentages in the detail (avoid raw $0.00 values)
                detail: t('home.statistics.costDetails', {
                  zenCost: `${stats.costReduction.toFixed(0)}%`,
                  baseCost: `${stats.zenCostRelative.toFixed(0)}%`,
                }),
                zenVisual: Math.max(4, Math.min(100, stats.costReduction)),
                baseVisual: Math.max(4, Math.min(100, stats.zenCostRelative)),
              },
              {
                title: t('home.statistics.quality'),
                desc: t('home.statistics.accuracyLead'),
                zenLabel: `${stats.zenAccuracy.toFixed(1)}%`,
                baseLabel: `${stats.baselineAccuracy.toFixed(1)}%`,
                detail: t('home.statistics.accuracyDetails', {
                  zen: stats.zenAccuracy.toFixed(1),
                  base: stats.baselineAccuracy.toFixed(1),
                }),
                zenVisual: Math.max(4, Math.min(100, stats.zenAccuracy)),
                baseVisual: Math.max(4, Math.min(100, stats.baselineAccuracy)),
              },
            ].map((row, i) => (
              <article
                key={i}
                className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-950 via-gray-900 to-black p-6 md:p-8 mb-5"
              >
                <div className="absolute -top-24 -right-24 h-52 w-52 rounded-full bg-cyan-500/10 blur-3xl" aria-hidden="true" />

                <div className="relative grid gap-8 md:grid-cols-[1.1fr_1fr]">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-gray-500 mb-3">{row.desc}</p>
                    <h3 className="text-3xl md:text-4xl font-bold text-white leading-tight">{row.title}</h3>
                    <p className="text-sm text-gray-400 mt-4">{row.detail}</p>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/80">Zen</p>
                        <p className="text-2xl md:text-3xl font-semibold text-cyan-100 mt-1">{row.zenLabel}</p>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Base</p>
                        <p className="text-2xl md:text-3xl font-semibold text-gray-200 mt-1">{row.baseLabel}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-center gap-5">
                    <div>
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-cyan-300 mb-2">
                        <span>Zen</span>
                        <span>{row.zenLabel}</span>
                      </div>
                      <div className="h-3 rounded-full bg-cyan-950/50 ring-1 ring-cyan-700/40 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-400"
                          style={{ width: `${row.zenVisual}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-gray-500 mb-2">
                        <span>Base</span>
                        <span>{row.baseLabel}</span>
                      </div>
                      <div className="h-3 rounded-full bg-gray-800 ring-1 ring-gray-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-gray-600 to-gray-500"
                          style={{ width: `${row.baseVisual}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section id="features" className="px-6 bg-black overflow-hidden">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-4xl md:text-5xl font-bold mb-12 pb-4 border-b-4 border-white">Features</h2>

          <div className="flex flex-col gap-24 py-8">
            {features.map((f, idx) => (
              <div
                key={idx}
                className="relative flex items-center"
              >
                <div className={`w-full md:w-[85%] ${idx % 2 === 1 ? 'md:ml-auto' : ''}`} style={{ perspective: '1500px' }}>
                  <img
                    src={f.img}
                    alt={t(f.titleKey)}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    className="w-full h-auto object-contain rounded-lg"
                    style={{ transform: `rotateX(-1deg) rotateY(${idx % 2 === 1 ? '-5deg' : '5deg'})`, transformStyle: 'preserve-3d' }}
                  />
                </div>
                <div className={`absolute ${idx % 2 === 1 ? 'left-0' : 'right-0'} top-1/2 -translate-y-1/2 w-72 bg-gray-900/80 backdrop-blur-sm p-6 rounded-lg border border-gray-700 shadow-2xl`}>
                  <h3 className="text-2xl md:text-3xl font-bold mb-3 leading-tight">{t(f.titleKey)}</h3>
                  <p className="text-gray-400 text-sm md:text-base leading-relaxed">{t(f.descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      <section id="help" className="py-20 px-6 bg-black">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-4xl md:text-5xl font-bold mb-12 pb-4 border-b-4 border-white">{t('home.help.title')}</h2>

          <div className="space-y-4">
            {helpItems.map((item, index) => (
              <div
                key={index}
                className="bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden transition-all duration-300 hover:border-gray-700"
              >
                <button
                  onClick={() => setOpenHelpIndex(openHelpIndex === index ? null : index)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-800/50 transition-colors"
                  aria-expanded={openHelpIndex === index}
                >
                  <span className="text-lg font-semibold text-white pr-4">{item.question}</span>
                  <span className="flex-shrink-0 text-gray-400">
                    {openHelpIndex === index ? <Minus size={20} /> : <Plus size={20} />}
                  </span>
                </button>

                <div
                  className={`transition-all duration-300 ease-in-out ${
                    openHelpIndex === index
                      ? 'max-h-96 opacity-100'
                      : 'max-h-0 opacity-0'
                  } overflow-hidden`}
                >
                  <div className="px-6 pb-4 pt-2">
                    <p className="text-gray-300 leading-relaxed" style={{ whiteSpace: 'pre-line' }}>{item.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>




      <footer className="py-8 px-6 bg-black border-t border-gray-900">
        <div className="container mx-auto text-center">
          <p className="text-gray-500 text-sm">{t('footer.made_by')}</p>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;
