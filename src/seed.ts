/**
 * Database seed script
 * Creates: roles, permissions, organization, users, rooms, beds
 *
 * Roles:
 *   - "Admin" (type: "admin") — full access including room/bed management
 *   - "Authenticated" (built-in) — staff/worker access (bookings only)
 *   - "Public" (built-in) — public booking creation
 */

const ADMIN_PERMISSIONS = [
  // Bookings
  'api::booking.booking.find',
  'api::booking.booking.findOne',
  'api::booking.booking.create',
  'api::booking.booking.update',
  'api::booking.booking.delete',
  // Rooms
  'api::room.room.find',
  'api::room.room.findOne',
  'api::room.room.create',
  'api::room.room.update',
  'api::room.room.delete',
  // Beds
  'api::bed.bed.find',
  'api::bed.bed.findOne',
  'api::bed.bed.create',
  'api::bed.bed.update',
  'api::bed.bed.delete',
  // Organizations
  'api::organization.organization.find',
  'api::organization.organization.findOne',
  'api::organization.organization.update',
];

const STAFF_PERMISSIONS = [
  // Bookings
  'api::booking.booking.find',
  'api::booking.booking.findOne',
  'api::booking.booking.create',
  'api::booking.booking.update',
  // Rooms (read only)
  'api::room.room.find',
  'api::room.room.findOne',
  // Beds (read only)
  'api::bed.bed.find',
  'api::bed.bed.findOne',
  // Organizations (read only)
  'api::organization.organization.find',
  'api::organization.organization.findOne',
];

const PUBLIC_PERMISSIONS = [
  'api::booking.booking.createPublic',
  'api::organization.organization.find',
  'api::organization.organization.findOne',
  'api::room.room.find',
  'api::room.room.findOne',
  'api::bed.bed.find',
  'api::bed.bed.findOne',
  'plugin::users-permissions.auth.callback',
  'plugin::users-permissions.auth.register',
];

const AUTH_COMMON_PERMISSIONS = [
  'plugin::users-permissions.auth.callback',
  'plugin::users-permissions.user.me',
];

// 30 rooms, 75 beds total
// Rooms 1-15: 3 beds each = 45
// Rooms 16-30: 2 beds each = 30
const ROOM_COUNT = 30;
const BEDS_PER_ROOM_HIGH = 3;
const BEDS_PER_ROOM_LOW = 2;
const HIGH_BED_ROOM_COUNT = 15;

export async function seed(strapi) {
  const orgCount = await strapi.db.query('api::organization.organization').count();
  if (orgCount > 0) {
    strapi.log.info('Seed: Database already has data, skipping seed.');
    return;
  }

  strapi.log.info('Seed: Starting database seed...');

  // 1. Setup roles & permissions
  const { adminRole, authenticatedRole } = await setupRolesAndPermissions(strapi);

  // 2. Create organization
  const org = await strapi.db.query('api::organization.organization').create({
    data: {
      name: 'Баатарван Амралт сувилал',
      phone: '77001234',
      email: 'info@eldercare.mn',
      address: 'Улаанбаатар хот',
    },
  });
  strapi.log.info(`Seed: Organization created: ${org.name} (id: ${org.id})`);

  // 3. Create users
  const hashPassword = strapi.plugin('users-permissions').service('user').hashPassword;

  const adminUser = await strapi.db.query('plugin::users-permissions.user').create({
    data: {
      username: 'admin',
      email: 'admin@eldercare.mn',
      password: await hashPassword('Qwerty123'),
      confirmed: true,
      blocked: false,
      provider: 'local',
      role: adminRole.id,
      organization: org.id,
    },
  });
  strapi.log.info(`Seed: Admin user created: ${adminUser.email} (role: Admin)`);

  const workerUser = await strapi.db.query('plugin::users-permissions.user').create({
    data: {
      username: 'worker',
      email: 'worker@eldercare.mn',
      password: await hashPassword('Qwertt123'),
      confirmed: true,
      blocked: false,
      provider: 'local',
      role: authenticatedRole.id,
      organization: org.id,
    },
  });
  strapi.log.info(`Seed: Worker user created: ${workerUser.email} (role: Authenticated/Staff)`);

  // 4. Create rooms and beds
  let totalBeds = 0;
  for (let i = 1; i <= ROOM_COUNT; i++) {
    const room = await strapi.db.query('api::room.room').create({
      data: {
        name: `${i}-р өрөө`,
        pricePerDay: 50000,
        priceWelfare: 30000,
        organization: org.id,
      },
    });

    const bedCount = i <= HIGH_BED_ROOM_COUNT ? BEDS_PER_ROOM_HIGH : BEDS_PER_ROOM_LOW;
    for (let b = 1; b <= bedCount; b++) {
      await strapi.db.query('api::bed.bed').create({
        data: {
          name: `${b}-р ор`,
          no: b,
          room: room.id,
        },
      });
      totalBeds++;
    }
  }
  strapi.log.info(`Seed: Created ${ROOM_COUNT} rooms, ${totalBeds} beds`);

  strapi.log.info('Seed: Database seed completed successfully!');
}

async function setPermissions(strapi, roleId: number, actions: string[]) {
  for (const action of actions) {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: { action, role: roleId },
    });
    if (!existing) {
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: { action, role: roleId },
      });
    }
  }
}

async function setupRolesAndPermissions(strapi) {
  // Get built-in roles
  const publicRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });

  const authenticatedRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'authenticated' } });

  if (!publicRole || !authenticatedRole) {
    throw new Error('Default roles (public/authenticated) not found');
  }

  // Create "Admin" role
  let adminRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'admin' } });

  if (!adminRole) {
    adminRole = await strapi.db.query('plugin::users-permissions.role').create({
      data: {
        name: 'Admin',
        description: 'Admin role with full access',
        type: 'admin',
      },
    });
    strapi.log.info(`Seed: Admin role created (id: ${adminRole.id})`);
  }

  // Set permissions for each role
  await setPermissions(strapi, publicRole.id, PUBLIC_PERMISSIONS);
  strapi.log.info(`Seed: Public permissions set (${PUBLIC_PERMISSIONS.length})`);

  await setPermissions(strapi, authenticatedRole.id, [...STAFF_PERMISSIONS, ...AUTH_COMMON_PERMISSIONS]);
  strapi.log.info(`Seed: Authenticated/Staff permissions set (${STAFF_PERMISSIONS.length + AUTH_COMMON_PERMISSIONS.length})`);

  await setPermissions(strapi, adminRole.id, [...ADMIN_PERMISSIONS, ...AUTH_COMMON_PERMISSIONS]);
  strapi.log.info(`Seed: Admin permissions set (${ADMIN_PERMISSIONS.length + AUTH_COMMON_PERMISSIONS.length})`);

  return { publicRole, authenticatedRole, adminRole };
}
