import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { HttpErrorFilter } from "./shared/http/http-error.filter";
import { RequestIdMiddleware } from "./shared/http/request-id.middleware";
import { logger } from "./shared/logger/logger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true
  });

  app.use(RequestIdMiddleware);
  app.useGlobalFilters(new HttpErrorFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  logger.info(`listening on :${port}`);
}

void bootstrap();

