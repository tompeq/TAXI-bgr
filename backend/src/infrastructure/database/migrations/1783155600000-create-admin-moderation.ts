import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminModeration1783155600000 implements MigrationInterface {
  name = 'CreateAdminModeration1783155600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TYPE user_role RENAME TO user_role_old');
    await queryRunner.query(`
      CREATE TYPE user_role AS ENUM ('passenger', 'driver', 'admin')
    `);
    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN role TYPE user_role
      USING (
        CASE
          WHEN role::text IN ('lawyer', 'developer') THEN 'admin'
          ELSE role::text
        END
      )::user_role
    `);
    await queryRunner.query('DROP TYPE user_role_old');

    await queryRunner.query(`
      ALTER TABLE driver_profiles
      ALTER COLUMN verification_status DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TYPE driver_verification_status
      RENAME TO driver_verification_status_old
    `);
    await queryRunner.query(`
      CREATE TYPE driver_verification_status AS ENUM (
        'pending',
        'approved',
        'rejected',
        'changes_requested',
        'blocked'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE driver_profiles
      ALTER COLUMN verification_status TYPE driver_verification_status
      USING verification_status::text::driver_verification_status
    `);
    await queryRunner.query('DROP TYPE driver_verification_status_old');
    await queryRunner.query(`
      ALTER TABLE driver_profiles
      ALTER COLUMN verification_status SET DEFAULT 'pending'
    `);

    await queryRunner.query(`
      CREATE TABLE driver_verification_reviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_profile_id uuid NOT NULL,
        reviewer_user_id uuid NOT NULL,
        previous_status driver_verification_status NOT NULL,
        decision_status driver_verification_status NOT NULL,
        comment text,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT driver_verification_reviews_profile_fk
          FOREIGN KEY (driver_profile_id)
          REFERENCES driver_profiles(id)
          ON DELETE RESTRICT,
        CONSTRAINT driver_verification_reviews_reviewer_fk
          FOREIGN KEY (reviewer_user_id)
          REFERENCES users(id)
          ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX driver_verification_reviews_profile_time_idx
      ON driver_verification_reviews (driver_profile_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE driver_verification_reviews');

    await queryRunner.query(`
      ALTER TABLE driver_profiles
      ALTER COLUMN verification_status DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TYPE driver_verification_status
      RENAME TO driver_verification_status_new
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
      UPDATE driver_profiles
      SET verification_status = 'rejected'
      WHERE verification_status = 'changes_requested'
    `);
    await queryRunner.query(`
      ALTER TABLE driver_profiles
      ALTER COLUMN verification_status TYPE driver_verification_status
      USING verification_status::text::driver_verification_status
    `);
    await queryRunner.query('DROP TYPE driver_verification_status_new');
    await queryRunner.query(`
      ALTER TABLE driver_profiles
      ALTER COLUMN verification_status SET DEFAULT 'pending'
    `);

    await queryRunner.query('ALTER TYPE user_role RENAME TO user_role_new');
    await queryRunner.query(`
      CREATE TYPE user_role AS ENUM (
        'passenger',
        'driver',
        'lawyer',
        'developer'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN role TYPE user_role
      USING (
        CASE
          WHEN role::text = 'admin' THEN 'developer'
          ELSE role::text
        END
      )::user_role
    `);
    await queryRunner.query('DROP TYPE user_role_new');
  }
}
