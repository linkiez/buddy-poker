# poker-ws-protocol

## Visão geral

Módulo responsável por **interpretar e validar** mensagens recebidas do cliente via WebSocket.

O objetivo é centralizar:

- Parsing de JSON de forma segura
- Validação mínima de payload por tipo de mensagem

## Responsabilidades

- Converter `raw: string` em uma mensagem tipada (ou `null`).
- Aplicar validação mínima coerente com o servidor:
  - `join` exige `roomId` e `name` como `string`.
  - `vote` exige `value` como `string`.
  - `reveal` e `reset` não exigem campos adicionais.

## Entradas e saídas

- Entrada:
  - `raw: string` (payload recebido do WebSocket)
- Saída:
  - `PokerWsMessageFromClient | null`

## Fluxo principal

```mermaid
flowchart TD
  A[raw string] --> B[JSON.parse seguro]
  B -->|falha| X[null]
  B --> C{é objeto?}
  C -- não --> X
  C -- sim --> D{type}
  D -- join --> E[valida roomId/name]
  E -->|inválido| X
  E -->|válido| J[retorna join]
  D -- vote --> V[valida value]
  V -->|inválido| X
  V -->|válido| W[retorna vote]
  D -- reveal/reset --> R[retorna mensagem]
  D -- outro --> X
```

## Tratamento de erros e casos-limite

- JSON inválido retorna `null`.
- JSON válido, porém não-objeto (ex.: `null`, `[]`, `123`) retorna `null`.
- Campos extras são ignorados.
- `token` em `join` só é aceito quando é `string`.

## Exemplos

```ts
parsePokerWsMessageFromClient('{');
// null

parsePokerWsMessageFromClient(JSON.stringify({ type: 'join', roomId: 'r', name: 'n' }));
// { type: 'join', roomId: 'r', name: 'n' }

parsePokerWsMessageFromClient(JSON.stringify({ type: 'vote', value: '5' }));
// { type: 'vote', value: '5' }
```

## Dependências e integrações

- Usado em [src/server.ts](server.ts) para validar mensagens antes de aplicar regras de sala.
