const aggregatingMovies = new Set();
const aggregatingBooks = new Set();

module.exports = {
    async beforeCreate(event) {
        strapi.log.info("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~beforeCreate event triggered");
    validateRatingReference(event.params.data);
    },

    async beforeUpdate(event) {
        strapi.log.info("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~beforeUpdate event triggered");
        const { where = {}, data = {} } = event.params;
        const { id } = where;

        if (!id) {
          throw new Error('Rating update requires an ID');
        }

        const existingRating = await strapi.db.query('api::rating.rating').findOne({
          where: { id },
          select: ['id'],
          populate: {
            movie: { select: ['id'] },
            season: { select: ['id'] },
            book: { select: ['id'] }
          }
        });

        if (!existingRating) {
          throw new Error(`Rating ${id} not found`);
        }

        event.state = event.state || {};
        event.state.previousRelation = {
          movieId: existingRating.movie?.id ?? null,
          seasonId: existingRating.season?.id ?? null,
          bookId: existingRating.book?.id ?? null
        };

        const hasMovieInPayload = Object.prototype.hasOwnProperty.call(data, 'movie');
        const hasSeasonInPayload = Object.prototype.hasOwnProperty.call(data, 'season');
        const hasBookInPayload = Object.prototype.hasOwnProperty.call(data, 'book');

        const movieRef = hasMovieInPayload ? data.movie : existingRating.movie;
        const seasonRef = hasSeasonInPayload ? data.season : existingRating.season;
        const bookRef = hasBookInPayload ? data.book : existingRating.book;

        validateRatingReference({ movie: movieRef, season: seasonRef, book: bookRef });
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
          populate: { movie: true, season: true, book: true }
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

        // Handle book deletion
        if (rating.book) {
          const bookId = rating.book.id;
          if (bookId) {
            strapi.log.info(`Found book before deletion: ${JSON.stringify(rating.book)}`);
            await updateBookRatings(bookId, id);
          }
        }
      } catch (error) {
        strapi.log.error("Error in beforeDelete:", error);
      }
    }
  };
  
  /**
   * Validate that a rating references exactly one rateable entity
   */
  async function validateRatingReference(data) {
    const hasMovie = !!data.movie;
    const hasSeason = !!data.season;
    const hasBook = !!data.book;
    const relationsCount = [hasMovie, hasSeason, hasBook].filter(Boolean).length;

    if (relationsCount !== 1) {
      throw new Error('Rating must reference exactly one of movie, season, or book');
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
        populate: { movie: true, season: true, book: true }
      });
      
      if (!rating) {
        strapi.log.info("Could not find rating");
        return;
      }
      
      const previousMovieId = event.state?.previousRelation?.movieId ?? null;
      const previousSeasonId = event.state?.previousRelation?.seasonId ?? null;
      const previousBookId = event.state?.previousRelation?.bookId ?? null;
      const currentMovieId = rating.movie?.id ?? null;
      const currentSeasonId = rating.season?.id ?? null;
      const currentBookId = rating.book?.id ?? null;

      // Update movie ratings if movie is present
      if (rating.movie) {
        const movieId = currentMovieId;
        if (movieId) {
          strapi.log.info(`Found movie: ${JSON.stringify(rating.movie)}`);
          await updateMovieRatings(movieId);
        }
      }

      if (previousMovieId && previousMovieId !== currentMovieId) {
        strapi.log.info(`Recalculating previous movie ${previousMovieId} after relation change`);
        await updateMovieRatings(previousMovieId);
      }
      
      // Update season ratings if season is present
      if (rating.season) {
        const seasonId = currentSeasonId;
        if (seasonId) {
          strapi.log.info(`Found season: ${JSON.stringify(rating.season)}`);
          await updateSeasonRatings(seasonId);
        }
      }

      if (previousSeasonId && previousSeasonId !== currentSeasonId) {
        strapi.log.info(`Recalculating previous season ${previousSeasonId} after relation change`);
        await updateSeasonRatings(previousSeasonId);
      }

      // Update book ratings if book is present
      if (rating.book) {
        const bookId = currentBookId;
        if (bookId) {
          strapi.log.info(`Found book: ${JSON.stringify(rating.book)}`);
          await updateBookRatings(bookId);
        }
      }

      if (previousBookId && previousBookId !== currentBookId) {
        strapi.log.info(`Recalculating previous book ${previousBookId} after relation change`);
        await updateBookRatings(previousBookId);
      }
      
      if (!rating.movie && !rating.season && !rating.book) {
        strapi.log.info("Rating has no associated movie, season, or book");
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
      
      // Get the movie to retrieve its documentId
      const movie = await db.query('api::movie.movie').findOne({
        where: { id: movieId },
        select: ['documentId']
      });
      
      if (!movie || !movie.documentId) {
        strapi.log.error(`Could not find movie or documentId for movie ${movieId}`);
        return;
      }
      
      // Update the movie
      await strapi.documents('api::movie.movie').update({
        documentId: movie.documentId,
        data: {
          average_rating,
          total_ratings: count,
          last_review_date: new Date().toISOString()
        }
      });

      // Publish the movie changes
      await strapi.documents('api::movie.movie').publish({
        documentId: movie.documentId
      });
      
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
      
      // Get the season to retrieve its documentId
      const season = await db.query('api::season.season').findOne({
        where: { id: seasonId },
        select: ['documentId']
      });
      
      if (!season || !season.documentId) {
        strapi.log.error(`Could not find season or documentId for season ${seasonId}`);
        return;
      }
      
      // Update the season
      await strapi.documents('api::season.season').update({
        documentId: season.documentId,
        data: {
          average_rating,
          total_ratings: count
        }
      });

      // Publish the season changes
      await strapi.documents('api::season.season').publish({
        documentId: season.documentId
      });
      
      strapi.log.info(`Updated season ${seasonId} rating: ${average_rating} from ${count} ratings${excludeMessage}`);
    } catch (error) {
      strapi.log.error(`Failed to update season ${seasonId} ratings`);
      strapi.log.error(error);
    }
  }

  /**
   * Update rating averages for a specific book
   * @param {number|string} bookId - The ID of the book to update
   * @param {number|string|null} excludeRatingId - Optional ID of a rating to exclude (for beforeDelete)
   */
  async function updateBookRatings(bookId, excludeRatingId = null) {
    if (!bookId) {
      strapi.log.error("No book ID provided to updateBookRatings function");
      return;
    }

    if (aggregatingBooks.has(bookId)) {
      strapi.log.info(`Aggregation already in progress for book ${bookId}, skipping concurrent run`);
      return;
    }

    aggregatingBooks.add(bookId);

    try {
      const { db } = strapi;
      const excludeMessage = excludeRatingId ? ` (excluding rating ${excludeRatingId})` : '';
      strapi.log.info(`Aggregating ratings for book ${bookId}${excludeMessage}...`);

      const queryWhere = {
        publishedAt: { $notNull: true },
        book: bookId
      };

      if (excludeRatingId) {
        queryWhere.id = { $ne: excludeRatingId };
      }

      const ratings = await db.query('api::rating.rating').findMany({
        select: ['id', 'score'],
        where: queryWhere
      });

      strapi.log.info(`Found ${ratings.length} ratings for book ${bookId}${excludeMessage}`);
      strapi.log.info(`Ratings details: ${JSON.stringify(ratings)}`);

      let totalScore = 0;
      const count = ratings.length;

      ratings.forEach((rating, index) => {
        strapi.log.info(`Rating ${index + 1}: ID=${rating.id}, Score=${rating.score}`);
        totalScore += rating.score;
      });

      const average_rating = count > 0
        ? parseFloat((totalScore / count).toFixed(1))
        : 0;

      strapi.log.info(`Calculation: Total=${totalScore}, Count=${count}, Average=${average_rating}`);

      const book = await db.query('api::book.book').findOne({
        where: { id: bookId },
        select: ['documentId']
      });

      if (!book || !book.documentId) {
        strapi.log.error(`Could not find book or documentId for book ${bookId}`);
        return;
      }

      await strapi.documents('api::book.book').update({
        documentId: book.documentId,
        data: {
          average_rating,
          total_ratings: count,
          last_review_date: new Date().toISOString()
        }
      });

      await strapi.documents('api::book.book').publish({
        documentId: book.documentId
      });

      strapi.log.info(`Updated book ${bookId} rating: ${average_rating} from ${count} ratings${excludeMessage}`);
    } catch (error) {
      strapi.log.error(`Failed to update book ${bookId} ratings`);
      strapi.log.error(error);
    } finally {
      aggregatingBooks.delete(bookId);
    }
  }