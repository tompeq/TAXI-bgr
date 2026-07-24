import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowPhonePerRole1783756800000 implements MigrationInterface {
  name = 'AllowPhonePerRole1783756800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS users_phone_unique_idx');
    await queryRunner.query(
      'CREATE UNIQUE INDEX users_phone_role_unique_idx ON users (phone, role)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS users_phone_role_unique_idx');
    await queryRunner.query(
      'CREATE UNIQUE INDEX users_phone_unique_idx ON users (phone)',
    );
  }
}
