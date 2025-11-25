import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getApiStatus() {
    return {
      status: 'Online',
      version: '1.0.0',
      uptime: `${process.uptime().toFixed(2)} seconds`,
    };
  }
}
