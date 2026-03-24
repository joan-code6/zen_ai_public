import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Gauge, Trophy } from 'lucide-react';
import { useTranslation } from '../i18n';

type BenchmarkRow = {
  zen_grade: number;
  normal_grade: number;
  zen_prompt_tokens: number;
  normal_prompt_tokens: number;
  zen_total_tokens: number;
  normal_total_tokens: number;
  zen_note_ids?: string[];
  zen_usage?: {
    latency_ms?: number;
  };
  normal_usage?: {
    latency_ms?: number;
  };
};

type BenchmarkData = {
  timestamp: string;
  config: {
    provider: string;
    model: string;
    judge_model: string;
    threshold: number;
  };
  summary: {
    questions: number;
    zen_score: number;
    normal_score: number;
    zen_avg_prompt_tokens: number;
    normal_avg_prompt_tokens: number;
    zen_total_tokens: number;
    normal_total_tokens: number;
    zen_total_cost: number;
    normal_total_cost: number;
  };
  rows: BenchmarkRow[];
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

function BenchmarkPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${import.meta.env.BASE_URL}result.json`);
        if (!response.ok) throw new Error('Failed to load benchmark data.');
        const json = (await response.json()) as BenchmarkData;
        if (isMounted) {
          setData(json);
          setError(null);
        }
      } catch {
        if (isMounted) setError(t('benchmark.error'));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [t]);

  const metrics = useMemo(() => {
    if (!data) return null;

    const { summary, rows } = data;
    const questionCount = summary.questions || rows.length || 1;

    const zenAccuracy = (summary.zen_score / questionCount) * 100;
    const normalAccuracy = (summary.normal_score / questionCount) * 100;
    const accuracyDelta = zenAccuracy - normalAccuracy;

    const promptReduction =
      ((summary.normal_avg_prompt_tokens - summary.zen_avg_prompt_tokens) /
        Math.max(summary.normal_avg_prompt_tokens, 1)) *
      100;

    const totalTokenReduction =
      ((summary.normal_total_tokens - summary.zen_total_tokens) /
        Math.max(summary.normal_total_tokens, 1)) *
      100;

    const costReduction =
      ((summary.normal_total_cost - summary.zen_total_cost) /
        Math.max(summary.normal_total_cost, 0.000001)) *
      100;

    const costMultiplier =
      summary.normal_total_cost / Math.max(summary.zen_total_cost, 0.000001);

    const avgZenLatency =
      rows.reduce((sum, row) => sum + (row.zen_usage?.latency_ms ?? 0), 0) /
      Math.max(rows.length, 1);

    const avgNormalLatency =
      rows.reduce((sum, row) => sum + (row.normal_usage?.latency_ms ?? 0), 0) /
      Math.max(rows.length, 1);

    const avgNotesPerQuestion =
      rows.reduce((sum, row) => sum + (row.zen_note_ids?.length ?? 0), 0) /
      Math.max(rows.length, 1);

    const tokenSavingsByQuestion = rows.map((row) =>
      Math.max(0, row.normal_prompt_tokens - row.zen_prompt_tokens),
    );

    const largestSavings = [...tokenSavingsByQuestion]
      .sort((a, b) => b - a)
      .slice(0, 3)
      .reduce((sum, item) => sum + item, 0);

    const averageSavedPerQuestion =
      tokenSavingsByQuestion.reduce((sum, value) => sum + value, 0) /
      Math.max(tokenSavingsByQuestion.length, 1);

    const qualityRatio = normalAccuracy > 0 ? (zenAccuracy / normalAccuracy) * 100 : 100;

    return {
      questionCount,
      zenAccuracy,
      normalAccuracy,
      accuracyDelta,
      promptReduction,
      totalTokenReduction,
      avgZenLatency,
      avgNormalLatency,
      avgNotesPerQuestion,
      largestSavings,
      averageSavedPerQuestion,
      zenTotalTokens: summary.zen_total_tokens,
      normalTotalTokens: summary.normal_total_tokens,
      costReduction,
      costMultiplier,
      zenModel: data.config.model,
      judgeModel: data.config.judge_model,
      provider: data.config.provider,
      threshold: data.config.threshold,
      timestamp: data.timestamp,
      zenAvgPromptTokens: summary.zen_avg_prompt_tokens,
      normalAvgPromptTokens: summary.normal_avg_prompt_tokens,
      qualityRatio,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full border-2 border-gray-700 border-t-white animate-spin" />
          <p className="mt-6 text-gray-300 text-lg">{t('benchmark.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="max-w-lg text-center">
          <p className="text-xl font-semibold mb-3">{t('benchmark.errorTitle')}</p>
          <p className="text-gray-400">{error ?? t('benchmark.error')}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 mt-8 px-6 py-3 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft size={18} />
            {t('benchmark.backHome')}
          </Link>
        </div>
      </div>
    );
  }

  const zenAccuracyPercent = clampPercent(metrics.zenAccuracy);
  const normalAccuracyPercent = clampPercent(metrics.normalAccuracy);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <section className="relative px-6 pt-24 pb-14 border-b border-gray-900">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 left-[8%] w-80 h-80 bg-cyan-500/20 blur-[130px] rounded-full" />
          <div className="absolute top-0 right-[12%] w-72 h-72 bg-indigo-500/20 blur-[130px] rounded-full" />
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-gray-700 bg-gray-900/70 hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft size={16} />
              {t('benchmark.backHome')}
            </Link>
            <div className="text-xs uppercase tracking-[0.18em] text-gray-400">
              {t('benchmark.updated')}: {new Date(metrics.timestamp).toLocaleString()}
            </div>
          </div>

          <div className="max-w-5xl">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300 mb-4">{t('benchmark.kicker')}</p>
            <h1 className="text-5xl md:text-7xl font-bold leading-[0.98] mb-6 bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-transparent">
              {t('benchmark.title')}
            </h1>
            <p className="text-lg md:text-2xl text-gray-300 leading-relaxed max-w-3xl">
              {t('benchmark.subtitle')}
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 py-14">
        <div className="max-w-6xl mx-auto rounded-3xl border border-gray-700 bg-[#090b12] overflow-hidden">
          <div className="grid lg:grid-cols-2">
            <article className="p-8 md:p-12 border-b lg:border-b-0 lg:border-r border-gray-700/80">
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight">{t('benchmark.cards.promptReduction')}</h2>
                <Gauge size={26} className="text-cyan-300" />
              </div>
              <p className="text-[4.2rem] md:text-[6rem] leading-[0.9] font-black text-cyan-200">
                {formatNumber(metrics.promptReduction, 1)}%
              </p>
              <p className="mt-6 text-xl text-gray-200 max-w-md">{t('benchmark.cards.contextTax')}</p>

              <div className="mt-8 space-y-5">
                <div>
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span>Zen AI avg prompt</span>
                    <span>{formatNumber(metrics.zenAvgPromptTokens, 0)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-900 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300"
                      style={{
                        width: `${clampPercent((metrics.zenAvgPromptTokens / Math.max(metrics.normalAvgPromptTokens, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span>Baseline avg prompt</span>
                    <span>{formatNumber(metrics.normalAvgPromptTokens, 0)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-900 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-gray-500 to-gray-400" style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
            </article>

            <article className="p-8 md:p-12">
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight">{t('benchmark.cards.quality')}</h2>
                <Trophy size={26} className="text-emerald-300" />
              </div>
              <p className="text-[4.2rem] md:text-[6rem] leading-[0.9] font-black text-emerald-200">
                {formatNumber(metrics.zenAccuracy, 1)}%
              </p>
              <p className="mt-6 text-xl text-gray-200 max-w-md">{t('benchmark.accuracy.copy')}</p>

              <div className="mt-8 space-y-5">
                <div>
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span>Zen AI</span>
                    <span>{formatNumber(metrics.zenAccuracy, 1)}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-900 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300" style={{ width: `${zenAccuracyPercent}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span>Baseline</span>
                    <span>{formatNumber(metrics.normalAccuracy, 1)}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-900 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-gray-500 to-gray-400" style={{ width: `${normalAccuracyPercent}%` }} />
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="px-6 pb-14">
        <div className="max-w-6xl mx-auto grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-800 bg-[#0b0c13] p-6">
            <p className="text-sm text-gray-400 mb-2">{t('benchmark.cards.tokenReduction')}</p>
            <p className="text-5xl font-black text-indigo-200">{formatNumber(metrics.totalTokenReduction, 1)}%</p>
            <p className="text-sm text-gray-400 mt-3">{formatNumber(metrics.zenTotalTokens)} vs {formatNumber(metrics.normalTotalTokens)}</p>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-[#0b0c13] p-6">
            <p className="text-sm text-gray-400 mb-2">{t('benchmark.cards.notes')}</p>
            <p className="text-5xl font-black text-fuchsia-200">{formatNumber(metrics.avgNotesPerQuestion, 1)}</p>
            <p className="text-sm text-gray-400 mt-3">{t('benchmark.cards.notesHint')}</p>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-[#0b0c13] p-6">
            <p className="text-sm text-gray-400 mb-2">{t('benchmark.mini.avgSavings')}</p>
            <p className="text-5xl font-black text-cyan-100">{formatNumber(metrics.averageSavedPerQuestion, 0)}</p>
            <p className="text-sm text-gray-400 mt-3">{t('benchmark.mini.tokensPerQuestion')}</p>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <article className="rounded-3xl border border-emerald-500/35 bg-gradient-to-br from-emerald-500/12 via-cyan-500/10 to-black p-8 md:p-10">
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-200 mb-4">{t('benchmark.pricing.kicker')}</p>
            <h2 className="text-3xl md:text-5xl font-black leading-[0.95] mb-7">{t('benchmark.pricing.title')}</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-700/70 bg-black/35 p-6">
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-3">Zen AI</p>
                <p className="text-4xl md:text-5xl font-black text-emerald-200">{formatNumber(100 - metrics.costReduction, 1)}%</p>
                <p className="text-sm text-gray-400 mt-2">{t('benchmark.pricing.relativeCost')}</p>
              </div>
              <div className="rounded-2xl border border-gray-700/70 bg-black/35 p-6">
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-3">Baseline</p>
                <p className="text-4xl md:text-5xl font-black text-gray-100">100%</p>
                <p className="text-sm text-gray-400 mt-2">{t('benchmark.pricing.baselineRef')}</p>
              </div>
            </div>

            <p className="text-[2.2rem] md:text-[3.1rem] font-black leading-[0.95] mt-7 text-emerald-100">
              {formatNumber(metrics.costReduction, 1)}% {t('benchmark.pricing.savings')}
            </p>
            <p className="text-lg md:text-xl text-cyan-100 mt-2">
              {t('benchmark.pricing.multiplier', { mult: formatNumber(metrics.costMultiplier, 1) })}
            </p>
          </article>

          <article className="rounded-3xl border border-gray-800 bg-[#0b0c13] p-7 md:p-8">
            <h3 className="text-2xl font-bold mb-5">{t('benchmark.context.title')}</h3>
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-700/70 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">{t('benchmark.method.sampleSize')}</p>
                <p className="text-2xl font-bold">{metrics.questionCount}</p>
              </div>
              <div className="rounded-xl border border-gray-700/70 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">{t('benchmark.context.speed')}</p>
                <p className="text-lg text-gray-100">Zen {formatNumber(metrics.avgZenLatency, 0)} ms</p>
                <p className="text-lg text-gray-100">Base {formatNumber(metrics.avgNormalLatency, 0)} ms</p>
              </div>
              <div className="rounded-xl border border-gray-700/70 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">{t('benchmark.method.model')}</p>
                <p className="text-sm text-gray-200 break-all">{metrics.zenModel}</p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-6xl mx-auto rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-black p-8 md:p-10">
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-200 mb-3">{t('benchmark.takeaway.kicker')}</p>
          <h2 className="text-3xl md:text-4xl font-bold leading-tight mb-4">{t('benchmark.takeaway.title')}</h2>
          <p className="text-gray-200 max-w-3xl leading-relaxed">{t('benchmark.takeaway.copy')}</p>
          <p className="text-sm text-gray-400 mt-5">
            {t('benchmark.takeaway.supporting', {
              promptDrop: formatNumber(metrics.promptReduction, 1),
              topSavings: formatNumber(metrics.largestSavings),
            })}
          </p>
          <p className="text-sm text-cyan-100 mt-2">
            {t('benchmark.takeaway.supporting2', {
              qualityRatio: formatNumber(metrics.qualityRatio, 1),
            })}
          </p>
          <p className="text-sm text-emerald-200 mt-2">
            +{formatNumber(metrics.accuracyDelta, 1)} pp accuracy lead
          </p>
        </div>
      </section>
    </div>
  );
}

export default BenchmarkPage;
