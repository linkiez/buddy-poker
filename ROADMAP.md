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

## P2P WebRTC Mode (Roadmap Completo)

**Objetivo**: Implementar modo P2P (peer-to-peer) usando WebRTC DataChannel para comunicação em tempo real, reduzindo carga no servidor e latência.

**Visão geral**: Ver [docs/p2p-webrtc-design.doc.md](docs/p2p-webrtc-design.doc.md) para design completo.

### Fase 0: Design e Documentação ✅

- [x] **Design doc completo** (`docs/p2p-webrtc-design.doc.md`)
  - [x] Motivação, objetivos e não-objetivos
  - [x] Arquitetura (3 modos de transporte: WebRTC, WebSocket, HTTP)
  - [x] Componentes: WebRtcTransport, SignalingService, integração com PokerWsService
  - [x] Fluxos detalhados (join, offer/answer, ICE, reconexão, fallback)
  - [x] Estratégia para redes restritas (STUN/TURN, coturn, timeouts)
  - [x] Segurança e autorização
  - [x] Consistência do estado (servidor autoritativo)
  - [x] Observabilidade (logs, métricas)
  - [x] Compatibilidade (SSR, browsers)
  - [x] Impactos no deploy (TURN, configs)

- [x] **Roadmap detalhado** (este arquivo)
  - [x] Fases, tarefas e critérios de aceite

**Critérios de aceite:**
- ✅ Documento de design cobre todos os aspectos técnicos
- ✅ Roadmap tem fases claras e acionáveis
- ✅ `yarn test` continua passando

---

### Fase 1: Signaling Mínimo

**Objetivo**: Implementar infraestrutura de sinalização no servidor para permitir troca de offers/answers/ICE candidates entre peers.

**Tarefas:**

- [ ] **Backend: Mensagens de sinalização WebSocket**
  - [ ] Adicionar tipos de mensagem: `webrtc-join`, `webrtc-offer`, `webrtc-answer`, `webrtc-ice-candidate`, `webrtc-peer-joined`, `webrtc-peer-left`
  - [ ] Criar `handleWebRtcJoin(clientId, msg)` no servidor
    - [ ] Validar token de sala
    - [ ] Verificar limite de 8 participantes
    - [ ] Retornar lista de peers existentes
    - [ ] Notificar peers existentes sobre novo peer (com `shouldInitiate` flag)
  - [ ] Criar `handleWebRtcOffer/Answer/IceCandidate(clientId, msg)`
    - [ ] Rotear mensagens para peer de destino (`targetPeerId`)
    - [ ] Validar que ambos os peers estão na mesma sala
  - [ ] Criar `handleWebRtcPeerLeft(clientId, roomId)`
    - [ ] Notificar outros peers quando peer desconecta

- [ ] **Backend: Lógica anti-glare**
  - [ ] Implementar estratégia de "quem inicia offer" (baseado em peer ID lexicográfico)
  - [ ] Incluir `shouldInitiate: boolean` em `webrtc-peer-joined`

- [ ] **Backend: Rate limiting de sinalização**
  - [ ] Aplicar limite de 10 mensagens de sinalização/segundo por cliente
  - [ ] Log warning se limite excedido

- [ ] **Testes de sinalização**
  - [ ] Unit tests: validação de token em `webrtc-join`
  - [ ] Unit tests: roteamento de mensagens entre peers
  - [ ] Unit tests: limite de 8 participantes
  - [ ] Unit tests: lógica anti-glare (`shouldInitiate`)

**Critérios de aceite:**
- [ ] Servidor roteia mensagens de sinalização corretamente
- [ ] Validação de token funciona para sinalização
- [ ] Limite de 8 participantes é respeitado
- [ ] Testes cobrem casos principais
- [ ] `yarn test` passa

**Estimativa**: 2-3 dias

---

### Fase 2: WebRtcTransport (Client)

**Objetivo**: Implementar `WebRtcTransport` no cliente para estabelecer conexões P2P via WebRTC DataChannel.

**Tarefas:**

