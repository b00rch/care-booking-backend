/**
 * room controller
 */

import { factories } from '@strapi/strapi';

const ADMIN_MODEL_UID = 'api::room.room';
const ROOM_POPULATE = {
	organization: {
		fields: ['id'],
	},
} as const;

const getOrganizationId = (ctx: any): number => {
	const orgSource = ctx.state?.user?.organization ?? ctx.state?.organization;
	if (!orgSource) {
		ctx.throw(403, 'Хэрэглэгчийн байгууллага тодорхойгүй байна.');
	}
	const orgId = typeof orgSource === 'object' ? orgSource.id : orgSource;
	if (!orgId) {
		ctx.throw(403, 'Хэрэглэгчийн байгууллага тодорхойгүй байна.');
	}
	return Number(orgId);
};

const coerceRoomParam = async (ctx: any, strapi: any) => {
	const rawId = ctx.params?.id;
	if (!rawId) {
		ctx.throw(400, 'Өрөөний ID дамжаагүй байна.');
	}
	const isNumericId = /^\d+$/.test(String(rawId));
	if (isNumericId) {
		const numericId = Number(rawId);
		if (Number.isNaN(numericId)) {
			ctx.throw(400, 'Буруу ID утга дамжуулагдсан байна.');
		}
		const room = await strapi.entityService.findOne(ADMIN_MODEL_UID, numericId, {
			populate: ROOM_POPULATE,
		});
		if (room?.documentId && ctx.params.id !== room.documentId) {
			ctx.params.id = room.documentId;
		}
		if (!room) {
			ctx.throw(404, 'Өрөө олдсонгүй.');
		}
		return room;
	}

	const [room] = await strapi.entityService.findMany(ADMIN_MODEL_UID, {
		filters: { documentId: rawId },
		populate: ROOM_POPULATE,
		publicationState: 'preview',
		limit: 1,
	});

	if (!room) {
		ctx.throw(404, 'Өрөө олдсонгүй.');
	}
	if (room.documentId && ctx.params.id !== room.documentId) {
		ctx.params.id = room.documentId;
	}
	return room;
};

const enforceOrganizationFilter = (ctx: any, organizationId: number) => {
	ctx.query = ctx.query ?? {};
	const existingFilters = ctx.query.filters;
	if (existingFilters) {
		ctx.query.filters = {
			$and: [existingFilters, { organization: { id: organizationId } }],
		};
	} else {
		ctx.query.filters = { organization: { id: organizationId } };
	}
};


const ensureRoomOwnership = (ctx: any, room: any, organizationId: number) => {
	if (!room || room.organization?.id !== organizationId) {
		ctx.throw(403, 'Энэ өрөөнд хандах эрхгүй байна.');
	}

	return room;
};

const setOrganizationOnBody = (ctx: any, organizationId: number) => {
	ctx.request.body = ctx.request.body ?? {};
	ctx.request.body.data = ctx.request.body.data ?? {};
	ctx.request.body.data.organization = organizationId;
};

export default factories.createCoreController(ADMIN_MODEL_UID, ({ strapi }) => ({
	async find(ctx) {
		const organizationId = getOrganizationId(ctx);
		enforceOrganizationFilter(ctx, organizationId);
		return await super.find(ctx);
	},

	async findOne(ctx) {
		const organizationId = getOrganizationId(ctx);
		const room = await coerceRoomParam(ctx, strapi);
		ensureRoomOwnership(ctx, room, organizationId);
		return await super.findOne(ctx);
	},

	async create(ctx) {
		const organizationId = getOrganizationId(ctx);
		setOrganizationOnBody(ctx, organizationId);
		return await super.create(ctx);
	},

	async update(ctx) {
		const organizationId = getOrganizationId(ctx);
		const room = await coerceRoomParam(ctx, strapi);
		ensureRoomOwnership(ctx, room, organizationId);
		setOrganizationOnBody(ctx, organizationId);
		return await super.update(ctx);
	},

	async delete(ctx) {
		const organizationId = getOrganizationId(ctx);
		const room = await coerceRoomParam(ctx, strapi);
		ensureRoomOwnership(ctx, room, organizationId);
		return await super.delete(ctx);
	},
}));
