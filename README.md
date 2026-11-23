<div align="center">

# Page Clone Engine

**Capture páginas públicas de produto e reconstrua clones responsivos e interativos — 100% locais.**

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.57-2EAD33?logo=playwright&logoColor=white)
![Cheerio](https://img.shields.io/badge/Cheerio-1.x-E88C1C)
![Archiver](https://img.shields.io/badge/Archiver-7-4B5563)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](./LICENSE)

</div>

---

## 📖 Sobre

O **Page Clone Engine** é um estúdio local de snapshots de páginas de produto. Informe a URL pública de um produto e a ferramenta abre a página em um navegador headless (Chromium via Playwright), captura o HTML já renderizado em **desktop, tablet e celular**, extrai os dados do produto e monta um clone navegável que roda inteiramente na sua máquina — sem depender do site de origem.

O projeto resolve um problema comum de quem precisa demonstrar, testar ou estudar páginas de e-commerce: como obter uma cópia fiel e interativa de uma página que depende de JavaScript, lazy-loading e chamadas de rede, sem quebrar imagens, fontes e layout, e sem expor áreas sensíveis da loja (login, conta, checkout e pagamento).

A versão **v0.4** corrige um bug central da v0.3. Como as páginas clonadas usam `<base href="URL-DA-LOJA">` para manter CSS, imagens e fontes relativas funcionando, um `fetch('./clone-config.json')` acabava buscando o arquivo no site original em vez de `127.0.0.1`. Como consequência, título, imagens, fallback de galeria, reparo de título mobile e link de compra podiam se perder. Agora o runtime deriva a raiz **local** do projeto a partir de `location.pathname`.

É uma ferramenta para desenvolvedores, designers e profissionais de marketing/QA que queiram montar protótipos ou demonstrações de páginas de produto de forma isolada e segura.

## ✨ Funcionalidades

- **Captura em três formatos**: `desktop` (1440×1000), `tablet` (820×1180) e `mobile` (390×844), com opção de capturar somente desktop.
- **Autoscroll automático** para disparar conteúdo lazy antes do snapshot, com espera configurável (0,8 s a 5 s).
- **Remoção de pop-ups comuns**: modais, cookies, newsletter, consent, interstitials e backdrops.
- **Extração de dados do produto** via JSON-LD, Open Graph e microdados: título, descrição, marca, SKU, GTIN, imagens (até 40), preço, moeda, disponibilidade, vendedor, avaliação, contagem de reviews, pedidos e categoria.
- **Sanitização do HTML**: remove `script`, `iframe`, `object`, `embed`, handlers inline (`on*`), inputs de senha/cartão, meta de CSP e ações de formulário; injeta um runtime próprio.
- **Segurança de rede**: bloqueia endereços locais/privados, resolve DNS antes de acessar, aceita apenas `GET/HEAD/OPTIONS`, bloqueia rastreadores conhecidos e recusa páginas de login/conta/checkout/pagamento.
- **Galeria interativa reconstruída**: marcação de imagem principal e miniaturas no DOM hidratado, congelamento de `img.currentSrc` (fim do `<base>`), troca de imagem, botões anterior/próximo e galeria de fallback quando poucas imagens são detectadas.
- **Reparo de título mobile**: garante a exibição do título em viewports pequenas, recriando-o a partir das marcações capturadas quando necessário.
- **Tabs e accordions** habilitados localmente via `aria-controls`.
- **Modal de CEP** com consulta ao ViaCEP (quando online) e persistência em `localStorage`.
- **Carrinho local** (contador em `localStorage`) e **link de Comprar/Avançar configurável**, alterável depois sem refazer o clone.
- **Rota de produto não encontrado**: links para outros produtos da mesma loja são interceptados e exibem uma página local dedicada.
- **Seletor de variante responsiva**: `index.html` redireciona para a versão adequada ao tamanho da tela, inclusive no primeiro carregamento.
- **Biblioteca de projetos** com listagem, detalhes, visualização lado a lado (original × clone) e exclusão.
- **Exportação em ZIP** de qualquer projeto clonado.

## 🛠️ Tecnologias

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-Chromium-2EAD33?logo=playwright&logoColor=white)
![Cheerio](https://img.shields.io/badge/Cheerio-1.x-E88C1C)
![Archiver](https://img.shields.io/badge/Archiver-7-4B5563)
![JavaScript ESM](https://img.shields.io/badge/JavaScript-ESM-F7DF1E?logo=javascript&logoColor=black)

## 📁 Estrutura do projeto

```
page-clone-engine-v4/
├── server.js                        # Servidor Express + API REST
├── src/
│   ├── cloneEngine.js               # Captura Playwright + sanitização + runtime
│   ├── extractor.js                 # Extração de dados do produto
│   ├── security.js                  # Validação de URL/DNS e páginas sensíveis
│   └── storage.js                   # Leitura/escrita dos projetos em disco
├── public/
│   ├── index.html                   # Painel do usuário
│   ├── app.js                       # Lógica do painel (clona, lista, exporta)
│   ├── styles.css                   # Estilos do painel
│   ├── clone-runtime.css            # Estilos injetados nos clones
│   └── clone-runtime.js             # Runtime interativo dos clones
├── data/projects/                   # Clones gerados (meta.json, *.html, PNGs, ZIP)
├── start.bat                        # Sobe o servidor e abre o navegador
├── atualizar_page_clone_engine_v4.py  # Script de atualização de instalações v3
└── package.json
```

Cada clone é gravado em `data/projects/<id>/` com `meta.json`, `product.json`, `clone-config.json`, `index.html`, `desktop.html`/`tablet.html`/`mobile.html`, screenshots `source-*.png` e o `export.zip` gerado sob demanda.

## 🚀 Como rodar localmente

Requer **Node.js ≥ 22**.

```bash
# 1. Instale as dependências
npm install

# 2. Baixe o navegador usado na captura
npx playwright install chromium

# 3. Inicie o servidor
npm start
```

Depois acesse **http://127.0.0.1:4317**.

No Windows também é possível dar duplo clique em `start.bat`, que inicia o servidor e abre o navegador automaticamente.

## ⚙️ Configuração

O servidor lê as seguintes variáveis de ambiente (todas opcionais):

| Variável | Descrição |
| --- | --- |
| `PORT` | Porta HTTP do servidor (padrão `4317`) |
| `HOST` | Endereço de escuta (padrão `127.0.0.1`) |

Parâmetros por captura são enviados pela própria interface: URL do produto, nome do projeto, espera extra, link do botão Comprar, remoção de pop-ups e captura dos três formatos.

## 📄 Licença

Distribuído sob a **Licença MIT**. Veja [`LICENSE`](./LICENSE).
