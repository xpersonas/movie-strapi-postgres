'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/aggregate-ratings',
      handler: 'ratings.aggregateRatings',
      config: {
        auth: false
      }
    }
  ]
};