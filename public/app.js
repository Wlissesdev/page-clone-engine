const $ = selector =>
  document.querySelector(selector);

const $$ = selector =>
  [...document.querySelectorAll(selector)];

let projects = [];
let currentResult = null;
let currentDevice = 'desktop';

function showView(name) {
  $$('.nav').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.view === name
    );
  });

  $$('.view').forEach(view => {
    view.classList.remove('active');
  });

  $('#' + name + 'View').classList.add('active');

  if (name === 'projects') {
    loadProjects();
  }
}

$$('.nav').forEach(button => {
  button.addEventListener(
    'click',
    () => showView(button.dataset.view)
  );
});

function esc(value = '') {
  return String(value).replace(
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

function value(v) {
  if (
    v === null ||
    v === undefined ||
    v === ''
  ) {
    return '—';
  }

  if (typeof v === 'object') {
    return JSON.stringify(v);
  }

  return String(v);
}

function sourcePathFor(device) {
  const paths =
    currentResult?.paths || {};

  if (device === 'mobile') {
    return paths.sourceMobile || paths.sourceScreenshot;
  }

  if (device === 'tablet') {
    return paths.sourceTablet || paths.sourceScreenshot;
  }

  return paths.sourceDesktop || paths.sourceScreenshot;
}

function clonePathFor(device) {
  const paths =
    currentResult?.paths || {};

  if (device === 'mobile') {
    return paths.mobile || paths.clone;
  }

  if (device === 'tablet') {
    return paths.tablet || paths.clone;
  }

  return paths.desktop || paths.clone;
}

function updateDevicePreview(device) {
  currentDevice =
    device;

  $$('.device-switch button').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.device === device
    );
  });

  const source =
    $('#sourcePreview');

  const frame =
    $('#cloneFrame');

  if (source) {
    source.src =
      sourcePathFor(device) +
      '?t=' +
      Date.now();
  }

  if (frame) {
    frame.src =
      clonePathFor(device) +
      '?t=' +
      Date.now();
  }
}

function renderResult(project) {
  currentResult =
    project;

  currentDevice =
    'desktop';

  const product =
    project.product || {};

  const buyUrl =
    project.config?.buyUrl || '';

  $('#result').classList.remove('hidden');

  $('#result').innerHTML = `
    <div class="card result-card">
      <div class="result-head">
        <div>
          <span class="eyebrow">CAPTURA CONCLUÍDA</span>

          <h2>${esc(project.projectName)}</h2>

          <p>${esc(project.finalUrl)}</p>
        </div>

        <div class="actions">
          <a
            class="ghost"
            href="${esc(project.paths.clone)}"
            target="_blank"
            style="text-decoration:none"
          >
            Abrir responsivo
          </a>

          <a
            class="primary"
            href="${esc(project.paths.download)}"
            style="text-decoration:none"
          >
            Baixar ZIP
          </a>
        </div>
      </div>

      <div class="runtime-editor">
        <label>Link de Comprar / Avançar deste clone</label>

        <input
          id="projectBuyUrl"
          type="text"
          value="${esc(buyUrl)}"
          placeholder="meusite.com/produto"
        >

        <button
          class="primary"
          id="saveBuyUrl"
        >
          Salvar link
        </button>

        <small>
          O endereço pode ser alterado depois sem refazer o clone.
        </small>
      </div>

      <div class="device-switch">
        <button class="active" data-device="desktop">Desktop</button>
        <button data-device="tablet">Tablet</button>
        <button data-device="mobile">Celular</button>
      </div>

      <div class="compare">
        <div class="preview-panel">
          <div class="preview-title">
            <span>ORIGINAL RENDERIZADO</span>
            <span id="sourceDeviceLabel">Desktop</span>
          </div>

          <div class="preview-scroll">
            <img
              id="sourcePreview"
              src="${esc(sourcePathFor('desktop'))}?t=${Date.now()}"
              alt=""
            >
          </div>
        </div>

        <div class="preview-panel">
          <div class="preview-title">
            <span>CLONE INTERATIVO</span>
            <span>Galeria • título • CEP • CTA</span>
          </div>

          <div class="preview-scroll">
            <iframe
              id="cloneFrame"
              src="${esc(clonePathFor('desktop'))}?t=${Date.now()}"
            ></iframe>
          </div>
        </div>
      </div>

      <div class="data-grid">
        <div class="stat">
          <span>PRODUTO</span>
          <b title="${esc(value(product.title))}">
            ${esc(value(product.title))}
          </b>
        </div>

        <div class="stat">
          <span>PREÇO</span>
          <b>
            ${esc(value(product.currency))}
            ${esc(value(product.price))}
          </b>
        </div>

        <div class="stat">
          <span>MARCA</span>
          <b>${esc(value(product.brand))}</b>
        </div>

        <div class="stat">
          <span>IMAGENS EXTRAÍDAS</span>
          <b>
            ${Array.isArray(product.images) ? product.images.length : 0}
          </b>
        </div>
      </div>

      <pre class="json">${esc(JSON.stringify(product, null, 2))}</pre>
    </div>
  `;

  $$('.device-switch button').forEach(button => {
    button.addEventListener(
      'click',
      () => updateDevicePreview(button.dataset.device)
    );
  });

  $('#saveBuyUrl').onclick =
    async () => {
      const button =
        $('#saveBuyUrl');

      button.disabled =
        true;

      button.textContent =
        'Salvando...';

      try {
        const response =
          await fetch(
            `/api/projects/${encodeURIComponent(project.id)}/config`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                buyUrl:
                  $('#projectBuyUrl').value.trim()
              })
            }
          );

        const body =
          await response.json();

        if (!response.ok) {
          throw new Error(
            body.error ||
            'Falha ao salvar.'
          );
        }

        currentResult.config =
          body.config;

        button.textContent =
          'Salvo ✓';

        updateDevicePreview(
          currentDevice
        );

        setTimeout(
          () => {
            button.textContent =
              'Salvar link';

            button.disabled =
              false;
          },
          900
        );
      } catch (error) {
        alert(error.message);

        button.textContent =
          'Salvar link';

        button.disabled =
          false;
      }
    };

  $('#result').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

