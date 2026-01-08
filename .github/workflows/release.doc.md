# release.yml

## Visão geral

Workflow de CI/CD responsável por:

- Validar qualidade (testes unitários, gate de cobertura 100% e E2E).
- Executar `semantic-release` para gerar versão, changelog e GitHub Release.
- Publicar a imagem Docker no GitHub Container Registry (GHCR).

## Responsabilidades

- Rodar `yarn install --immutable` para garantir reprodutibilidade.
- Executar `yarn test` e `yarn test:coverage:check` (gate 100%).
- Executar `yarn e2e` via Playwright.
- Autenticar no GHCR usando `GITHUB_TOKEN`.
- Rodar `yarn release` (que orquestra semantic-release + docker publish via `@semantic-release/exec`).

## Entradas e saídas

- Entradas:
  - Push no branch `main`.
  - Execução manual via `workflow_dispatch`.
  - Tokens/permissões do GitHub Actions (`contents: write`, `packages: write`, etc.).
- Saídas:
  - GitHub Release + tags/commits gerados pelo semantic-release.
  - `CHANGELOG.md` atualizado e commitado (via `@semantic-release/git`).
  - Imagens Docker publicadas em `ghcr.io/<owner>/<repo>:<version>` e `:latest`.

## Fluxo principal

```mermaid
flowchart TD
  A[Push no main / workflow_dispatch] --> B[Checkout (fetch-depth: 0)]
  B --> C[Setup Node + Corepack]
  C --> D[yarn install --immutable]
  D --> E[yarn test]
  E --> F[yarn test:coverage:check]
  F --> G[Playwright install chromium]
  G --> H[yarn e2e]
  H --> I[Docker buildx]
  I --> J[Login GHCR]
  J --> K[yarn release (semantic-release)]
  K --> L[Docker publish via exec]
```

## Tratamento de erros e casos-limite

- `--immutable` falha se `yarn.lock` estiver desatualizado.
- `enableGlobalCache: false` evita depender de cache global do runner (`~/.yarn/berry/cache`), reduzindo chance de ZIP corrompido/missing.
- O job ignora commits de release (`chore(release): ...`) para evitar loop do próprio semantic-release.

## Exemplos

Rodar release localmente (usa token do GitHub, se necessário):

```bash
corepack enable
corepack prepare yarn@4.12.0 --activate
corepack yarn install --immutable
GITHUB_TOKEN=... corepack yarn release
```

## Dependências e integrações

- GitHub Actions:
  - `actions/checkout@v4`
  - `actions/setup-node@v4`
  - `actions/cache@v4`
  - `docker/setup-buildx-action@v3`
  - `docker/login-action@v3`
- Yarn Berry (Corepack) + Plug'n'Play.
- `semantic-release` e plugins configurados em `package.json`.
- GHCR (registry `ghcr.io`).
