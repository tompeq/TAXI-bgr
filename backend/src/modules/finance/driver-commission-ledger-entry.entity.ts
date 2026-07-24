import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CommissionLedgerEntryType } from './commission-ledger-entry-type.enum';

@Entity({ name: 'driver_commission_ledger_entries' })
export class DriverCommissionLedgerEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'driver_user_id', type: 'uuid' })
  driverUserId!: string;

  @Column({ name: 'order_id', type: 'uuid', nullable: true, unique: true })
  orderId!: string | null;

  @Column({
    type: 'enum',
    enum: CommissionLedgerEntryType,
    enumName: 'commission_ledger_entry_type',
  })
  type!: CommissionLedgerEntryType;

  // Positive values increase the driver's debt; negative values reduce it.
  @Column({ type: 'integer' })
  amount!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