async function cloneNow() {
  const url =
    $('#url').value.trim();

  const error =
    $('#error');

  error.classList.add('hidden');

  if (!url) {
    error.textContent =
      'Cole uma URL pública de produto.';

    error.classList.remove('hidden');
    return;
  }

  $('#cloneBtn').disabled =
    true;

  $('#cloneBtn').textContent =
    'Clonando...';

  $('#progress').classList.remove('hidden');
  $('#result').classList.add('hidden');

  try {
    const response =
      await fetch('/api/clone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          projectName:
            $('#projectName').value.trim(),

          waitMs:
            Number($('#waitMs').value),

          buyUrl:
            $('#buyUrl').value.trim(),

          cleanOverlays:
            $('#cleanOverlays').checked,

          captureAllFormats:
            $('#captureAllFormats').checked
        })
      });

    const body =
      await response.json();

    if (!response.ok) {
      throw new Error(
        body.error ||
        'Falha ao clonar.'
      );
    }

    renderResult(body);

    await loadProjects(false);
  } catch (errorObject) {
    error.textContent =
      errorObject.message;

    error.classList.remove('hidden');
  } finally {
    $('#cloneBtn').disabled =
      false;

    $('#cloneBtn').textContent =
      'Analisar e clonar';

    $('#progress').classList.add('hidden');
  }
}

$('#cloneBtn').addEventListener(
  'click',
  cloneNow
);

$('#url').addEventListener(
  'keydown',
  event => {
    if (event.key === 'Enter') {
      cloneNow();
    }
  }
);

async function loadProjects(render = true) {
  try {
    const response =
      await fetch('/api/projects');

    projects =
      await response.json();

    $('#projectCount').textContent =
      projects.length;

    if (!render) return;

    const grid =
      $('#projectsGrid');

    if (!projects.length) {
      grid.innerHTML =
        '<div class="card" style="color:#87919e">Nenhum projeto ainda.</div>';

      return;
    }

    grid.innerHTML =
      projects
        .map(project => `
          <article class="project">
            <img
              src="${esc(project.paths?.sourceDesktop || project.paths?.sourceScreenshot || '')}"
              alt=""
            >

            <div class="project-body">
              <h3>${esc(project.projectName)}</h3>

              <p>${esc(project.finalUrl)}</p>

              <div class="project-actions">
                <button data-open="${esc(project.id)}">
                  Detalhes
                </button>

                <a
                  href="${esc(project.paths?.clone || '#')}"
                  target="_blank"
                >
                  Clone
                </a>

                <button data-delete="${esc(project.id)}">
                  Excluir
                </button>
              </div>
            </div>
          </article>
        `)
        .join('');

    $$('[data-open]').forEach(button => {
      button.onclick =
        () => openProject(button.dataset.open);
    });

    $$('[data-delete]').forEach(button => {
      button.onclick =
        () => removeProject(button.dataset.delete);
    });
  } catch (error) {
    $('#projectsGrid').innerHTML =
      `<div class="error">${esc(error.message)}</div>`;
  }
}

async function openProject(id) {
  const response =
    await fetch(
      '/api/projects/' +
      encodeURIComponent(id)
    );

  const body =
    await response.json();

  if (!response.ok) {
    alert(
      body.error ||
      'Projeto não encontrado.'
    );
    return;
  }

  showView('new');
  renderResult(body);
}

async function removeProject(id) {
  if (
    !confirm(
      'Excluir este clone local?'
    )
  ) {
    return;
  }

  await fetch(
    '/api/projects/' +
    encodeURIComponent(id),
    {
      method: 'DELETE'
    }
  );

  loadProjects();
}

$('#refreshBtn').addEventListener(
  'click',
  () => loadProjects()
);

loadProjects(false);
