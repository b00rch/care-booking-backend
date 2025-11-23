// import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    strapi.server.use(async (ctx, next) => {
      if (ctx.path === '/health' && ctx.method === 'GET') {
        ctx.set('Cache-Control', 'no-store');

        try {
          await strapi.db?.connection?.raw?.('SELECT 1');
          ctx.body = {
            status: 'ok',
            timestamp: new Date().toISOString(),
          };
          ctx.status = 200;
        } catch (error) {
          strapi.log.error('Health check database probe failed', error);
          ctx.body = {
            status: 'error',
            timestamp: new Date().toISOString(),
          };
          ctx.status = 503;
        }

        return;
      }

      await next();
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap(/* { strapi }: { strapi: Core.Strapi } */) { },
};
