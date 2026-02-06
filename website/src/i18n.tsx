import React, { createContext, useContext, useEffect, useState } from 'react';

type Lang = 'en' | 'de';

const COOKIE_NAME = 'zen_lang';

const translations: Record<Lang, Record<string, string>> = {
  en: {
    // Home
    'home.title_line1': 'Smarter context',
    'home.title_line2': 'Sharper answers',
    'home.subtitle': 'Precision without overload',
    'home.btn.documentation': 'Documentation',
    'home.btn.download': 'Download',
    'home.btn.github': 'GitHub',
    'home.faq.title': 'FAQ',
    // Documentation
    'doc.title': 'Documentation',
    'doc.welcome': 'Welcome to the Zen AI docs',
    'doc.howto': 'Using the app',
    'doc.research': 'Research',
    // Documentation layout
    'doc.loading': 'Loading docs…',
    'doc.failed': 'Couldn’t load the docs',
    'doc.search.placeholder': 'Search the docs…',
    'doc.notfoundFor': 'Nothing found for “{term}”',
    // Doc page
    'doc.back': '← Back',
    'doc.loading_simple': 'Loading…',
    'doc.page_not_found': 'Page not found',
    'doc.key_findings': 'Key findings',
    // Download
    'download.title': 'Download Zen AI',
    'download.description':
      'We pick the right build for your system. Scroll for all platforms and releases.',
    'download.primaryNote.default':
      '',
    'download.see_all': 'All downloads',
    // FAQ
    'faq.1.question': 'What is Zen AI?',
    'faq.1.answer':
      'Zen AI wraps ChatGPT, Claude, etc. and adds a more efficient way to store and send information along side the users request.',
    'faq.2.question': 'Why does that matter?',
    'faq.2.answer':
      'LLMs get sloppy when they drown in context. We solve the “needle-in-a-haystack” problem by filtering noise before it ever reaches the model.',
    'faq.3.question': 'How does it work?',
    'faq.3.answer':
      'We use notes with content and trigger words. When triggered, only relevant notes are sent.\n• Content (the information)\n• Trigger words\n\nWhen you talk to the AI, matching Notes are attached automatically.\nNeed something that wasn’t triggered? The built-in MCP server lets the model search your notes on the fly—so even “write an email” can find your name without you saying it.',
    'faq.4.question': 'How do I start?',
    'faq.4.answer': 'Install the app and create a account! Thats it.',
    // Features
    'features.clean_ui.title': 'Clean & minimal',
    'features.clean_ui.description':
      'One window, zero clutter, maximum focus.',
    'features.notes.title': 'Smart notes',
    'features.notes.description':
      'With the power of notes, Zen remembers what matters and forgets the rest.',
    'features.customizable.title': 'Made for you',
    'features.customizable.description':
      'Themes, shortcuts and layouts that bend to your workflow.',
    'features.calendar.title': 'Built-in calendar',
    'features.calendar.description':
      'See your day without leaving the app and let Zen interact with it.',
    'features.email.title': 'Built-in inbox',
    'features.email.description':
      'Incoming mail is auto-scanned and categorized. Letting the AI know what you\'re talking about.',

    'home.help.title': 'Help',
    'help.1.question': 'When I send a message I get a 429 error, what can I do?',
    'help.1.answer': 'A 429 error means the server has received too many requests in a certain period. Wait a few minutes and try again.\nIf the problem persists, you may have reached your limit for today or (since Zen AI is free) other users have been very active and the servers are not accepting more requests for a certain period.\nMaybe try again tomorrow.',

    
      // Footer
    'footer.made_by': 'Built with ❤ by Joan Code',
  },
  de: {
    // Home
    'home.title_line1': 'Schlauer Kontext',
    'home.title_line2': 'Bessere Antworten',
    'home.subtitle': '',
    'home.btn.documentation': 'Dokumentation',
    'home.btn.download': 'Download',
    'home.btn.github': 'GitHub',
    'home.faq.title': 'FAQ',

    // Documentation
    'doc.title': 'Dokumentation',
    'doc.welcome': 'Willkommen in der Offiziellen Zen AI Dokumentation',
    'doc.howto': 'So funktioniert die App',
    'doc.research': 'Hintergrund & Forschung',

    // Documentation layout
    'doc.loading': 'Lade Dokumentation …',
    'doc.failed': 'Dokumentation konnte nicht geladen werden',
    'doc.search.placeholder': 'Dokumentation durchsuchen …',
    'doc.notfoundFor': 'Keine Treffer für „{term}“',

    // Doc page
    'doc.back': '← Zurück',
    'doc.loading_simple': 'Lädt …',
    'doc.page_not_found': 'Seite nicht gefunden',
    'doc.key_findings': 'Das Wichtigste in Kürze',

    // Download
    'download.title': 'Zen AI herunterladen',
    'download.description':
      'Wir erkennen dein System und liefern den passenden Build. Alle Versionen findest du weiter unten.',
    'download.primaryNote.default': '',
    'download.see_all': 'Alle Downloads',

    // FAQ
    'faq.1.question': 'Was ist Zen AI?',
    'faq.1.answer':
      'Zen AI baut auf bestehenden AIs wie ChatGPT oder Claude auf und fügt eine effizientere Möglichkeit hinzu, Informationen zusammen mit der Benutzeranfrage zu speichern und zu senden.',

    'faq.2.question': 'Warum ist das wichtig?',
    'faq.2.answer':
      'Zu viel Kontext verschlechtert die Qualität der AI-Antworten. Wir lösen das Needle in a Haystack Problem, indem nur relevante Informationen gesendet werden.',

    'faq.3.question': 'Wie funktioniert das?',
    'faq.3.answer':
      'Du schreibst Notizen mit Inhalt und Stichworten. Sobald ein Gespräch diese Stichwörter enthält, wird nur diese Notiz mitgeschickt.\n\nBraucht das Modell später etwas, das nicht automatisch ausgelöst wurde? Der eingebaute MCP-Server durchsucht deine Notizen live – selbst „Schreib eine E-Mail“ findet so deine Signatur, ohne dass du sie erwähnst.',

    'faq.4.question': 'Wie starte ich?',
    'faq.4.answer': 'Installiere die App und erstelle einen Account! Das war’s.',

    // Features
    'features.clean_ui.title': 'Reduziert aufs Wesentliche',
    'features.clean_ui.description':
      'Ein Fenster, keine Ablenkung – nur du und deine Gedanken.',

    'features.notes.title': 'Notizen mit Hirn',
    'features.notes.description':
      'Zen merkt sich, was wichtig ist, und lässt den Rest einfach links liegen.',

    'features.customizable.title': 'Passgenau',
    'features.customizable.description':
      'Farben, Shortcuts und Layouts – so, wie du arbeitest, nicht andersherum.',

    'features.calendar.title': 'Integrierter Kalender',
    'features.calendar.description':
      'Dein Tag auf einen Blick – ohne die App zu verlassen.',

    'features.email.title': 'Integrierter\nE-Mail Posteingang',
    'features.email.description':
      'Eingehende E-Mails werden automatisch gescannt und kategorisiert. So weiß die KI sofort, worum es geht.',
    'home.help.title': 'Hilfe',
    'help.1.question': 'Wenn ich eine Nachricht sende kriege ich einen 429 Fehler, was kann ich tun?',
    'help.1.answer': 'Ein 429 Fehler bedeutet, dass der Server zu viele Anfragen innerhalb eines bestimmten Zeitraums erhalten hat. Warte ein paar Minuten und versuche es erneut.\nWenn das Problem weiterhin besteht kann es sein, dass du für Heute dein Limit erreicht hast oder (da Zen AI kostenlos ist) andere Nutzer heute sehr aktiv waren und die Server keine weiteren Anfragen für einen bestimmten Zeitraum annehmen.\nVersuche es vielleicht Morgen noch einmal.',
    // Footer
    'footer.made_by': 'Built with ❤ by Joan Code',
  },
};
/* ---------- cookie helpers ---------- */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const found = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.split('=')[1]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; expires=${expires}; path=/`;
}

/* ---------- language detection ---------- */
const detectDefaultLang = (): Lang => {
  try {
    if (typeof navigator !== 'undefined') {
      const lang = navigator.language.toLowerCase();
      if (lang.startsWith('de')) return 'de';
    }
  } catch {}
  return 'en';
};

/* ---------- context ---------- */
interface I18nContextValue {
  language: Lang;
  setLanguage: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: k => k,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguageState] = useState<Lang>('en');

  useEffect(() => {
    const cookie = readCookie(COOKIE_NAME) as Lang | null;
    setLanguageState(cookie === 'en' || cookie === 'de' ? cookie : detectDefaultLang());
  }, []);

  const setLanguage = (l: Lang) => {
    setLanguageState(l);
    setCookie(COOKIE_NAME, l, 365);
  };

  const t = (key: string, vars?: Record<string, string | number>) => {
    const dict = translations[language] ?? translations.en;
    let text = dict[key] ?? translations.en[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => useContext(I18nContext);
export type { Lang };