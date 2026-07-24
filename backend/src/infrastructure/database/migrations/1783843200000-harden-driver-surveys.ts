import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenDriverSurveys1783843200000 implements MigrationInterface {
  name = 'HardenDriverSurveys1783843200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX driver_survey_responses_harbor_order_unique_idx
      ON driver_survey_responses (driver_user_id, order_id)
      WHERE survey_type = 'road_harbor' AND order_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS driver_survey_responses_harbor_order_unique_idx',
    );
  }
}
