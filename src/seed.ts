/**
 * Database seed script
 * Creates: roles, permissions, organization, users, rooms, beds
 * Each table is seeded independently — skips if data already exists,
 * reads from previously seeded tables to resolve relations.
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

const ROOM_COUNT = 30;
const BEDS_PER_ROOM_HIGH = 3; // rooms 1-15
const BEDS_PER_ROOM_LOW = 2;  // rooms 16-30
const HIGH_BED_ROOM_COUNT = 15;

export async function seed(strapi) {
  strapi.log.info('Seed: Checking each table...');

  // 1. Roles & permissions (always ensure)
  const { adminRole, authenticatedRole } = await seedRolesAndPermissions(strapi);

  // 2. Organization
  const org = await seedOrganization(strapi);

  // 3. Users (needs org + roles)
  await seedUsers(strapi, org.id, adminRole.id, authenticatedRole.id);

  // 4. Rooms (needs org)
  await seedRooms(strapi, org.id);

  // 5. Beds (needs rooms)
  await seedBeds(strapi);

  strapi.log.info('Seed: Done.');
}

// ── Organization ──

async function seedOrganization(strapi) {
  const existing = await strapi.db.query('api::organization.organization').findOne({});
  if (existing) {
    strapi.log.info(`Seed: Organization exists (id: ${existing.id}), skipping.`);
    return existing;
  }

  const org = await strapi.db.query('api::organization.organization').create({
    data: {
      name: 'Баатарван Амралт сувилал',
      phone: '77001234',
      email: 'info@eldercare.mn',
      address: 'Улаанбаатар хот',
    },
  });
  strapi.log.info(`Seed: Organization created: ${org.name} (id: ${org.id})`);
  return org;
}

// ── Users ──

async function seedUsers(strapi, orgId: number, adminRoleId: number, staffRoleId: number) {
  const userCount = await strapi.db.query('plugin::users-permissions.user').count();
  if (userCount > 0) {
    strapi.log.info(`Seed: Users exist (${userCount}), skipping.`);
    return;
  }

  const hashPassword = strapi.plugin('users-permissions').service('user').hashPassword;

  await strapi.db.query('plugin::users-permissions.user').create({
    data: {
      username: 'admin',
      email: 'admin@eldercare.mn',
      password: await hashPassword('Qwerty123'),
      confirmed: true,
      blocked: false,
      provider: 'local',
      role: adminRoleId,
      organization: orgId,
    },
  });
  strapi.log.info('Seed: Admin user created: admin@eldercare.mn');

  await strapi.db.query('plugin::users-permissions.user').create({
    data: {
      username: 'worker',
      email: 'worker@eldercare.mn',
      password: await hashPassword('Qwertt123'),
      confirmed: true,
      blocked: false,
      provider: 'local',
      role: staffRoleId,
      organization: orgId,
    },
  });
  strapi.log.info('Seed: Worker user created: worker@eldercare.mn');
}

// ── Rooms ──

async function seedRooms(strapi, orgId: number) {
  const roomCount = await strapi.db.query('api::room.room').count();
  if (roomCount > 0) {
    strapi.log.info(`Seed: Rooms exist (${roomCount}), skipping.`);
    return;
  }

  for (let i = 1; i <= ROOM_COUNT; i++) {
    await strapi.db.query('api::room.room').create({
      data: {
        name: `${i}-р өрөө`,
        pricePerDay: 50000,
        priceWelfare: 30000,
        organization: orgId,
      },
    });
  }
  strapi.log.info(`Seed: Created ${ROOM_COUNT} rooms`);
}

// ── Beds ──

async function seedBeds(strapi) {
  const bedCount = await strapi.db.query('api::bed.bed').count();
  if (bedCount > 0) {
    strapi.log.info(`Seed: Beds exist (${bedCount}), skipping.`);
    return;
  }

  // Read rooms from DB to get their IDs
  const rooms = await strapi.db.query('api::room.room').findMany({
    orderBy: { id: 'asc' },
  });

  if (rooms.length === 0) {
    strapi.log.warn('Seed: No rooms found, cannot create beds.');
    return;
  }

  let totalBeds = 0;
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    const count = i < HIGH_BED_ROOM_COUNT ? BEDS_PER_ROOM_HIGH : BEDS_PER_ROOM_LOW;
    for (let b = 1; b <= count; b++) {
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
  strapi.log.info(`Seed: Created ${totalBeds} beds across ${rooms.length} rooms`);
}

// ── Roles & Permissions ──

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

async function seedRolesAndPermissions(strapi) {
  const publicRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });

  const authenticatedRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'authenticated' } });

  if (!publicRole || !authenticatedRole) {
    throw new Error('Default roles (public/authenticated) not found');
  }

  // Create or find "Admin" role
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

  // Ensure permissions (idempotent — skips existing)
  await setPermissions(strapi, publicRole.id, PUBLIC_PERMISSIONS);
  await setPermissions(strapi, authenticatedRole.id, [...STAFF_PERMISSIONS, ...AUTH_COMMON_PERMISSIONS]);
  await setPermissions(strapi, adminRole.id, [...ADMIN_PERMISSIONS, ...AUTH_COMMON_PERMISSIONS]);
  strapi.log.info('Seed: Roles & permissions ensured.');

  return { publicRole, authenticatedRole, adminRole };
}
