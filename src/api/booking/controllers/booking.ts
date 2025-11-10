/**
 * booking controller
 */

import { factories } from '@strapi/strapi';

const MODEL_UID = 'api::booking.booking';
const ORGANIZATION_MODEL_UID = 'api::organization.organization';
const ROOM_MODEL_UID = 'api::room.room';
const BED_MODEL_UID = 'api::bed.bed';
const BOOKING_POPULATE = {
	organization: {
		fields: ['id'],
	},
} as const;

const BOOKING_STATES = ['new', 'pending', 'confirmed', 'cancelled', 'completed'] as const;
type BookingState = (typeof BOOKING_STATES)[number];

const COMPLETION_REASONS = ['service_completed', 'deposit_refunded', 'auto_expired'] as const;
type CompletionReason = (typeof COMPLETION_REASONS)[number];

const normalizeState = (value: unknown): BookingState | undefined => {
	if (typeof value !== 'string') return undefined;
	const lower = value.toLowerCase();
	return BOOKING_STATES.find((state) => state === lower);
};

const normalizeCompletionReason = (value: unknown): CompletionReason | undefined => {
	if (typeof value !== 'string') return undefined;
	const lower = value.toLowerCase();
	return COMPLETION_REASONS.find((reason) => reason === lower);
};

const toNonNegativeInteger = (value: unknown): number | undefined => {
	if (value == null) return undefined;
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return undefined;
	return Math.max(0, Math.round(numeric));
};

const prepareBookingData = (data: Record<string, unknown> | undefined, fallbackState?: BookingState) => {
	if (!data || typeof data !== 'object') return;
	const stateCandidate = normalizeState((data as { state?: unknown }).state ?? (data as { status?: unknown }).status);
	if ('status' in (data as { status?: unknown })) {
		delete (data as { status?: unknown }).status;
	}
	if (stateCandidate) {
		(data as { state: BookingState }).state = stateCandidate;
	} else if (fallbackState) {
		(data as { state: BookingState }).state = fallbackState;
	} else {
		delete (data as { state?: unknown }).state;
	}

	if ('depositAmount' in data) {
		const deposit = toNonNegativeInteger((data as { depositAmount?: unknown }).depositAmount);
		(data as { depositAmount?: number }).depositAmount = deposit ?? 0;
	} else if (fallbackState) {
		(data as { depositAmount?: number }).depositAmount = 0;
	}

	if ('completionReason' in data) {
		const reason = normalizeCompletionReason((data as { completionReason?: unknown }).completionReason);
		(data as { completionReason?: CompletionReason | null }).completionReason = reason ?? null;
	} else if (fallbackState) {
		(data as { completionReason?: CompletionReason | null }).completionReason = null;
	}
};

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

const ensureBookingOwnership = (ctx: any, booking: any, organizationId: number) => {
	if (!booking || booking.organization?.id !== organizationId) {
		ctx.throw(403, 'Энэ захиалгад хандах эрхгүй байна.');
	}

	return booking;
};

const appendFilter = (ctx: any, filter: Record<string, unknown>) => {
	ctx.query = ctx.query ?? {};
	const existing = ctx.query.filters;
	if (!existing) {
		ctx.query.filters = filter;
		return;
	}
	if (existing.$and && Array.isArray(existing.$and)) {
		existing.$and.push(filter);
		return;
	}
	ctx.query.filters = {
		$and: [existing, filter],
	};
};