- [ ] **SignalingService (client)**
  - [ ] Criar `SignalingService` para comunicar com servidor via WS
  - [ ] Implementar `connect(roomId, token)` → envia `webrtc-join`
  - [ ] Implementar `sendOffer/Answer/IceCandidate(targetPeerId, ...)`
  - [ ] Expor observables: `onPeerJoined$`, `onOffer$`, `onAnswer$`, `onIceCandidate$`, `onPeerLeft$`
  - [ ] Adicionar guards `isPlatformBrowser` (não rodar no SSR)

- [ ] **WebRtcTransport (client)**
  - [ ] Implementar interface `Transport`
  - [ ] Criar `connect(roomId, name, token?)` → inicia sinalização
  - [ ] Criar `RTCPeerConnection` para cada peer
  - [ ] Criar `DataChannel('poker')` para cada peer
  - [ ] Implementar fluxo de offer/answer:
    - [ ] Se `shouldInitiate=true`, criar offer
    - [ ] Se receber offer, criar answer
  - [ ] Implementar troca de ICE candidates (trickle ICE)
  - [ ] Implementar detecção de suporte WebRTC (`isWebRtcSupported()`)
  - [ ] Adicionar timeout de conexão (15s)
    - [ ] Se timeout, emitir evento `failed`
  - [ ] Implementar `send(message)` → envia para todos os peers via DataChannel
  - [ ] Implementar `disconnect()` → fecha todas as conexões

- [ ] **WebRTC Configuration**
  - [ ] Criar endpoint `/api/webrtc-config` no servidor
    - [ ] Retorna `iceServers` (STUN público por enquanto)
  - [ ] Cliente busca config antes de criar `RTCPeerConnection`

- [ ] **Observables e estado**
  - [ ] `status$`: emite 'connecting', 'connected', 'disconnected'
  - [ ] `onMessage$`: emite mensagens recebidas via DataChannel
  - [ ] `onFailed$`: emite quando P2P falha (para trigger fallback)

- [ ] **Testes**
  - [ ] Unit tests: mock `RTCPeerConnection` e `DataChannel`
  - [ ] Testar fluxo de offer/answer
  - [ ] Testar troca de ICE candidates
  - [ ] Testar timeout de conexão
  - [ ] Testar envio/recebimento de mensagens

**Critérios de aceite:**
- [ ] WebRtcTransport estabelece conexões P2P entre 2 peers
- [ ] DataChannel abre e troca mensagens JSON
- [ ] Timeout de 15s funciona (fallback se não conectar)
- [ ] Código só roda no browser (guards SSR funcionam)
- [ ] `yarn test` passa

**Estimativa**: 4-5 dias

---

### Fase 3: Mesh Completo (até 8 Peers) + Glare Handling

**Objetivo**: Suportar múltiplos peers (até 8) em topologia mesh completa e resolver offer collisions.

**Tarefas:**

- [ ] **Mesh topology**
  - [ ] WebRtcTransport mantém Map de `peerId → RTCPeerConnection`
  - [ ] Ao receber `webrtc-peer-joined`, criar nova conexão com novo peer
  - [ ] Ao receber `webrtc-peer-left`, fechar conexão correspondente
  - [ ] Broadcast de mensagens: enviar para todos os peers conectados

- [ ] **Glare handling (offer collision)**
  - [ ] Implementar lógica: se ambos os peers enviam offer, peer com ID maior descarta seu offer
  - [ ] Testar cenário de offer collision

- [ ] **Reconexão de peer**
  - [ ] Detectar `iceconnectionstatechange` → 'disconnected'
  - [ ] Aguardar 5s para reconexão automática (ICE restart)
  - [ ] Se não reconectar, fechar conexão e criar nova via sinalização

- [ ] **Qualidade de conexão**
  - [ ] Monitorar packet loss e RTT via `getStats()`
  - [ ] Emitir warning se qualidade degradar (packet loss > 10%, RTT > 1000ms)

- [ ] **Testes**
  - [ ] Testar mesh com 3+ peers (simular múltiplas conexões)
  - [ ] Testar glare handling
  - [ ] Testar reconexão de peer desconectado
  - [ ] Testar broadcast para múltiplos peers

