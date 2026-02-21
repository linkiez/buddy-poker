## [1.6.1](https://github.com/linkiez/buddy-poker/compare/v1.6.0...v1.6.1) (2026-02-21)


### Bug Fixes

* align e2e session behavior and persist HTTP polling sessions ([3bef331](https://github.com/linkiez/buddy-poker/commit/3bef331b09767f80f7be3d1c707e6b06ea9d1705))

# [1.6.0](https://github.com/linkiez/buddy-poker/compare/v1.5.0...v1.6.0) (2026-02-08)


### Features

* disparar nova versão ([89e98d0](https://github.com/linkiez/buddy-poker/commit/89e98d07008cbb8f611454125960aecc0dc0b286))

# [1.5.0](https://github.com/linkiez/buddy-poker/compare/v1.4.0...v1.5.0) (2026-02-08)


### Bug Fixes

* estabilizar e2e e alinhar dependências do Angular ([8740285](https://github.com/linkiez/buddy-poker/commit/8740285516e319617b13e644a45b0b61309469a6))


### Features

* adicionar validação de fingerprint para prevenir múltiplas identidades ([503711e](https://github.com/linkiez/buddy-poker/commit/503711ec9044b9f2c4c5330388b871ee71970ade)), closes [#fingerprint-validation](https://github.com/linkiez/buddy-poker/issues/fingerprint-validation)
* implement session management for HttpPollingTransport, WebRtcTransport, and WebSocketTransport ([8e65c5e](https://github.com/linkiez/buddy-poker/commit/8e65c5ebac327ac547b7def62ea8262a297c37e5))

# [1.4.0](https://github.com/linkiez/buddy-poker/compare/v1.3.0...v1.4.0) (2026-01-13)


### Features

* add P2P transport mode indicator in UI ([ba3f94f](https://github.com/linkiez/buddy-poker/commit/ba3f94f3bd861924fbdbd4e91ebd5bf1e8b77557))
* implement P2P WebRTC Phase 5 (TURN infrastructure) ([0e3bf20](https://github.com/linkiez/buddy-poker/commit/0e3bf20c12815556298a64a87807804d6e0b5179))
* implement P2P WebRTC Phase 6 (E2E tests) - ALL PHASES COMPLETE ([f665dc0](https://github.com/linkiez/buddy-poker/commit/f665dc05add4eb45d988577087924b066c649ede))
* implement P2P WebRTC Phases 1-4 (signaling, transport, mesh, fallback) ([d54cb46](https://github.com/linkiez/buddy-poker/commit/d54cb46bf944db0ad6c524daef98f0ab3b2c192b))

# [1.3.0](https://github.com/linkiez/buddy-poker/compare/v1.2.0...v1.3.0) (2026-01-12)


### Bug Fixes

* clarify error suppression comment in poker-ws.service.ts ([209546e](https://github.com/linkiez/buddy-poker/commit/209546ec4b426039e0b32fde36c6f950c993ec6f))


### Features

* improve WebSocket fallback UX - reduce timeouts and suppress errors ([de5f0fc](https://github.com/linkiez/buddy-poker/commit/de5f0fcfeeed4ac83d058e67d8f0417622847e0c))

# [1.2.0](https://github.com/linkiez/buddy-poker/compare/v1.1.0...v1.2.0) (2026-01-12)


### Bug Fixes

* address code review feedback ([b3892b1](https://github.com/linkiez/buddy-poker/commit/b3892b18ad9091ec2ae310f2d78dd3c71b6a79db))


### Features

* implement WebSocket to HTTP fallback mechanism ([f412a51](https://github.com/linkiez/buddy-poker/commit/f412a51b2c8e6a00fa369f149ba7495082962a38))

# [1.1.0](https://github.com/linkiez/buddy-poker/compare/v1.0.3...v1.1.0) (2026-01-08)


### Features

* **redis:** suportar senha via env ([a8d6dd8](https://github.com/linkiez/buddy-poker/commit/a8d6dd8df2692bea5159cd125a6958e8ce8e006e))

## [1.0.3](https://github.com/linkiez/buddy-poker/compare/v1.0.2...v1.0.3) (2026-01-08)


### Bug Fixes

* **docker:** corrigir build com yarn 4 ([4ce9b8c](https://github.com/linkiez/buddy-poker/commit/4ce9b8cd91303fb1a9b9ff0ad9a3e98818528350))

## [1.0.2](https://github.com/linkiez/buddy-poker/compare/v1.0.1...v1.0.2) (2026-01-08)


### Bug Fixes

* **ci:** corrigir publishCmd do docker no release ([2011b46](https://github.com/linkiez/buddy-poker/commit/2011b46eba7a5fc1feadf85cf0888811b1e275c9))

## [1.0.1](https://github.com/linkiez/buddy-poker/compare/v1.0.0...v1.0.1) (2026-01-08)


### Bug Fixes

* **ci:** corrigir env do GHCR no semantic-release ([fa8b435](https://github.com/linkiez/buddy-poker/commit/fa8b435ecc8d47b3c4e291e351a01009e22bbbd4))

# 1.0.0 (2026-01-08)


### Bug Fixes

* **build:** trocar yarn para node-modules ([ecad347](https://github.com/linkiez/buddy-poker/commit/ecad34738280aedfb1f4a98ad2b4c7bad43ed35d))
* **ci:** atualizar lockfile do yarn ([0ec56fc](https://github.com/linkiez/buddy-poker/commit/0ec56fc9173c2d8cc87585e47506068f8452cadb))
* **ci:** corrigir yarn do workflow ([113b012](https://github.com/linkiez/buddy-poker/commit/113b012ae63cff8a85c5df40a7fa831ead43061d))
* **ci:** estabilizar cache do yarn no runner ([796dfea](https://github.com/linkiez/buddy-poker/commit/796dfea84684a71a6260a7724696446f340f9e86))
* **ci:** evitar cache stale do yarn ([cac074a](https://github.com/linkiez/buddy-poker/commit/cac074ab502b70a814e1408bf54f132c5d14a566))
* **ci:** remover cache do yarn no workflow ([86c9ad0](https://github.com/linkiez/buddy-poker/commit/86c9ad024a5996c487cbe22a5d0c6e8dcdab8793))


### Features

* add release workflow and semantic-release configuration ([2552914](https://github.com/linkiez/buddy-poker/commit/2552914e9f9942fdbeb11fea141c80125a2f7151))
