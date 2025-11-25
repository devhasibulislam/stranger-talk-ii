import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchingService } from '../matching/matching.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class CallingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(private readonly matchingService: MatchingService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    const partnerId = this.matchingService.disconnect(client.id);

    if (partnerId) {
      this.server.to(partnerId).emit('partner-disconnected');
    }
  }

  @SubscribeMessage('start-calling')
  handleStartCalling(@ConnectedSocket() client: Socket) {
    const partnerId = this.matchingService.addToQueue(client.id);

    if (partnerId) {
      client.emit('matched', { partnerId });
      this.server.to(partnerId).emit('matched', { partnerId: client.id });
    } else {
      client.emit('waiting');
    }
  }

  @SubscribeMessage('skip-partner')
  handleSkipPartner(@ConnectedSocket() client: Socket) {
    const partnerId = this.matchingService.skipPartner(client.id);

    if (partnerId) {
      this.server.to(partnerId).emit('partner-skipped');
    }

    const newPartnerId = this.matchingService.addToQueue(client.id);

    if (newPartnerId) {
      client.emit('matched', { partnerId: newPartnerId });
      this.server.to(newPartnerId).emit('matched', { partnerId: client.id });
    } else {
      client.emit('waiting');
    }
  }

  @SubscribeMessage('end-calling')
  handleEndCalling(@ConnectedSocket() client: Socket) {
    const partnerId = this.matchingService.disconnect(client.id);

    if (partnerId) {
      this.server.to(partnerId).emit('partner-ended');
    }

    client.emit('call-ended');
  }

  @SubscribeMessage('webrtc-offer')
  handleOffer(
    @MessageBody() data: { offer: RTCSessionDescriptionInit },
    @ConnectedSocket() client: Socket,
  ) {
    const partnerId = this.matchingService.getPartner(client.id);

    if (partnerId) {
      this.server.to(partnerId).emit('webrtc-offer', {
        offer: data.offer,
        from: client.id,
      });
    }
  }

  @SubscribeMessage('webrtc-answer')
  handleAnswer(
    @MessageBody() data: { answer: RTCSessionDescriptionInit },
    @ConnectedSocket() client: Socket,
  ) {
    const partnerId = this.matchingService.getPartner(client.id);

    if (partnerId) {
      this.server.to(partnerId).emit('webrtc-answer', {
        answer: data.answer,
        from: client.id,
      });
    }
  }

  @SubscribeMessage('webrtc-ice-candidate')
  handleIceCandidate(
    @MessageBody() data: { candidate: RTCIceCandidateInit },
    @ConnectedSocket() client: Socket,
  ) {
    const partnerId = this.matchingService.getPartner(client.id);

    if (partnerId) {
      this.server.to(partnerId).emit('webrtc-ice-candidate', {
        candidate: data.candidate,
        from: client.id,
      });
    }
  }

  @SubscribeMessage('get-stats')
  handleGetStats(@ConnectedSocket() client: Socket) {
    const stats = this.matchingService.getStats();
    client.emit('stats', stats);
  }
}
