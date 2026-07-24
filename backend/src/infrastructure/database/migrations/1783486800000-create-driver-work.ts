import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverWork1783486800000 implements MigrationInterface {
  name = 'CreateDriverWork1783486800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE driver_work_status AS ENUM ('online', 'break')
    `);

    await queryRunner.query(`
      CREATE TABLE driver_work_settings (
        driver_user_id uuid PRIMARY KEY,
        accepts_taxi boolean NOT NULL DEFAULT true,
        accepts_delivery boolean NOT NULL DEFAULT true,
        background_notifications boolean NOT NULL DEFAULT true,
        night_notifications boolean NOT NULL DEFAULT false,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT driver_work_settings_driver_fk
          FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT driver_work_settings_kind_check
          CHECK (accepts_taxi OR accepts_delivery)
      )
    `);
    await queryRunner.query(`
      INSERT INTO driver_work_settings (driver_user_id)
      SELECT id
      FROM users
      WHERE role = 'driver'
      ON CONFLICT (driver_user_id) DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE driver_shifts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_user_id uuid NOT NULL,
        status driver_work_status NOT NULL DEFAULT 'online',
        break_until timestamptz,
        started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at timestamptz,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT driver_shifts_driver_fk
          FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT driver_shifts_break_state_check
          CHECK (
            (status = 'break' AND break_until IS NOT NULL)
            OR (status = 'online' AND break_until IS NULL)
          )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX driver_shifts_one_active_idx
      ON driver_shifts (driver_user_id)
      WHERE ended_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX driver_shifts_active_status_idx
      ON driver_shifts (status, driver_user_id)
      WHERE ended_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX driver_shifts_driver_time_idx
      ON driver_shifts (driver_user_id, started_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS driver_shifts');
    await queryRunner.query('DROP TABLE IF EXISTS driver_work_settings');
    await queryRunner.query('DROP TYPE IF EXISTS driver_work_status');
  }
}
