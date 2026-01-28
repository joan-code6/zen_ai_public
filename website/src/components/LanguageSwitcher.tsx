import { useTranslation } from '../i18n';

export default function LanguageSwitcher() {
  const { language, setLanguage } = useTranslation();

  return (
    <div className="inline-flex items-center gap-2">
      <button
        aria-label="Select English"
        onClick={() => setLanguage('en')}
        className={`px-3 py-1 rounded ${language === 'en' ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
      >
        EN
      </button>
      <button
        aria-label="Select German"
        onClick={() => setLanguage('de')}
        className={`px-3 py-1 rounded ${language === 'de' ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
      >
        DE
      </button>
    </div>
  );
}
