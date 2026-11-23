import './instrument.js';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { configureApp } from './setup.js';

const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
});
configureApp(app);
await app.listen(app.get<AppConfig>(APP_CONFIG).PORT);