const resolveBookingParam = async (ctx: any, strapi: any) => {
	const rawId = ctx.params?.id;
	if (!rawId) {
		ctx.throw(400, 'Захиалгын ID дамжаагүй байна.');
	}

	const isNumericId = /^\d+$/.test(String(rawId));
	if (isNumericId) {
		const numericId = Number(rawId);
		if (Number.isNaN(numericId)) {
			ctx.throw(400, 'Буруу ID утга дамжуулагдсан байна.');
		}
		const booking = await strapi.entityService.findOne(MODEL_UID, numericId, {
			populate: BOOKING_POPULATE,
		});
		if (!booking) {
			ctx.throw(404, 'Захиалга олдсонгүй.');
		}
		if (booking.documentId && ctx.params.id !== booking.documentId) {
			ctx.params.id = booking.documentId;
		}
		return booking;
	}

	const [booking] = await strapi.entityService.findMany(MODEL_UID, {
		filters: { documentId: rawId },
		populate: BOOKING_POPULATE,
		publicationState: 'preview',
		limit: 1,
	});

	if (!booking) {
		ctx.throw(404, 'Захиалга олдсонгүй.');
	}
	if (booking.documentId && ctx.params.id !== booking.documentId) {
		ctx.params.id = booking.documentId;
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

const ensureOrganizationExists = async (ctx: any, strapi: any, organizationId: number) => {
	const organization = await strapi.entityService.findOne(ORGANIZATION_MODEL_UID, organizationId, {
		fields: ['id'],
	});

	if (!organization) {
		ctx.throw(404, 'Сонгосон байгууллага олдсонгүй.');
	}

	return organization;
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

export default factories.createCoreController(MODEL_UID, ({ strapi }) => ({
	async find(ctx) {
		const organizationId = getOrganizationId(ctx);
		enforceOrganizationFilter(ctx, organizationId);

		const cursorRaw = typeof ctx.request?.query?.cursor === 'string'
			? ctx.request.query.cursor
			: typeof ctx.query?.cursor === 'string'
				? ctx.query.cursor
				: undefined;
		const cursorIdRaw = ctx.request?.query?.cursorId ?? ctx.query?.cursorId;
		const limitRaw = ctx.request?.query?.limit ?? ctx.query?.limit;
		const rangeStartRaw = typeof ctx.request?.query?.rangeStart === 'string'
			? ctx.request.query.rangeStart
			: typeof ctx.query?.rangeStart === 'string'
				? ctx.query.rangeStart
				: undefined;
		const rangeEndRaw = typeof ctx.request?.query?.rangeEnd === 'string'
			? ctx.request.query.rangeEnd
			: typeof ctx.query?.rangeEnd === 'string'
				? ctx.query.rangeEnd
				: undefined;

		const cursorDate = cursorRaw ? new Date(cursorRaw) : undefined;
		const cursorId = toNumericId(cursorIdRaw);
		const cursorIso = cursorDate && !Number.isNaN(cursorDate.valueOf()) ? cursorDate.toISOString() : undefined;

		if (cursorIso) {
			if (cursorId) {
				appendFilter(ctx, {
					$or: [
						{ createdAt: { $lt: cursorIso } },
						{ createdAt: cursorIso, id: { $lt: cursorId } },
					],
				});
			} else {
				appendFilter(ctx, { createdAt: { $lt: cursorIso } });
			}
		}

		const normalizedRangeStart = typeof rangeStartRaw === 'string' && rangeStartRaw ? rangeStartRaw : undefined;
		const normalizedRangeEnd = typeof rangeEndRaw === 'string' && rangeEndRaw ? rangeEndRaw : undefined;

		if (normalizedRangeStart) {
			appendFilter(ctx, {
				endDay: {
					$gte: normalizedRangeStart,
				},
			});
		}

		if (normalizedRangeEnd) {
			appendFilter(ctx, {
				startDay: {
					$lte: normalizedRangeEnd,
				},
			});
		}

		const limitNumeric = (() => {
			const parsed = Number(limitRaw);
			if (!Number.isFinite(parsed) || parsed <= 0) return 50;
			return Math.min(200, Math.round(parsed));
		})();

		ctx.query = ctx.query ?? {};
		ctx.query.pagination = {
			start: 0,
			limit: limitNumeric,
		};

		if (!ctx.query.sort) {
			ctx.query.sort = ['createdAt:desc', 'id:desc'];
		}

		const response = await super.find(ctx);
		const rows = Array.isArray(response?.data) ? response.data : [];
		const lastEntry = rows.length === limitNumeric ? rows[rows.length - 1] : undefined;
		const lastAttributes = lastEntry?.attributes ?? {};
		const nextCursor = lastEntry && lastAttributes?.createdAt
			? {
				createdAt: lastAttributes.createdAt,
				id: String(lastEntry.id ?? ''),
			}
			: null;

		response.meta = {
			...(response.meta ?? {}),
			nextCursor,
		};

		return response;
	},

	async findOne(ctx) {
		const organizationId = getOrganizationId(ctx);
		const booking = await resolveBookingParam(ctx, strapi);
		ensureBookingOwnership(ctx, booking, organizationId);
		return await super.findOne(ctx);
	},

	async create(ctx) {
		const organizationId = getOrganizationId(ctx);
		setOrganizationOnBody(ctx, organizationId);
		await validateBookingRelations(ctx, strapi, organizationId);
		prepareBookingData(ctx.request.body.data, 'pending');
		const sanitizedInput = await this.sanitizeInput(ctx.request.body.data, ctx);
		const created = await strapi.entityService.create(MODEL_UID, {
			data: sanitizedInput as any,
			populate: {
				organization: {
					fields: ['id', 'name'],
				},
				room: {
					fields: ['id', 'name'],
				},
				bed: {
					fields: ['id', 'no', 'name'],
				},
			},
		});

		const sanitizedOutput = await this.sanitizeOutput(created, ctx);
		return this.transformResponse(sanitizedOutput);
	},

	async createPublic(ctx) {
		ctx.request.body = ctx.request.body ?? {};
		ctx.request.body.data = ctx.request.body.data ?? {};
		const data = ctx.request.body.data;

		const organizationId = toNumericId(data.organization);
		if (!organizationId) {
			ctx.throw(400, 'Байгууллагын ID шаардлагатай.');
		}

		await ensureOrganizationExists(ctx, strapi, organizationId);
		setOrganizationOnBody(ctx, organizationId);
		await validateBookingRelations(ctx, strapi, organizationId);
		prepareBookingData(ctx.request.body.data, 'new');
		const sanitizedInput = await this.sanitizeInput(ctx.request.body.data, ctx);
		const created = await strapi.entityService.create(MODEL_UID, {
			data: sanitizedInput as any,
			populate: {
				organization: {
					fields: ['id', 'name'],
				},
				room: {
					fields: ['id', 'name'],
				},
				bed: {
					fields: ['id', 'no', 'name'],
				},
			},
		});

		const sanitizedOutput = await this.sanitizeOutput(created, ctx);
		return this.transformResponse(sanitizedOutput);
	},

	async update(ctx) {
		const organizationId = getOrganizationId(ctx);
		const booking = await resolveBookingParam(ctx, strapi);
		ensureBookingOwnership(ctx, booking, organizationId);
		setOrganizationOnBody(ctx, organizationId);
		await validateBookingRelations(ctx, strapi, organizationId);
		prepareBookingData(ctx.request.body.data);
		return await super.update(ctx);
	},

	async delete(ctx) {
		const organizationId = getOrganizationId(ctx);
		const booking = await resolveBookingParam(ctx, strapi);
		ensureBookingOwnership(ctx, booking, organizationId);
		return await super.delete(ctx);
	},
}));
