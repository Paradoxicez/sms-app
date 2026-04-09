import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // bodyParser: false per RESEARCH.md Pitfall 3 — Better Auth needs raw request body
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3002',
    ],
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`SMS Platform API running on http://localhost:${port}`);
}

bootstrap();
