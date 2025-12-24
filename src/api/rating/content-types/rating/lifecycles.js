const aggregatingMovies = new Set();

module.exports = {
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
          populate: { movie: true }
        });
        
        if (!rating || !rating.movie) {
          strapi.log.info("Could not find rating or its associated movie before deletion");
          return;
        }
        
        const movieDocumentId = rating.movie.documentId;
        if (!movieDocumentId) {
          strapi.log.info("No movie documentId found before deletion");
          return;
        }
        
        strapi.log.info(`Found movie before deletion: ${JSON.stringify(rating.movie)}`);
        
        // Recalculate the aggregates while excluding the rating being deleted
        await updateMovieRatings(movieDocumentId, id);
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
      
      // Get the movie documentId (use documentId for consistency with Strapi v5)
      const movieDocumentId = rating.movie.documentId;
      if (!movieDocumentId) {
        strapi.log.info("No movie documentId found");
        return;
      }
      
      // Update the movie ratings (no rating to exclude)
      await updateMovieRatings(movieDocumentId);
    } catch (error) {
      strapi.log.error("Error processing rating event:");
      strapi.log.error(error);
    }
  }
  
  /**
   * Update rating averages for a specific movie
   * @param {string} movieDocumentId - The documentId of the movie to update
   * @param {number|string|null} excludeRatingId - Optional ID of a rating to exclude (for beforeDelete)
   */
  async function updateMovieRatings(movieDocumentId, excludeRatingId = null) {
    if (!movieDocumentId) {
      strapi.log.error("No movie documentId provided to updateMovieRatings function");
      return;
    }

    if (aggregatingMovies.has(movieDocumentId)) {
      strapi.log.info(`Aggregation already in progress for movie ${movieDocumentId}, skipping concurrent run`);
      return;
    }

    aggregatingMovies.add(movieDocumentId);
    
    try {
      const { db } = strapi;
      const excludeMessage = excludeRatingId ? ` (excluding rating ${excludeRatingId})` : '';
      strapi.log.info(`Aggregating ratings for movie ${movieDocumentId}${excludeMessage}...`);
      
      // First, get the movie's internal id for querying ratings
      const movie = await db.query('api::movie.movie').findOne({
        where: { documentId: movieDocumentId },
        select: ['id', 'updatedAt'],
      });
      
      if (!movie) {
        strapi.log.error(`Movie with documentId ${movieDocumentId} not found`);
        return;
      }
      
      // Build the query using internal id for relation
      const queryWhere = {
        movie: movie.id
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
      
      strapi.log.info(`Found ${ratings.length} ratings for movie ${movieDocumentId}${excludeMessage}`);
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
      
      // Update the movie using documentId, preserving updatedAt but setting last_review_date to now
      await db.query('api::movie.movie').update({
        where: { documentId: movieDocumentId },
        data: {
          average_rating,
          total_ratings: count,
          last_review_date: new Date().toISOString(),
          updatedAt: movie.updatedAt,
        }
      });
      
      strapi.log.info(`Updated movie ${movieDocumentId} rating: ${average_rating} from ${count} ratings${excludeMessage}`);
    } catch (error) {
      strapi.log.error(`Failed to update movie ${movieDocumentId} ratings`);
      strapi.log.error(error);
    } finally {
      aggregatingMovies.delete(movieDocumentId);
    }
  }