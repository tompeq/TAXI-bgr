import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrders1783400400000 implements MigrationInterface {
  name = 'CreateOrders1783400400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE order_kind AS ENUM ('taxi', 'delivery')
    `);
    await queryRunner.query(`
      CREATE TYPE order_payment_method AS ENUM ('cash', 'transfer')
    `);
    await queryRunner.query(`
      CREATE TYPE order_status AS ENUM (
        'open',
        'accepted',
        'driver_en_route',
        'arrived',
        'waiting',
        'started',
        'completed',
        'canceled'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE tariff_period AS ENUM ('day', 'evening', 'night')
    `);
    await queryRunner.query(`
      CREATE TYPE service_zone_code AS ENUM (
        'upper_bgr',
        'kombinat',
        'lower_harbor',
        'quarry'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE tariff_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind order_kind NOT NULL,
        zone service_zone_code NOT NULL,
        day_fare integer NOT NULL,
        evening_fare integer NOT NULL,
        night_fare integer NOT NULL,
        updated_by_user_id uuid,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT tariff_settings_kind_zone_unique UNIQUE (kind, zone),
        CONSTRAINT tariff_settings_updated_by_fk
          FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT tariff_settings_positive_fares_check
          CHECK (day_fare > 0 AND evening_fare > 0 AND night_fare > 0)
      )
    `);
    await queryRunner.query(`
      INSERT INTO tariff_settings (
        kind,
        zone,
        day_fare,
        evening_fare,
        night_fare
      )
      SELECT kind, zone, day_fare, evening_fare, night_fare
      FROM (
        VALUES
          ('upper_bgr'::service_zone_code, 200, 300, 400),
          ('kombinat'::service_zone_code, 250, 350, 500),
          ('lower_harbor'::service_zone_code, 700, 900, 1500),
          ('quarry'::service_zone_code, 500, 650, 1000)
      ) AS fares(zone, day_fare, evening_fare, night_fare)
      CROSS JOIN (
        VALUES ('taxi'::order_kind), ('delivery'::order_kind)
      ) AS kinds(kind)
    `);

    await queryRunner.query(`
      CREATE TABLE orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        passenger_user_id uuid NOT NULL,
        driver_user_id uuid,
        kind order_kind NOT NULL,
        payment_method order_payment_method NOT NULL,
        passenger_count smallint NOT NULL,
        round_trip boolean NOT NULL DEFAULT false,
        pickup_address varchar(300) NOT NULL,
        pickup_point geometry(Point, 4326) NOT NULL,
        pickup_zone service_zone_code NOT NULL,
        destination_address varchar(300) NOT NULL,
        destination_point geometry(Point, 4326) NOT NULL,
        destination_zone service_zone_code NOT NULL,
        scheduled_for timestamptz,
        tariff_setting_id uuid NOT NULL,
        tariff_version integer NOT NULL,
        fare_amount integer NOT NULL,
        tariff_period tariff_period NOT NULL,
        road_surcharge_amount integer NOT NULL DEFAULT 0,
        status order_status NOT NULL DEFAULT 'open',
        accepted_at timestamptz,
        driver_en_route_at timestamptz,
        arrived_at timestamptz,
        started_at timestamptz,
        completed_at timestamptz,
        canceled_at timestamptz,
        canceled_by_user_id uuid,
        cancellation_reason varchar(500),
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT orders_passenger_fk
          FOREIGN KEY (passenger_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT orders_driver_fk
          FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT orders_canceled_by_fk
          FOREIGN KEY (canceled_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT orders_tariff_setting_fk
          FOREIGN KEY (tariff_setting_id)
          REFERENCES tariff_settings(id)
          ON DELETE RESTRICT,
        CONSTRAINT orders_passenger_count_check
          CHECK (passenger_count BETWEEN 1 AND 3),
        CONSTRAINT orders_fare_positive_check
          CHECK (fare_amount > 0),
        CONSTRAINT orders_road_surcharge_non_negative_check
          CHECK (road_surcharge_amount >= 0),
        CONSTRAINT orders_different_points_check
          CHECK (NOT ST_Equals(pickup_point, destination_point))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX orders_open_board_idx
      ON orders (created_at DESC)
      WHERE status = 'open'
    `);
    await queryRunner.query(`
      CREATE INDEX orders_passenger_time_idx
      ON orders (passenger_user_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX orders_driver_time_idx
      ON orders (driver_user_id, created_at DESC)
      WHERE driver_user_id IS NOT NULL
    `);
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
      CREATE INDEX orders_pickup_point_gix
      ON orders USING GIST (pickup_point)
    `);
    await queryRunner.query(`
      CREATE INDEX orders_destination_point_gix
      ON orders USING GIST (destination_point)
    `);

    await queryRunner.query(`
      CREATE TABLE order_status_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL,
        actor_user_id uuid NOT NULL,
        previous_status order_status,
        next_status order_status NOT NULL,
        reason varchar(500),
        occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT order_status_history_order_fk
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT order_status_history_actor_fk
          FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX order_status_history_order_time_idx
      ON order_status_history (order_id, occurred_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS order_status_history');
    await queryRunner.query('DROP TABLE IF EXISTS orders');
    await queryRunner.query('DROP TABLE IF EXISTS tariff_settings');
    await queryRunner.query('DROP TYPE IF EXISTS service_zone_code');
    await queryRunner.query('DROP TYPE IF EXISTS tariff_period');
    await queryRunner.query('DROP TYPE IF EXISTS order_status');
    await queryRunner.query('DROP TYPE IF EXISTS order_payment_method');
    await queryRunner.query('DROP TYPE IF EXISTS order_kind');
  }
}
