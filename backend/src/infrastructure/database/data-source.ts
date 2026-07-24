import 'dotenv/config';

import { join } from 'node:path';
import { DataSource } from 'typeorm';

const sslEnabled = process.env.DB_SSL === 'true';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? 'taxi_bgr',
  username: process.env.DB_USER ?? 'taxi_bgr',
  password: process.env.DB_PASSWORD ?? 'taxi_bgr_dev',
  applicationName: 'taxi-bgr-migrations',
  entities: [join(__dirname, '../../modules/**/*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  ssl: sslEnabled
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      }
    : false,
});
