import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true gives Better Auth access to raw body while keeping JSON parsing for all routes
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:3010',
    ],
    credentials: true,
  });

  const port = process.env.PORT || 3003;
  await app.listen(port);
  console.log(`SMS Platform API running on http://localhost:${port}`);
}

bootstrap();
