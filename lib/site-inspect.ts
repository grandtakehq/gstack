/**
 * site-inspect — pure analysis over a rendered page snapshot.
 *
 * The CLI (bin/gstack-site-inspect) drives a headless browser and hands a
 * PageSnapshot to analyzeSnapshot(). Keeping the analysis pure means it is
 * unit-testable without a network or a browser.
 *
 * What it answers, from the public page only:
 *   - Which payment processors the site loads (script/iframe/network hosts)
 *   - Which payment methods it shows or mentions (text, logo alt/src/class)
 *   - Currency and country/region hints
 *   - Forms on the page and what they ask for
 *
 * It cannot see why a specific payment was declined (issuer, fraud rules,
 * 3-D Secure). Reports say so instead of guessing.
 */

export interface PageImage { src: string; alt: string; cls: string }
export interface PageForm {
  action: string;
  method: string;
  fields: Array<{ name: string; type: string; label: string; required: boolean; options?: string[] }>;
}
export interface PageSnapshot {
  url: string;
  finalUrl: string;
  status: number | null;
  title: string;
  description: string;
  lang: string;
  text: string;
  images: PageImage[];
  scripts: string[];
  iframes: string[];
  requestUrls: string[];
  forms: PageForm[];
  links: Array<{ text: string; href: string }>;
}

export interface Evidence { label: string; evidence: string[] }
export interface InspectReport {
  url: string;
  finalUrl: string;
  status: number | null;
  title: string;
  description: string;
  lang: string;
  paymentProviders: Evidence[];
  paymentMethods: Evidence[];
  currencies: Evidence[];
  regionHints: string[];
  checkoutLinks: Array<{ text: string; href: string }>;
  forms: PageForm[];
  thirdPartyHosts: string[];
  notes: string[];
}

/** Processors identified by hosts they load scripts/iframes/API calls from. */
export const PAYMENT_PROVIDERS: Array<{ name: string; hosts: RegExp }> = [
  { name: 'Stripe', hosts: /(^|\.)stripe\.(com|network)$/ },
  { name: 'PayPal', hosts: /(^|\.)(paypal|paypalobjects)\.com$/ },
  { name: 'Braintree', hosts: /(^|\.)braintree(gateway|-api)?\.com$/ },
  { name: 'Adyen', hosts: /(^|\.)adyen(payments)?\.com$/ },
  { name: 'Square', hosts: /(^|\.)(squareup|squarecdn)\.com$/ },
  { name: 'Checkout.com', hosts: /(^|\.)checkout\.com$/ },
  { name: 'Klarna', hosts: /(^|\.)klarna(cdn|services)?\.(com|net)$/ },
  { name: 'Afterpay / Clearpay', hosts: /(^|\.)(afterpay|clearpay)\.(com|co\.uk)$/ },
  { name: 'Affirm', hosts: /(^|\.)affirm\.com$/ },
  { name: 'Paystack', hosts: /(^|\.)paystack\.(co|com)$/ },
  { name: 'Flutterwave', hosts: /(^|\.)(flutterwave\.com|ravepay\.co)$/ },
  { name: 'Interswitch', hosts: /(^|\.)interswitch(ng|group)\.com$/ },
  { name: 'Monnify', hosts: /(^|\.)monnify\.com$/ },
  { name: 'Razorpay', hosts: /(^|\.)razorpay\.com$/ },
  { name: 'Mercado Pago', hosts: /(^|\.)mercadopago\.com(\.[a-z]+)?$/ },
  { name: 'Mollie', hosts: /(^|\.)mollie\.com$/ },
  { name: 'Worldpay', hosts: /(^|\.)worldpay\.com$/ },
  { name: 'Authorize.net', hosts: /(^|\.)authorize\.net$/ },
  { name: 'Cybersource', hosts: /(^|\.)cybersource\.com$/ },
  { name: 'Shopify Payments / Shop Pay', hosts: /(^|\.)(shop\.app|shopifycs\.com|checkout\.shopify\.com)$/ },
  { name: 'Amazon Pay', hosts: /(^|\.)(payments\.amazon\.com|amazonpay\.com)$/ },
  { name: 'Google Pay', hosts: /(^|\.)pay\.google\.com$/ },
  { name: 'Apple Pay', hosts: /(^|\.)apple-pay-gateway\.apple\.com$/ },
  { name: 'Paddle', hosts: /(^|\.)paddle\.com$/ },
  { name: 'Lemon Squeezy', hosts: /(^|\.)lemonsqueezy\.com$/ },
  { name: 'Chargebee', hosts: /(^|\.)chargebee\.com$/ },
  { name: 'Recurly', hosts: /(^|\.)recurly\.com$/ },
  { name: '2Checkout / Verifone', hosts: /(^|\.)(2checkout|2co)\.com$/ },
  { name: 'Coinbase Commerce', hosts: /(^|\.)commerce\.coinbase\.com$/ },
  { name: 'BitPay', hosts: /(^|\.)bitpay\.com$/ },
];

