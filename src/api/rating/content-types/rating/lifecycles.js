module.exports = {
    async afterCreate(event) {
      strapi.log.info("afterCreate event triggered");
      await processRatingEvent(event);
    },
    
    async afterUpdate(event) {
      strapi.log.info("afterUpdate event triggered");
      await processRatingEvent(event);
    },
    
    async beforeDelete(event) {
      strapi.log.info("beforeDelete event triggered");
      try {
        const { id } = event.params.where;
        if (!id) {
          strapi.log.info("No rating ID found in beforeDelete event");
          return;
        }
        
        const rating = await strapi.db.query('api::rating.rating').findOne({
          where: { id },
          populate: { movie: true }
        });
        
        if (!rating || !rating.movie) {
          strapi.log.info("Could not find rating or its associated movie before deletion");
          return;
        }
        
        const movieId = rating.movie.id;
        if (!movieId) {
          strapi.log.info("No movie ID found before deletion");
          return;
        }
        
        strapi.log.info(`Found movie before deletion: ${JSON.stringify(rating.movie)}`);
        
        // Use the unified function with an exclusion for the rating being deleted
        await updateMovieRatings(movieId, id);
      } catch (error) {
        strapi.log.error("Error in beforeDelete:", error);
      }
    }
  };
  
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
      
      // Get the rating with its movie relation fully populated
      const rating = await strapi.db.query('api::rating.rating').findOne({
        where: { id: ratingId },
        populate: { movie: true }
      });
      
      if (!rating || !rating.movie) {
        strapi.log.info("Could not find rating or its associated movie");
        return;
      }
      
      strapi.log.info(`Found movie: ${JSON.stringify(rating.movie)}`);
      
      // Get the movie ID
      const movieId = rating.movie.id;
      if (!movieId) {
        strapi.log.info("No movie ID found");
        return;
      }
      
      // Update the movie ratings (no rating to exclude)
      await updateMovieRatings(movieId);
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
      
      // Get all ratings for this movie
      const ratings = await db.query('api::rating.rating').findMany({
        select: ['score'],
        where: queryWhere
      });
      
      strapi.log.info(`Found ${ratings.length} ratings for movie ${movieId}${excludeMessage}`);
      
      // Calculate average
      let totalScore = 0;
      const count = ratings.length;
      
      for (const rating of ratings) {
        totalScore += rating.score;
      }
      
      const average_rating = count > 0 
        ? parseFloat((totalScore / count).toFixed(1)) 
        : 0;
      
      // Update the movie
      await db.query('api::movie.movie').update({
        where: { id: movieId },
        data: {
          average_rating,
          total_ratings: count
        }
      });
      
      strapi.log.info(`Updated movie ${movieId} rating: ${average_rating} from ${count} ratings${excludeMessage}`);
    } catch (error) {
      strapi.log.error(`Failed to update movie ${movieId} ratings`);
      strapi.log.error(error);
    }
  }