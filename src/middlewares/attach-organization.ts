import type { Context } from 'koa';
import type { Core } from '@strapi/strapi';

type NextFn = () => Promise<unknown>;

type MinimalOrganization = {
  id: number;
  name?: string | null;
};

const ORGANIZATION_FIELDS = ['id', 'name'] as const;

const sanitizeOrg = (org: { id?: number | string; name?: string | null } | null | undefined): MinimalOrganization | undefined => {
  if (!org || org.id === null || org.id === undefined) {
    return undefined;
  }
  const parsedId = typeof org.id === 'string' ? Number(org.id) : org.id;
  if (typeof parsedId !== 'number' || Number.isNaN(parsedId)) {
    return undefined;
  }
  return {
    id: parsedId,
    name: org.name ?? undefined,
  };
};

const decodeUserFromToken = async (ctx: Context, strapi: Core.Strapi) => {
  const header = ctx.request.header?.authorization;
  if (!header || typeof header !== 'string') return undefined;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) return undefined;

  try {
    const jwtService = strapi.plugins['users-permissions']?.services?.jwt;
    const decoded = await jwtService?.verify(parts[1]);
    const userId = decoded?.id ?? decoded?._id;
    if (!userId) return undefined;

    const user = await strapi.entityService.findOne('plugin::users-permissions.user', userId, {
      populate: {
        organization: {
          fields: [...ORGANIZATION_FIELDS],
        },
      },
    });

    return user as { organization?: MinimalOrganization | null | undefined } & Context['state']['user'];
  } catch (error) {
    strapi.log.warn('Failed to decode JWT for organization attachment', error);
    return undefined;
  }
};

export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: Context, next: NextFn) => {
    let user = ctx.state?.user;

    if (!user) {
      user = await decodeUserFromToken(ctx, strapi);
      if (user) {
        ctx.state.user = user;
      }
    }

    if (!user) {
      return next();
    }

    const existingOrg = sanitizeOrg((user as { organization?: MinimalOrganization }).organization);
    if (existingOrg) {
      ctx.state.organization = existingOrg;
      return next();
    }

    try {
      const userWithOrg = (await strapi.entityService.findOne('plugin::users-permissions.user', user.id, {
        populate: {
          organization: {
            fields: [...ORGANIZATION_FIELDS],
          },
        },
      })) as { organization?: MinimalOrganization | null | undefined } | null;

      const organization = sanitizeOrg(userWithOrg?.organization);
      if (organization) {
        ctx.state.user.organization = organization;
        ctx.state.organization = organization;
      }
    } catch (error) {
      strapi.log.error('Failed to attach organization to request context', error);
    }

    await next();
  };
};
