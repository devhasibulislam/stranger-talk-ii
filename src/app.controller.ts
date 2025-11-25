import { Controller, Get, Render, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Render('index')
  root() {
    return { message: 'Welcome to Stranger Talk' };
  }

  @Get('api-status')
  @Render('api-status')
  getApiStatus() {
    return this.appService.getApiStatus();
  }

  @Get('error/forbidden')
  @Render('403')
  @HttpCode(HttpStatus.FORBIDDEN)
  getForbidden() {
    return { message: 'You do not have permission to access this resource.' };
  }

  @Get('error/not-found')
  @Render('404')
  @HttpCode(HttpStatus.NOT_FOUND)
  getNotFound() {
    return { message: 'The page you are looking for does not exist.' };
  }

  @Get('error/server-error')
  @Render('500')
  @HttpCode(HttpStatus.INTERNAL_SERVER_ERROR)
  getServerError() {
    return { message: 'An internal server error occurred.' };
  }
}
