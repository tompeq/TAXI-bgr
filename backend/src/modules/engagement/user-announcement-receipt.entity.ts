import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'user_announcement_receipts' })
export class UserAnnouncementReceiptEntity {
  @PrimaryColumn({ name: 'announcement_id', type: 'uuid' })
  announcementId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'acknowledged_at', type: 'timestamptz' })
  acknowledgedAt!: Date;
}
