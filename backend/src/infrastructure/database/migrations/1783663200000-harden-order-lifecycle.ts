import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenOrderLifecycle1783663200000 implements MigrationInterface {
  name = 'HardenOrderLifecycle1783663200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN cancellation_fee_amount integer NOT NULL DEFAULT 0,
        ADD COLUMN scheduled_announced_at timestamptz,
        ADD CONSTRAINT orders_cancellation_fee_non_negative_check
          CHECK (cancellation_fee_amount >= 0)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX orders_one_active_per_passenger_idx
      ON orders (passenger_user_id)
      WHERE status IN (
        'open',
        'accepted',
        'driver_en_route',
        'arrived',
        'waiting',
        'started'
      )
    `);
    await queryRunner.query(`
      CREATE INDEX orders_open_scheduled_board_idx
      ON orders (scheduled_for, created_at DESC)
      WHERE status = 'open'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS orders_open_scheduled_board_idx',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS orders_one_active_per_passenger_idx',
    );
    await queryRunner.query(`
      ALTER TABLE orders
        DROP CONSTRAINT IF EXISTS orders_cancellation_fee_non_negative_check,
        DROP COLUMN IF EXISTS scheduled_announced_at,
        DROP COLUMN IF EXISTS cancellation_fee_amount
    `);
  }
}
