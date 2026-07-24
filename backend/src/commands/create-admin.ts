import dataSource from '../infrastructure/database/data-source';
import { UserRole } from '../modules/users/user-role.enum';
import { UserStatus } from '../modules/users/user-status.enum';
import { UserEntity } from '../modules/users/user.entity';

const phone = process.argv[2];
const name = process.argv.slice(3).join(' ').trim() || 'Администратор';

if (!phone || !/^\+[1-9][0-9]{7,14}$/.test(phone)) {
  console.error(
    'Usage: npm run admin:create -- +79990000000 "Administrator name"',
  );
  process.exit(1);
}

void dataSource
  .initialize()
  .then(async () => {
    const users = dataSource.getRepository(UserEntity);
    const existing = await users.findOneBy({ phone });
    if (existing) {
      if (existing.role !== UserRole.Admin) {
        throw new Error('This phone already belongs to a non-admin user');
      }
      console.log(`Administrator already exists: ${existing.phone}`);
      return;
    }

    const admin = await users.save(
      users.create({
        phone,
        name,
        role: UserRole.Admin,
        status: UserStatus.Active,
        avatarObjectKey: null,
        lastActiveAt: null,
      }),
    );
    console.log(`Administrator created: ${admin.phone} (${admin.id})`);
  })
  .finally(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
