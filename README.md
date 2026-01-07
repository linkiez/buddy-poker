# Buddy Poker Scrum

Aplicação de planning poker ("poker scrum") com Angular SSR e sincronização em tempo real via WebSocket.

Feita para ser simples de rodar, rápida para entrar em uma sala e divertida de usar.

## Funcionalidades

- Salas em tempo real via WebSocket (`/ws`)
- Moderador (dono da sala) com permissões de **revelar** e **resetar**
- Link compartilhável de sala (com `token` quando a sala fica privada)
- Status de conexão (conectado/reconectando/desconectado)
- UI com PrimeNG + tema, com layout responsivo

## Como funciona (resumo)

- O primeiro usuário que entra vira o **moderador** (`ownerId`).
- A sala gera um `token` e ele aparece na URL do moderador.
- A partir do segundo participante, o `token` passa a ser obrigatório para entrar na sala.

## Requisitos

- Node.js com Corepack habilitado (para resolver `yarn@4.12.0` via `packageManager`).
- Yarn (via Corepack).

## Rodar em desenvolvimento

```bash
yarn start
```

`yarn start` roda o modo recomendado de desenvolvimento: **SSR + WebSocket**.

- App: `http://localhost:4000/`
- WebSocket: `ws://localhost:4000/ws`

### Rodar somente SPA (sem SSR/WS)

Útil para trabalhar só no layout/rotas, mas **não** habilita o servidor WebSocket.

```bash
yarn start:spa
```

- App: `http://localhost:4200/`

## Build (produção)

```bash
yarn build
```

## Servir SSR (produção)

```bash
yarn serve:ssr:buddy-poker
```

- App: `http://localhost:4000/`
- WebSocket: `ws://localhost:4000/ws`

## Scripts

- `yarn start`: dev SSR + WebSocket (porta 4000)
- `yarn start:spa`: dev SPA (porta 4200)
- `yarn build`: build SSR (gera `dist/buddy-poker/...`)
- `yarn serve:ssr:buddy-poker`: serve SSR build (respeita `PORT`)
- `yarn test`: unit tests
- `yarn test:coverage:check`: unit tests + gate de cobertura 100%
- `yarn e2e`: testes E2E (Playwright)
- `yarn e2e:install`: instala browser do Playwright

## Testes

```bash
yarn test
```

### Cobertura (gate 100%)

```bash
yarn test:coverage:check
```

### E2E (Playwright)

```bash
yarn e2e:install
yarn e2e
```

## Arquitetura

- Frontend: Angular (SSR) + PrimeNG
- Backend SSR: Node + Express
- Realtime: `ws` com endpoint `ws://<host>/ws`

### Protocolo WebSocket

Mensagens são JSON. Tipos principais:

- `join` (entrar na sala)
- `vote` (votar)
- `reveal` (somente moderador)
- `reset` (somente moderador)

Docs detalhadas em:

- `src/poker-ws-protocol.doc.md`
- `src/poker-permissions.doc.md`
- `src/room-token.doc.md`

## Docker

### Build e run

```bash
docker build -t buddy-poker:local .
docker run --rm -p 4000:4000 buddy-poker:local
```

### Compose

```bash
docker compose up --build
```

### Compose + Redis (persistência opcional)

```bash
docker compose -f docker-compose.redis.yml up --build
```

### Compose + Nginx (reverse proxy)

```bash
docker compose -f docker-compose.nginx.yml up --build
```

## Documentação

- Roadmap: [ROADMAP.md](ROADMAP.md)
- Deploy: [deploy.doc.md](deploy.doc.md)

## Licença

MIT. Veja [LICENSE](LICENSE).

## Créditos / Assets

- Ícones/SVGs estão em `public/svgs/`.
- O arquivo `public/svgs/cards-mask.svg` foi obtido via SVG Repo e contém metadados no próprio arquivo. Antes de publicar, confirme a licença/origem apropriada no provedor do asset.
