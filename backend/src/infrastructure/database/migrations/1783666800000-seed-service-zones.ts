import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedServiceZones1783666800000 implements MigrationInterface {
  name = 'SeedServiceZones1783666800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO service_zones (code, name, boundary)
      VALUES
        (
          'upper_bgr',
          'Upper Bogorodskoye',
          ST_Multi(
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(140.4358, 52.3661), 4326)::geography,
              3500
            )::geometry
          )
        ),
        (
          'kombinat',
          'Kombinat',
          ST_Multi(
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(140.4217, 52.3585), 4326)::geography,
              1200
            )::geometry
          )
        ),
        (
          'lower_harbor',
          'Lower Harbor',
          ST_Multi(
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(140.3896, 52.3428), 4326)::geography,
              1200
            )::geometry
          )
        ),
        (
          'quarry',
          'Quarry',
          ST_Multi(
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(140.3658, 52.3315), 4326)::geography,
              1200
            )::geometry
          )
        )
      ON CONFLICT (code) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM service_zones
      WHERE code IN ('upper_bgr', 'kombinat', 'lower_harbor', 'quarry')
    `);
  }
}
