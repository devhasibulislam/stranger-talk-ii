import { Injectable } from '@nestjs/common';

interface WaitingUser {
  socketId: string;
  timestamp: number;
}

@Injectable()
export class MatchingService {
  private waitingQueue: WaitingUser[] = [];
  private activeConnections: Map<string, string> = new Map();

  addToQueue(socketId: string): string | null {
    if (this.activeConnections.has(socketId)) {
      return null;
    }

    if (this.waitingQueue.length > 0) {
      const partner = this.waitingQueue.shift();
      if (partner) {
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
    if (partnerId) {
      this.activeConnections.delete(partnerId);
    }

    this.removeFromQueue(socketId);

    return partnerId;
  }

  skipPartner(socketId: string): string | undefined {
    const partnerId = this.disconnect(socketId);
    return partnerId;
  }

  getStats() {
    return {
      waitingUsers: this.waitingQueue.length,
      activeConnections: this.activeConnections.size / 2,
    };
  }
}
