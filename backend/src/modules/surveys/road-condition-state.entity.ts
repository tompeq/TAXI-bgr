import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum RoadConditionArea {
  Bgr = 'bgr',
  Harbor = 'harbor',
}

@Entity({ name: 'road_condition_states' })
export class RoadConditionStateEntity {
  @PrimaryColumn({
    type: 'enum',
    enum: RoadConditionArea,
    enumName: 'road_condition_area',
  })
  area!: RoadConditionArea;

  @Column({ name: 'surcharge_active', type: 'boolean' })
  surchargeActive!: boolean;

  @Column({ name: 'bad_votes', type: 'integer' })
  badVotes!: number;

  @Column({ name: 'good_votes', type: 'integer' })
  goodVotes!: number;

  @Column({ name: 'state_changed_at', type: 'timestamptz' })
  stateChangedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
