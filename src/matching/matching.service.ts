import { Injectable } from '@nestjs/common';

interface WaitingUser {
  socketId: string;
  timestamp: number;
}

interface ConnectionState {
  partnerId: string;
  isEstablished: boolean;
  timestamp: number;
}

@Injectable()
export class MatchingService {
  private waitingQueue: WaitingUser[] = [];
  private activeConnections: Map<string, string> = new Map();
  private connectionStates: Map<string, ConnectionState> = new Map();

  addToQueue(socketId: string): string | null {
    // Remove from any existing connections first
    this.connectionStates.delete(socketId);

    if (this.activeConnections.has(socketId)) {
      return null;
    }

    if (this.waitingQueue.length > 0) {
      const partner = this.waitingQueue.shift();
      if (partner) {
        // Create connection state tracking
        this.connectionStates.set(socketId, {
          partnerId: partner.socketId,
          isEstablished: false,
          timestamp: Date.now(),
        });
        this.connectionStates.set(partner.socketId, {
          partnerId: socketId,
          isEstablished: false,
          timestamp: Date.now(),
        });

        this.activeConnections.set(socketId, partner.socketId);
        this.activeConnections.set(partner.socketId, socketId);
        return partner.socketId;
      }
    }

    this.waitingQueue.push({
      socketId,
      timestamp: Date.now(),
    });

    return null;
  }

  removeFromQueue(socketId: string): void {
    this.waitingQueue = this.waitingQueue.filter(
      (user) => user.socketId !== socketId,
    );
  }

  getPartner(socketId: string): string | undefined {
    return this.activeConnections.get(socketId);
  }

  disconnect(socketId: string): string | undefined {
    const partnerId = this.activeConnections.get(socketId);

    this.activeConnections.delete(socketId);
    this.connectionStates.delete(socketId);

    if (partnerId) {
      this.activeConnections.delete(partnerId);
      this.connectionStates.delete(partnerId);
    }

    this.removeFromQueue(socketId);

    return partnerId;
  }

  skipPartner(socketId: string): string | undefined {
    const partnerId = this.disconnect(socketId);
    return partnerId;
  }

  isConnectionValid(socketId: string, partnerId: string): boolean {
    const currentPartner = this.activeConnections.get(socketId);
    return currentPartner === partnerId;
  }

  markConnectionEstablished(socketId: string): void {
    const state = this.connectionStates.get(socketId);
    if (state) {
      state.isEstablished = true;
    }
  }

  isConnectionEstablished(socketId: string): boolean {
    const state = this.connectionStates.get(socketId);
    return state ? state.isEstablished : false;
  }

  getStats() {
    return {
      waitingUsers: this.waitingQueue.length,
      activeConnections: this.activeConnections.size / 2,
    };
  }
}
