const aggregatingMovies = new Set();

module.exports = {
    async beforeCreate(event) {
        strapi.log.info("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~beforeCreate event triggered");
        await validateRatingReference(event.params.data);
    },

    async beforeUpdate(event) {
        strapi.log.info("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~beforeUpdate event triggered");
        await validateRatingReference(event.params.data);
    },

    async afterCreate(event) {
        strapi.log.info("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~afterCreate event triggered");
        strapi.log.info(`Event info: ${JSON.stringify(event)}`);
        await processRatingEvent(event);
    },
    
    async afterUpdate(event) {
      strapi.log.info("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~afterUpdate event triggered");
      strapi.log.info(`Event info: ${JSON.stringify(event)}`);
      await processRatingEvent(event);
    },
    
    async beforeDelete(event) {
      strapi.log.info("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~beforeDelete event triggered");
      strapi.log.info(`Event info: ${JSON.stringify(event)}`);
      try {
        const { id } = event.params.where;
        if (!id) {
          strapi.log.info("No rating ID found in beforeDelete event");
          return;
        }
        
        const rating = await strapi.db.query('api::rating.rating').findOne({
          where: { id },
          populate: { movie: true, season: true }
        });
        
        if (!rating) {
          strapi.log.info("Could not find rating before deletion");
          return;
        }
        
        // Handle movie deletion
        if (rating.movie) {
          const movieId = rating.movie.id;
          if (movieId) {
            strapi.log.info(`Found movie before deletion: ${JSON.stringify(rating.movie)}`);
            await updateMovieRatings(movieId, id);
          }
        }
        
        // Handle season deletion
        if (rating.season) {
          const seasonId = rating.season.id;
          if (seasonId) {
            strapi.log.info(`Found season before deletion: ${JSON.stringify(rating.season)}`);
            await updateSeasonRatings(seasonId, id);
          }
        }
      } catch (error) {
        strapi.log.error("Error in beforeDelete:", error);
      }
    }
  };
  
  /**
   * Validate that a rating references exactly one of movie or season
   */
  async function validateRatingReference(data) {
    const hasMovie = !!data.movie;
    const hasSeason = !!data.season;

    if (hasMovie === hasSeason) {
      throw new Error('Rating must reference exactly one of movie or season');
    }
  }

  /**
   * Process a rating event and update the associated movie's ratings
   */
  async function processRatingEvent(event) {
    try {
      const ratingId = event.result.id;
      if (!ratingId) {
        strapi.log.info("No rating ID found in event");
        return;
      }
      
      // Get the rating with its movie and season relations fully populated
      const rating = await strapi.db.query('api::rating.rating').findOne({
        where: { id: ratingId },
        populate: { movie: true, season: true }
      });
      
      if (!rating) {
        strapi.log.info("Could not find rating");
        return;
      }
      
      // Update movie ratings if movie is present
      if (rating.movie) {
        const movieId = rating.movie.id;
        if (movieId) {
          strapi.log.info(`Found movie: ${JSON.stringify(rating.movie)}`);
          await updateMovieRatings(movieId);
        }
      }
      
      // Update season ratings if season is present
      if (rating.season) {
        const seasonId = rating.season.id;
        if (seasonId) {
          strapi.log.info(`Found season: ${JSON.stringify(rating.season)}`);
          await updateSeasonRatings(seasonId);
        }
      }
      
      if (!rating.movie && !rating.season) {
        strapi.log.info("Rating has no associated movie or season");
      }
    } catch (error) {
      strapi.log.error("Error processing rating event:");
      strapi.log.error(error);
    }
  }
  
  /**
   * Update rating averages for a specific movie
   * @param {number|string} movieId - The ID of the movie to update
   * @param {number|string|null} excludeRatingId - Optional ID of a rating to exclude (for beforeDelete)
   */
  async function updateMovieRatings(movieId, excludeRatingId = null) {
    if (!movieId) {
      strapi.log.error("No movie ID provided to updateMovieRatings function");
      return;
    }

    if (aggregatingMovies.has(movieId)) {
      strapi.log.info(`Aggregation already in progress for movie ${movieId}, skipping concurrent run`);
      return;
    }

    aggregatingMovies.add(movieId);
    
    try {
      const { db } = strapi;
      const excludeMessage = excludeRatingId ? ` (excluding rating ${excludeRatingId})` : '';
      strapi.log.info(`Aggregating ratings for movie ${movieId}${excludeMessage}...`);
      
      // Build the query
      const queryWhere = {
        publishedAt: { $notNull: true },
        movie: movieId
      };
      
      // Add exclusion if needed
      if (excludeRatingId) {
        queryWhere.id = { $ne: excludeRatingId };
      }
      
      // Get all ratings for this movie with their IDs to ensure uniqueness
      const ratings = await db.query('api::rating.rating').findMany({
        select: ['id', 'score'],  // Include ID to differentiate between ratings
        where: queryWhere
      });
      
      strapi.log.info(`Found ${ratings.length} ratings for movie ${movieId}${excludeMessage}`);
      strapi.log.info(`Ratings details: ${JSON.stringify(ratings)}`);
      
      // Calculate average with explicit iteration to ensure all ratings are counted
      let totalScore = 0;
      const count = ratings.length;
      
      // Log each rating individually for debugging
      ratings.forEach((rating, index) => {
        strapi.log.info(`Rating ${index + 1}: ID=${rating.id}, Score=${rating.score}`);
        totalScore += rating.score;
      });
      
      const average_rating = count > 0 
        ? parseFloat((totalScore / count).toFixed(1)) 
        : 0;
      
      strapi.log.info(`Calculation: Total=${totalScore}, Count=${count}, Average=${average_rating}`);
      
      // Update the movie
      await db.query('api::movie.movie').update({
        where: { id: movieId },
        data: {
          average_rating,
          total_ratings: count,
          last_review_date: new Date().toISOString()
        },
        populate: false
      });
      
      // Publish the changes
      await strapi.entityService.publish('api::movie.movie', movieId);
      
      strapi.log.info(`Updated movie ${movieId} rating: ${average_rating} from ${count} ratings${excludeMessage}`);
    } catch (error) {
      strapi.log.error(`Failed to update movie ${movieId} ratings`);
      strapi.log.error(error);
    } finally {
      aggregatingMovies.delete(movieId);
    }
  }

  /**
   * Update rating averages for a specific season
   * @param {number|string} seasonId - The ID of the season to update
   * @param {number|string|null} excludeRatingId - Optional ID of a rating to exclude (for beforeDelete)
   */
  async function updateSeasonRatings(seasonId, excludeRatingId = null) {
    if (!seasonId) {
      strapi.log.error("No season ID provided to updateSeasonRatings function");
      return;
    }
    
    try {
      const { db } = strapi;
      const excludeMessage = excludeRatingId ? ` (excluding rating ${excludeRatingId})` : '';
      strapi.log.info(`Aggregating ratings for season ${seasonId}${excludeMessage}...`);
      
      // Build the query
      const queryWhere = {
        publishedAt: { $notNull: true },
        season: seasonId
      };
      
      // Add exclusion if needed
      if (excludeRatingId) {
        queryWhere.id = { $ne: excludeRatingId };
      }
      
      // Get all ratings for this season with their IDs to ensure uniqueness
      const ratings = await db.query('api::rating.rating').findMany({
        select: ['id', 'score'],
        where: queryWhere
      });
      
      strapi.log.info(`Found ${ratings.length} ratings for season ${seasonId}${excludeMessage}`);
      strapi.log.info(`Ratings details: ${JSON.stringify(ratings)}`);
      
      // Calculate average with explicit iteration to ensure all ratings are counted
      let totalScore = 0;
      const count = ratings.length;
      
      // Log each rating individually for debugging
      ratings.forEach((rating, index) => {
        strapi.log.info(`Rating ${index + 1}: ID=${rating.id}, Score=${rating.score}`);
        totalScore += rating.score;
      });
      
      const average_rating = count > 0 
        ? parseFloat((totalScore / count).toFixed(1)) 
        : 0;
      
      strapi.log.info(`Calculation: Total=${totalScore}, Count=${count}, Average=${average_rating}`);
      
      // Update the season
      await db.query('api::season.season').update({
        where: { id: seasonId },
        data: {
          average_rating,
          total_ratings: count
        },
        populate: false
      });
      
      // Publish the changes
      await strapi.entityService.publish('api::season.season', seasonId);
      
      strapi.log.info(`Updated season ${seasonId} rating: ${average_rating} from ${count} ratings${excludeMessage}`);
    } catch (error) {
      strapi.log.error(`Failed to update season ${seasonId} ratings`);
      strapi.log.error(error);
    }
  }