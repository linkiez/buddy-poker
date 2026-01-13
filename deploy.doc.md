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

## Deploy com P2P WebRTC (TURN Server)

Para habilitar modo P2P em redes corporativas/restritas, é necessário configurar um servidor TURN (coturn).

### Subir com TURN (coturn)

```bash
docker compose -f docker-compose.turn.yml up --build
```

Este modo inicia:
- **App** (porta 4000): Aplicação Buddy Poker com suporte P2P
- **Coturn** (porta 443/TCP, 3478/UDP): Servidor TURN para relay de conexões P2P

### Configuração TURN

1. **Gerar certificados SSL** (obrigatório para `turns:443`):

```bash
cd coturn/certs
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=turn.yourdomain.com"
```

2. **Editar coturn/turnserver.conf**:
   - Alterar `realm` e `server-name` para seu domínio
   - Alterar `user=buddypoker:change-me-in-production` (username:password)
   - Em produção, configurar `external-ip` com IP público do servidor
   - Em produção, descomentar `denied-peer-ip` para segurança

3. **Variáveis de ambiente** (docker-compose.turn.yml):

```yaml
environment:
  - TURN_SERVER_URL=turns:coturn:443  # ou seu domínio
  - TURN_USERNAME=buddypoker
  - TURN_PASSWORD=change-me-in-production
  - STUN_SERVER_URL=stun:stun.l.google.com:19302
  - MAX_P2P_PEERS=8
  - WEBRTC_CONNECTION_TIMEOUT=15000
```

### Portas TURN

O coturn precisa das seguintes portas abertas:

- **443/TCP**: TURN over TLS (turns:) - principal para redes restritas
- **3478/UDP**: TURN sem TLS (turn:) - fallback
- **3478/TCP**: TURN TCP - fallback para UDP bloqueado
- **49152-65535/UDP**: Porta de relay para mídia (range configurável)

**Firewall em produção:**
```bash
# Permitir TURN
sudo ufw allow 443/tcp
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp
sudo ufw allow 49152:65535/udp
```

### Produção (Let's Encrypt)

Para usar certificados SSL válidos em produção:

```bash
# Instalar certbot
sudo apt-get install certbot

# Obter certificado (substituir domínio)
sudo certbot certonly --standalone -d turn.yourdomain.com

# Copiar certificados para coturn
sudo cp /etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem coturn/certs/cert.pem
sudo cp /etc/letsencrypt/live/turn.yourdomain.com/privkey.pem coturn/certs/key.pem

# Ajustar permissões
sudo chown $(whoami):$(whoami) coturn/certs/*.pem
```

### Custos Estimados (P2P + TURN)

- **Servidor TURN** (1 vCPU, 1 GB RAM): ~$5-10/mês
- **Bandwidth**: Depende do uso de relay
  - Conexões diretas (host/srflx): sem custo adicional
  - Relay via TURN: ~100 KB/s por par de peers = ~2 Mbps para 8 peers
- **Certificado SSL**: Gratuito (Let's Encrypt)

**Recomendação**: Monitorar uso de bandwidth e ajustar quotas em `turnserver.conf` se necessário.

### Testar TURN

Após iniciar coturn, verificar funcionamento:

```bash
# Testar STUN
turnutils-stunclient -v turn.yourdomain.com

# Testar TURN com autenticação
turnutils-uclient -v -u buddypoker -w change-me-in-production turn.yourdomain.com
```

### Monitoramento

Logs do coturn:
```bash
docker logs buddy-poker-coturn-1 -f
```

Verificar uso de relay:
```bash
# Dentro do container
docker exec -it buddy-poker-coturn-1 cat /var/log/turnserver.log
```

### Troubleshooting

**P2P não conecta:**
1. Verificar se certificados SSL estão corretos (`cert.pem`, `key.pem`)
2. Verificar portas abertas no firewall (443, 3478, 49152-65535)
3. Verificar variáveis de ambiente (`TURN_SERVER_URL`, `TURN_USERNAME`, `TURN_PASSWORD`)
4. Verificar logs do coturn: `docker logs buddy-poker-coturn-1`

**Conexão cai para WebSocket/HTTP:**
- Normal em redes muito restritas ou quando sala > 8 participantes
- P2P tenta reconectar automaticamente a cada 60 segundos
- Verificar console do browser: procurar erros `[WebRtcTransport]`

