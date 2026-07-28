import { MigrationInterface, QueryRunner } from 'typeorm';

export class CorrectQuarryLandmark1784188800000 implements MigrationInterface {
  name = 'CorrectQuarryLandmark1784188800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE service_zones
      SET
        name = 'Quarry',
        boundary = ST_Multi(
          ST_Buffer(
            ST_SetSRID(ST_MakePoint(140.45700, 52.43720), 4326)::geography,
            1200
          )::geometry
        )
      WHERE code = 'quarry'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE service_zones
      SET boundary = ST_Multi(
        ST_Buffer(
          ST_SetSRID(ST_MakePoint(140.43950, 52.39279), 4326)::geography,
          1200
        )::geometry
      )
      WHERE code = 'quarry'
    `);
  }
}
