# rate-limit

## Visão geral

Utilitário simples de rate limit (janela fixa) usado para limitar a quantidade de mensagens recebidas por conexão WebSocket.

## Responsabilidades

- Controlar quantos eventos podem ocorrer dentro de uma janela de tempo.
- Fornecer uma API mínima (`allow()`) para ser usada no servidor.

## Entradas e saídas

- Entradas:
  - `maxEvents`: máximo de eventos permitidos por janela.
  - `windowMs`: duração da janela em milissegundos.
  - `now` (opcional): função de relógio para testes.
- Saída:
  - Objeto com método `allow(): boolean`.

## API / Assinatura

```ts
export type RateLimiter = {
  allow(): boolean;
};

export function createRateLimiter(options: {
  maxEvents: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter;
```

## Fluxo principal

```mermaid
flowchart TD
  A[allow()] --> B{janela expirou?}
  B -- sim --> C[reset windowStartMs/usedInWindow]
  B -- nao --> D{usedInWindow >= maxEvents?}
  D -- sim --> E[return false]
  D -- nao --> F[increment usedInWindow]
  F --> G[return true]
```

## Tratamento de erros e casos-limite

- Lança `TypeError` quando `maxEvents` ou `windowMs` não são inteiros positivos.
- A janela é resetada quando `now() - windowStartMs >= windowMs`.

## Exemplos

```ts
const limiter = createRateLimiter({ maxEvents: 40, windowMs: 10_000 });

if (!limiter.allow()) {
  // Deny/throttle
}
```

## Dependências e integrações

- Integrado em [src/server.ts](server.ts) para limitar mensagens por conexão WebSocket.
