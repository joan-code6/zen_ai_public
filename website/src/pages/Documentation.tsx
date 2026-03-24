import { Link } from 'react-router-dom';
import DocumentationLayout from '../components/DocumentationLayout';
import { useTranslation } from '../i18n';

function Documentation() {
  const { t } = useTranslation();
  return (
    <DocumentationLayout>
      <div className="p-12 max-w-5xl">
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center mb-6">
            <img
              src="/fulllogo.png"
              alt="ZEN AI"
              className="h-16 select-none"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              style={{ userSelect: 'none' }}
            />
          </div>
          <h1 className="text-5xl font-bold mb-4">{t('doc.title')}</h1>
        </div>

        <section className="mb-16 flex flex-col items-center text-center">
          <h2 className="text-3xl font-bold mb-6">{t('doc.welcome')}</h2>
          <p className="text-gray-300 text-lg leading-relaxed mb-8">
            {t('doc.welcome')}
          </p>

          <div className="flex gap-4 justify-center">
            <Link
              to="/documentation/installation"
              className="px-6 py-2.5 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors text-sm font-medium"
            >
              {t('doc.howto')}
            </Link>
            <Link
              to="/documentation/needle"
              className="px-6 py-2.5 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors text-sm font-medium"
            >
              {t('doc.research')}
            </Link>
          </div>
        </section>
      </div>
    </DocumentationLayout>
  );
}

export default Documentation;
