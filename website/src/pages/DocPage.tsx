import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import DocumentationLayout, { DocItem } from '../components/DocumentationLayout';
import { useTranslation } from '../i18n';

function DocPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [currentItem, setCurrentItem] = useState<DocItem | null>(null);
  const [prevItem, setPrevItem] = useState<DocItem | null>(null);
  const [nextItem, setNextItem] = useState<DocItem | null>(null);

  useEffect(() => {
    const loadDocumentation = async () => {
      try {
        // Load index.json to determine which documentation files to fetch
        const indexRes = await fetch(`${import.meta.env.BASE_URL}index.json`);
        const index = await indexRes.json();

        const docPromises = index.map((entry: { file: string }) =>
          fetch(`${import.meta.env.BASE_URL}${entry.file}`).then(res => res.json())
        );
        const docs = await Promise.all(docPromises);

        // Combine all section items into a single list
        const allItems: DocItem[] = [];
        docs.forEach((section: any) => {
          if (Array.isArray(section.items)) {
            allItems.push(...section.items);
          }
        });

        const currentIndex = allItems.findIndex(item => item.id === id);
        if (currentIndex !== -1) {
          setCurrentItem(allItems[currentIndex]);
          setPrevItem(currentIndex > 0 ? allItems[currentIndex - 1] : null);
          setNextItem(currentIndex < allItems.length - 1 ? allItems[currentIndex + 1] : null);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error loading documentation:', error);
        setLoading(false);
      }
    };

    loadDocumentation();
  }, [id]);

  const { t } = useTranslation();

  if (loading) {
    return (
      <DocumentationLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-xl">{t('doc.loading_simple')}</div>
        </div>
      </DocumentationLayout>
    );
  }

  if (!currentItem) {
    return (
      <DocumentationLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-xl">{t('doc.page_not_found')}</div>
        </div>
      </DocumentationLayout>
    );
  }

  return (
    <DocumentationLayout>
      <div className="p-12 max-w-5xl">
        <div className="mb-8">
          <Link to="/documentation" className="text-gray-400 hover:text-white transition-colors">
            {t('doc.back')}
          </Link>
        </div>

        <section className="mb-16">
          <h1 className="text-4xl font-bold mb-4">{currentItem.title}</h1>
          <div className="text-gray-300 leading-relaxed mb-4 prose prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const isInline = !match;
                  return !isInline && match ? (
                    <SyntaxHighlighter
                      style={vscDarkPlus as any}
                      language={match[1]}
                      PreTag="div"
                      className="rounded-lg"
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className="bg-gray-800 px-1 py-0.5 rounded text-sm" {...props}>
                      {children}
                    </code>
                  );
                },
                img({ src, alt, ...props }) {
                  return (
                    <img
                      src={src}
                      alt={alt}
                      className="max-w-full h-auto rounded-lg shadow-lg my-4"
                      {...props}
                    />
                  );
                },
                h1: ({ children }) => <h1 className="text-3xl font-bold mb-4 mt-8">{children}</h1>,
                h2: ({ children }) => <h2 className="text-2xl font-bold mb-3 mt-6">{children}</h2>,
                h3: ({ children }) => <h3 className="text-xl font-bold mb-2 mt-4">{children}</h3>,
                p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="mb-4 ml-6 list-disc space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="mb-4 ml-6 list-decimal space-y-1">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-gray-600 pl-4 italic my-4 text-gray-400">
                    {children}
                  </blockquote>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto my-4">
                    <table className="min-w-full border border-gray-700">{children}</table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-gray-800">{children}</thead>
                ),
                tbody: ({ children }) => (
                  <tbody>{children}</tbody>
                ),
                th: ({ children }) => (
                  <th className="border border-gray-700 px-4 py-2 bg-gray-800 font-bold text-left">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-gray-700 px-4 py-2">{children}</td>
                ),
              }}
            >
              {currentItem.content}
            </ReactMarkdown>
          </div>
          {currentItem.code && (
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 mb-4">
              <code className="text-green-400">{currentItem.code}</code>
            </div>
          )}
          {currentItem.image && (
            <div className="mb-4">
              <img
                src={currentItem.image}
                alt={`${currentItem.title} screenshot`}
                className="max-w-full h-auto rounded-lg shadow-lg"
              />
            </div>
          )}
          {currentItem.note && (
            <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-800 mb-4">
              <p className="text-gray-400 italic">
                {currentItem.note}
              </p>
            </div>
          )}
          {currentItem.keyFindings && (
            <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-800">
              <p className="text-gray-300 font-semibold mb-2">{t('doc.key_findings')}</p>
              <ul className="space-y-2 text-gray-400">
                {currentItem.keyFindings.map((finding, index) => (
                  <li key={index}>• {finding}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="flex justify-between items-center pt-8 border-t border-gray-800">
          {prevItem ? (
            <Link
              to={`/documentation/${prevItem.id}`}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-sm"
            >
              <ChevronLeft size={16} />
              {prevItem.title}
            </Link>
          ) : (
            <div />
          )}
          {nextItem ? (
            <Link
              to={`/documentation/${nextItem.id}`}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-sm"
            >
              {nextItem.title}
              <ChevronRight size={16} />
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>
    </DocumentationLayout>
  );
}

export default DocPage;