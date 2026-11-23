import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

import { projectsRoot } from './storage.js';
import {
  assertPublicProductUrl,
  assertNoSensitivePage,
  isObviouslyPrivateUrl
} from './security.js';
import { extractProduct } from './extractor.js';

const TRACKERS =
  /google-analytics|googletagmanager|doubleclick|facebook\.com\/tr|connect\.facebook|hotjar|clarity\.ms|segment\.io|mixpanel|amplitude/i;

const FORMAT_VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 }
};

function slugify(text) {
  return String(text || 'clone')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'clone';
}

function safeProjectId(name) {
  const stamp =
    new Date()
      .toISOString()
      .replace(/\D/g, '')
      .slice(0, 14);

  const random =
    crypto
      .randomBytes(3)
      .toString('hex');

  return `${stamp}-${slugify(name)}-${random}`;
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      let stable = 0;
      let lastHeight = 0;

      const timer = setInterval(() => {
        window.scrollBy(0, 650);
        total += 650;

        const height = Math.max(
          document.body?.scrollHeight || 0,
          document.documentElement?.scrollHeight || 0
        );

        stable = height === lastHeight
          ? stable + 1
          : 0;

        lastHeight = height;

        if (
          window.scrollY + window.innerHeight >= height - 4 ||
          stable > 4 ||
          total > 45000
        ) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          setTimeout(resolve, 350);
        }
      }, 120);
    });
  });
}

async function dismissCommonOverlays(page) {
  try {
    await page.keyboard.press('Escape');
  } catch {}

  await page.evaluate(() => {
    const closeText =
      /^(fechar|close|agora não|agora nao|não agora|nao agora|x|×)$/i;

    const selectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[class*="modal" i]',
      '[class*="popup" i]',
      '[class*="newsletter" i]',
      '[class*="cookie" i]',
      '[class*="consent" i]',
      '[class*="interstitial" i]',
      '[id*="modal" i]',
      '[id*="popup" i]',
      '[id*="cookie" i]'
    ];

    for (const selector of selectors) {
      for (const root of document.querySelectorAll(selector)) {
        const rect = root.getBoundingClientRect();
        const style = getComputedStyle(root);

        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          rect.width < 10 ||
          rect.height < 10
        ) {
          continue;
        }

        const close =
          [...root.querySelectorAll('button,[role="button"],a')]
            .find(el => {
              const text =
                (
                  el.getAttribute('aria-label') ||
                  el.textContent ||
                  ''
                )
                  .trim();

              return (
                closeText.test(text) ||
                /fechar|close/i.test(text)
              );
            });

        if (close) {
          try {
            close.click();
          } catch {}
        }
      }
    }
  });

  await page.waitForTimeout(250);
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function makeSafeClone(html, finalUrl) {
  const $ = cheerio.load(html, {
    decodeEntities: false
  });

  $(
    'meta[http-equiv="Content-Security-Policy"],meta[http-equiv="content-security-policy"]'
  ).remove();

  $('base').remove();

  if (!$('head').length) {
    $('html').prepend('<head></head>');
  }

  $('head').prepend(
    `<base href="${escapeAttr(finalUrl)}">`
  );

  $('script,iframe,object,embed').remove();

  $('form').each((_, element) => {
    $(element)
      .removeAttr('action')
      .removeAttr('method')
      .attr('data-clone-form', 'true');
  });

  $('input[type="password"],input[autocomplete^="cc-"]').remove();

  $('*').each((_, element) => {
    const attrs = {
      ...(element.attribs || {})
    };

    for (const name of Object.keys(attrs)) {
      if (/^on/i.test(name)) {
        $(element).removeAttr(name);
      }
    }
  });

  $('a[href]').each((_, element) => {
    const href =
      $(element).attr('href') || '';

    if (/^\s*javascript:/i.test(href)) {
      $(element).attr('href', '#');
    }
  });

  $('head').append(
    '<link rel="stylesheet" href="/clone-runtime.css">'
  );

  $('body').append(
    '<script src="/clone-runtime.js"></script>'
  );

  return $.html();
}

