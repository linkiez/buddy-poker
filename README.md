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
- Realtime: WebSocket (`ws://<host>/ws`) com fallback para HTTP

### Protocolo de Comunicação em Tempo Real

O app usa **WebSocket como transporte principal**, com **fallback automático para HTTP polling** quando WebSocket não está disponível.

#### WebSocket (modo preferencial)

Mensagens são JSON. Tipos principais:

- `join` (entrar na sala)
- `vote` (votar)
- `reveal` (somente moderador)
- `reset` (somente moderador)

#### HTTP Polling (fallback automático)

Quando WebSocket não está disponível (por proxy, firewall ou restrições de navegador), o app automaticamente alterna para HTTP polling:

- `POST /api/poker/action` - envia ações (join, vote, reveal, reset)
- `GET /api/poker/events` - recebe atualizações do estado da sala

#### Detecção e Fallback

O cliente tenta conectar via WebSocket primeiro. Se a conexão falhar após 3 tentativas (timeout de 10 segundos por tentativa), o app automaticamente alterna para HTTP polling. 

Enquanto em modo HTTP, o cliente tenta periodicamente (a cada 60 segundos) retornar para WebSocket.

#### Configuração (opcional)

Você pode ajustar os parâmetros de fallback definindo variáveis globais no `window` antes de carregar o app:

```javascript
window.WS_CONNECTION_TIMEOUT_MS = 10000;  // Timeout de conexão WebSocket (padrão: 10s)
window.WS_RECONNECT_BASE_DELAY_MS = 500;  // Delay base para reconexão (padrão: 500ms)
window.WS_RECONNECT_MAX_DELAY_MS = 10000; // Delay máximo para reconexão (padrão: 10s)
window.HTTP_POLLING_INTERVAL_MS = 3000;   // Intervalo de polling HTTP (padrão: 3s)
```

#### Simulação de Falha de WebSocket (teste local)

Para testar o fallback localmente, você pode bloquear o WebSocket no DevTools:

1. Abra DevTools (F12)
2. Network tab → Filter → WS (WebSocket)
3. Right-click no WebSocket connection → Block request URL
4. Recarregue a página

O app deve alternar automaticamente para HTTP polling e continuar funcionando normalmente.

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
