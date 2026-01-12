import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomComponent } from './room.component';
import { PokerWsService } from '../poker/poker-ws.service';
import type { PokerRoomViewState } from '../poker/poker-types';
import type { TransportMode } from '../poker/transport.types';

describe('RoomComponent', () => {
  let component: RoomComponent;
  let mockWsService: any;
  let mockRouter: any;
  let mockActivatedRoute: any;

  // Create BehaviorSubjects for observables
  let stateSubject: BehaviorSubject<PokerRoomViewState | null>;
  let clientIdSubject: BehaviorSubject<string | null>;
  let roomTokenSubject: BehaviorSubject<string | null>;
  let errorSubject: BehaviorSubject<string | null>;
  let statusSubject: BehaviorSubject<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>;
  let modeSubject: BehaviorSubject<TransportMode | null>;

  beforeEach(() => {
    // Initialize subjects
    stateSubject = new BehaviorSubject<PokerRoomViewState | null>(null);
    clientIdSubject = new BehaviorSubject<string | null>(null);
    roomTokenSubject = new BehaviorSubject<string | null>(null);
    errorSubject = new BehaviorSubject<string | null>(null);
    statusSubject = new BehaviorSubject<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>(
      'disconnected',
    );
    modeSubject = new BehaviorSubject<TransportMode | null>(null);

    // Mock PokerWsService
    mockWsService = {
      state$: stateSubject.asObservable(),
      clientId$: clientIdSubject.asObservable(),
      roomToken$: roomTokenSubject.asObservable(),
      error$: errorSubject.asObservable(),
      status$: statusSubject.asObservable(),
      mode$: modeSubject.asObservable(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      vote: vi.fn(),
      reveal: vi.fn(),
      reset: vi.fn(),
      clearError: vi.fn(),
    };

    // Mock Router
    mockRouter = {
      navigate: vi.fn(),
    };

    // Mock ActivatedRoute
    mockActivatedRoute = {
      snapshot: {
        paramMap: convertToParamMap({ roomId: 'test-room' }),
        queryParamMap: convertToParamMap({}),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: PokerWsService, useValue: mockWsService },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    });

    const fixture = TestBed.createComponent(RoomComponent);
    component = fixture.componentInstance;
  });

  describe('transportMode subscription', () => {
    it('should update transportMode signal when mode$ emits websocket', () => {
      component.ngOnInit();

      modeSubject.next('websocket');

      expect(component['transportMode']()).toBe('websocket');
    });

    it('should update transportMode signal when mode$ emits http-polling', () => {
      component.ngOnInit();

      modeSubject.next('http-polling');

      expect(component['transportMode']()).toBe('http-polling');
    });

    it('should update transportMode signal when mode$ emits null', () => {
      component.ngOnInit();

      modeSubject.next('websocket');
      expect(component['transportMode']()).toBe('websocket');

      modeSubject.next(null);
      expect(component['transportMode']()).toBe(null);
    });

    it('should switch transportMode from websocket to http-polling when mode changes', () => {
      component.ngOnInit();

      modeSubject.next('websocket');
      expect(component['transportMode']()).toBe('websocket');

      modeSubject.next('http-polling');
      expect(component['transportMode']()).toBe('http-polling');
    });
  });

  describe('transportModeLabel computed property', () => {
    it('should return "WebSocket" when transportMode is websocket', () => {
      component.ngOnInit();

      modeSubject.next('websocket');

      expect(component['transportModeLabel']()).toBe('WebSocket');
    });

    it('should return "HTTP" when transportMode is http-polling', () => {
      component.ngOnInit();

      modeSubject.next('http-polling');

      expect(component['transportModeLabel']()).toBe('HTTP');
    });

    it('should return null when transportMode is null', () => {
      component.ngOnInit();

      modeSubject.next(null);

      expect(component['transportModeLabel']()).toBe(null);
    });

    it('should update label when mode switches from websocket to http-polling', () => {
      component.ngOnInit();

      modeSubject.next('websocket');
      expect(component['transportModeLabel']()).toBe('WebSocket');

      modeSubject.next('http-polling');
      expect(component['transportModeLabel']()).toBe('HTTP');
    });
  });

  describe('ngOnDestroy', () => {
    it('should unsubscribe from mode$ observable', () => {
      component.ngOnInit();

      const spy = vi.spyOn(component['subs'], 'unsubscribe');

      component.ngOnDestroy();

      expect(spy).toHaveBeenCalled();
    });
  });
});