/** Methods identified by words in page text or logo alt/src/class names. */
export const PAYMENT_METHODS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Visa', pattern: /\bvisa\b/i },
  { name: 'Mastercard', pattern: /\bmaster[\s-]?card\b/i },
  { name: 'American Express', pattern: /\b(american[\s-]?express|amex)\b/i },
  { name: 'Discover', pattern: /\bdiscover (card|network|logo|icon)\b|\b(visa|mastercard|amex)[^.\n]{0,40}\bdiscover\b|\bdiscover\b[^.\n]{0,40}\b(visa|mastercard|amex)\b/i },
  { name: 'JCB', pattern: /\bjcb\b/i },
  { name: 'UnionPay', pattern: /\bunion[\s-]?pay\b/i },
  { name: 'Diners Club', pattern: /\bdiners[\s-]?club\b/i },
  { name: 'Maestro', pattern: /\bmaestro\b/i },
  { name: 'Verve', pattern: /\bverve (card|logo|icon)\b|\b(visa|mastercard)[^.\n]{0,40}\bverve\b|\bverve\b[^.\n]{0,40}\b(visa|mastercard)\b/i },
  { name: 'PayPal', pattern: /\bpay[\s-]?pal\b/i },
  { name: 'Apple Pay', pattern: /\bapple[\s-]?pay\b/i },
  { name: 'Google Pay', pattern: /\b(google[\s-]?pay|gpay)\b/i },
  { name: 'Amazon Pay', pattern: /\bamazon[\s-]?pay\b/i },
  { name: 'Shop Pay', pattern: /\bshop[\s-]?pay\b/i },
  { name: 'Klarna', pattern: /\bklarna\b/i },
  { name: 'Afterpay / Clearpay', pattern: /\b(afterpay|clearpay)\b/i },
  { name: 'Affirm', pattern: /\baffirm\b(?=[^.\n]{0,40}\b(pay|month|financ))|\baffirm (logo|icon)\b/i },
  { name: 'Bank transfer', pattern: /\b(bank[\s-]?transfer|wire[\s-]?transfer|direct[\s-]?debit|ach\b)/i },
  { name: 'USSD', pattern: /\bussd\b/i },
  { name: 'M-Pesa', pattern: /\bm[\s-]?pesa\b/i },
  { name: 'Mobile money', pattern: /\bmobile[\s-]?money\b/i },
  { name: 'iDEAL', pattern: /\biDEAL\b|\bideal (logo|icon)\b/ },
  { name: 'Bancontact', pattern: /\bbancontact\b/i },
  { name: 'SEPA', pattern: /\bsepa\b/i },
  { name: 'Sofort', pattern: /\bsofort\b/i },
  { name: 'Pix', pattern: /\bpix\b(?=[^.\n]{0,40}\b(pag|pay|qr))|\bpix (logo|icon)\b/i },
  { name: 'Boleto', pattern: /\bboleto\b/i },
  { name: 'UPI', pattern: /\bupi\b/i },
  { name: 'Alipay', pattern: /\bali[\s-]?pay\b/i },
  { name: 'WeChat Pay', pattern: /\bwe[\s-]?chat[\s-]?pay\b/i },
  { name: 'Crypto', pattern: /\b(crypto(currency)?|bitcoin|btc|usdt|usdc|ethereum)\b/i },
  { name: 'Cash on delivery', pattern: /\b(cash[\s-]?on[\s-]?delivery|pay[\s-]?on[\s-]?delivery|\bcod\b)/i },
  { name: 'Gift card', pattern: /\bgift[\s-]?cards?\b/i },
];

