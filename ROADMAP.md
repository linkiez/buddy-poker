# Buddy Poker Scrum — Roadmap

## Visão

Aplicação de planning poker ("poker scrum") para estimativas em equipe, com Angular SSR e sincronização em tempo real via WebSocket.

Princípios:

- UI em pt-BR.
- Código e identificadores em en_US.
- SSR primeiro (sem acessar APIs de browser no server).
- Estado de sala em tempo real.

## MVP (core) — concluído

- [x] Angular SSR (Angular 21) com rotas `Home` e `Sala`.
- [x] WebSocket em `/ws` no mesmo processo do SSR.
- [x] Sala com ações: entrar, votar, revelar, resetar.
- [x] Moderador por sala:
  - [x] Primeiro participante vira moderador.
  - [x] Apenas moderador pode revelar/resetar.
  - [x] Reatribui moderador quando o dono sai.
- [x] Vitest rodando via `ng test` (script sem watch por padrão).
- [x] Documentação `.doc.md` dos principais módulos.

## Próximos passos (prioridade alta)

- [x] Melhorar resiliência do WS:
  - [x] Reconnect automático no client e re-join transparente.
  - [x] Ping/pong e timeout para limpar conexões zumbis.
- [x] Melhorar UX da sala:
  - [x] Indicar quem é o moderador na lista de jogadores.
  - [x] Botão para copiar link da sala.
  - [x] Feedback visual de conexão (conectado/desconectado).
- [x] Usar PrimeNG na UI e adicionar animações.
- [x] Usar SVGs no UI e trocar favicon.

## UX — responsividade (prioridade alta)

Critérios de aceite (mínimo):

- Não ter scroll horizontal em telas pequenas.
- Formulários, botões e cards se adaptam sem “espremer” conteúdo.
- Ações principais ficam fáceis de tocar no mobile (botões com largura total quando fizer sentido).

Checklist (mobile-first):

- [x] Infra: Tailwind CSS instalado (utilitários de layout, quando necessário).
- [x] Home:
  - [x] Campos e ações empilham bem em telas estreitas.
  - [x] Botões ficam com largura total em mobile.
- [x] Sala:
  - [x] Header e ações do topo não quebram layout em mobile.
  - [x] Card de entrar (nome + botão) fica confortável em mobile.
  - [x] Linhas de mensagem (erro/sucesso) não estouram largura.
  - [x] Lista de participantes lida com nomes longos sem overflow.
  - [x] Área de votos mantém wrap e botões tocáveis.

Validação:

- Rodar `yarn start` e verificar em ~360px, ~768px e >=900px.
- Manter `yarn test` e `yarn test:coverage:check` verdes.

## Próximos passos (prioridade média)

- [x] Persistência opcional:
  - [x] Guardar histórico de rodadas (na memória, por sala).
  - [x] (Opcional) persistir em storage externo (ex.: Redis) se virar multi-instância.
- [x] Segurança básica:
  - [x] Token simples por sala (query/header) para evitar “invadir sala por acaso”.
  - [x] Rate limit por conexão WS.

## Qualidade (testes e cobertura)

- [x] Cobertura 100% (allowlist de módulos core):
  - [x] `yarn test:coverage` gera relatórios de cobertura.
  - [x] `yarn test:coverage:check` valida 100% (lines/branches/functions/statements).
- [x] Expandir a allowlist de cobertura para incluir fluxos do servidor WS (protocolo e permissões).
- [x] Expandir a allowlist de cobertura para incluir fluxos do client (services e parsing de URL).
- [x] Definir escopo e estratégia para 100% de cobertura do app inteiro (sem allowlist):
  - Escopo-alvo (produção): `src/**/*.ts`.
  - Exclusões explícitas (não-regra de negócio / bootstrap / testes): `**/*.spec.ts`, `src/main.ts`, `src/main.server.ts`.
  - Medição: manter o gate atual (`yarn test:coverage:check`) estável e usar um comando separado apenas para relatório do app inteiro.
  - Estratégia incremental:
    - Transformar lógica “difícil de testar” em módulos puros (sem DOM/WebSocket real), mantendo o uso em Angular por composição.
    - Adicionar testes unitários por arquivo/feature até o relatório “app inteiro” atingir 100%.
    - Quando o relatório “app inteiro” atingir 100%, remover allowlist e migrar o gate para validar o escopo total.
  - Baseline (relatório do escopo total): `yarn test:coverage:all`.
  - Backlog recomendado (ordem sugerida para fechar 100%):
    - `src/app/app.ts` (1 branch pendente no artefato compilado do decorator).
    - `src/app/app.routes.ts`.
    - `src/app/app.routes.server.ts`.
    - `src/app/app.config.ts`.
    - `src/app/app.config.server.ts`.
    - `src/app/home/home.component.ts`.
    - `src/app/room/room.component.ts`.
    - `src/server.ts`.

## Qualidade — testes E2E (100% funcionalidades)

Objetivo: cobrir 100% das funcionalidades do MVP via testes E2E (fluxos de usuário), garantindo que SSR + WebSocket funcionem em conjunto.

Critérios de aceite:

- Os testes E2E rodam localmente com um único comando.
- Os cenários cobrem: criar/entrar em sala, votar, revelar/resetar, restrição de moderador e copiar link.
- Manter `yarn test` e `yarn test:coverage:check` verdes (E2E é suíte separada).

Checklist:

- [x] Infra: Playwright instalado e configurado.
- [x] Cenários (MVP):
  - [x] Abrir sala sem nome e entrar via formulário.
  - [x] Criar sala pela Home e entrar automaticamente.
  - [x] Dois participantes na mesma sala.
  - [x] Participante sem token recebe erro (a partir do 2º join).
  - [x] Votar (cliente 1 e cliente 2) e ver “votou”.
  - [x] Moderador revela e votos ficam visíveis.
  - [x] Participante não vê ações de moderador e vê aviso informativo.
  - [x] Moderador reseta e estado volta para “cartas na mesa”.
  - [x] Copiar link mostra feedback de sucesso.

Comandos úteis:

```bash
yarn e2e
```

## Próximos passos (prioridade baixa)

- [ ] Temas / skins (engraçados, mas sem poluir o app):
  - [ ] Tema “Café & Caos”.
  - [ ] Tema “Sprint da Madrugada”.
- [ ] Deploy:
  - [x] Container/Dockerfile e compose.
  - [x] Config de Reverse proxy (Nginx) com upgrade de WebSocket.

## Comandos úteis

```bash
yarn start
```

```bash
yarn test
```

```bash
yarn test:coverage:check
```

```bash
yarn build
```

```bash
yarn serve:ssr:buddy-poker
```
