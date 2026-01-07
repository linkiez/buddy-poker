# room-link

## Visão geral

Utilitário para interpretar o valor digitado no campo de sala, aceitando formatos amigáveis como:

- Apenas o `roomId` (`scrumzada-abc123`)
- `roomId` com query (`scrumzada-abc123?token=...`)
- Link completo (`https://host/room/scrumzada-abc123?token=...`)

O objetivo é permitir entrar em salas privadas sem adicionar novos campos na UI.

## Responsabilidades

- Extrair `roomId` e `token` (quando existir) de uma string fornecida pelo usuário.

## Entradas e saídas

- Entrada:
  - `input: string`
- Saída:
  - `{ roomId: string; token: string | null }`

## Fluxo principal

```mermaid
flowchart TD
  A[input] --> B{parece URL/caminho?}
  B -- sim --> C[parse como URL (absoluta)]
  C -->|falha| C2[parse como URL com base]
  C2 -->|falha| E
  C2 -->|ok| D
  C -->|ok| D[extrai /room/:roomId + token]
  B -- nao --> E{tem '?'}
  E -- sim --> F[URLSearchParams token]
  E -- nao --> G[token=null]
```

## Tratamento de erros e casos-limite

- Inputs vazios retornam `roomId` vazio e `token=null`.
- Se a entrada não puder ser interpretada como URL (nem com base), usa parsing manual por `?`.
- Token é retornado somente se presente e não vazio.

## Exemplos

```ts
parseRoomInput('scrumzada-abc123');
// { roomId: 'scrumzada-abc123', token: null }

parseRoomInput('scrumzada-abc123?token=sekret');
// { roomId: 'scrumzada-abc123', token: 'sekret' }

parseRoomInput('https://example.com/room/scrumzada-abc123?token=sekret');
// { roomId: 'scrumzada-abc123', token: 'sekret' }
```

## Dependências e integrações

- Usado em [src/app/home/home.component.ts](../home/home.component.ts) para navegar já com `token` quando fornecido.
