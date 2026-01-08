# Deploy (Docker)

## Visão geral

Este documento descreve como executar o Buddy Poker Scrum em container Docker usando SSR + WebSocket no mesmo processo.

## Responsabilidades

- Padronizar execução em ambiente isolado (Docker).
- Garantir que SSR e WebSocket (`/ws`) funcionem no mesmo listener HTTP.

## Entradas e saídas

- Entradas:
  - Variáveis de ambiente:
    - `PORT` (default: `4000`)
    - `NODE_ENV` (recomendado: `production`)
- Saídas:
  - HTTP: `http://localhost:4000`
  - WebSocket: `ws://localhost:4000/ws`

## Fluxo principal

```mermaid
flowchart TD
  A[Docker build] --> B[yarn install]
  B --> C[yarn build (Angular SSR)]
  C --> D[Container runtime]
  D --> E[Express SSR + ws (/ws)]
```

## Tratamento de erros e casos-limite

- `PORT` inválido: o servidor lança `TypeError` e não inicia.
- A imagem executa o runtime com `node dist/buddy-poker/server/server.mjs` (não depende de Yarn no runtime).

## Exemplos

### Build e run (Docker)

```bash
docker build -t buddy-poker:local .
docker run --rm -p 4000:4000 buddy-poker:local
```

### Subir com Compose

```bash
docker compose up --build
```

### Subir com Nginx (reverse proxy + WebSocket)

Este modo coloca o Nginx na frente e expõe a aplicação em `http://localhost:8080/`.

```bash
docker compose -f docker-compose.nginx.yml up --build
```

- App: `http://localhost:8080/`
- WebSocket: `ws://localhost:8080/ws`

Configuração do proxy: [deploy/nginx.conf](deploy/nginx.conf)

### Subir com Redis (persistência opcional)

Este modo adiciona um Redis e configura o servidor para persistir **metadados da sala** (token e histórico de rodadas).

```bash
docker compose -f docker-compose.redis.yml up --build
```

Variáveis de ambiente relevantes:

- `REDIS_URL`: URL de conexão (ex.: `redis://redis:6379`).
- `REDIS_PASSWORD` (opcional): senha do Redis, quando aplicável.
- `ROOM_TTL_SECONDS`: TTL padrão das chaves da sala (default: `86400`).
- `REDIS_KEY_PREFIX`: prefixo da chave (default: `buddy-poker:room:`).

## Dependências e integrações

- Docker / Docker Compose
- Node.js (imagem base) + Corepack (para resolver `yarn@4.12.0` via `packageManager`)
- Aplicação SSR: script `serve:ssr:buddy-poker`
