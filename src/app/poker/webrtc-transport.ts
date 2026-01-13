import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import type { Transport, TransportStatus, TransportEventHandlers } from './transport.types';
import type { PokerClientMessage, PokerServerMessage } from './poker-types';
import { SignalingService } from './signaling.service';

interface WebRtcConfig {
  iceServers: RTCIceServer[];
  connectionTimeout: number;
  maxPeers: number;
}

interface PeerConnection {
  pc: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  status: 'connecting' | 'connected' | 'failed' | 'closed';
}

@Injectable({
  providedIn: 'root',
})
export class WebRtcTransport implements Transport {
  private platformId = inject(PLATFORM_ID);
  private signalingService = inject(SignalingService);

  readonly mode = 'webrtc' as const;
  private statusSubject = new BehaviorSubject<TransportStatus>('disconnected');
  private handlers: TransportEventHandlers | null = null;
  private peerConnections = new Map<string, PeerConnection>();
  private config: WebRtcConfig | null = null;
  private myClientId: string | null = null;
  private roomId: string | null = null;
  private connectionTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private hasInitialConnection = false;

  get status(): TransportStatus {
    return this.statusSubject.value;
  }

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Subscribe to signaling events
    this.signalingService.onPeerList$.subscribe((peers) => {
      for (const peer of peers) {
        if (peer.shouldInitiate) {
          void this.createOffer(peer.peerId);
        }
      }
    });

    this.signalingService.onPeerJoined$.subscribe((event) => {
      if (event.shouldInitiate) {
        void this.createOffer(event.peerId);
      }
    });

    this.signalingService.onPeerLeft$.subscribe((event) => {
      this.closePeerConnection(event.peerId);
    });

    this.signalingService.onOffer$.subscribe((event) => {
      void this.handleOffer(event.fromPeerId, event.offer);
    });

    this.signalingService.onAnswer$.subscribe((event) => {
      void this.handleAnswer(event.fromPeerId, event.answer);
    });

