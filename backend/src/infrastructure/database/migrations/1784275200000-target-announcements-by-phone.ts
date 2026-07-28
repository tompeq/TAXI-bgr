import { MigrationInterface, QueryRunner } from 'typeorm';

export class TargetAnnouncementsByPhone1784275200000 implements MigrationInterface {
  name = 'TargetAnnouncementsByPhone1784275200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_announcements
      ADD COLUMN target_phone varchar(16)
    `);
    await queryRunner.query(`
      UPDATE user_announcements
      SET target_role = NULL
      WHERE target_user_id IS NOT NULL
        AND target_role IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE user_announcements
      DROP CONSTRAINT user_announcements_target_check,
      ADD CONSTRAINT user_announcements_target_check
        CHECK (
          num_nonnulls(target_role, target_user_id, target_phone) = 1
        )
    `);
    await queryRunner.query(`
      CREATE INDEX user_announcements_target_phone_idx
      ON user_announcements (target_phone)
      WHERE target_phone IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM user_announcements
      WHERE target_phone IS NOT NULL
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS user_announcements_target_phone_idx
    `);
    await queryRunner.query(`
      ALTER TABLE user_announcements
      DROP CONSTRAINT user_announcements_target_check,
      DROP COLUMN target_phone,
      ADD CONSTRAINT user_announcements_target_check
        CHECK (target_role IS NOT NULL OR target_user_id IS NOT NULL)
    `);
  }
}
