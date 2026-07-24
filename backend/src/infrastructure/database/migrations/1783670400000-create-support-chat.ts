import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSupportChat1783670400000 implements MigrationInterface {
  name = 'CreateSupportChat1783670400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE support_conversations (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL UNIQUE,
        status varchar(16) NOT NULL DEFAULT 'open',
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT support_conversations_status_check
          CHECK (status IN ('open', 'closed')),
        CONSTRAINT support_conversations_user_fk
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE support_messages (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id uuid NOT NULL,
        sender_user_id uuid NOT NULL,
        body varchar(1000) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT support_messages_conversation_fk
          FOREIGN KEY (conversation_id)
          REFERENCES support_conversations(id) ON DELETE CASCADE,
        CONSTRAINT support_messages_sender_fk
          FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX support_conversations_updated_idx
      ON support_conversations (updated_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX support_messages_conversation_time_idx
      ON support_messages (conversation_id, created_at ASC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS support_messages_conversation_time_idx',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS support_conversations_updated_idx',
    );
    await queryRunner.query('DROP TABLE IF EXISTS support_messages');
    await queryRunner.query('DROP TABLE IF EXISTS support_conversations');
  }
}
