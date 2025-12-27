'use strict';

/**
 * goat-snapshot service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::goat-snapshot.goat-snapshot');
