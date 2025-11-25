import { Module } from '@nestjs/common';
import { CallingGateway } from './calling.gateway';
import { MatchingService } from '../matching/matching.service';

@Module({
  providers: [CallingGateway, MatchingService],
  exports: [MatchingService],
})
export class CallingModule {}
