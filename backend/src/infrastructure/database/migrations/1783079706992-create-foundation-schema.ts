import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFoundationSchema1783079706992 implements MigrationInterface {
  name = 'CreateFoundationSchema1783079706992';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await queryRunner.query(`
      CREATE TYPE user_role AS ENUM (
        'passenger',
        'driver',
        'lawyer',
        'developer'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE user_status AS ENUM (
        'active',
        'pending_verification',
        'blocked'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE driver_verification_status AS ENUM (
        'pending',
        'approved',
        'rejected',
        'blocked'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        phone varchar(16) NOT NULL,
        name varchar(120) NOT NULL,
        role user_role NOT NULL,
        status user_status NOT NULL DEFAULT 'active',
        avatar_object_key varchar(512),
        last_active_at timestamptz,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT users_phone_e164_check
          CHECK (phone ~ '^\\+[1-9][0-9]{7,14}$')
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX users_phone_unique_idx ON users (phone)',
    );
    await queryRunner.query(
      'CREATE INDEX users_role_status_idx ON users (role, status)',
    );

    await queryRunner.query(`
      CREATE TABLE driver_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        full_name varchar(200) NOT NULL,
        license_photo_key varchar(512) NOT NULL,
        car_photo_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
        verification_status driver_verification_status NOT NULL DEFAULT 'pending',
        reviewed_by_user_id uuid,
        reviewed_at timestamptz,
        review_comment text,
        blocked_reason text,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT driver_profiles_user_unique UNIQUE (user_id),
        CONSTRAINT driver_profiles_user_fk
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT driver_profiles_reviewer_fk
          FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT driver_profiles_car_photos_array_check
          CHECK (
            jsonb_typeof(car_photo_keys) = 'array'
            AND jsonb_array_length(car_photo_keys) = 4
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX driver_profiles_verification_status_idx
      ON driver_profiles (verification_status, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE service_zones (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(64) NOT NULL,
        name varchar(120) NOT NULL,
        boundary geometry(MultiPolygon, 4326) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT service_zones_code_unique UNIQUE (code),
        CONSTRAINT service_zones_boundary_valid_check
          CHECK (ST_IsValid(boundary) AND ST_SRID(boundary) = 4326)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX service_zones_boundary_gix
      ON service_zones USING GIST (boundary)
    `);

    await queryRunner.query(`
      CREATE TABLE activity_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type varchar(100) NOT NULL,
        actor_user_id uuid,
        entity_type varchar(80),
        entity_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT activity_events_actor_fk
          FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX activity_events_type_time_idx
      ON activity_events (event_type, occurred_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX activity_events_actor_time_idx
      ON activity_events (actor_user_id, occurred_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE outbox_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        aggregate_type varchar(80) NOT NULL,
        aggregate_id uuid NOT NULL,
        event_type varchar(100) NOT NULL,
        payload jsonb NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        published_at timestamptz,
        attempts integer NOT NULL DEFAULT 0,
        last_error text,
        CONSTRAINT outbox_events_attempts_non_negative_check
          CHECK (attempts >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX outbox_events_unpublished_idx
      ON outbox_events (occurred_at)
      WHERE published_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS outbox_events');
    await queryRunner.query('DROP TABLE IF EXISTS activity_events');
    await queryRunner.query('DROP TABLE IF EXISTS service_zones');
    await queryRunner.query('DROP TABLE IF EXISTS driver_profiles');
    await queryRunner.query('DROP TABLE IF EXISTS users');
    await queryRunner.query('DROP TYPE IF EXISTS driver_verification_status');
    await queryRunner.query('DROP TYPE IF EXISTS user_status');
    await queryRunner.query('DROP TYPE IF EXISTS user_role');
  }
}