function buildResponsiveLoader(hasAllFormats) {
  if (!hasAllFormats) {
    return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script>
location.replace('./desktop.html' + location.search + location.hash);
<\/script>`;
  }

  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clone responsivo</title>
<style>
html,body{margin:0;background:#fff}
</style>
<script>
(() => {
  function target() {
    if (innerWidth <= 600) return 'mobile.html';
    if (innerWidth <= 1024) return 'tablet.html';
    return 'desktop.html';
  }

  location.replace('./' + target() + location.search + location.hash);
})();
<\/script>`;
}


async function markAndFreezeRenderedProduct(page, product, format) {
  await page.evaluate(({ product, format }) => {
    const normalize = value =>
      String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const absolute = raw => {
      if (!raw) return '';
      try {
        return new URL(raw, location.href).href;
      } catch {
        return '';
      }
    };

    const bestSrc = img => {
      if (!img) return '';

      const direct = [
        img.currentSrc,
        img.src,
        img.getAttribute('data-src'),
        img.getAttribute('data-original'),
        img.getAttribute('data-lazy-src')
      ].filter(Boolean);

      if (direct.length) {
        return absolute(direct[0]);
      }

      const srcset =
        img.getAttribute('srcset') ||
        img.getAttribute('data-srcset') ||
        '';

      if (srcset) {
        const last =
          srcset
            .split(',')
            .pop()
            ?.trim()
            .split(/\s+/)[0];

        return absolute(last);
      }

      return '';
    };

    const sameImage = (a, b) => {
      if (!a || !b) return false;

      try {
        const ua = new URL(a, location.href);
        const ub = new URL(b, location.href);

        if (ua.href === ub.href) return true;

        const fa =
          ua.pathname
            .split('/')
            .pop()
            ?.split('?')[0] || '';

        const fb =
          ub.pathname
            .split('/')
            .pop()
            ?.split('?')[0] || '';

        return Boolean(
          fa &&
          fb &&
          fa === fb
        );
      } catch {
        return a === b;
      }
    };

    document.documentElement.setAttribute(
      'data-pce-captured-format',
      format
    );

    // Congela as imagens no src que o navegador realmente escolheu.
    for (const img of document.querySelectorAll('img')) {
      const current =
        bestSrc(img);

      if (!current) continue;

      img.setAttribute(
        'src',
        current
      );

      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.removeAttribute('data-srcset');
      img.removeAttribute('data-src');
      img.removeAttribute('loading');
    }

    const productTitle =
      String(product?.title || '')
        .trim();

    const normalizedTitle =
      normalize(productTitle);

    let titleElement =
      document.querySelector('h1');

    if (normalizedTitle) {
      const candidates =
        [
          ...document.querySelectorAll(
            'h1,h2,[data-testid*="title" i],[class*="title" i]'
          )
        ];

      const exact =
        candidates.find(element =>
          normalize(element.textContent) === normalizedTitle
        );

      const close =
        candidates.find(element => {
          const text =
            normalize(element.textContent);

          return (
            text.length > 8 &&
            (
              normalizedTitle.includes(text) ||
              text.includes(normalizedTitle)
            )
          );
        });

      titleElement =
        exact ||
        close ||
        titleElement;
    }

    if (titleElement) {
      titleElement.setAttribute(
        'data-pce-product-title',
        '1'
      );
    }

    const productImages =
      Array.isArray(product?.images)
        ? product.images.filter(Boolean)
        : (
            product?.image
              ? [product.image]
              : []
          );

    const images =
      [
        ...document.querySelectorAll('img')
      ];

    let hero =
      null;

    let heroScore =
      -1;

    for (const img of images) {
      const rect =
        img.getBoundingClientRect();

      if (
        rect.width < 45 ||
        rect.height < 45
      ) {
        continue;
      }

      if (
        img.closest('header,nav,footer')
      ) {
        continue;
      }

      const src =
        bestSrc(img);

      let score =
        rect.width * rect.height;

      if (
        productImages.some(
          candidate =>
            sameImage(candidate, src)
        )
      ) {
        score += 1000000000;
      }

      if (
        img.closest(
          'main,[role="main"]'
        )
      ) {
        score += 100000;
      }

      if (
        rect.top < innerHeight * 1.8
      ) {
        score += 50000;
      }

      if (
        score > heroScore
      ) {
        hero =
          img;

        heroScore =
          score;
      }
    }

    if (hero) {
      hero.setAttribute(
        'data-pce-product-hero',
        '1'
      );

      let root =
        hero.parentElement;

      let chosenRoot =
        hero.parentElement;

      for (
        let depth = 0;
        root && depth < 7;
        depth++
      ) {
        const childImages =
          [
            ...root.querySelectorAll('img')
          ].filter(img => {
            const rect =
              img.getBoundingClientRect();

            return (
              rect.width >= 28 &&
              rect.height >= 28
            );
          });

        if (
          childImages.length >= 2 &&
          childImages.length <= 30
        ) {
          chosenRoot =
            root;
        }

        root =
          root.parentElement;
      }

      const thumbs =
        [
          ...chosenRoot.querySelectorAll('img')
        ].filter(
          img =>
            img !== hero
        );

      thumbs.forEach(
        (img, index) => {
          img.setAttribute(
            'data-pce-product-thumb',
            String(index)
          );
        }
      );
    }

    // Para snapshots estáticos, animações de skeleton sem texto não têm utilidade.
    const skeletonSelectors = [
      '[class*="skeleton" i]',
      '[class*="shimmer" i]',
      '[data-testid*="skeleton" i]'
    ];

    const main =
      document.querySelector(
        'main,[role="main"]'
      ) || document.body;

    for (const selector of skeletonSelectors) {
      for (const element of main.querySelectorAll(selector)) {
        const text =
          (element.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();

        if (text.length <= 2) {
          element.setAttribute(
            'data-pce-stale-skeleton',
            '1'
          );

          element.style.setProperty(
            'animation',
            'none',
            'important'
          );
        }
      }
    }
  }, { product, format });
}

async function captureFormat({
  browser,
  url,
  viewport,
  format,
  waitMs,
  dir,
  cleanOverlays
}) {
  const context =
    await browser.newContext({
      viewport,
      serviceWorkers: 'block',
      ignoreHTTPSErrors: false,
      locale: 'pt-BR',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/143.0.0.0 Safari/537.36'
    });

  try {
    await context.route('**/*', async route => {
      const request = route.request();
      const method = request.method().toUpperCase();
      const requestUrl = request.url();

      if (
        requestUrl.startsWith('data:') ||
        requestUrl.startsWith('blob:')
      ) {
        return route.continue();
      }

      if (isObviouslyPrivateUrl(requestUrl)) {
        return route.abort('blockedbyclient');
      }

      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(method)
      ) {
        return route.abort('blockedbyclient');
      }

      if (TRACKERS.test(requestUrl)) {
        return route.abort('blockedbyclient');
      }

      return route.continue();
    });

    const page =
      await context.newPage();

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    try {
      await page.waitForLoadState('networkidle', {
        timeout: 12000
      });
    } catch {}

    if (cleanOverlays) {
      await dismissCommonOverlays(page);
    }

    await autoScroll(page);

    if (waitMs) {
      await page.waitForTimeout(waitMs);
    }

    const finalUrl =
      page.url();

    await assertPublicProductUrl(finalUrl);
    await assertNoSensitivePage(page);

    const product =
      await extractProduct(page);

    const title =
      await page.title();

    // Marca elementos importantes no DOM já hidratado e congela src/srcset reais.
    // Isso evita perder título/galeria quando os scripts originais são removidos.
    await markAndFreezeRenderedProduct(
      page,
      product,
      format
    );

    const html =
      await page.content();

    const sourceScreenshot =
      path.join(dir, `source-${format}.png`);

    try {
      await page.screenshot({
        path: sourceScreenshot,
        fullPage: true,
        animations: 'disabled'
      });
    } catch {
      await page.screenshot({
        path: sourceScreenshot,
        fullPage: false,
        animations: 'disabled'
      });
    }

    const safeHtml =
      makeSafeClone(html, finalUrl);

    await fs.writeFile(
      path.join(dir, `${format}.html`),
      safeHtml,
      'utf8'
    );

    return {
      finalUrl,
      product,
      title,
      sourceScreenshot:
        `/clones/${path.basename(dir)}/source-${format}.png`,
      htmlPath:
        `/clones/${path.basename(dir)}/${format}.html`
    };
  } finally {
    try {
      await context.close();
    } catch {}
  }
}

export async function cloneProductPage({
  url,
  projectName,
  waitMs,
  baseUrl,
  captureAllFormats,
  cloneConfig = {}
}) {
  await assertPublicProductUrl(url);

  const id =
    safeProjectId(
      projectName ||
      new URL(url).hostname
    );

  const dir =
    path.join(projectsRoot, id);

  await fs.mkdir(dir, {
    recursive: true
  });

  const browser =
    await chromium.launch({
      headless: true
    });

  try {
    const formats =
      captureAllFormats
        ? ['desktop', 'tablet', 'mobile']
        : ['desktop'];

    const captures = {};

    for (const format of formats) {
      captures[format] =
        await captureFormat({
          browser,
          url,
          viewport: FORMAT_VIEWPORTS[format],
          format,
          waitMs,
          dir,
          cleanOverlays:
            cloneConfig.cleanOverlays !== false
        });
    }

    if (!captures.tablet) {
      await fs.copyFile(
        path.join(dir, 'desktop.html'),
        path.join(dir, 'tablet.html')
      );

      await fs.copyFile(
        path.join(dir, 'source-desktop.png'),
        path.join(dir, 'source-tablet.png')
      );
    }

    if (!captures.mobile) {
      await fs.copyFile(
        path.join(dir, 'desktop.html'),
        path.join(dir, 'mobile.html')
      );

      await fs.copyFile(
        path.join(dir, 'source-desktop.png'),
        path.join(dir, 'source-mobile.png')
      );
    }

    const primary =
      captures.desktop ||
      captures.tablet ||
      captures.mobile;

    const product =
      primary.product || {};

    const config = {
      sourceUrl:
        primary.finalUrl,

      sourceOrigin:
        new URL(primary.finalUrl).origin,

      sourcePathname:
        new URL(primary.finalUrl).pathname,

      buyUrl:
        cloneConfig.buyUrl || '',

      cleanOverlays:
        cloneConfig.cleanOverlays !== false,

      productTitle:
        product.title || primary.title || '',

      productImages:
        Array.isArray(product.images)
          ? product.images
          : (product.image ? [product.image] : []),

      productPrice:
        product.price || '',

      currency:
        product.currency || '',

      responsiveVariants:
        captureAllFormats !== false,

      features: {
        gallery: true,
        mobileTitleRepair: true,
        accordions: true,
        tabs: true,
        cep: true,
        localCart: true,
        customBuyLink: true,
        missingProductRoute: true,
        responsiveVariants: true
      },

      createdAt:
        new Date().toISOString()
    };

    await fs.writeFile(
      path.join(dir, 'clone-config.json'),
      JSON.stringify(config, null, 2),
      'utf8'
    );

    await fs.writeFile(
      path.join(dir, 'product.json'),
      JSON.stringify(product, null, 2),
      'utf8'
    );

    await fs.writeFile(
      path.join(dir, 'index.html'),
      buildResponsiveLoader(
        captureAllFormats !== false
      ),
      'utf8'
    );

    const meta = {
      id,
      projectName:
        projectName ||
        product.title ||
        primary.title ||
        id,

      title:
        product.title ||
        primary.title ||
        '',

      sourceUrl:
        url,

      finalUrl:
        primary.finalUrl,

      createdAt:
        new Date().toISOString(),

      version:
        '0.4.0',

      formats:
        ['desktop', 'tablet', 'mobile'],

      paths: {
        clone:
          `/clones/${id}/index.html`,

        desktop:
          `/clones/${id}/desktop.html`,

        tablet:
          `/clones/${id}/tablet.html`,

        mobile:
          `/clones/${id}/mobile.html`,

        sourceScreenshot:
          `/clones/${id}/source-desktop.png`,

        sourceDesktop:
          `/clones/${id}/source-desktop.png`,

        sourceTablet:
          `/clones/${id}/source-tablet.png`,

        sourceMobile:
          `/clones/${id}/source-mobile.png`,

        productJson:
          `/clones/${id}/product.json`,

        config:
          `/clones/${id}/clone-config.json`,

        download:
          `/api/projects/${id}/download`
      },

      notes: [
        'A v0.4 corrige o carregamento local de clone-config.json mesmo com <base> apontando para a loja original.',
        'O clone escolhe automaticamente a variante adequada ao tamanho da tela.',
        'Título, imagem principal e miniaturas são marcados no DOM hidratado antes da remoção dos scripts.',
        'Imagens lazy são congeladas no currentSrc real de cada viewport e skeletons antigos são neutralizados.',
        'Links para outros produtos são interceptados e exibem uma página local de produto não encontrado.',
        'CTAs de comprar/avançar/continuar podem ir para a URL definida no painel.',
        'Login, checkout e pagamento da loja original continuam desativados.'
      ]
    };

    await fs.writeFile(
      path.join(dir, 'meta.json'),
      JSON.stringify(meta, null, 2),
      'utf8'
    );

    return {
      ...meta,
      product,
      config
    };
  } catch (err) {
    try {
      await fs.rm(dir, {
        recursive: true,
        force: true
      });
    } catch {}

    throw err;
  } finally {
    try {
      await browser.close();
    } catch {}
  }
}
