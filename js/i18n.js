// Site-wide translation: a language picker in the header that translates every
// visible string on the page, including the text AgriHaven writes for each field
// (field story, recommendations, satellite lab, compare table), into 130+ languages.
// Uses Google's website translation element, loaded only when a language other than
// English is chosen, so English visitors download nothing extra.

// Most-used farming languages first, then every other supported language A–Z.
export const TOP = [
  ['en', 'English'], ['es', 'Español'], ['hi', 'हिन्दी'], ['pt', 'Português'], ['fr', 'Français'],
  ['zh-CN', '中文（简体）'], ['ar', 'العربية'], ['bn', 'বাংলা'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'],
  ['pa', 'ਪੰਜਾਬੀ'], ['mr', 'मराठी'], ['gu', 'ગુજરાતી'], ['kn', 'ಕನ್ನಡ'], ['ml', 'മലയാളം'], ['ur', 'اردو'],
  ['sw', 'Kiswahili'], ['ha', 'Hausa'], ['yo', 'Yorùbá'], ['ig', 'Igbo'], ['am', 'አማርኛ'],
  ['id', 'Bahasa Indonesia'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'], ['tl', 'Filipino'],
  ['ru', 'Русский'], ['uk', 'Українська'], ['tr', 'Türkçe'], ['de', 'Deutsch'], ['it', 'Italiano'],
  ['ja', '日本語'], ['ko', '한국어'], ['fa', 'فارسی'], ['ne', 'नेपाली']
];
export const ALL = [
  ['af', 'Afrikaans'], ['ak', 'Akan (Twi)'], ['sq', 'Shqip (Albanian)'], ['hy', 'Հայերեն (Armenian)'], ['as', 'অসমীয়া (Assamese)'],
  ['ay', 'Aymar aru (Aymara)'], ['az', 'Azərbaycan'], ['bm', 'Bamanankan (Bambara)'], ['eu', 'Euskara (Basque)'], ['be', 'Беларуская'],
  ['bho', 'भोजपुरी (Bhojpuri)'], ['bs', 'Bosanski'], ['bg', 'Български'], ['ca', 'Català'], ['ceb', 'Cebuano'],
  ['ny', 'Chichewa'], ['zh-TW', '中文（繁體）'], ['co', 'Corsu (Corsican)'], ['hr', 'Hrvatski'], ['cs', 'Čeština'],
  ['da', 'Dansk'], ['dv', 'ދިވެހި (Dhivehi)'], ['doi', 'डोगरी (Dogri)'], ['nl', 'Nederlands'], ['eo', 'Esperanto'],
  ['et', 'Eesti'], ['ee', 'Eʋegbe (Ewe)'], ['fi', 'Suomi'], ['fy', 'Frysk'], ['gl', 'Galego'],
  ['ka', 'ქართული (Georgian)'], ['el', 'Ελληνικά'], ['gn', 'Avañeʼẽ (Guarani)'], ['ht', 'Kreyòl ayisyen'], ['haw', 'ʻŌlelo Hawaiʻi'],
  ['iw', 'עברית (Hebrew)'], ['hmn', 'Hmoob (Hmong)'], ['hu', 'Magyar'], ['is', 'Íslenska'], ['ilo', 'Ilokano'],
  ['ga', 'Gaeilge (Irish)'], ['jw', 'Basa Jawa'], ['kk', 'Қазақ'], ['km', 'ខ្មែរ (Khmer)'], ['rw', 'Kinyarwanda'],
  ['gom', 'कोंकणी (Konkani)'], ['kri', 'Krio'], ['ku', 'Kurdî (Kurmancî)'], ['ckb', 'کوردی (Sorani)'], ['ky', 'Кыргызча'],
  ['lo', 'ລາວ (Lao)'], ['la', 'Latina'], ['lv', 'Latviešu'], ['ln', 'Lingála'], ['lt', 'Lietuvių'],
  ['lg', 'Luganda'], ['lb', 'Lëtzebuergesch'], ['mk', 'Македонски'], ['mai', 'मैथिली (Maithili)'], ['mg', 'Malagasy'],
  ['ms', 'Bahasa Melayu'], ['mt', 'Malti'], ['mi', 'Māori'], ['mni-Mtei', 'ꯃꯩꯇꯩꯂꯣꯟ (Meitei)'], ['lus', 'Mizo'],
  ['mn', 'Монгол'], ['my', 'မြန်မာ (Burmese)'], ['no', 'Norsk'], ['or', 'ଓଡ଼ିଆ (Odia)'], ['om', 'Afaan Oromoo'],
  ['ps', 'پښتو (Pashto)'], ['pl', 'Polski'], ['qu', 'Runasimi (Quechua)'], ['ro', 'Română'], ['sm', 'Gagana Samoa'],
  ['sa', 'संस्कृतम् (Sanskrit)'], ['gd', 'Gàidhlig'], ['nso', 'Sepedi'], ['sr', 'Српски'], ['st', 'Sesotho'],
  ['sn', 'chiShona'], ['sd', 'سنڌي (Sindhi)'], ['si', 'සිංහල (Sinhala)'], ['sk', 'Slovenčina'], ['sl', 'Slovenščina'],
  ['so', 'Soomaali'], ['su', 'Basa Sunda'], ['sv', 'Svenska'], ['tg', 'Тоҷикӣ'], ['tt', 'Татар'],
  ['ti', 'ትግርኛ (Tigrinya)'], ['ts', 'Xitsonga'], ['tk', 'Türkmen'], ['ug', 'ئۇيغۇرچە (Uyghur)'], ['uz', 'Oʻzbek'],
  ['cy', 'Cymraeg (Welsh)'], ['xh', 'isiXhosa'], ['yi', 'ייִדיש (Yiddish)'], ['zu', 'isiZulu']
];
const KNOWN = new Set([...TOP, ...ALL].map(([c]) => c));
const RTL = new Set(['ar', 'fa', 'ur', 'iw', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb']);
// Voice codes for read-aloud where they differ from the translation code.
const VOICE = { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', iw: 'he-IL', jw: 'jv-ID', tl: 'fil-PH', no: 'nb-NO', 'mni-Mtei': 'mni' };
const KEY = 'agrihaven-lang';

const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch {} }
};
export function currentLang() {
  const saved = store.get();
  if (saved && KNOWN.has(saved)) return saved;
  const m = document.cookie.match(/googtrans=\/en\/([^;]+)/);
  return m && KNOWN.has(decodeURIComponent(m[1])) ? decodeURIComponent(m[1]) : 'en';
}
export function voiceLang() {
  const l = currentLang();
  return l === 'en' ? 'en-US' : VOICE[l] || l;
}

function setCookie(val) {
  const host = location.hostname;
  const exp = val ? '' : '; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  const v = val ? `/en/${val}` : '';
  document.cookie = `googtrans=${v}; path=/${exp}`;
  if (host.includes('.')) document.cookie = `googtrans=${v}; path=/; domain=.${host}${exp}`;
}

let loading = null;
function loadEngine() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const host = document.createElement('div');
    host.id = 'gtHost'; host.className = 'notranslate'; host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    window.__agriGT = () => {
      // eslint-disable-next-line no-undef
      new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'gtHost');
      const wait = (n) => {
        const combo = host.querySelector('select.goog-te-combo');
        if (combo) resolve(combo); else if (n > 0) setTimeout(() => wait(n - 1), 100); else reject(new Error('translate widget did not start'));
      };
      wait(80);
    };
    const s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=__agriGT';
    s.async = true;
    s.onerror = () => reject(new Error('translate service unreachable'));
    document.head.appendChild(s);
  });
  return loading;
}

