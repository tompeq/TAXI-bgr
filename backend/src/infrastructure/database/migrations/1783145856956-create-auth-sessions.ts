import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthSessions1783145856956 implements MigrationInterface {
  name = 'CreateAuthSessions1783145856956';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE auth_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        refresh_token_hash char(64) NOT NULL,
        device_name varchar(160),
        last_ip inet,
        expires_at timestamptz NOT NULL,
        last_used_at timestamptz,
        revoked_at timestamptz,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT auth_sessions_user_fk
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX auth_sessions_user_active_idx
      ON auth_sessions (user_id, expires_at DESC)
      WHERE revoked_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX auth_sessions_expiration_idx
      ON auth_sessions (expires_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS auth_sessions');
  }
}
