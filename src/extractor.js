export async function extractProduct(page) {
  return await page.evaluate(() => {
    const pick = (...selectors) => {
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) continue;

        const value =
          el.getAttribute('content') ||
          el.getAttribute('value') ||
          el.textContent;

        if (value && value.trim()) return value.trim();
      }

      return '';
    };

    const absolute = raw => {
      if (!raw) return '';
      try {
        return new URL(raw, location.href).href;
      } catch {
        return '';
      }
    };

    const bestSrcFromElement = img => {
      if (!img) return '';

      const candidates = [
        img.currentSrc,
        img.src,
        img.getAttribute('data-src'),
        img.getAttribute('data-original'),
        img.getAttribute('data-lazy-src')
      ].filter(Boolean);

      if (candidates.length) return absolute(candidates[0]);

      const srcset =
        img.getAttribute('srcset') ||
        img.getAttribute('data-srcset') ||
        '';

      if (srcset) {
        const last = srcset.split(',').pop()?.trim().split(/\s+/)[0];
        return absolute(last);
      }

      return '';
    };

    const jsonLd = [];

    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        jsonLd.push(JSON.parse(script.textContent || ''));
      } catch {}
    }

    const products = [];

    const walk = value => {
      if (!value) return;

      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }

      if (typeof value !== 'object') return;

      const type = value['@type'];
      const types = Array.isArray(type) ? type : [type];

      if (
        types
          .filter(Boolean)
          .some(t => String(t).toLowerCase() === 'product')
      ) {
        products.push(value);
      }

      for (const child of Object.values(value)) {
        walk(child);
      }
    };

    jsonLd.forEach(walk);

    const schema = products[0] || {};
    const offers = Array.isArray(schema.offers)
      ? schema.offers[0]
      : (schema.offers || {});

    const brand =
      typeof schema.brand === 'string'
        ? schema.brand
        : (schema.brand?.name || '');

    const body = document.body?.innerText || '';

    const orderMatch = body.match(
      /(?:mais de\s*)?[\d.,]+\s*(?:mil\s*)?(?:pedidos|vendidos|vendas)/i
    );

    const imageSet = new Set();

    const addImage = raw => {
      if (!raw) return;

      if (Array.isArray(raw)) {
        raw.forEach(addImage);
        return;
      }

      if (typeof raw === 'object') {
        addImage(raw.url || raw.contentUrl);
        return;
      }

      const url = absolute(String(raw));
      if (!url) return;

      if (/^data:/i.test(url)) return;

      imageSet.add(url);
    };

    addImage(schema.image);
    addImage(pick('meta[property="og:image"]'));

    const h1 = document.querySelector('h1');
    const main =
      h1?.closest('main') ||
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.body;

    const h1Rect = h1?.getBoundingClientRect();

    for (const img of main.querySelectorAll('img')) {
      const rect = img.getBoundingClientRect();

      if (rect.width < 36 || rect.height < 36) continue;

      if (
        h1Rect &&
        Math.abs((rect.top + scrollY) - (h1Rect.top + scrollY)) > 2200
      ) {
        continue;
      }

      addImage(bestSrcFromElement(img));
    }

    return {
      title:
        schema.name ||
        pick('meta[property="og:title"]', 'h1', 'title'),

      description:
        schema.description ||
        pick(
          'meta[property="og:description"]',
          'meta[name="description"]'
        ),

      brand,
      sku: schema.sku || schema.mpn || '',
      gtin:
        schema.gtin13 ||
        schema.gtin12 ||
        schema.gtin14 ||
        schema.gtin ||
        '',

      image:
        [...imageSet][0] ||
        pick('meta[property="og:image"]'),

      images: [...imageSet].slice(0, 40),

      price:
        offers.price ||
        pick(
          '[itemprop="price"]',
          'meta[property="product:price:amount"]',
          '[data-price]'
        ),

      currency:
        offers.priceCurrency ||
        pick('meta[property="product:price:currency"]'),

      availability: offers.availability || '',

      seller:
        typeof offers.seller === 'string'
          ? offers.seller
          : (offers.seller?.name || ''),

      rating: schema.aggregateRating?.ratingValue || '',

      reviewCount:
        schema.aggregateRating?.reviewCount ||
        schema.aggregateRating?.ratingCount ||
        '',

      orders: orderMatch?.[0] || '',
      category: schema.category || '',
      sourceUrl: location.href,
      canonical:
        document.querySelector('link[rel="canonical"]')?.href || '',

      schema
    };
  });
}