    this.signalingService.onIceCandidate$.subscribe((event) => {
      void this.handleIceCandidate(event.fromPeerId, event.candidate);
    });
  }

  setHandlers(handlers: TransportEventHandlers): void {
    this.handlers = handlers;
  }

  async connect(roomId: string, name: string, token?: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('WebRTC not available in SSR');
    }

    if (!this.isWebRtcSupported()) {
      throw new Error('WebRTC not supported in this browser');
    }

    this.statusSubject.next('connecting');
    this.handlers?.onStatusChange('connecting');
    this.roomId = roomId;

    try {
      // Fetch WebRTC configuration
      this.config = await this.fetchWebRtcConfig();

      // Connect to signaling server
      await this.signalingService.connect(roomId, token);

      // Set timeout for initial connection
      this.connectionTimeoutHandle = setTimeout(() => {
        if (!this.hasInitialConnection && this.peerConnections.size === 0) {
          console.warn('[WebRtcTransport] Connection timeout - no peers connected');
          this.statusSubject.next('disconnected');
          this.handlers?.onStatusChange('disconnected');
          this.handlers?.onError('WebRTC connection timeout');
        }
      }, this.config.connectionTimeout);
    } catch (error) {
      console.error('[WebRtcTransport] Failed to connect:', error);
      this.statusSubject.next('disconnected');
      this.handlers?.onStatusChange('disconnected');
      throw error;
    }
  }

  send(message: PokerClientMessage): void {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    for (const [peerId, conn] of this.peerConnections.entries()) {
      if (conn.dataChannel && conn.dataChannel.readyState === 'open') {
        try {
          conn.dataChannel.send(messageStr);
          sentCount++;
        } catch (error) {
          console.error(`[WebRtcTransport] Failed to send to peer ${peerId}:`, error);
        }
      }
    }

    if (sentCount === 0) {
      console.warn('[WebRtcTransport] No open data channels to send message');
    }
  }

  disconnect(): void {
    if (this.connectionTimeoutHandle) {
      clearTimeout(this.connectionTimeoutHandle);
      this.connectionTimeoutHandle = null;
    }

    for (const [peerId] of this.peerConnections) {
      this.closePeerConnection(peerId);
    }

    this.signalingService.disconnect();
    this.statusSubject.next('disconnected');
    this.handlers?.onStatusChange('disconnected');
    this.hasInitialConnection = false;
  }

  hasConnectionFailed(): boolean {
    // If we tried to connect but have no successful connections
    return (
      this.statusSubject.value === 'disconnected' &&
      this.connectionTimeoutHandle === null &&
      this.peerConnections.size === 0 &&
      !this.hasInitialConnection
    );
  }

  getPeerConnections(): Map<string, RTCPeerConnection> {
    const result = new Map<string, RTCPeerConnection>();
    for (const [peerId, conn] of this.peerConnections) {
      result.set(peerId, conn.pc);
    }
    return result;
  }

  async getConnectionStats(): Promise<RTCStatsReport[]> {
    const reports: RTCStatsReport[] = [];
    for (const conn of this.peerConnections.values()) {
      const stats = await conn.pc.getStats();
      reports.push(stats);
    }
    return reports;
  }

  private isWebRtcSupported(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    return !!(
      window.RTCPeerConnection &&
      window.RTCSessionDescription &&
      window.RTCIceCandidate
    );
  }

  private async fetchWebRtcConfig(): Promise<WebRtcConfig> {
    try {
      const response = await fetch('/api/webrtc-config');
      return await response.json();
    } catch {
      // Return default config if fetch fails
      return {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        connectionTimeout: 15000,
        maxPeers: 8,
      };
    }
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    if (!this.config) {
      throw new Error('WebRTC config not loaded');
    }

    const pc = new RTCPeerConnection({ iceServers: this.config.iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate && this.roomId) {
        this.signalingService.sendIceCandidate(peerId, this.roomId, event.candidate.toJSON());
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRtcTransport] ICE connection state with ${peerId}: ${pc.iceConnectionState}`);

      const conn = this.peerConnections.get(peerId);
      if (!conn) return;

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        conn.status = 'connected';
        this.hasInitialConnection = true;

        // Check if we have at least one working connection
        const hasActiveConnection = Array.from(this.peerConnections.values()).some(
          (c) => c.status === 'connected',
        );

        if (hasActiveConnection && this.statusSubject.value !== 'connected') {
          this.statusSubject.next('connected');
          this.handlers?.onStatusChange('connected');

          if (this.connectionTimeoutHandle) {
            clearTimeout(this.connectionTimeoutHandle);
            this.connectionTimeoutHandle = null;
          }
        }
      } else if (pc.iceConnectionState === 'failed') {
        conn.status = 'failed';
        console.warn(`[WebRtcTransport] Connection failed with peer ${peerId}`);

        // If all connections failed, trigger fallback
        const allFailed = Array.from(this.peerConnections.values()).every(
          (c) => c.status === 'failed' || c.status === 'closed',
        );

        if (allFailed) {
          this.statusSubject.next('disconnected');
          this.handlers?.onStatusChange('disconnected');
          this.handlers?.onError('All WebRTC connections failed');
        }
      } else if (pc.iceConnectionState === 'disconnected') {
        // Wait for potential reconnection
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            this.closePeerConnection(peerId);
          }
        }, 5000);
      }
    };

    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    return pc;
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    const conn = this.peerConnections.get(peerId);
    if (conn) {
      conn.dataChannel = channel;
    }

    channel.onopen = () => {
      console.log(`[WebRtcTransport] DataChannel opened with peer ${peerId}`);
    };

    channel.onclose = () => {
      console.log(`[WebRtcTransport] DataChannel closed with peer ${peerId}`);
    };

    channel.onerror = (error) => {
      console.error(`[WebRtcTransport] DataChannel error with peer ${peerId}:`, error);
    };

    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as PokerServerMessage;
        this.handlers?.onMessage(msg);
      } catch (error) {
        console.error('[WebRtcTransport] Failed to parse message:', error);
      }
    };
  }

  private async createOffer(peerId: string): Promise<void> {
    if (!this.roomId) {
      return;
    }

    const pc = this.createPeerConnection(peerId);
    const dataChannel = pc.createDataChannel('poker', { ordered: true });

    this.peerConnections.set(peerId, {
      pc,
      dataChannel,
      status: 'connecting',
    });

    this.setupDataChannel(peerId, dataChannel);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (offer.sdp) {
        this.signalingService.sendOffer(peerId, this.roomId, {
          type: offer.type,
          sdp: offer.sdp,
        });
      }
    } catch (error) {
      console.error(`[WebRtcTransport] Failed to create offer for ${peerId}:`, error);
      this.closePeerConnection(peerId);
    }
  }

  private async handleOffer(fromPeerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.roomId) {
      return;
    }

    // Check for glare (both sides sent offers)
    const existingConn = this.peerConnections.get(fromPeerId);
    if (existingConn && existingConn.pc.signalingState !== 'stable') {
      // Use lexicographic comparison - higher ID discards its offer
      if (this.myClientId && this.myClientId > fromPeerId) {
        console.log(`[WebRtcTransport] Glare detected, discarding our offer to ${fromPeerId}`);
        this.closePeerConnection(fromPeerId);
      } else {
        console.log(`[WebRtcTransport] Glare detected, ignoring offer from ${fromPeerId}`);
        return;
      }
    }

    const pc = this.createPeerConnection(fromPeerId);
    this.peerConnections.set(fromPeerId, {
      pc,
      dataChannel: null,
      status: 'connecting',
    });

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (answer.sdp) {
        this.signalingService.sendAnswer(fromPeerId, this.roomId, {
          type: answer.type,
          sdp: answer.sdp,
        });
      }
    } catch (error) {
      console.error(`[WebRtcTransport] Failed to handle offer from ${fromPeerId}:`, error);
      this.closePeerConnection(fromPeerId);
    }
  }

  private async handleAnswer(
    fromPeerId: string,
    answer: RTCSessionDescriptionInit,
  ): Promise<void> {
    const conn = this.peerConnections.get(fromPeerId);
    if (!conn) {
      console.warn(`[WebRtcTransport] Received answer from unknown peer ${fromPeerId}`);
      return;
    }

    try {
      await conn.pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error(`[WebRtcTransport] Failed to handle answer from ${fromPeerId}:`, error);
      this.closePeerConnection(fromPeerId);
    }
  }

  private async handleIceCandidate(
    fromPeerId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const conn = this.peerConnections.get(fromPeerId);
    if (!conn) {
      return;
    }

    try {
      await conn.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error(`[WebRtcTransport] Failed to add ICE candidate from ${fromPeerId}:`, error);
    }
  }

  private closePeerConnection(peerId: string): void {
    const conn = this.peerConnections.get(peerId);
    if (!conn) {
      return;
    }

    if (conn.dataChannel) {
      conn.dataChannel.close();
    }
    conn.pc.close();
    conn.status = 'closed';
    this.peerConnections.delete(peerId);

    console.log(`[WebRtcTransport] Closed connection with peer ${peerId}`);
  }
}
