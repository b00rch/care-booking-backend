/**
 * Override users-permissions plugin to always populate role & organization on /users/me
 */
export default (plugin) => {
  plugin.controllers.user.me = async (ctx) => {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized();
    }

    const fullUser = await (strapi as any).entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      {
        populate: {
          role: { fields: ['id', 'name', 'type'] },
          organization: { fields: ['id', 'name'] },
        },
      },
    );

    if (!fullUser) {
      return ctx.unauthorized();
    }

    // Remove sensitive fields
    const { password, resetPasswordToken, confirmationToken, ...sanitized } = fullUser as any;
    ctx.body = sanitized;
  };

  return plugin;
};
