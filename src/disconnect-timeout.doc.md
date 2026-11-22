# disconnect-timeout

Define por quanto tempo um participante desconectado mantém o lugar e o voto na sala.

- Padrão: 20 minutos (`DEFAULT_DISCONNECT_TIMEOUT_MS`).
- Configuração: variável de ambiente `DISCONNECT_TIMEOUT_MS` (milissegundos, inteiro positivo).
  Valor ausente, vazio, não numérico ou `<= 0` usa o padrão.
- Usado pelo servidor para: expiração da sessão do participante, reserva do moderador
  (`OWNER_RESERVATION_TTL_MS` ainda pode sobrescrever só a reserva) e inatividade da sessão HTTP.
- Ao perder o WebSocket, o participante continua na sala (marcado `online: false` no estado)
  até o timeout; reconectar dentro do prazo restaura o mesmo lugar e voto.
