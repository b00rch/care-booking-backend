/**
 * booking controller
 */

import { factories } from '@strapi/strapi';

const MODEL_UID = 'api::booking.booking';
const ROOM_MODEL_UID = 'api::room.room';
const BED_MODEL_UID = 'api::bed.bed';

const toNumericId = (value: unknown): number | undefined => {
	if (value == null) {
		return undefined;
	}
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	if (typeof value === 'object') {
		const maybeId = (value as { id?: unknown }).id;
		if (maybeId !== undefined) {
			return toNumericId(maybeId);
		}
		const maybeConnect = (value as { connect?: unknown }).connect;
		if (Array.isArray(maybeConnect) && maybeConnect.length > 0) {
			return toNumericId(maybeConnect[0]);
		}
	}
	return undefined;
};

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

const ensureBookingOwnership = async (ctx: any, strapi: any, bookingId: number, organizationId: number) => {
	const booking = await strapi.entityService.findOne(MODEL_UID, bookingId, {
		populate: {
			organization: {
				fields: ['id'],
			},
		},
	});

	if (!booking || booking.organization?.id !== organizationId) {
		ctx.throw(403, 'Энэ захиалгад хандах эрхгүй байна.');
	}

	return booking;
};

const ensureRoomOwnership = async (ctx: any, strapi: any, roomId: number, organizationId: number) => {
	const room = await strapi.entityService.findOne(ROOM_MODEL_UID, roomId, {
		populate: {
			organization: {
				fields: ['id'],
			},
		},
	});

	if (!room || room.organization?.id !== organizationId) {
		ctx.throw(403, 'Сонгосон өрөөнд хандах эрхгүй байна.');
	}

	return room;
};

const ensureBedOwnership = async (ctx: any, strapi: any, bedId: number, organizationId: number) => {
	const bed = await strapi.entityService.findOne(BED_MODEL_UID, bedId, {
		populate: {
			room: {
				populate: {
					organization: {
						fields: ['id'],
					},
				},
				fields: ['id'],
			},
		},
	});

	const bedRoomOrgId = bed?.room?.organization?.id;
	if (!bed || bedRoomOrgId !== organizationId) {
		ctx.throw(403, 'Сонгосон оронд хандах эрхгүй байна.');
	}

	return bed;
};

const setOrganizationOnBody = (ctx: any, organizationId: number) => {
	ctx.request.body = ctx.request.body ?? {};
	ctx.request.body.data = ctx.request.body.data ?? {};
	ctx.request.body.data.organization = organizationId;
};

const validateBookingRelations = async (ctx: any, strapi: any, organizationId: number) => {
	ctx.request.body = ctx.request.body ?? {};
	ctx.request.body.data = ctx.request.body.data ?? {};

	const data = ctx.request.body.data;
	let roomId = toNumericId(data.room);
	const bedId = toNumericId(data.bed);

	if (bedId) {
		const bed = await ensureBedOwnership(ctx, strapi, bedId, organizationId);
		const linkedRoomId = bed.room?.id ? Number(bed.room.id) : undefined;
		if (!linkedRoomId) {
			ctx.throw(400, 'Энэ ор холбоотой өрөө олдсонгүй.');
		}
		if (roomId && roomId !== linkedRoomId) {
			ctx.throw(400, 'Өрөө болон орны мэдээлэл зөрж байна.');
		}
		roomId = linkedRoomId;
		data.bed = bedId;
	}

	if (roomId) {
		await ensureRoomOwnership(ctx, strapi, roomId, organizationId);
		data.room = roomId;
	}
};

	const parseParamId = (ctx: any): number => {
		const rawId = ctx.params.id;
		const parsed = Number(rawId);
		if (Number.isNaN(parsed)) {
			ctx.throw(400, 'Буруу ID утга дамжуулагдсан байна.');
		}
		return parsed;
	};

export default factories.createCoreController(MODEL_UID, ({ strapi }) => ({
	async find(ctx) {
		const organizationId = getOrganizationId(ctx);
		enforceOrganizationFilter(ctx, organizationId);
		return await super.find(ctx);
	},

	async findOne(ctx) {
		const organizationId = getOrganizationId(ctx);
			const bookingId = parseParamId(ctx);
		await ensureBookingOwnership(ctx, strapi, bookingId, organizationId);
		return await super.findOne(ctx);
	},

	async create(ctx) {
		const organizationId = getOrganizationId(ctx);
		setOrganizationOnBody(ctx, organizationId);
		await validateBookingRelations(ctx, strapi, organizationId);
		return await super.create(ctx);
	},

	async update(ctx) {
		const organizationId = getOrganizationId(ctx);
			const bookingId = parseParamId(ctx);
		await ensureBookingOwnership(ctx, strapi, bookingId, organizationId);
		setOrganizationOnBody(ctx, organizationId);
		await validateBookingRelations(ctx, strapi, organizationId);
		return await super.update(ctx);
	},

	async delete(ctx) {
		const organizationId = getOrganizationId(ctx);
			const bookingId = parseParamId(ctx);
		await ensureBookingOwnership(ctx, strapi, bookingId, organizationId);
		return await super.delete(ctx);
	},
}));
