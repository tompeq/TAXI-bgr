import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverVehicleAndBoardAnnouncement1784016000000 implements MigrationInterface {
  name = 'AddDriverVehicleAndBoardAnnouncement1784016000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE driver_profiles
        ADD COLUMN license_photo_back_key varchar(512),
        ADD COLUMN vehicle_make_model varchar(120),
        ADD COLUMN vehicle_color varchar(60),
        ADD COLUMN vehicle_plate varchar(20)
    `);
    await queryRunner.query(`
      CREATE INDEX driver_profiles_vehicle_plate_idx
        ON driver_profiles (vehicle_plate)
    `);
    await queryRunner.query(`
      ALTER TABLE service_settings
        ADD COLUMN driver_board_announcement varchar(500) NOT NULL
        DEFAULT 'Проверяйте адрес и способ оплаты перед принятием заказа.'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE service_settings
        DROP COLUMN driver_board_announcement
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS driver_profiles_vehicle_plate_idx
    `);
    await queryRunner.query(`
      ALTER TABLE driver_profiles
        DROP COLUMN vehicle_plate,
        DROP COLUMN vehicle_color,
        DROP COLUMN vehicle_make_model,
        DROP COLUMN license_photo_back_key
    `);
  }
}