**Critérios de aceite:**
- [ ] Até 8 peers conseguem se conectar em mesh completo
- [ ] Offer collision é resolvida corretamente
- [ ] Peer desconectado reconecta ou é removido
- [ ] Broadcast funciona para todos os peers
- [ ] `yarn test` passa

**Estimativa**: 3-4 dias

---

### Fase 4: Fallback/Return-to-P2P e UX

**Objetivo**: Integrar WebRtcTransport com PokerWsService, implementar fallback automático e UX de modo de transporte.

**Tarefas:**

- [ ] **Integração com PokerWsService**
  - [ ] Refatorar PokerWsService para suportar 3 transportes: WebRTC, WebSocket, HTTP
  - [ ] Lógica de seleção de transporte:
    - [ ] Verificar tamanho da sala (API ou sinalização)
    - [ ] Se ≤ 8, tentar WebRTC
    - [ ] Se > 8 ou WebRTC não suportado, usar WebSocket
    - [ ] Se WebSocket falhar, usar HTTP
  - [ ] Expor `mode$: Observable<'webrtc' | 'websocket' | 'http-polling'>`

- [ ] **Fallback P2P → WebSocket**
  - [ ] WebRtcTransport emite `failed` após timeout (15s)
  - [ ] PokerWsService detecta e faz switch para WebSocketTransport
  - [ ] Log: `[PokerWsService] WebRTC failed, switching to WebSocket`

- [ ] **Return-to-P2P (WebSocket → P2P)**
  - [ ] A cada 60s, se `mode !== 'webrtc'` e `roomSize ≤ 8`, tentar WebRTC
  - [ ] Iniciar WebRtcTransport em paralelo com transporte atual
  - [ ] Se conectar em < 15s, fazer switch
  - [ ] Caso contrário, manter transporte atual e tentar novamente em 60s

- [ ] **UX: Indicador de modo de transporte**
  - [ ] Adicionar badge no RoomComponent mostrando modo atual
  - [ ] Ícones sugeridos:
    - [ ] P2P: `🔗` ou "P2P"
    - [ ] WebSocket: `🔌` ou "WS"
    - [ ] HTTP: `📡` ou "HTTP"
  - [ ] Cor:
    - [ ] P2P: verde (melhor)
    - [ ] WebSocket: amarelo (intermediário)
    - [ ] HTTP: laranja (fallback)
  - [ ] Tooltip explicando o modo

- [ ] **Testes**
  - [ ] Testar fallback WebRTC → WebSocket
  - [ ] Testar return-to-P2P (WebSocket → WebRTC)
  - [ ] Testar sala > 8 usa WebSocket diretamente
  - [ ] E2E: usuário vê indicador de modo

**Critérios de aceite:**
- [ ] Fallback automático funciona (P2P → WS → HTTP)
- [ ] Return-to-P2P funciona (tentativa a cada 60s)
- [ ] Indicador de modo visível na UI
- [ ] Salas > 8 usam WebSocket (sem tentar P2P)
- [ ] `yarn test` e `yarn e2e` passam

**Estimativa**: 3-4 dias

---

### Fase 5: Infraestrutura TURN/Coturn

**Objetivo**: Configurar servidor TURN (coturn) para suportar redes restritas e atualizar docs de deploy.

**Tarefas:**

