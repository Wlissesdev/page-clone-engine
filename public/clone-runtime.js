(async () => {
  const SENSITIVE =
    /(^|\/)(login|signin|sign-in|auth|oauth|checkout|payment|payments|billing|password|verify|verification|wallet|bank|account)(\/|$)/i;

  const CTA_RE =
    /\b(comprar|compre|comprar agora|compre agora|buy now|purchase|avançar|avancar|continuar|prosseguir|finalizar|finalize|ir para compra|ver oferta|quero comprar|seguir para compra)\b/i;

  const CART_RE =
    /\b(adicionar ao carrinho|add to cart|colocar no carrinho)\b/i;

  const CEP_RE =
    /\b(cep|código postal|codigo postal|postal code)\b/i;

  const PRODUCT_LINK_RE =
    /(\/p(?:[/?#]|$)|\/produto(?:[/?#]|$)|\/product(?:[/?#]|$)|[?&](?:idsku|sku|productid|produto)=)/i;

  let config = {};

  // IMPORTANTE:
  // a página clonada possui <base href="URL-ORIGINAL"> para manter CSS/imagens.
  // Portanto './clone-config.json' apontaria para a loja original.
  // Sempre derivamos a raiz LOCAL do projeto a partir de location.pathname.
  const projectRootMatch =
    location.pathname.match(/^(\/clones\/[^/]+\/)/);

  const localProjectRoot =
    projectRootMatch
      ? projectRootMatch[1]
      : location.pathname.replace(/[^/]*$/, '');

  const localConfigUrl =
    localProjectRoot + 'clone-config.json';

  try {
    const response =
      await fetch(localConfigUrl, {
        cache: 'no-store'
      });

    if (response.ok) {
      config =
        await response.json();
    }
  } catch (error) {
    console.warn(
      '[PCE] clone-config.json não carregou:',
      error
    );
  }

  const initialLocalUrl =
    location.href;

  const initialPath =
    location.pathname + location.search + location.hash;

  const toast =
    document.createElement('div');

  toast.id =
    'page-clone-toast';

  document.body.appendChild(toast);

  let toastTimer;

  function showToast(text) {
    clearTimeout(toastTimer);

    toast.textContent =
      text;

    toast.classList.add('show');

    toastTimer =
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2600);
  }

  function normalizedText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function textOf(element) {
    return (
      element?.getAttribute?.('aria-label') ||
      element?.getAttribute?.('title') ||
      element?.textContent ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isVisible(element) {
    if (!element) return false;

    const style =
      getComputedStyle(element);

    const rect =
      element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || '1') > 0.03 &&
      rect.width > 1 &&
      rect.height > 1
    );
  }

  function bestImageSrc(img) {
    if (!img) return '';

    const candidates = [
      img.currentSrc,
      img.src,
      img.getAttribute('data-src'),
      img.getAttribute('data-original'),
      img.getAttribute('data-lazy-src')
    ].filter(Boolean);

    if (candidates.length) {
      return candidates[0];
    }

    const srcset =
      img.getAttribute('srcset') ||
      img.getAttribute('data-srcset') ||
      '';

    if (srcset) {
      return (
        srcset
          .split(',')
          .pop()
          ?.trim()
          .split(/\s+/)[0] ||
        ''
      );
    }

    return '';
  }

  function sameImage(a, b) {
    if (!a || !b) return false;

    try {
      const ua =
        new URL(a, location.href);

      const ub =
        new URL(b, location.href);

      const fileA =
        ua.pathname.split('/').pop()?.split('?')[0] || '';

      const fileB =
        ub.pathname.split('/').pop()?.split('?')[0] || '';

      return (
        ua.href === ub.href ||
        (
          fileA &&
          fileB &&
          fileA === fileB
        )
      );
    } catch {
      return a === b;
    }
  }

  function cleanOverlays() {
    if (config.cleanOverlays === false) return;

    const selectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[class*="modal" i]',
      '[class*="popup" i]',
      '[class*="newsletter" i]',
      '[class*="cookie" i]',
      '[class*="consent" i]',
      '[class*="backdrop" i]',
      '[class*="interstitial" i]',
      '[id*="modal" i]',
      '[id*="popup" i]',
      '[id*="cookie" i]'
    ];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (element.closest('#pce-cep-overlay')) continue;

        const rect =
          element.getBoundingClientRect();

        const style =
          getComputedStyle(element);

        const likelyBlocking =
          style.position === 'fixed' ||
          Number.parseInt(style.zIndex || '0', 10) >= 100;

        const sizeable =
          rect.width > 220 &&
          rect.height > 80;

        if (
          likelyBlocking &&
          sizeable
        ) {
          element.style.setProperty(
            'display',
            'none',
            'important'
          );

          element.style.setProperty(
            'pointer-events',
            'none',
            'important'
          );
        }
      }
    }

    document.documentElement.style.overflow =
      'auto';

    document.body.style.overflow =
      'auto';
  }

  function productImageMatchScore(src) {
    if (!src) return 0;

    const productImages =
      Array.isArray(config.productImages)
        ? config.productImages
        : [];

    for (const productSrc of productImages) {
      if (sameImage(src, productSrc)) {
        return 1000000000;
      }
    }

    return 0;
  }

  function visibleProductImages() {
    return [...document.images]
      .filter(img => {
        if (!isVisible(img)) return false;

        if (
          img.closest('header,nav,footer')
        ) {
          return false;
        }

        const rect =
          img.getBoundingClientRect();

        return (
          rect.width >= 36 &&
          rect.height >= 36
        );
      });
  }

  function findHeroImage() {
    const markedHero =
      document.querySelector(
        '[data-pce-product-hero="1"]'
      );

    if (
      markedHero &&
      markedHero.tagName === 'IMG'
    ) {
      return markedHero;
    }

    const images =
      visibleProductImages();

    let best = null;
    let bestScore = -1;

    for (const img of images) {
      const rect =
        img.getBoundingClientRect();

      const src =
        bestImageSrc(img);

      let score =
        rect.width * rect.height;

      score +=
        productImageMatchScore(src);

      if (
        img.closest('main,[role="main"]')
      ) {
        score += 100000;
      }

      if (
        rect.top < innerHeight * 1.8
      ) {
        score += 50000;
      }

      if (
        score > bestScore
      ) {
        best = img;
        bestScore = score;
      }
    }

    return best;
  }

  function findGalleryRoot(hero) {
    if (!hero) return null;

    let current =
      hero.parentElement;

    let fallback =
      hero.parentElement;

    for (let depth = 0; current && depth < 7; depth++) {
      const images =
        [...current.querySelectorAll('img')]
          .filter(img => {
            const rect =
              img.getBoundingClientRect();

            return (
              rect.width >= 28 &&
              rect.height >= 28
            );
          });

      if (
        images.length >= 2 &&
        images.length <= 24
      ) {
        fallback = current;

        if (
          current.matches(
            '[class*="gallery" i],[class*="image" i],[class*="media" i],[class*="photo" i],[data-testid*="gallery" i]'
          )
        ) {
          return current;
        }
      }

      current =
        current.parentElement;
    }

    return fallback;
  }

  function setHeroSource(hero, source) {
    if (!hero || !source) return;

    hero.removeAttribute('srcset');
    hero.removeAttribute('sizes');
    hero.removeAttribute('data-srcset');

    hero.src =
      source;

    const picture =
      hero.closest('picture');

    if (picture) {
      picture
        .querySelectorAll('source')
        .forEach(sourceEl => {
          sourceEl.removeAttribute('srcset');
          sourceEl.removeAttribute('data-srcset');
        });
    }
  }

  function enhanceGallery() {
    const hero =
      findHeroImage();

    if (!hero) return;

    const root =
      findGalleryRoot(hero);

    const candidates =
      root
        ? [...root.querySelectorAll('img')]
        : visibleProductImages();

    const thumbnails =
      candidates.filter(img => {
        if (img === hero) return false;

        const source =
          bestImageSrc(img);

        if (!source) return false;

        const rect =
          img.getBoundingClientRect();

        const heroRect =
          hero.getBoundingClientRect();

        const plausibleSize =
          rect.width <= Math.max(360, heroRect.width * 0.82) &&
          rect.height <= Math.max(360, heroRect.height * 0.82);

        const near =
          Math.abs(
            (rect.top + scrollY) -
            (heroRect.top + scrollY)
          ) < Math.max(1300, heroRect.height * 2.2);

        return plausibleSize && near;
      });

    const unique =
      [];

    for (const img of thumbnails) {
      const source =
        bestImageSrc(img);

      if (
        !unique.some(
          existing =>
            sameImage(
              bestImageSrc(existing),
              source
            )
        )
      ) {
        unique.push(img);
      }
    }

    for (const img of unique) {
      if (img.dataset.pceGalleryBound === '1') continue;

      img.dataset.pceGalleryBound =
        '1';

      img.classList.add(
        'pce-gallery-clickable'
      );

      const clickable =
        img.closest(
          'button,a,[role="button"]'
        ) || img;

      clickable.addEventListener(
        'click',
        event => {
          event.preventDefault();
          event.stopPropagation();

          const source =
            bestImageSrc(img);

          setHeroSource(
            hero,
            source
          );

          showToast(
            'Imagem alterada'
          );
        },
        true
      );
    }

    const extracted =
      Array.isArray(config.productImages)
        ? config.productImages.filter(Boolean)
        : [];

    if (
      unique.length < 2 &&
      extracted.length > 1 &&
      !document.getElementById('pce-fallback-gallery')
    ) {
      const fallback =
        document.createElement('div');

      fallback.id =
        'pce-fallback-gallery';

      for (const source of extracted.slice(0, 12)) {
        const button =
          document.createElement('button');

        button.type =
          'button';

        const img =
          document.createElement('img');

        img.src =
          source;

        img.alt =
          '';

        button.appendChild(img);

        button.addEventListener(
          'click',
          event => {
            event.preventDefault();
            event.stopPropagation();

            setHeroSource(
              hero,
              source
            );
          }
        );

        fallback.appendChild(button);
      }

      const host =
        root || hero.parentElement;

      host.appendChild(fallback);
    }

    const buttonCandidates =
      root
        ? [...root.querySelectorAll('button,[role="button"]')]
        : [...document.querySelectorAll('button,[role="button"]')];

    const nextButtons =
      buttonCandidates.filter(button =>
        /próxim|proxim|next|seguinte/i.test(
          textOf(button)
        )
      );

    const previousButtons =
      buttonCandidates.filter(button =>
        /anter|prev/i.test(
          textOf(button)
        )
      );

    const sources =
      [
        bestImageSrc(hero),
        ...unique.map(bestImageSrc),
        ...extracted
      ]
        .filter(Boolean)
        .filter(
          (src, index, array) =>
            array.findIndex(
              candidate =>
                sameImage(candidate, src)
            ) === index
        );

    let currentIndex =
      0;

    const cycle =
      direction => {
        if (sources.length < 2) return;

        currentIndex =
          (
            currentIndex +
            direction +
            sources.length
          ) % sources.length;

        setHeroSource(
          hero,
          sources[currentIndex]
        );
      };

    nextButtons.forEach(button => {
      if (button.dataset.pceNextBound === '1') return;

      button.dataset.pceNextBound =
        '1';

      button.addEventListener(
        'click',
        event => {
          event.preventDefault();
          event.stopPropagation();
          cycle(1);
        },
        true
      );
    });

    previousButtons.forEach(button => {
      if (button.dataset.pcePrevBound === '1') return;

      button.dataset.pcePrevBound =
        '1';

      button.addEventListener(
        'click',
        event => {
          event.preventDefault();
          event.stopPropagation();
          cycle(-1);
        },
        true
      );
    });
  }

  function removeStaleLoadingSkeletons() {
    const selectors = [
      '[class*="skeleton" i]',
      '[class*="shimmer" i]',
      '[class*="placeholder" i]',
      '[class*="loading" i]',
      '[data-testid*="skeleton" i]',
      '[data-testid*="loading" i]'
    ];

    const main =
      document.querySelector(
        'main,[role="main"]'
      ) || document.body;

    for (const selector of selectors) {
      for (const element of main.querySelectorAll(selector)) {
        if (
          element.closest('#pce-cep-overlay') ||
          element.closest('#pce-fallback-gallery')
        ) {
          continue;
        }

        const text =
          (element.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();

        const rect =
          element.getBoundingClientRect();

        // Só remove placeholders visuais sem conteúdo real.
        if (
          text.length <= 2 &&
          rect.width > 20 &&
          rect.height > 4
        ) {
          element.style.setProperty(
            'animation',
            'none',
            'important'
          );

          element.style.setProperty(
            'display',
            'none',
            'important'
          );
        }
      }
    }
  }

  function repairProductTitle() {
    const title =
      String(config.productTitle || '').trim();

    if (!title) return;

    const capturedTitle =
      document.querySelector(
        '[data-pce-product-title="1"]'
      );

    if (capturedTitle) {
      capturedTitle.classList.add(
        'pce-force-title'
      );

      capturedTitle.style.setProperty(
        'display',
        'block',
        'important'
      );

      capturedTitle.style.setProperty(
        'visibility',
        'visible',
        'important'
      );

      capturedTitle.style.setProperty(
        'opacity',
        '1',
        'important'
      );

      removeStaleLoadingSkeletons();

      if (isVisible(capturedTitle)) {
        return;
      }
    }

    const normalized =
      normalizedText(title);

    const matching =
      [...document.querySelectorAll('h1,h2,[data-testid*="title" i],[class*="title" i]')]
        .filter(element => {
          const text =
            normalizedText(
              element.textContent
            );

          return (
            text === normalized ||
            (
              text.length > 8 &&
              normalized.includes(text)
            ) ||
            (
              normalized.length > 8 &&
              text.includes(normalized)
            )
          );
        });

    if (
      matching.some(isVisible)
    ) {
      return;
    }

    const hidden =
      matching[0];

    if (hidden) {
      const clone =
        hidden.cloneNode(true);

      clone.removeAttribute('id');

      clone.classList.add(
        'pce-force-title'
      );

      clone.id =
        'pce-mobile-title';

      const anchor =
        findProductInfoAnchor();

      if (anchor) {
        anchor.parentElement.insertBefore(
          clone,
          anchor
        );
      } else {
        const main =
          document.querySelector(
            'main,[role="main"]'
          ) || document.body;

        main.insertBefore(
          clone,
          main.firstChild
        );
      }

      return;
    }

    const fallback =
      document.createElement('h1');

    fallback.id =
      'pce-mobile-title';

    fallback.textContent =
      title;

    const anchor =
      findProductInfoAnchor();

    if (anchor) {
      anchor.parentElement.insertBefore(
        fallback,
        anchor
      );
    } else {
      const main =
        document.querySelector(
          'main,[role="main"]'
        ) || document.body;

      main.insertBefore(
        fallback,
        main.firstChild
      );
    }
  }

  function findProductInfoAnchor() {
    const pricePattern =
      /(?:R\$|\$|€|£)\s*\d/i;

    const candidates =
      [...document.querySelectorAll('main *')]
        .filter(element => {
          if (element.children.length > 4) return false;
          if (!isVisible(element)) return false;

          const text =
            (element.textContent || '')
              .replace(/\s+/g, ' ')
              .trim();

          return (
            text.length < 90 &&
            pricePattern.test(text)
          );
        });

    if (candidates.length) {
      return candidates[0];
    }

    const hero =
      findHeroImage();

    return (
      findGalleryRoot(hero) ||
      hero
    );
  }

  function enhanceTabsAndAccordions() {
    document
      .querySelectorAll(
        '[role="tab"][aria-controls]'
      )
      .forEach(tab => {
        if (tab.dataset.pceTabBound === '1') return;

        tab.dataset.pceTabBound =
          '1';

        tab.addEventListener(
          'click',
          event => {
            const target =
              document.getElementById(
                tab.getAttribute('aria-controls')
              );

            if (!target) return;

            event.preventDefault();

            const list =
              tab.closest('[role="tablist"]') ||
              tab.parentElement ||
              document;

            list
              .querySelectorAll('[role="tab"]')
              .forEach(item => {
                item.setAttribute(
                  'aria-selected',
                  String(item === tab)
                );
              });

            const scope =
              target.parentElement ||
              document;

            scope
              .querySelectorAll('[role="tabpanel"]')
              .forEach(panel => {
                panel.hidden =
                  panel !== target;

                panel.style.display =
                  panel === target
                    ? ''
                    : 'none';
              });

            target.hidden =
              false;

            target.style.display =
              '';
          },
          true
        );
      });

    document
      .querySelectorAll(
        '[aria-expanded][aria-controls]'
      )
      .forEach(control => {
        if (
          control.getAttribute('role') === 'tab' ||
          control.dataset.pceAccordionBound === '1'
        ) {
          return;
        }

        control.dataset.pceAccordionBound =
          '1';

        control.addEventListener(
          'click',
          event => {
            const target =
              document.getElementById(
                control.getAttribute('aria-controls')
              );

            if (!target) return;

            event.preventDefault();

            const expanded =
              control.getAttribute('aria-expanded') === 'true';

            control.setAttribute(
              'aria-expanded',
              String(!expanded)
            );

            target.hidden =
              expanded;

            target.style.display =
              expanded
                ? 'none'
                : '';
          },
          true
        );
      });
  }

  function buildCepModal() {
    const overlay =
      document.createElement('div');

    overlay.id =
      'pce-cep-overlay';

    overlay.innerHTML = `
      <div id="pce-cep-card">
        <h3>Informe seu CEP</h3>
        <p>O CEP fica salvo apenas neste clone local.</p>
        <input id="pce-cep-input" inputmode="numeric" maxlength="9" placeholder="00000-000">
        <div id="pce-cep-actions">
          <button id="pce-cep-cancel">Cancelar</button>
          <button id="pce-cep-apply">Aplicar CEP</button>
        </div>
        <div id="pce-cep-status"></div>
      </div>
    `;

    document.body.appendChild(
      overlay
    );

    const input =
      overlay.querySelector('#pce-cep-input');

    const status =
      overlay.querySelector('#pce-cep-status');

    const saved =
      localStorage.getItem('pce_cep') || '';

    if (saved) {
      input.value =
        saved;
    }

    input.addEventListener(
      'input',
      () => {
        const digits =
          input.value
            .replace(/\D/g, '')
            .slice(0, 8);

        input.value =
          digits.length > 5
            ? (
                digits.slice(0, 5) +
                '-' +
                digits.slice(5)
              )
            : digits;
      }
    );

    function close() {
      overlay.classList.remove('show');
    }

    overlay
      .querySelector('#pce-cep-cancel')
      .onclick =
        close;

    overlay.addEventListener(
      'click',
      event => {
        if (event.target === overlay) {
          close();
        }
      }
    );

    overlay
      .querySelector('#pce-cep-apply')
      .onclick =
        async () => {
          const cep =
            input.value
              .replace(/\D/g, '');

          if (cep.length !== 8) {
            status.textContent =
              'Digite um CEP com 8 números.';
            return;
          }

          status.textContent =
            'Consultando CEP...';

          let label =
            input.value;

          try {
            const response =
              await fetch(
                `https://viacep.com.br/ws/${cep}/json/`
              );

            const data =
              await response.json();

            if (!data.erro) {
              label =
                `${input.value} • ${data.localidade || ''}${data.uf ? '/' + data.uf : ''}`;

              status.textContent =
                `${data.logradouro || ''}${data.bairro ? ' • ' + data.bairro : ''}`;
            } else {
              status.textContent =
                'CEP salvo.';
            }
          } catch {
            status.textContent =
              'CEP salvo localmente.';
          }

          localStorage.setItem(
            'pce_cep',
            input.value
          );

          localStorage.setItem(
            'pce_cep_label',
            label
          );

          updateCepLabels(
            label
          );

          showToast(
            'CEP aplicado: ' + label
          );

          setTimeout(
            close,
            700
          );
        };

    input.addEventListener(
      'keydown',
      event => {
        if (event.key === 'Enter') {
          overlay
            .querySelector('#pce-cep-apply')
            .click();
        }
      }
    );

    return {
      open() {
        overlay.classList.add('show');

        setTimeout(
          () => input.focus(),
          40
        );
      }
    };
  }

  function updateCepLabels(label) {
    for (
      const node of
      document.querySelectorAll(
        'button,a,[role="button"],span,div,label'
      )
    ) {
      if (
        node.closest('#pce-cep-overlay')
      ) {
        continue;
      }

      if (
        node.children.length > 4
      ) {
        continue;
      }

      const text =
        (node.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();

      if (
        /informe seu cep|digite seu cep|cep:/i.test(text) &&
        text.length < 100
      ) {
        node.textContent =
          label;
      }
    }
  }

  function enhanceCep() {
    const modal =
      buildCepModal();

    const savedLabel =
      localStorage.getItem('pce_cep_label');

    if (savedLabel) {
      updateCepLabels(
        savedLabel
      );
    }

    document.addEventListener(
      'click',
      event => {
        const clickable =
          event.target.closest(
            'button,a,[role="button"],label,div,span'
          );

        if (
          !clickable ||
          clickable.closest('#pce-cep-overlay')
        ) {
          return;
        }

        const text =
          textOf(clickable);

        if (
          /informe seu cep|digite seu cep|calcular frete|alterar cep|mudar cep/i.test(text) &&
          text.length < 120
        ) {
          event.preventDefault();
          event.stopPropagation();

          modal.open();
        }
      },
      true
    );
  }

  function showMissingProduct(destination) {
    const main =
      document.querySelector(
        'main,[role="main"]'
      );

    if (!main) {
      showToast(
        'Produto não encontrado'
      );
      return;
    }

    main.innerHTML = `
      <section id="pce-notfound">
        <h1>Produto não encontrado.</h1>
        <h2>Não conseguimos localizar esse item.</h2>
        <ul>
          <li>Confira se o endereço do produto está correto.</li>
          <li>Use a busca da loja para procurar outro item.</li>
          <li>Você também pode navegar pelas categorias disponíveis.</li>
        </ul>

        <div class="pce-help">
          <div>
            <strong>Precisa de ajuda?</strong>
            <p>Volte para o produto principal ou utilize a navegação da página.</p>
          </div>

          <div>
            <strong>Produto solicitado</strong>
            <p>${escapeHtml(destination.pathname)}</p>
          </div>

          <div>
            <strong>O clone continua local</strong>
            <p>Login e checkout da loja original permanecem desativados.</p>
          </div>
        </div>
      </section>
    `;

    const clonePrefixMatch =
      location.pathname.match(
        /^(\/clones\/[^/]+)/
      );

    const clonePrefix =
      clonePrefixMatch
        ? clonePrefixMatch[1]
        : '';

    const fakePath =
      `${clonePrefix}${destination.pathname}${destination.search}`;

    try {
      history.pushState(
        {
          pceMissingProduct: true
        },
        '',
        fakePath
      );
    } catch {}

    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(
        /[&<>"']/g,
        char => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[char])
      );
  }

  function isOtherProductLink(destination) {
    if (!destination) return false;

    if (
      destination.origin !== config.sourceOrigin
    ) {
      return false;
    }

    if (
      destination.pathname === config.sourcePathname
    ) {
      return false;
    }

    if (
      PRODUCT_LINK_RE.test(
        destination.pathname + destination.search
      )
    ) {
      return true;
    }

    return false;
  }

  function enhanceMainActions() {
    document.addEventListener(
      'submit',
      event => {
        event.preventDefault();

        showToast(
          'Envio do formulário original foi desativado no clone.'
        );
      },
      true
    );

    document.addEventListener(
      'click',
      event => {
        const control =
          event.target.closest(
            'a,button,[role="button"],input[type="button"],input[type="submit"]'
          );

        if (!control) return;

        const text =
          textOf(control);

        if (
          CTA_RE.test(text) &&
          config.buyUrl
        ) {
          event.preventDefault();
          event.stopPropagation();

          location.href =
            config.buyUrl;

          return;
        }

        if (
          CART_RE.test(text)
        ) {
          event.preventDefault();
          event.stopPropagation();

          const count =
            Number(
              localStorage.getItem(
                'pce_cart_count'
              ) || '0'
            ) + 1;

          localStorage.setItem(
            'pce_cart_count',
            String(count)
          );

          showToast(
            `Adicionado ao carrinho local (${count})`
          );

          return;
        }

        if (
          control.tagName === 'A' &&
          control.href
        ) {
          let destination;

          try {
            destination =
              new URL(
                control.href,
                config.sourceUrl ||
                location.href
              );
          } catch {
            return;
          }

          if (
            !['http:', 'https:'].includes(
              destination.protocol
            )
          ) {
            return;
          }

          if (
            SENSITIVE.test(
              destination.pathname
            )
          ) {
            event.preventDefault();
            event.stopPropagation();

            if (config.buyUrl) {
              location.href =
                config.buyUrl;
            } else {
              showToast(
                'Login/checkout da loja original fica bloqueado no clone.'
              );
            }

            return;
          }

          if (
            isOtherProductLink(destination)
          ) {
            event.preventDefault();
            event.stopPropagation();

            showMissingProduct(
              destination
            );

            return;
          }

          if (
            destination.origin !== location.origin
          ) {
            control.target =
              '_blank';

            control.rel =
              'noopener noreferrer';
          }
        }
      },
      true
    );
  }

  function ensureResponsiveVariant() {
    const currentFile =
      location.pathname
        .split('/')
        .pop()
        ?.split('?')[0] || '';

    const expected =
      innerWidth <= 600
        ? 'mobile.html'
        : (
            innerWidth <= 1024
              ? 'tablet.html'
              : 'desktop.html'
          );

    if (
      ['desktop.html', 'tablet.html', 'mobile.html']
        .includes(currentFile) &&
      expected !== currentFile
    ) {
      const base =
        location.pathname
          .replace(
            /[^/]+$/,
            expected
          );

      location.replace(
        base +
        location.search +
        location.hash
      );

      return true;
    }

    return false;
  }

  let resizeTimer;

  window.addEventListener(
    'resize',
    () => {
      clearTimeout(resizeTimer);

      resizeTimer =
        setTimeout(
          ensureResponsiveVariant,
          250
        );
    }
  );

  window.addEventListener(
    'popstate',
    event => {
      if (
        !event.state?.pceMissingProduct
      ) {
        location.href =
          initialLocalUrl;
      }
    }
  );

  // Se alguém abrir desktop.html diretamente no celular, corrige já no primeiro paint.
  if (ensureResponsiveVariant()) {
    return;
  }

  cleanOverlays();
  removeStaleLoadingSkeletons();
  repairProductTitle();
  enhanceTabsAndAccordions();
  enhanceGallery();
  enhanceCep();
  enhanceMainActions();

  setTimeout(
    () => {
      cleanOverlays();
      removeStaleLoadingSkeletons();
      repairProductTitle();
      enhanceGallery();
    },
    900
  );
})();
