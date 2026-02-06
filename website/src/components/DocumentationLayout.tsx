import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n';
import { Search, X } from 'lucide-react';

interface DocItem {
  id: string;
  title: string;
  content: string;
  code?: string;
  note?: string;
  keyFindings?: string[];
  image?: string;
}

interface DocSection {
  title: string;
  items: DocItem[];
}

interface DocumentationData {
  sections: DocSection[];
}

interface DocumentationLayoutProps {
  children: React.ReactNode;
}

function DocumentationLayout({ children }: DocumentationLayoutProps) {
  const [data, setData] = useState<DocumentationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const location = useLocation();

  useEffect(() => {
    const loadDocumentation = async () => {
      try {
        const indexRes = await fetch(`${import.meta.env.BASE_URL}index.json`);
        const index = await indexRes.json();
        const docPromises = index.map((entry: { file: string }) =>
          fetch(`${import.meta.env.BASE_URL}${entry.file}`).then(res => res.json())
        );
        const docs = await Promise.all(docPromises);
        // Attach titles from index.json to each section
        const sections = docs.map((doc, i) => ({ ...doc, title: index[i].title }));
        setData({ sections });
        setLoading(false);
      } catch (error) {
        console.error('Error loading documentation:', error);
        setLoading(false);
      }
    };
    loadDocumentation();
  }, []);

  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-xl">{t('doc.loading')}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-xl">{t('doc.failed')}</div>
      </div>
    );
  }

  // Filter sections based on search term
  const filteredSections = data.sections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      const searchableText = [
        item.title,
        item.content,
        item.note || '',
        ...(item.keyFindings || [])
      ].join(' ').toLowerCase();
      
      return searchableText.includes(searchLower);
    })
  })).filter(section => section.items.length > 0);

  return (
    <div className="min-h-screen bg-black text-white flex">
      <aside className="w-64 bg-gray-800 fixed h-full overflow-y-auto border-r border-gray-700">
        <div className="p-6">
          <Link to="/" className="flex items-center mb-8">
            <img
              src="/fulllogo.png"
              alt="ZEN AI"
              className="h-8 select-none"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              style={{ userSelect: 'none' }}
            />
          </Link>

          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder={t('doc.search.placeholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <nav className="space-y-6">
            {filteredSections.length === 0 && searchTerm ? (
              <div className="text-gray-400 text-sm">
                {t('doc.notfoundFor', { term: searchTerm })}
              </div>
            ) : (
              filteredSections.map((section, sectionIndex) => (
                <div key={sectionIndex}>
                  <h3 className="text-white font-bold mb-3 text-sm uppercase tracking-wider">{section.title}</h3>
                  <ul className="space-y-2 ml-4">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <Link
                          to={`/documentation/${item.id}`}
                          className={`transition-colors block py-1 ${
                            location.pathname === `/documentation/${item.id}`
                              ? 'text-white font-medium'
                              : 'text-gray-300 hover:text-white'
                          }`}
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </nav>
        </div>
      </aside>

      <main className="ml-64 flex-1">
        {children}
      </main>
    </div>
  );
}

export default DocumentationLayout;
export type { DocItem, DocSection, DocumentationData };