- [ ] **Coturn setup**
  - [ ] Criar `docker-compose.turn.yml` com serviço coturn
  - [ ] Criar `coturn/turnserver.conf` com configuração básica
    - [ ] `listening-port=3478`
    - [ ] `tls-listening-port=443`
    - [ ] `realm=buddy-poker.example.com`
    - [ ] `user=user:pass` (credenciais para testes)
  - [ ] Configurar certificado SSL (Let's Encrypt ou self-signed para dev)

- [ ] **Backend: WebRTC config com TURN**
  - [ ] Atualizar `/api/webrtc-config` para incluir TURN
  - [ ] Usar variáveis de ambiente:
    - [ ] `TURN_SERVER_URL`
    - [ ] `TURN_USERNAME`
    - [ ] `TURN_PASSWORD`
    - [ ] `STUN_SERVER_URL`

- [ ] **Documentação de deploy**
  - [ ] Atualizar `deploy.doc.md` com seção sobre coturn
  - [ ] Instruções para configurar certificado SSL
  - [ ] Instruções para rodar coturn em produção
  - [ ] Estimativa de custos (servidor, bandwidth)

- [ ] **Exemplo de deploy completo**
  - [ ] `docker-compose.prod.yml` incluindo app + coturn
  - [ ] Exemplo de nginx.conf para proxy de coturn (se necessário)

- [ ] **Monitoramento de TURN**
  - [ ] Documentar como visualizar logs de coturn
  - [ ] Sugerir métricas para monitorar (bandwidth, sessões)

- [ ] **Testes**
  - [ ] Testar conexão P2P usando TURN relay (simular firewall)
  - [ ] Verificar que `turns:443` funciona

**Critérios de aceite:**
- [ ] Coturn configurado e rodando via docker-compose
- [ ] P2P funciona em redes restritas (usando TURN)
- [ ] Documentação completa de setup de TURN
- [ ] Exemplo de deploy produção com TURN

**Estimativa**: 2-3 dias

---

### Fase 6: Testes E2E (P2P + Fallback)

**Objetivo**: Cobrir cenários de P2P e fallback com testes E2E (Playwright).

**Tarefas:**

- [ ] **E2E: P2P básico (2 peers)**
  - [ ] Teste: 2 usuários entram na sala, WebRTC conecta
  - [ ] Verificar indicador "P2P" visível
  - [ ] Usuário vota, outro usuário vê voto atualizado via P2P

- [ ] **E2E: Mesh (3+ peers)**
  - [ ] Teste: 3 usuários entram na sala
  - [ ] Verificar que todos os peers conectam entre si (mesh)
  - [ ] Verificar broadcast (voto de um usuário aparece para todos)

- [ ] **E2E: Fallback P2P → WebSocket**
  - [ ] Bloquear WebRTC no browser (via DevTools ou config)
  - [ ] Verificar que app cai para WebSocket automaticamente
  - [ ] Verificar indicador "WS" visível
  - [ ] Funcionalidade continua (vote, reveal, reset)

- [ ] **E2E: Sala > 8 participantes**
  - [ ] Teste: 9+ usuários tentam entrar
  - [ ] Verificar que app usa WebSocket diretamente (sem tentar P2P)

- [ ] **E2E: Return-to-P2P**
  - [ ] Começar em WebSocket (simular falha inicial de P2P)
  - [ ] Aguardar 60s
  - [ ] Verificar que app tenta retornar para P2P
  - [ ] Se bem-sucedido, indicador muda para "P2P"

- [ ] **E2E: Reconexão de peer**
  - [ ] 2 peers conectados via P2P
  - [ ] Simular desconexão de um peer (fechar DataChannel)
  - [ ] Verificar reconexão automática ou fallback

**Critérios de aceite:**
- [ ] Todos os cenários E2E passam
- [ ] Testes cobrem P2P, fallback, return-to-P2P
- [ ] `yarn e2e` passa sem erros

**Estimativa**: 3-4 dias

---

## Resumo do Roadmap P2P

| Fase | Objetivo | Estimativa | Dependências |
|------|----------|------------|--------------|
| **0** | Design e Documentação | ✅ Completo | - |
| **1** | Signaling Mínimo | 2-3 dias | Fase 0 |
| **2** | WebRtcTransport | 4-5 dias | Fase 1 |
| **3** | Mesh + Glare | 3-4 dias | Fase 2 |
| **4** | Fallback + UX | 3-4 dias | Fase 3 |
| **5** | TURN/Coturn | 2-3 dias | Fase 4 |
| **6** | E2E Tests | 3-4 dias | Fase 5 |

**Total estimado**: 17-23 dias (~3-4 semanas)

---

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
