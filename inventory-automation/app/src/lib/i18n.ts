/* Lightweight UI language support (English / Hindi / Gujarati). */
import { useEffect, useState } from 'react';

export type Lang = 'en' | 'hi' | 'gu';

const KEY = 'br.lang';

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
    'Scheduled reports': 'निर्धारित रिपोर्ट',
    Labels: 'लेबल',
    Sources: 'स्रोत',
    'Field Mapping': 'फ़ील्ड मैपिंग',
    Rules: 'नियम',
    Alerts: 'अलर्ट',
    'Users & Security': 'उपयोगकर्ता और सुरक्षा',
    'Sessions & Audit': 'सत्र और ऑडिट',
    Tools: 'उपकरण',
    Save: 'सहेजें',
    'Save changes': 'बदलाव सहेजें',
    Cancel: 'रद्द करें',
    Delete: 'हटाएँ',
    Edit: 'संपादित करें',
    'Add row': 'पंक्ति जोड़ें',
    Refresh: 'रीफ़्रेश करें',
    Export: 'निर्यात',
    Print: 'प्रिंट',
    Scan: 'स्कैन',
    Clear: 'साफ़ करें',
    Retry: 'फिर कोशिश करें',
    Close: 'बंद करें',
    'Sign out': 'साइन आउट',
    Search: 'खोजें',
    'Save view': 'व्यू सहेजें',
    'Inventory items': 'इन्वेंटरी आइटम',
    'Active sources': 'सक्रिय स्रोत',
    'Active reports': 'सक्रिय रिपोर्ट',
    'Recent errors': 'हाल की त्रुटियाँ',
    'Recent runs': 'हाल के रन',
    'By status': 'स्थिति के अनुसार',
    'By age bucket': 'आयु वर्ग के अनुसार',
    'By status bucket': 'स्थिति वर्ग के अनुसार',
    'Top brands': 'शीर्ष ब्रांड',
    'Ageing trend': 'एजिंग ट्रेंड',
    'Label settings': 'लेबल सेटिंग्स',
    'Active sessions': 'सक्रिय सत्र',
    'Login history': 'लॉगिन इतिहास',
    'Saved views': 'सहेजे गए व्यू',
    'Visible columns': 'दिखने वाले कॉलम',
    User: 'उपयोगकर्ता',
    Role: 'भूमिका',
    'Signed in': 'साइन इन',
    'Last seen': 'अंतिम बार देखा गया',
    Expires: 'समाप्त होता है',
    When: 'कब',
    Event: 'घटना',
    IP: 'आईपी',
    'Run ID': 'रन आईडी',
    Source: 'स्रोत',
    Processed: 'प्रोसेस किए गए',
    Errors: 'त्रुटियाँ',
    Field: 'फ़ील्ड',
    Error: 'त्रुटि',
    Barcode: 'बारकोड',
    Status: 'स्थिति',
    Model: 'मॉडल',
    Brand: 'ब्रांड',
    Location: 'स्थान',
    BARCODE: 'बारकोड',
    MODEL: 'मॉडल',
    BRAND: 'ब्रांड',
    STATUS: 'स्थिति',
    'STOCK AGE': 'स्टॉक आयु',
    'AGE BUCKET': 'आयु वर्ग',
    PRIORITY: 'प्राथमिकता',
    'STATUS BUCKET': 'स्थिति वर्ग',
    LOCATION: 'स्थान',
    'BIN BUCKET': 'बिन वर्ग',
    'SOURCE TYPE': 'स्रोत प्रकार',
    'No data': 'कोई डेटा नहीं',
    'No data yet': 'अभी कोई डेटा नहीं',
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
    'Scheduled reports': 'સુનિશ્ચિત રિપોર્ટ',
    Labels: 'લેબલ',
    Sources: 'સ્રોત',
    'Field Mapping': 'ફીલ્ડ મેપિંગ',
    Rules: 'નિયમો',
    Alerts: 'ચેતવણી',
    'Users & Security': 'વપરાશકર્તા અને સુરક્ષા',
    'Sessions & Audit': 'સેશન અને ઓડિટ',
    Tools: 'સાધનો',
    Save: 'સાચવો',
    'Save changes': 'ફેરફારો સાચવો',
    Cancel: 'રદ કરો',
    Delete: 'કાઢી નાખો',
    Edit: 'સંપાદિત કરો',
    'Add row': 'પંક્તિ ઉમેરો',
    Refresh: 'રિફ્રેશ કરો',
    Export: 'એક્સપોર્ટ',
    Print: 'પ્રિન્ટ',
    Scan: 'સ્કેન',
    Clear: 'સાફ કરો',
    Retry: 'ફરી પ્રયાસ કરો',
    Close: 'બંધ કરો',
    'Sign out': 'સાઇન આઉટ',
    Search: 'શોધો',
    'Save view': 'વ્યૂ સાચવો',
    'Inventory items': 'ઇન્વેન્ટરી આઇટમ',
    'Active sources': 'સક્રિય સ્રોત',
    'Active reports': 'સક્રિય રિપોર્ટ',
    'Recent errors': 'તાજેતરની ભૂલો',
    'Recent runs': 'તાજેતરના રન',
    'By status': 'સ્થિતિ મુજબ',
    'By age bucket': 'વય જૂથ મુજબ',
    'By status bucket': 'સ્થિતિ જૂથ મુજબ',
    'Top brands': 'ટોચના બ્રાન્ડ',
    'Ageing trend': 'એજિંગ ટ્રેન્ડ',
    'Label settings': 'લેબલ સેટિંગ્સ',
    'Active sessions': 'સક્રિય સેશન',
    'Login history': 'લોગિન ઇતિહાસ',
    'Saved views': 'સાચવેલા વ્યૂ',
    'Visible columns': 'દૃશ્યમાન કૉલમ',
    User: 'વપરાશકર્તા',
    Role: 'ભૂમિકા',
    'Signed in': 'સાઇન ઇન',
    'Last seen': 'છેલ્લે જોયું',
    Expires: 'સમાપ્ત થાય છે',
    When: 'ક્યારે',
    Event: 'ઘટના',
    IP: 'આઈપી',
    'Run ID': 'રન આઈડી',
    Source: 'સ્રોત',
    Processed: 'પ્રોસેસ થયેલ',
    Errors: 'ભૂલો',
    Field: 'ફીલ્ડ',
    Error: 'ભૂલ',
    Barcode: 'બારકોડ',
    Status: 'સ્થિતિ',
    Model: 'મોડેલ',
    Brand: 'બ્રાન્ડ',
    Location: 'સ્થાન',
    BARCODE: 'બારકોડ',
    MODEL: 'મોડેલ',
    BRAND: 'બ્રાન્ડ',
    STATUS: 'સ્થિતિ',
    'STOCK AGE': 'સ્ટોક વય',
    'AGE BUCKET': 'વય જૂથ',
    PRIORITY: 'પ્રાથમિકતા',
    'STATUS BUCKET': 'સ્થિતિ જૂથ',
    LOCATION: 'સ્થાન',
    'BIN BUCKET': 'બિન જૂથ',
    'SOURCE TYPE': 'સ્રોત પ્રકાર',
    'No data': 'કોઈ ડેટા નથી',
    'No data yet': 'હજી કોઈ ડેટા નથી',
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
