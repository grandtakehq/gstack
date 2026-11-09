import { describe, test, expect } from 'bun:test';
import {
  analyzeSnapshot, formatReport, toCsv, parseFieldSpec, hostOf, type PageSnapshot,
} from '../lib/site-inspect';

function snap(over: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: 'https://shop.example.com', finalUrl: 'https://shop.example.com/', status: 200,
    title: 'Example Shop', description: '', lang: 'en', text: '', images: [], scripts: [],
    iframes: [], requestUrls: [], forms: [], links: [], ...over,
  };
}

describe('analyzeSnapshot: providers', () => {
  test('detects processors from script, iframe, and network hosts', () => {
    const r = analyzeSnapshot(snap({
      scripts: ['https://js.stripe.com/v3/'],
      iframes: ['https://www.paypal.com/smart/buttons'],
      requestUrls: ['https://api.paystack.co/checkout', 'https://checkout.flutterwave.com/v3.js'],
    }));
    const names = r.paymentProviders.map(p => p.label);
    expect(names).toEqual(expect.arrayContaining(['Stripe', 'PayPal', 'Paystack', 'Flutterwave']));
  });

  test('does not match look-alike hosts', () => {
    const r = analyzeSnapshot(snap({ scripts: ['https://notstripe.com/x.js', 'https://stripe.com.evil.io/x.js'] }));
    expect(r.paymentProviders).toEqual([]);
  });

  test('first-party hosts are excluded from thirdPartyHosts', () => {
    const r = analyzeSnapshot(snap({ requestUrls: ['https://cdn.shop.example.com/a.js', 'https://js.stripe.com/v3'] }));
    expect(r.thirdPartyHosts).toEqual(['js.stripe.com']);
  });
});

describe('analyzeSnapshot: methods', () => {
  test('finds methods in text with a snippet', () => {
    const r = analyzeSnapshot(snap({ text: 'We accept Visa, Mastercard, Apple Pay and bank transfer.' }));
    const names = r.paymentMethods.map(m => m.label);
    expect(names).toEqual(expect.arrayContaining(['Visa', 'Mastercard', 'Apple Pay', 'Bank transfer']));
    expect(r.paymentMethods.find(m => m.label === 'Visa')!.evidence[0]).toContain('We accept Visa');
  });

  test('finds methods from logo images', () => {
    const r = analyzeSnapshot(snap({ images: [{ src: '/icons/amex-logo.svg', alt: '', cls: '' }, { src: '', alt: 'Google Pay', cls: '' }] }));
    const names = r.paymentMethods.map(m => m.label);
    expect(names).toEqual(expect.arrayContaining(['American Express', 'Google Pay']));
  });

  test('ambiguous words need payment context', () => {
    const r = analyzeSnapshot(snap({ text: 'Discover our new collection. The ideal gift. Verve and style.' }));
    const names = r.paymentMethods.map(m => m.label);
    expect(names).not.toContain('Discover');
    expect(names).not.toContain('iDEAL');
    expect(names).not.toContain('Verve');
  });

  test('card form fields imply card payments', () => {
    const r = analyzeSnapshot(snap({
      forms: [{ action: '', method: 'post', fields: [{ name: 'cc-number', type: 'text', label: 'Card number', required: true }] }],
    }));
    expect(r.paymentMethods.map(m => m.label)).toContain('Card (form fields present)');
  });
});

describe('analyzeSnapshot: currency, region, notes', () => {
  test('currencies and region hints', () => {
    const r = analyzeSnapshot(snap({ text: 'Total ₦12,500. We only ship to Nigeria and Ghana. Billing address must match your card.' }));
    expect(r.currencies.map(c => c.label)).toContain('NGN');
    expect(r.regionHints.join(' ')).toContain('ship to Nigeria');
    expect(r.regionHints.join(' ')).toContain('Billing address must match');
  });

  test('flags bot-check pages and HTTP errors', () => {
    const r = analyzeSnapshot(snap({ status: 403, title: 'Just a moment...', text: 'Verify you are human' }));
    expect(r.notes.join(' ')).toContain('HTTP 403');
    expect(r.notes.join(' ')).toContain('bot check');
  });

  test('no signals suggests following checkout links', () => {
    const r = analyzeSnapshot(snap({ links: [{ text: 'Cart', href: 'https://shop.example.com/cart' }, { text: 'About', href: 'https://shop.example.com/about' }] }));
    expect(r.checkoutLinks.map(l => l.href)).toEqual(['https://shop.example.com/cart']);
    expect(r.notes.join(' ')).toContain('No payment signals');
  });

  test('formatReport renders sections', () => {
    const out = formatReport(analyzeSnapshot(snap({ scripts: ['https://js.stripe.com/v3'] })));
    expect(out).toContain('# Example Shop');
    expect(out).toContain('Payment processors:');
    expect(out).toContain('Stripe');
  });
});

describe('helpers', () => {
  test('toCsv escapes and unions columns', () => {
    expect(toCsv([{ a: '1', b: 'x,y' }, { a: 'say "hi"', c: 'z' }])).toBe('a,b,c\n1,"x,y",\n"say ""hi""",,z\n');
  });

  test('parseFieldSpec', () => {
    expect(parseFieldSpec('title=h3 a@title')).toEqual({ name: 'title', selector: 'h3 a', attr: 'title' });
    expect(parseFieldSpec('price=.price')).toEqual({ name: 'price', selector: '.price', attr: null });
    expect(parseFieldSpec('x=a[href^="mailto:a@b"]')).toEqual({ name: 'x', selector: 'a[href^="mailto:a@b"]', attr: null });
    expect(() => parseFieldSpec('noequals')).toThrow();
  });

  test('hostOf tolerates bad URLs', () => {
    expect(hostOf('not a url')).toBe('');
    expect(hostOf('https://JS.Stripe.com/v3')).toBe('js.stripe.com');
  });
});
