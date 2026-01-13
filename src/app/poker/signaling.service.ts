import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import type { PokerServerMessage } from './poker-types';

export interface PeerJoinedEvent {
  peerId: string;
  shouldInitiate: boolean;
}

export interface OfferEvent {
  fromPeerId: string;
  offer: RTCSessionDescriptionInit;
}

export interface AnswerEvent {
  fromPeerId: string;
  answer: RTCSessionDescriptionInit;
}

export interface IceCandidateEvent {
  fromPeerId: string;
  candidate: RTCIceCandidateInit;
}

export interface PeerLeftEvent {
  peerId: string;
}

@Injectable({
  providedIn: 'root',
})
export class SignalingService {
  private platformId = inject(PLATFORM_ID);
  private ws: WebSocket | null = null;
  private statusSubject = new BehaviorSubject<'disconnected' | 'connecting' | 'connected'>(
    'disconnected',
  );
  private peerJoinedSubject = new Subject<PeerJoinedEvent>();
  private offerSubject = new Subject<OfferEvent>();
  private answerSubject = new Subject<AnswerEvent>();
  private iceCandidateSubject = new Subject<IceCandidateEvent>();
  private peerLeftSubject = new Subject<PeerLeftEvent>();
  private peerListSubject = new Subject<PeerJoinedEvent[]>();

  readonly status$ = this.statusSubject.asObservable();
  readonly onPeerJoined$ = this.peerJoinedSubject.asObservable();
  readonly onOffer$ = this.offerSubject.asObservable();
  readonly onAnswer$ = this.answerSubject.asObservable();
  readonly onIceCandidate$ = this.iceCandidateSubject.asObservable();
  readonly onPeerLeft$ = this.peerLeftSubject.asObservable();
  readonly onPeerList$ = this.peerListSubject.asObservable();

  connect(roomId: string, token?: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return Promise.reject(new Error('WebRTC not available in SSR'));
    }

    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      this.ws = new WebSocket(wsUrl);
      this.statusSubject.next('connecting');

      this.ws.onopen = () => {
        this.statusSubject.next('connected');
        // Send webrtc-join message
        this.send({
          type: 'webrtc-join',
          roomId,
          ...(token ? { token } : {}),
        });
        resolve();
      };

      this.ws.onerror = () => {
        this.statusSubject.next('disconnected');
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as PokerServerMessage;
          this.handleMessage(msg);
        } catch {
          // Ignore invalid messages
        }
      };

      this.ws.onclose = () => {
        this.statusSubject.next('disconnected');
      };
    });
  }

  private handleMessage(msg: PokerServerMessage): void {
    switch (msg.type) {
      case 'webrtc-peer-list':
        this.peerListSubject.next(msg.peers);
        break;
      case 'webrtc-peer-joined':
        this.peerJoinedSubject.next({ peerId: msg.peerId, shouldInitiate: msg.shouldInitiate });
        break;
      case 'webrtc-peer-left':
        this.peerLeftSubject.next({ peerId: msg.peerId });
        break;
      case 'webrtc-offer':
        this.offerSubject.next({ fromPeerId: msg.fromPeerId, offer: msg.offer });
        break;
      case 'webrtc-answer':
        this.answerSubject.next({ fromPeerId: msg.fromPeerId, answer: msg.answer });
        break;
      case 'webrtc-ice-candidate':
        this.iceCandidateSubject.next({ fromPeerId: msg.fromPeerId, candidate: msg.candidate });
        break;
    }
  }

  sendOffer(targetPeerId: string, roomId: string, offer: RTCSessionDescriptionInit): void {
    this.send({
      type: 'webrtc-offer',
      roomId,
      targetPeerId,
      offer,
    });
  }

  sendAnswer(targetPeerId: string, roomId: string, answer: RTCSessionDescriptionInit): void {
    this.send({
      type: 'webrtc-answer',
      roomId,
      targetPeerId,
      answer,
    });
  }

  sendIceCandidate(targetPeerId: string, roomId: string, candidate: RTCIceCandidateInit): void {
    this.send({
      type: 'webrtc-ice-candidate',
      roomId,
      targetPeerId,
      candidate,
    });
  }

  private send(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.statusSubject.next('disconnected');
  }
}
