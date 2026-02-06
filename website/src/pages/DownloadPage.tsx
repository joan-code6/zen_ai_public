import { DownloadCloud, Globe, Terminal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';

type Platform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web' | 'unknown';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  const platform = (navigator as any).platform || '';

  if (/android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(platform) && !/iPhone|iPad|iPod/i.test(ua)) return 'macos';
  if (/Linux/i.test(platform) && !/Android/i.test(ua)) return 'linux';
  return 'web';
}

export default function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [showCliModal, setShowCliModal] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const primary = (() => {
    switch (platform) {
      case 'windows':
      return { label: 'Download for Windows', href: 'https://fra.cloud.appwrite.io/v1/storage/buckets/696520880012a3766904/files/696528390004be526d20/download?project=zenai&mode=admin' };
      // case 'macos':
      // return { label: 'Download for macOS', href: '#', note: 'Not here yet... But you can try out the web version!' };
      // case 'linux':
      // return { label: 'Download for Linux', href: '#', note: 'Not here yet... But you can try out the web version!' };
      // case 'android':
      // return { label: 'Download APK', href: '#', note: 'Not here yet... But you can try out the web version!' };
      // case 'ios':
      // return { label: 'Open web app', href: '#', note: 'Not here yet... But you can try out the web version!' };
      case 'web':
      return { label: 'Open web app', href: 'https://zen.arg-server.de/' };
      default:
      return { label: 'Open web app', href: 'https://zen.arg-server.de/', note: 'Looks like there is no native app for your platform yet.' };
    }
  })();

  const desktopDownloads = [
    { name: 'Windows', hint: 'Installer (.exe)', href: 'https://fra.cloud.appwrite.io/v1/storage/buckets/696520880012a3766904/files/696528390004be526d20/download?project=zenai&mode=admin' },
    // { name: 'Linux', hint: 'AppImage / .tar.gz', href: '#' },
    // { name: 'macOS', hint: 'Disk image (.dmg)', href: '#' },
  ];

  const mobileDownloads = [
    { name: 'Android', hint: 'APK (sideload) — or get it on Play Store', href: '#', storeLink: '#' },
  ];

  const webDownloads = [{ name: 'Web', hint: 'Runs in your browser — no install', href: 'https://zen.arg-server.de/' }];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* CLI Modal */}
      {showCliModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCliModal(false)}>
          <div className="bg-gray-900 rounded-xl border border-gray-800 max-w-2xl w-full p-8 relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowCliModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
            >
              <X size={24} />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <Terminal size={32} className="text-white" />
              <h2 className="text-3xl font-bold text-white">ZEN AI CLI</h2>
            </div>

            <p className="text-gray-400 mb-6">
              Command-line interface for developers to interact with ZEN AI directly from the terminal.
            </p>

            <div className="space-y-4">
              <div className="bg-black/50 rounded-lg p-6 border border-gray-800">
                <p className="text-gray-300 font-semibold mb-3">Installation</p>
                <div className="bg-black rounded-md p-4 border border-gray-700">
                  <code className="text-green-400 text-lg font-mono">pip install zen-ai-cli</code>
                </div>
              </div>

              <div className="bg-black/50 rounded-lg p-6 border border-gray-800">
                <p className="text-gray-300 font-semibold mb-3">Usage</p>
                <div className="bg-black rounded-md p-4 border border-gray-700">
                  <code className="text-blue-400 text-lg font-mono">zen</code>
                </div>
                <p className="text-gray-400 text-sm mt-3">Run this command in your terminal to open the CLI.</p>
              </div>
            </div>
          </div>
        </div>
      )}

  <section className="relative min-h-screen flex items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900 to-black"></div>

  <div className="relative z-10 text-center px-6 max-w-4xl mx-auto py-20">
          <img src={`${import.meta.env.BASE_URL}fulllogo.png`} alt="ZEN AI" className="h-40 mx-auto mb-6 select-none" draggable={false} />

          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent leading-tight whitespace-normal break-words">
            {t('download.title')}
          </h1>

          <p className="text-gray-400 text-lg mb-8">
            {t('download.description')}
          </p>

          <div className="flex flex-col items-center gap-4">
            <a
              href={primary.href}
              className="w-full sm:w-auto px-10 py-4 bg-white text-black font-semibold rounded-xl hover:bg-gray-200 transition transform hover:scale-[1.02] shadow-2xl flex items-center gap-3 justify-center"
            >
              {primary.href === '/app' ? <Globe size={22} /> : <DownloadCloud size={22} />}
              <span className="text-lg">{primary.label}</span>
            </a>

            {primary.note ? <p className="text-gray-400 text-sm">{primary.note}</p> : <p className="text-gray-400 text-sm">{t('download.primaryNote.default')}</p>}

            <a href="#all-downloads" className="text-gray-400 text-sm underline mt-2">
              {t('download.see_all')}
            </a>
          </div>
        </div>
      </section>

      <section id="all-downloads" className="py-16 px-6 bg-black">
        <div className="container mx-auto max-w-5xl">
          {/* Desktop */}
          <h2 className="text-3xl font-semibold mb-6">Desktop</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            {desktopDownloads.map((d) => (
              <div key={d.name} className="bg-gray-900/60 rounded-lg p-6 border border-gray-800">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{d.name}</h3>
                    <p className="text-gray-400 text-sm mt-1">{d.hint}</p>
                  </div>
                  <DownloadCloud size={20} className="text-gray-300" />
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <a href={d.href} className="px-4 py-2 bg-white text-black rounded-md font-semibold hover:bg-gray-200 transition">
                    Download
                  </a>
                  <span className="ml-auto inline-block px-2 py-1 bg-gray-800 text-gray-300 rounded-full text-xs">Stable</span>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile not here yet
          <h2 className="text-3xl font-semibold mb-6">Mobile</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {mobileDownloads.map((d) => (
              <div key={d.name} className="bg-gray-900/60 rounded-lg p-6 border border-gray-800">
                <div className="flex items-start justify-between">
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <a href={d.href} className="px-4 py-2 bg-white text-black rounded-md font-semibold hover:bg-gray-200 transition">
                    Download APK
                  </a>
                  <span className="ml-auto inline-block px-2 py-1 bg-gray-800 text-gray-300 rounded-full text-xs">Online</span>
                </div>
              </div>
            ))}
          </div> */}

          {/* Web */}
          <h2 className="text-3xl font-semibold mb-6">Web</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            {webDownloads.map((d) => (
              <div key={d.name} className="bg-gray-900/60 rounded-lg p-6 border border-gray-800">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{d.name}</h3>
                    <p className="text-gray-400 text-sm mt-1">{d.hint}</p>
                  </div>
                  <Globe size={20} className="text-gray-300" />
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <a href={d.href} className="px-4 py-2 bg-white text-black rounded-md font-semibold hover:bg-gray-200 transition">
                    Open web app
                  </a>
                  <span className="ml-auto inline-block px-2 py-1 bg-gray-800 text-gray-300 rounded-full text-xs">Online</span>
                </div>
              </div>
            ))}
          </div>

          {/* CLI */}
          <h2 className="text-3xl font-semibold mb-6">CLI</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => setShowCliModal(true)}
              className="bg-gray-900/60 rounded-lg p-6 border border-gray-800 hover:border-gray-700 transition text-left"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">CLI</h3>
                  <p className="text-gray-400 text-sm mt-1">Command-line interface for developers</p>
                </div>
                <Terminal size={20} className="text-gray-300" />
              </div>
              <div className="mt-4">
                <span className="px-4 py-2 bg-white text-black rounded-md font-semibold hover:bg-gray-200 transition inline-block">
                  View Instructions
                </span>
              </div>
            </button>
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