function applyDir(lang) {
  document.documentElement.lang = lang === 'iw' ? 'he' : lang;
  // Mirror text direction inside reading areas only, so maps and charts keep their layout.
  document.body.classList.toggle('rtl-text', RTL.has(lang));
}

async function choose(lang, picker) {
  if (!KNOWN.has(lang)) lang = 'en';
  store.set(lang);
  if (lang === 'en') {
    setCookie('');
    if (loading) { location.reload(); return; } // the engine can only be fully undone by a reload
    applyDir('en');
    document.dispatchEvent(new CustomEvent('agri:lang', { detail: 'en' }));
    return;
  }
  setCookie(lang);
  applyDir(lang);
  document.dispatchEvent(new CustomEvent('agri:lang', { detail: lang }));
  try {
    const combo = await loadEngine();
    if (combo.value !== lang) {
      combo.value = lang;
      combo.dispatchEvent(new Event('change'));
    }
  } catch (err) {
    if (picker) picker.value = 'en';
    store.set('en'); setCookie(''); applyDir('en');
    const t = document.getElementById('toast');
    if (t) { t.textContent = 'Translation is unavailable right now. Check your connection and try again.'; t.hidden = false; setTimeout(() => (t.hidden = true), 4000); }
  }
}

function buildOptions(sel) {
  const opt = ([c, n]) => `<option value="${c}">${n}</option>`;
  const byName = [...ALL].sort((a, b) => a[1].localeCompare(b[1]));
  sel.innerHTML = `<optgroup label="Popular">${TOP.map(opt).join('')}</optgroup><optgroup label="All languages">${byName.map(opt).join('')}</optgroup>`;
}

export function initLanguagePicker() {
  const pickers = [...document.querySelectorAll('select[data-langpick]')];
  pickers.forEach((sel) => {
    buildOptions(sel);
    sel.value = currentLang();
    sel.addEventListener('change', () => {
      pickers.forEach((o) => { if (o !== sel) o.value = sel.value; });
      choose(sel.value, sel);
    });
  });
  const start = currentLang();
  if (start !== 'en') choose(start);
}
