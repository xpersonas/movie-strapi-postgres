'use strict';

/**
 * show service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::show.show');
