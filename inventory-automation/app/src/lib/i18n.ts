/* UI language support (English / Hindi / Gujarati).
   Keys that are missing fall back to English, so a partial translation can
   never render a broken label. */
import { useEffect, useState } from 'react';

export type Lang = 'en' | 'hi' | 'gu';

const KEY = 'ors.lang';

const HI: Record<string, string> = {
  Overview: 'अवलोकन',
  Operations: 'संचालन',
  Administration: 'प्रशासन',
  Tools: 'औज़ार',
  Dashboard: 'डैशबोर्ड',
  'Data Sources': 'डेटा स्रोत',
  'Import Data': 'डेटा आयात',
  Multisource: 'मल्टीसोर्स',
  'Field Mapping': 'फ़ील्ड मैपिंग',
  Inventory: 'इन्वेंटरी',
  Rules: 'नियम',
  Reports: 'रिपोर्ट',
  'Report Templates': 'रिपोर्ट टेम्पलेट',
  'Report Builder': 'रिपोर्ट बिल्डर',
  Alerts: 'अलर्ट',
  'Ageing Trends': 'एजिंग ट्रेंड',
  Labels: 'लेबल',
  Schedules: 'शेड्यूल',
  Exports: 'एक्सपोर्ट',
  Purchasing: 'खरीदारी',
  'Users & Roles': 'उपयोगकर्ता और भूमिकाएँ',
  Security: 'सुरक्षा',
  'Sessions & Audit': 'सेशन और ऑडिट',
  'Activity Log': 'गतिविधि लॉग',
  Settings: 'सेटिंग्स',
  Save: 'सेव करें',
  Cancel: 'रद्द करें',
  Delete: 'हटाएँ',
  Refresh: 'रिफ्रेश',
  Export: 'एक्सपोर्ट',
  Print: 'प्रिंट',
  Scan: 'स्कैन',
  Clear: 'साफ़ करें',
  Close: 'बंद करें',
  Search: 'खोजें',
  'Sign out': 'साइन आउट',
  Language: 'भाषा'
};

const GU: Record<string, string> = {
  Overview: 'ઝલક',
  Operations: 'કામગીરી',
  Administration: 'વ્યવસ્થા',
  Tools: 'સાધનો',
  Dashboard: 'ડેશબોર્ડ',
  'Data Sources': 'ડેટા સ્રોત',
  'Import Data': 'ડેટા આયાત',
  Multisource: 'મલ્ટિસોર્સ',
  'Field Mapping': 'ફીલ્ડ મેપિંગ',
  Inventory: 'ઇન્વેન્ટરી',
  Rules: 'નિયમો',
  Reports: 'રિપોર્ટ',
  'Report Templates': 'રિપોર્ટ ટેમ્પલેટ',
  'Report Builder': 'રિપોર્ટ બિલ્ડર',
  Alerts: 'ચેતવણી',
  'Ageing Trends': 'એજિંગ ટ્રેન્ડ',
  Labels: 'લેબલ',
  Schedules: 'શેડ્યૂલ',
  Exports: 'એક્સપોર્ટ',
  Purchasing: 'ખરીદી',
  'Users & Roles': 'વપરાશકર્તા અને ભૂમિકા',
  Security: 'સુરક્ષા',
  'Sessions & Audit': 'સેશન અને ઓડિટ',
  'Activity Log': 'પ્રવૃત્તિ લોગ',
  Settings: 'સેટિંગ્સ',
  Save: 'સેવ કરો',
  Cancel: 'રદ કરો',
  Delete: 'કાઢી નાખો',
  Refresh: 'રિફ્રેશ',
  Export: 'એક્સપોર્ટ',
  Print: 'પ્રિન્ટ',
  Scan: 'સ્કેન',
  Clear: 'સાફ કરો',
  Close: 'બંધ કરો',
  Search: 'શોધો',
  'Sign out': 'સાઇન આઉટ',
  Language: 'ભાષા'
};

const DICT: Record<Exclude<Lang, 'en'>, Record<string, string>> = { hi: HI, gu: GU };

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