const CURRENCIES: Array<{ code: string; pattern: RegExp }> = [
  { code: 'USD', pattern: /\bUSD\b|US\$|(?<![A-Z])\$\s?\d/ },
  { code: 'EUR', pattern: /\bEUR\b|€\s?\d|\d\s?€/ },
  { code: 'GBP', pattern: /\bGBP\b|£\s?\d/ },
  { code: 'NGN', pattern: /\bNGN\b|₦\s?\d/ },
  { code: 'INR', pattern: /\bINR\b|₹\s?\d/ },
  { code: 'JPY', pattern: /\bJPY\b|¥\s?\d/ },
  { code: 'KES', pattern: /\bKES\b|\bKSh\s?\d/ },
  { code: 'GHS', pattern: /\bGHS\b|₵\s?\d|GH₵/ },
  { code: 'ZAR', pattern: /\bZAR\b|\bR\s\d+[.,]\d{2}\b/ },
  { code: 'CAD', pattern: /\bCAD\b|C\$\s?\d|CA\$/ },
  { code: 'AUD', pattern: /\bAUD\b|A\$\s?\d|AU\$/ },
  { code: 'BRL', pattern: /\bBRL\b|R\$\s?\d/ },
];

const REGION_PATTERNS: RegExp[] = [
  /\b(we )?(only )?(ship|deliver)s? (only )?(to|within) [^.\n]{3,80}/gi,
  /\bnot available in (your )?(country|region)[^.\n]{0,80}/gi,
  /\b(available|sold) only in [^.\n]{3,80}/gi,
  /\bbilling address must [^.\n]{3,100}/gi,
  /\b(cards?|payments?) issued (in|outside) [^.\n]{3,80}/gi,
  /\b(international|foreign) (cards?|payments?) [^.\n]{3,80}/gi,
];

const CHECKOUT_LINK = /\b(checkout|check out|cart|basket|pay(ment)?s?|billing|subscribe|pricing|buy now|purchase|donate)\b/i;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (err) {
    if (err instanceof TypeError) return '';
    throw err;
  }
}

function push(map: Map<string, Set<string>>, key: string, ev: string, cap = 5): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  if (set.size < cap) set.add(ev);
}

function toEvidence(map: Map<string, Set<string>>): Evidence[] {
  return [...map.entries()].map(([label, ev]) => ({ label, evidence: [...ev] }));
}

