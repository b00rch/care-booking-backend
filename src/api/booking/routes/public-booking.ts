export default {
	routes: [
		{
			method: 'POST',
			path: '/public/bookings',
			handler: 'booking.createPublic',
			config: {
				auth: false,
				policies: [],
				middlewares: [],
			},
		},
	],
};
