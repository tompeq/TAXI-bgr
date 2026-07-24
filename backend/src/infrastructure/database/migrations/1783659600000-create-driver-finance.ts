import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverFinance1783659600000 implements MigrationInterface {
  name = 'CreateDriverFinance1783659600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE commission_ledger_entry_type AS ENUM (
        'order_accrual',
        'manual_adjustment',
        'settlement'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE service_settings
        ADD COLUMN commission_percent smallint NOT NULL DEFAULT 0,
        ADD CONSTRAINT service_settings_commission_percent_check
          CHECK (commission_percent BETWEEN 0 AND 100)
    `);
    await queryRunner.query(`
      ALTER TABLE driver_profiles
        ADD COLUMN transfer_phone varchar(16),
        ADD COLUMN transfer_bank varchar(120),
        ADD COLUMN commission_percent_override smallint,
        ADD CONSTRAINT driver_profiles_commission_percent_override_check
          CHECK (
            commission_percent_override IS NULL
            OR commission_percent_override BETWEEN 0 AND 100
          )
    `);
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN commission_rate_percent smallint NOT NULL DEFAULT 0,
        ADD COLUMN commission_amount integer NOT NULL DEFAULT 0,
        ADD COLUMN transfer_declared_at timestamptz,
        ADD CONSTRAINT orders_commission_rate_percent_check
          CHECK (commission_rate_percent BETWEEN 0 AND 100),
        ADD CONSTRAINT orders_commission_amount_non_negative_check
          CHECK (commission_amount >= 0)
    `);
    await queryRunner.query(`
      CREATE TABLE driver_commission_ledger_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_user_id uuid NOT NULL,
        order_id uuid UNIQUE,
        type commission_ledger_entry_type NOT NULL,
        amount integer NOT NULL,
        note varchar(500),
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT driver_commission_ledger_entries_driver_fk
          FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT driver_commission_ledger_entries_order_fk
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
        CONSTRAINT driver_commission_ledger_entries_creator_fk
          FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX driver_commission_ledger_entries_driver_time_idx
      ON driver_commission_ledger_entries (driver_user_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS driver_commission_ledger_entries_driver_time_idx',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS driver_commission_ledger_entries',
    );
    await queryRunner.query(`
      ALTER TABLE orders
        DROP CONSTRAINT IF EXISTS orders_commission_amount_non_negative_check,
        DROP CONSTRAINT IF EXISTS orders_commission_rate_percent_check,
        DROP COLUMN IF EXISTS transfer_declared_at,
        DROP COLUMN IF EXISTS commission_amount,
        DROP COLUMN IF EXISTS commission_rate_percent
    `);
    await queryRunner.query(`
      ALTER TABLE driver_profiles
        DROP CONSTRAINT IF EXISTS driver_profiles_commission_percent_override_check,
        DROP COLUMN IF EXISTS commission_percent_override,
        DROP COLUMN IF EXISTS transfer_bank,
        DROP COLUMN IF EXISTS transfer_phone
    `);
    await queryRunner.query(`
      ALTER TABLE service_settings
        DROP CONSTRAINT IF EXISTS service_settings_commission_percent_check,
        DROP COLUMN IF EXISTS commission_percent
    `);
    await queryRunner.query('DROP TYPE IF EXISTS commission_ledger_entry_type');
  }
}
