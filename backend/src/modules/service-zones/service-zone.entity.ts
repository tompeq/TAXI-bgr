import type { MultiPolygon } from 'geojson';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity({ name: 'service_zones' })
export class ServiceZoneEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'MultiPolygon',
    srid: 4326,
  })
  boundary!: MultiPolygon;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
