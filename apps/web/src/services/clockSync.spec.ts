import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Socket } from 'socket.io-client';
import { SocketEvent, ClockPingPayload, ClockPongPayload } from '@dyswis/shared-types';
import { ClockSyncService } from './clockSync';

describe('ClockSyncService', () => {
  let mockSocket: Partial<Socket>;
  let listeners: Record<string, (payload: ClockPongPayload) => void>;

  beforeEach(() => {
    listeners = {};
    mockSocket = {
      on: vi.fn((event: string, callback: (payload: ClockPongPayload) => void) => {
        listeners[event] = callback;
        return mockSocket as Socket;
      }) as unknown as Socket['on'],
      emit: vi.fn() as unknown as Socket['emit'],
    };
  });

  it('should initialize in unready state with zero offset and RTT', () => {
    const service = new ClockSyncService(mockSocket as Socket);

    expect(service.isReady()).toBe(false);
    expect(service.getOffset()).toBe(0);
    expect(service.getRTT()).toBe(0);
  });

  it('should reject network jitter, select minimum RTT sample, and compute precise clock offset', async () => {
    // True clock offset: server is 5000ms ahead of client
    const TRUE_OFFSET = 5000;

    // Simulated RTTs for 5 consecutive samples (with jitter spikes)
    const simulatedRtts = [140, 40, 90, 260, 60];
    let sampleIndex = 0;
    let simulatedClientTime = 10000;

    // Date.now spy to simulate progressing local time
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => simulatedClientTime);

    mockSocket.emit = vi.fn((event: string, payload: ClockPingPayload) => {
      if (event === SocketEvent.CLOCK_PING) {
        const rtt = simulatedRtts[sampleIndex];
        const halfRtt = rtt / 2;
        const t0 = payload.clientTime;
        const serverTime = t0 + halfRtt + TRUE_OFFSET;

        // Advance client clock by RTT when pong arrives
        simulatedClientTime = t0 + rtt;
        sampleIndex++;

        // Respond asynchronously with CLOCK_PONG
        setTimeout(() => {
          const pongHandler = listeners[SocketEvent.CLOCK_PONG];
          if (pongHandler) {
            pongHandler({
              clientTime: t0,
              serverTime,
            } as ClockPongPayload);
          }
        }, 0);
      }
      return mockSocket as Socket;
    });

    const service = new ClockSyncService(mockSocket as Socket);
    const syncPromise = service.start();

    const finalOffset = await syncPromise;

    // Minimum RTT in samples is 40ms (sampleIndex 1)
    expect(service.getRTT()).toBe(40);
    expect(finalOffset).toBe(TRUE_OFFSET);
    expect(service.getOffset()).toBe(TRUE_OFFSET);
    expect(service.isReady()).toBe(true);

    // Verify time translation from server timestamp to local timestamp
    const serverTimestamp = 25000;
    expect(service.getLocalTime(serverTimestamp)).toBe(serverTimestamp - TRUE_OFFSET);

    dateSpy.mockRestore();
  });
});
