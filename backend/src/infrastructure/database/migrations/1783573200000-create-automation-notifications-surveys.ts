import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAutomationNotificationsSurveys1783573200000 implements MigrationInterface {
  name = 'CreateAutomationNotificationsSurveys1783573200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE service_settings (
        id smallint PRIMARY KEY DEFAULT 1,
        accepted_order_timeout_seconds integer NOT NULL DEFAULT 180,
        free_waiting_minutes integer NOT NULL DEFAULT 10,
        waiting_price_per_minute integer NOT NULL DEFAULT 10,
        arrival_soon_minutes integer NOT NULL DEFAULT 3,
        price_survey_enabled boolean NOT NULL DEFAULT true,
        price_survey_interval_days integer NOT NULL DEFAULT 3,
        price_survey_question varchar(300) NOT NULL DEFAULT 'Устраивают ли вас текущие цены на поездки?',
        price_survey_allow_suggestion boolean NOT NULL DEFAULT true,
        road_survey_enabled boolean NOT NULL DEFAULT true,
        road_survey_interval_days integer NOT NULL DEFAULT 1,
        road_survey_bgr_question varchar(300) NOT NULL DEFAULT 'Как вы оцениваете качество дорог по БГР?',
        road_survey_harbor_question varchar(300) NOT NULL DEFAULT 'Как вы оцениваете дорогу в Гавань?',
        harbor_survey_after_each_trip boolean NOT NULL DEFAULT true,
        road_bad_votes_required integer NOT NULL DEFAULT 3,
        road_good_votes_to_disable integer NOT NULL DEFAULT 3,
        road_surcharge_percent integer NOT NULL DEFAULT 20,
        updated_by_user_id uuid,
        version integer NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT service_settings_singleton_check CHECK (id = 1),
        CONSTRAINT service_settings_updated_by_fk
          FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`INSERT INTO service_settings (id) VALUES (1)`);

    await queryRunner.query(`
      ALTER TABLE orders
      ADD COLUMN waiting_started_at timestamptz,
      ADD COLUMN waiting_charge_amount integer NOT NULL DEFAULT 0,
      ADD COLUMN arrival_notified_at timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE orders
      ADD CONSTRAINT orders_waiting_charge_non_negative_check
      CHECK (waiting_charge_amount >= 0)
    `);

    await queryRunner.query(`
      CREATE TYPE device_platform AS ENUM ('android', 'ios')
    `);
    await queryRunner.query(`
      CREATE TABLE device_registrations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        token varchar(512) NOT NULL UNIQUE,
        platform device_platform NOT NULL,
        device_name varchar(120),
        enabled boolean NOT NULL DEFAULT true,
        last_seen_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT device_registrations_user_fk
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX device_registrations_user_enabled_idx
      ON device_registrations (user_id)
      WHERE enabled = true
    `);

    await queryRunner.query(`
      CREATE TYPE driver_survey_type AS ENUM ('price', 'road_bgr', 'road_harbor')
    `);
    await queryRunner.query(`
      CREATE TYPE driver_survey_answer AS ENUM ('satisfied', 'not_satisfied', 'good', 'bad')
    `);
    await queryRunner.query(`
      CREATE TABLE driver_survey_responses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_user_id uuid NOT NULL,
        survey_type driver_survey_type NOT NULL,
        answer driver_survey_answer NOT NULL,
        suggestion varchar(500),
        order_id uuid,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT driver_survey_responses_driver_fk
          FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT driver_survey_responses_order_fk
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX driver_survey_responses_driver_type_time_idx
      ON driver_survey_responses (driver_user_id, survey_type, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE TYPE road_condition_area AS ENUM ('bgr', 'harbor')
    `);
    await queryRunner.query(`
      CREATE TABLE road_condition_states (
        area road_condition_area PRIMARY KEY,
        surcharge_active boolean NOT NULL DEFAULT false,
        bad_votes integer NOT NULL DEFAULT 0,
        good_votes integer NOT NULL DEFAULT 0,
        state_changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      INSERT INTO road_condition_states (area) VALUES ('bgr'), ('harbor')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS road_condition_states');
    await queryRunner.query('DROP TYPE IF EXISTS road_condition_area');
    await queryRunner.query('DROP TABLE IF EXISTS driver_survey_responses');
    await queryRunner.query('DROP TYPE IF EXISTS driver_survey_answer');
    await queryRunner.query('DROP TYPE IF EXISTS driver_survey_type');
    await queryRunner.query('DROP TABLE IF EXISTS device_registrations');
    await queryRunner.query('DROP TYPE IF EXISTS device_platform');
    await queryRunner.query(`
      ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS orders_waiting_charge_non_negative_check,
      DROP COLUMN IF EXISTS arrival_notified_at,
      DROP COLUMN IF EXISTS waiting_charge_amount,
      DROP COLUMN IF EXISTS waiting_started_at
    `);
    await queryRunner.query('DROP TABLE IF EXISTS service_settings');
  }
}
