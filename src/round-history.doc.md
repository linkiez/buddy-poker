# round-history

## Visão geral

Persistência **em memória** do histórico de rodadas de planning poker por sala.

O objetivo é manter um registro simples (limitado) para consultas futuras, sem depender de storage externo.

## Responsabilidades

- Gerar um snapshot de uma rodada ao finalizar/resetar.
- Manter o histórico limitado (`maxRounds`) para evitar crescimento infinito.

## Entradas e saídas

- Entradas:
  - `reveal`: se a rodada estava revelada ao ser encerrada.
  - `participants`: participantes com `name` e `vote`.
  - `history`: histórico atual.
  - `maxRounds`: tamanho máximo do histórico.
  - `now` (opcional): relógio injetável para testes.
- Saída:
  - Novo array de histórico.

## Fluxo principal

```mermaid
flowchart TD
  A[appendRoundHistory] --> B[materializa votes[]]
  B --> C{tem voto ou reveal=true?}
  C -- nao --> D[return history]
  C -- sim --> E[append entry]
  E --> F{excedeu maxRounds?}
  F -- nao --> G[return]
  F -- sim --> H[keep last maxRounds]
```

## Tratamento de erros e casos-limite

- Se `maxRounds` não for inteiro positivo, lança `TypeError`.
- Rodadas vazias (sem votos e `reveal=false`) não são gravadas.

## Dependências e integrações

- Integrado em [src/server.ts](server.ts) no handler de `reset`.
