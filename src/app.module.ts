import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CallingModule } from './calling/calling.module';

@Module({
  imports: [CallingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