/** Short snippet of `text` around the first match of `re`. */
function snippet(text: string, re: RegExp, radius = 40): string | null {
  const m = new RegExp(re.source, re.flags.replace('g', '')).exec(text);
  if (!m) return null;
  const start = Math.max(0, m.index - radius);
  const end = Math.min(text.length, m.index + m[0].length + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

export function analyzeSnapshot(s: PageSnapshot): InspectReport {
  const pageHost = hostOf(s.finalUrl || s.url);
  const allUrls = [...s.scripts, ...s.iframes, ...s.requestUrls];

  // Providers: by host of anything the page loaded.
  const providers = new Map<string, Set<string>>();
  const hosts = new Set<string>();
  for (const u of allUrls) {
    const h = hostOf(u);
    if (!h) continue;
    if (h !== pageHost && !h.endsWith('.' + pageHost)) hosts.add(h);
    for (const p of PAYMENT_PROVIDERS) if (p.hosts.test(h)) push(providers, p.name, `loads ${h}`);
  }

  // Methods: text mentions + logo images.
  const methods = new Map<string, Set<string>>();
  for (const m of PAYMENT_METHODS) {
    const sn = snippet(s.text, m.pattern);
    if (sn) push(methods, m.name, `text: "${sn}"`);
    for (const img of s.images) {
      const hay = `${img.alt} ${img.cls} ${img.src.split('?')[0].split('/').pop() ?? ''}`.replace(/[-_.]/g, ' ');
      if (m.pattern.test(hay)) push(methods, m.name, `logo: ${img.alt || img.src.split('/').pop()}`);
    }
  }
  // A provider implies its own wallet method.
  for (const [prov, method] of [['PayPal', 'PayPal'], ['Klarna', 'Klarna'], ['Affirm', 'Affirm'], ['Amazon Pay', 'Amazon Pay'], ['Google Pay', 'Google Pay'], ['Apple Pay', 'Apple Pay']] as const) {
    if (providers.has(prov)) push(methods, method, `${prov} script loaded`);
  }
  // Card fields in forms imply card payments.
  const hasCardField = s.forms.some(f => f.fields.some(x => /card|cc-?(number|num)|cvc|cvv|expir/i.test(`${x.name} ${x.label}`)));
  if (hasCardField) push(methods, 'Card (form fields present)', 'form asks for card number / CVC / expiry');

  const currencies = new Map<string, Set<string>>();
  for (const c of CURRENCIES) {
    const sn = snippet(s.text, c.pattern, 25);
    if (sn) push(currencies, c.code, sn, 3);
  }

  const regionHints = new Set<string>();
  for (const re of REGION_PATTERNS) {
    for (const m of s.text.matchAll(re)) {
      regionHints.add(m[0].replace(/\s+/g, ' ').trim());
      if (regionHints.size >= 8) break;
    }
  }

  const seen = new Set<string>();
  const checkoutLinks = s.links
    .filter(l => CHECKOUT_LINK.test(`${l.text} ${l.href}`) && !seen.has(l.href) && seen.add(l.href))
    .slice(0, 15);

  const notes: string[] = [];
  if (s.status && s.status >= 400) notes.push(`Page returned HTTP ${s.status}; results may describe an error or bot-check page.`);
  if (/captcha|are you a robot|verify you are human|access denied|cloudflare/i.test(s.title + ' ' + s.text.slice(0, 2000))) {
    notes.push('Page looks like a bot check or access-denied page. Results are probably incomplete.');
  }
  if (providers.size === 0 && methods.size === 0) {
    notes.push('No payment signals on this page. Try the checkout, cart, or pricing link listed below.');
  }
  notes.push('Only the public page was checked. A declined payment can also come from your bank, fraud rules, 3-D Secure, or card country; the site cannot show those.');

  return {
    url: s.url,
    finalUrl: s.finalUrl,
    status: s.status,
    title: s.title,
    description: s.description,
    lang: s.lang,
    paymentProviders: toEvidence(providers),
    paymentMethods: toEvidence(methods),
    currencies: toEvidence(currencies),
    regionHints: [...regionHints],
    checkoutLinks,
    forms: s.forms,
    thirdPartyHosts: [...hosts].sort(),
    notes,
  };
}

export function formatReport(r: InspectReport): string {
  const out: string[] = [];
  const list = (items: Evidence[]) => items.length ? items.map(i => `  - ${i.label}  (${i.evidence.join('; ')})`) : ['  - none found'];
  out.push(`# ${r.title || '(no title)'}`);
  out.push(`URL: ${r.finalUrl}${r.finalUrl !== r.url ? `  (from ${r.url})` : ''}${r.status ? `  [HTTP ${r.status}]` : ''}`);
  if (r.description) out.push(`About: ${r.description}`);
  if (r.lang) out.push(`Language: ${r.lang}`);
  out.push('', 'Payment processors:', ...list(r.paymentProviders));
  out.push('', 'Payment methods shown or mentioned:', ...list(r.paymentMethods));
  out.push('', 'Currencies:', ...list(r.currencies));
  if (r.regionHints.length) out.push('', 'Region / billing restrictions mentioned:', ...r.regionHints.map(h => `  - ${h}`));
  if (r.checkoutLinks.length) out.push('', 'Checkout / pricing links:', ...r.checkoutLinks.map(l => `  - ${l.text || '(no text)'} -> ${l.href}`));
  if (r.forms.length) {
    out.push('', 'Forms:');
    for (const f of r.forms) {
      out.push(`  - ${f.method.toUpperCase()} ${f.action || '(same page)'}: ` +
        f.fields.map(x => `${x.label || x.name || x.type}${x.required ? '*' : ''}`).join(', '));
    }
  }
  out.push('', 'Notes:', ...r.notes.map(n => `  - ${n}`));
  return out.join('\n');
}

/** RFC 4180 CSV. Columns = union of keys in first-seen order. */
export function toCsv(rows: Array<Record<string, string>>): string {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [cols.map(esc).join(','), ...rows.map(r => cols.map(c => esc(r[c] ?? '')).join(','))].join('\n') + '\n';
}

/** Parse `name=selector` or `name=selector@attr`. */
export function parseFieldSpec(spec: string): { name: string; selector: string; attr: string | null } {
  const eq = spec.indexOf('=');
  if (eq < 1) throw new Error(`bad --field "${spec}": expected name=css[@attr]`);
  const name = spec.slice(0, eq);
  let selector = spec.slice(eq + 1);
  let attr: string | null = null;
  const at = selector.lastIndexOf('@');
  if (at > 0 && /^[a-zA-Z_:][-\w:.]*$/.test(selector.slice(at + 1))) {
    attr = selector.slice(at + 1);
    selector = selector.slice(0, at);
  }
  if (!selector) throw new Error(`bad --field "${spec}": empty selector`);
  return { name, selector, attr };
}
