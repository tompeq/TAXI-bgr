import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEngagementAndScheduledOrders1784102400000 implements MigrationInterface {
  name = 'AddEngagementAndScheduledOrders1784102400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE service_settings
        ADD COLUMN waiting_base_fee integer NOT NULL DEFAULT 50
    `);
    await queryRunner.query(`
      UPDATE service_settings
      SET free_waiting_minutes = 10,
          waiting_base_fee = 50,
          waiting_price_per_minute = 5
    `);
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN cancellation_reason_code varchar(64),
        ADD COLUMN scheduled_one_hour_notified_at timestamptz,
        ADD COLUMN scheduled_fifteen_minutes_notified_at timestamptz,
        ADD COLUMN scheduled_five_minutes_notified_at timestamptz
    `);
    await queryRunner.query(
      'DROP INDEX IF EXISTS orders_one_active_per_driver_idx',
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX orders_one_driving_order_per_driver_idx
      ON orders (driver_user_id)
      WHERE driver_user_id IS NOT NULL
        AND status IN ('driver_en_route', 'arrived', 'waiting', 'started')
    `);

    await queryRunner.query(`
      CREATE TABLE order_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL,
        sender_user_id uuid NOT NULL,
        body varchar(1000) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT order_messages_order_fk
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT order_messages_sender_fk
          FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX order_messages_order_time_idx
      ON order_messages (order_id, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE order_ratings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL,
        author_user_id uuid NOT NULL,
        target_user_id uuid NOT NULL,
        score smallint NOT NULL,
        comment varchar(500),
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT order_ratings_order_fk
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT order_ratings_author_fk
          FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT order_ratings_target_fk
          FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT order_ratings_author_unique
          UNIQUE (order_id, author_user_id),
        CONSTRAINT order_ratings_score_check CHECK (score BETWEEN 1 AND 5),
        CONSTRAINT order_ratings_not_self_check
          CHECK (author_user_id <> target_user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX order_ratings_target_time_idx
      ON order_ratings (target_user_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE survey_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar(160) NOT NULL,
        question varchar(500) NOT NULL,
        target_role varchar(16) NOT NULL,
        answer_options jsonb NOT NULL DEFAULT '[]'::jsonb,
        allow_comment boolean NOT NULL DEFAULT true,
        enabled boolean NOT NULL DEFAULT false,
        starts_at timestamptz,
        display_time time,
        frequency_days integer,
        every_completed_trips integer,
        created_by_user_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT survey_templates_creator_fk
          FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT survey_templates_target_check
          CHECK (target_role IN ('passenger', 'driver', 'all')),
        CONSTRAINT survey_templates_options_check
          CHECK (jsonb_typeof(answer_options) = 'array'),
        CONSTRAINT survey_templates_frequency_check
          CHECK (frequency_days IS NULL OR frequency_days BETWEEN 1 AND 365),
        CONSTRAINT survey_templates_trips_check
          CHECK (
            every_completed_trips IS NULL
            OR every_completed_trips BETWEEN 1 AND 10000
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX survey_templates_due_idx
      ON survey_templates (enabled, target_role)
    `);
    await queryRunner.query(`
      CREATE TABLE survey_responses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id uuid NOT NULL,
        user_id uuid NOT NULL,
        answer varchar(300),
        comment varchar(1000),
        completed_trip_count integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT survey_responses_survey_fk
          FOREIGN KEY (survey_id) REFERENCES survey_templates(id) ON DELETE CASCADE,
        CONSTRAINT survey_responses_user_fk
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT survey_responses_content_check
          CHECK (answer IS NOT NULL OR comment IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX survey_responses_survey_time_idx
      ON survey_responses (survey_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX survey_responses_user_time_idx
      ON survey_responses (user_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE user_announcements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar(160) NOT NULL,
        body varchar(1000) NOT NULL,
        target_role varchar(16),
        target_user_id uuid,
        enabled boolean NOT NULL DEFAULT true,
        created_by_user_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT user_announcements_target_user_fk
          FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT user_announcements_creator_fk
          FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT user_announcements_target_role_check
          CHECK (
            target_role IS NULL
            OR target_role IN ('passenger', 'driver', 'all')
          ),
        CONSTRAINT user_announcements_target_check
          CHECK (target_role IS NOT NULL OR target_user_id IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE user_announcement_receipts (
        announcement_id uuid NOT NULL,
        user_id uuid NOT NULL,
        acknowledged_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (announcement_id, user_id),
        CONSTRAINT user_announcement_receipts_announcement_fk
          FOREIGN KEY (announcement_id)
          REFERENCES user_announcements(id)
          ON DELETE CASCADE,
        CONSTRAINT user_announcement_receipts_user_fk
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS user_announcement_receipts');
    await queryRunner.query('DROP TABLE IF EXISTS user_announcements');
    await queryRunner.query('DROP TABLE IF EXISTS survey_responses');
    await queryRunner.query('DROP TABLE IF EXISTS survey_templates');
    await queryRunner.query('DROP TABLE IF EXISTS order_ratings');
    await queryRunner.query('DROP TABLE IF EXISTS order_messages');
    await queryRunner.query(
      'DROP INDEX IF EXISTS orders_one_driving_order_per_driver_idx',
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX orders_one_active_per_driver_idx
      ON orders (driver_user_id)
      WHERE driver_user_id IS NOT NULL
        AND status IN (
          'accepted',
          'driver_en_route',
          'arrived',
          'waiting',
          'started'
        )
    `);
    await queryRunner.query(`
      ALTER TABLE orders
        DROP COLUMN scheduled_five_minutes_notified_at,
        DROP COLUMN scheduled_fifteen_minutes_notified_at,
        DROP COLUMN scheduled_one_hour_notified_at,
        DROP COLUMN cancellation_reason_code
    `);
    await queryRunner.query(`
      ALTER TABLE service_settings
        DROP COLUMN waiting_base_fee
    `);
  }
}
