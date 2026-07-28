import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDistanceTariffsAndCorrectLandmarks1783929600000 implements MigrationInterface {
  name = 'AddDistanceTariffsAndCorrectLandmarks1783929600000';

  // PostgreSQL requires a commit after adding an enum value before it can be
  // used by the custom tariff seed below.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE service_zone_code ADD VALUE IF NOT EXISTS 'custom'
    `);
    await queryRunner.query(`
      CREATE TYPE order_pricing_mode AS ENUM ('fixed', 'distance')
    `);
    await queryRunner.query(`
      ALTER TABLE orders
      ADD COLUMN pricing_mode order_pricing_mode NOT NULL DEFAULT 'fixed',
      ADD COLUMN route_distance_meters integer,
      ADD COLUMN distance_rate_per_km integer,
      ADD CONSTRAINT orders_route_distance_positive_check
        CHECK (route_distance_meters IS NULL OR route_distance_meters > 0),
      ADD CONSTRAINT orders_distance_rate_positive_check
        CHECK (distance_rate_per_km IS NULL OR distance_rate_per_km > 0)
    `);
    await queryRunner.query(`
      INSERT INTO tariff_settings (
        kind,
        zone,
        day_fare,
        evening_fare,
        night_fare
      )
      VALUES
        ('taxi'::order_kind, 'custom'::service_zone_code, 60, 60, 60),
        ('delivery'::order_kind, 'custom'::service_zone_code, 60, 60, 60)
      ON CONFLICT (kind, zone) DO NOTHING
    `);
    await queryRunner.query(`
      UPDATE service_zones
      SET
        name = CASE code
          WHEN 'lower_harbor' THEN 'Lower Harbor'
          WHEN 'quarry' THEN 'Quarry'
          ELSE name
        END,
        boundary = CASE code
          WHEN 'lower_harbor' THEN ST_Multi(
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(140.42528, 52.43778), 4326)::geography,
              1200
            )::geometry
          )
          WHEN 'quarry' THEN ST_Multi(
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(140.45700, 52.43720), 4326)::geography,
              1200
            )::geometry
          )
          ELSE boundary
        END
      WHERE code IN ('lower_harbor', 'quarry')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE service_zones
      SET boundary = CASE code
        WHEN 'lower_harbor' THEN ST_Multi(
          ST_Buffer(
            ST_SetSRID(ST_MakePoint(140.3896, 52.3428), 4326)::geography,
            1200
          )::geometry
        )
        WHEN 'quarry' THEN ST_Multi(
          ST_Buffer(
            ST_SetSRID(ST_MakePoint(140.3658, 52.3315), 4326)::geography,
            1200
          )::geometry
        )
        ELSE boundary
      END
      WHERE code IN ('lower_harbor', 'quarry')
    `);
    await queryRunner.query(`
      ALTER TABLE orders
      DROP CONSTRAINT orders_distance_rate_positive_check,
      DROP CONSTRAINT orders_route_distance_positive_check,
      DROP COLUMN distance_rate_per_km,
      DROP COLUMN route_distance_meters,
      DROP COLUMN pricing_mode
    `);
    await queryRunner.query(`DROP TYPE order_pricing_mode`);
    await queryRunner.query(`
      DELETE FROM tariff_settings
      WHERE zone = 'custom'::service_zone_code
    `);
  }
}
