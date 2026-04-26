import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

// JSON.stringify does not know how to serialize BigInt — Prisma returns
// BigInt for several columns (Recording.totalSize, RecordingSegment.size).
// Monkey-patch once at boot so responses containing those fields serialize
// to string instead of throwing "Do not know how to serialize a BigInt".
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  // rawBody: true gives Better Auth access to raw body while keeping JSON parsing for all routes
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Enable NestJS shutdown hooks so OnApplicationShutdown fires on
  // SIGTERM/SIGINT/SIGHUP — required by ResilienceService to SIGTERM
  // running FFmpeg children before the process exits (T-15-05 mitigation).
  app.enableShutdownHooks();

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:3010',
    ],
    credentials: true,
  });

  // Swagger API documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('StreamBridge API')
    .setDescription(
      'Surveillance Management System — Developer API for managing cameras, streams, playback sessions, and webhooks.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
    .addCookieAuth('better-auth.session_token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 3003;
  await app.listen(port);
  console.log(`StreamBridge API running on http://localhost:${port}`);
}

bootstrap();
