/* Lightweight UI language support (English / Hindi / Gujarati). */
import { useEffect, useState } from 'react';

export type Lang = 'en' | 'hi' | 'gu';

const KEY = '***';

const DICT: Record<Exclude<Lang, 'en'>, Record<string, string>> = {
  hi: {
    Overview: 'अवलोकन',
    Operations: 'संचालन',
    Configuration: 'कॉन्फ़िगरेशन',
    Administration: 'प्रशासन',
    Dashboard: 'डैशबोर्ड',
    Inventory: 'इन्वेंटरी',
    Imports: 'इम्पोर्ट',
    Reports: 'रिपोर्ट',
    Labels: 'लेबल',
    Sources: 'स्रोत',
    'Field Mapping': 'फ़ील्ड मैपिंग',
    Rules: 'नियम',
    Alerts: 'अलर्ट',
    'Users & Security': 'उपयोगकर्ता और सुरक्षा',
    'Activity & Audit': 'गतिविधि और ऑडिट',
    Settings: 'सेटिंग्स',
    Assistant: 'सहायक',
    Language: 'भाषा'
  },
  gu: {
    Overview: 'ઝલક',
    Operations: 'કામગીરી',
    Configuration: 'રૂપરેખાંકન',
    Administration: 'વ્યવસ્થા',
    Dashboard: 'ડેશબોર્ડ',
    Inventory: 'ઇન્વેન્ટરી',
    Imports: 'આયાત',
    Reports: 'રિપોર્ટ',
    Labels: 'લેબલ',
    Sources: 'સ્રોત',
    'Field Mapping': 'ફીલ્ડ મેપિંગ',
    Rules: 'નિયમો',
    Alerts: 'ચેતવણી',
    'Users & Security': 'વપરાશકર્તા અને સુરક્ષા',
    'Activity & Audit': 'પ્રવૃત્તિ અને ઓડિટ',
    Settings: 'સેટિંગ્સ',
    Assistant: 'સહાયક',
    Language: 'ભાષા'
  }
};

export function getLang(): Lang {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'hi' || value === 'gu' || value === 'en') return value;
  } catch {
    /* ignore */
  }
  return 'en';
}

export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('br-lang', { detail: lang }));
}

export function translate(text: string, lang: Lang = getLang()): string {
  if (lang === 'en') return text;
  return DICT[lang][text] ?? text;
}

export function useLang(): [Lang, (lang: Lang) => void] {
  const [lang, setState] = useState<Lang>(getLang);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<Lang>).detail;
      setState(detail ?? getLang());
    };
    window.addEventListener('br-lang', handler);
    return () => window.removeEventListener('br-lang', handler);
  }, []);

  return [lang, setLang];
}
