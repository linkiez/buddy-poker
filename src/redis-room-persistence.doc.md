# redis-room-persistence

## Visão geral

Persistência opcional de metadados de sala em Redis, implementando o contrato `RoomPersistence`.

A persistência grava apenas:

- `token` da sala
- `rounds` (histórico de rodadas)

A lista de participantes e sockets continua sendo **estado em memória**, pois depende da instância do WebSocket.

## Responsabilidades

- Implementar `RoomPersistence` usando Redis (via package `redis`).
- Serializar/parsear o payload em JSON de forma tolerante a erros.
- Aplicar TTL (`EX`) para evitar chaves órfãs.

## Entradas e saídas

- Entradas:
  - `redisUrl` (ex.: `redis://localhost:6379`)
  - `keyPrefix` (default no servidor: `buddy-poker:room:`)
  - `defaultTtlSeconds` (default no servidor: `86400`)
- Saídas:
  - `get(roomId)` → `PersistedRoomState | null`

## Fluxo principal

```mermaid
flowchart TD
  A[get(roomId)] --> B[GET keyPrefix+roomId]
  B --> C{JSON válido?}
  C -->|não| D[null]
  C -->|sim| E[PersistedRoomState]

  F[set(roomId, state)] --> G[SET keyPrefix+roomId JSON EX ttl]
```

## Tratamento de erros e casos-limite

- `get` retorna `null` se o payload estiver corrompido (JSON inválido ou formato inesperado).
- A conexão com Redis é inicializada de forma lazy (primeira operação) para não conectar durante import.

## Exemplos

```ts
import { createLazyRedisClientRoomPersistence } from './redis-room-persistence';

const persistence = createLazyRedisClientRoomPersistence({
  redisUrl: 'redis://localhost:6379',
  keyPrefix: 'buddy-poker:room:',
  defaultTtlSeconds: 86400,
});
```

## Dependências e integrações

- `redis` (client) como dependência do projeto.
- Contrato base em [room-persistence.ts](room-persistence.ts).
