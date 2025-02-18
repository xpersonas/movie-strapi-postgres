'use strict';

/**
 * goat service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::goat.goat');
