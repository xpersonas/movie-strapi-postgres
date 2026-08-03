const aggregatingMovies = new Set();
const aggregatingSeasons = new Set();
const aggregatingBooks = new Set();

module.exports = {
  async beforeCreate(event) {
    validateRatingReference(event.params.data);
  },

  async beforeUpdate(event) {
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
    await processRatingEvent(event);
  },

  async afterUpdate(event) {
    await processRatingEvent(event);
  },

  async beforeDelete(event) {
    try {
      const { id } = event.params.where;
      if (!id) {
        return;
      }

      const rating = await strapi.db.query('api::rating.rating').findOne({
        where: { id },
        populate: { movie: true, season: true, book: true }
      });

      if (!rating) {
        return;
      }

      if (rating.movie?.id) {
        await updateMovieRatings(rating.movie.id, id);
      }

      if (rating.season?.id) {
        await updateSeasonRatings(rating.season.id, id);
      }

      if (rating.book?.id) {
        await updateBookRatings(rating.book.id, id);
      }
    } catch (error) {
      strapi.log.error('Error in rating beforeDelete:', error);
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
 * Process a rating event and update the associated movie/season/book aggregates
 */
async function processRatingEvent(event) {
  try {
    const ratingId = event.result?.id;
    if (!ratingId) {
      return;
    }

    const rating = await strapi.db.query('api::rating.rating').findOne({
      where: { id: ratingId },
      populate: { movie: true, season: true, book: true }
    });

    if (!rating) {
      return;
    }

    const previousMovieId = event.state?.previousRelation?.movieId ?? null;
    const previousSeasonId = event.state?.previousRelation?.seasonId ?? null;
    const previousBookId = event.state?.previousRelation?.bookId ?? null;
    const currentMovieId = rating.movie?.id ?? null;
    const currentSeasonId = rating.season?.id ?? null;
    const currentBookId = rating.book?.id ?? null;

    if (currentMovieId) {
      await updateMovieRatings(currentMovieId);
    }
    if (previousMovieId && previousMovieId !== currentMovieId) {
      await updateMovieRatings(previousMovieId);
    }

    if (currentSeasonId) {
      await updateSeasonRatings(currentSeasonId);
    }
    if (previousSeasonId && previousSeasonId !== currentSeasonId) {
      await updateSeasonRatings(previousSeasonId);
    }

    if (currentBookId) {
      await updateBookRatings(currentBookId);
    }
    if (previousBookId && previousBookId !== currentBookId) {
      await updateBookRatings(previousBookId);
    }
  } catch (error) {
    strapi.log.error('Error processing rating event:', error);
  }
}

/**
 * Compute the {count, average} of scores for a relation column, optionally excluding one rating.
 */
async function computeAggregate(relationColumn, relationId, excludeRatingId) {
  const queryWhere = {
    publishedAt: { $notNull: true },
    [relationColumn]: relationId
  };

  if (excludeRatingId) {
    queryWhere.id = { $ne: excludeRatingId };
  }

  const ratings = await strapi.db.query('api::rating.rating').findMany({
    select: ['score'],
    where: queryWhere
  });

  const count = ratings.length;
  const totalScore = ratings.reduce((sum, r) => sum + r.score, 0);
  const average_rating = count > 0 ? parseFloat((totalScore / count).toFixed(1)) : 0;

  return { average_rating, count };
}

/**
 * Update rating averages for a specific movie
 * @param {number|string} movieId - The ID of the movie to update
 * @param {number|string|null} excludeRatingId - Optional ID of a rating to exclude (for beforeDelete)
 */
async function updateMovieRatings(movieId, excludeRatingId = null) {
  if (!movieId) return;

  if (aggregatingMovies.has(movieId)) {
    return;
  }
  aggregatingMovies.add(movieId);

  try {
    const { average_rating, count } = await computeAggregate('movie', movieId, excludeRatingId);

    const movie = await strapi.db.query('api::movie.movie').findOne({
      where: { id: movieId },
      select: ['documentId']
    });

    if (!movie?.documentId) {
      strapi.log.error(`Could not find movie or documentId for movie ${movieId}`);
      return;
    }

    await strapi.documents('api::movie.movie').update({
      documentId: movie.documentId,
      data: {
        average_rating,
        total_ratings: count,
        last_review_date: new Date().toISOString()
      }
    });
  } catch (error) {
    strapi.log.error(`Failed to update movie ${movieId} ratings`, error);
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
  if (!seasonId) return;

  if (aggregatingSeasons.has(seasonId)) {
    return;
  }
  aggregatingSeasons.add(seasonId);

  try {
    const { average_rating, count } = await computeAggregate('season', seasonId, excludeRatingId);

    const season = await strapi.db.query('api::season.season').findOne({
      where: { id: seasonId },
      select: ['documentId']
    });

    if (!season?.documentId) {
      strapi.log.error(`Could not find season or documentId for season ${seasonId}`);
      return;
    }

    await strapi.documents('api::season.season').update({
      documentId: season.documentId,
      data: {
        average_rating,
        total_ratings: count
      }
    });
  } catch (error) {
    strapi.log.error(`Failed to update season ${seasonId} ratings`, error);
  } finally {
    aggregatingSeasons.delete(seasonId);
  }
}

/**
 * Update rating averages for a specific book
 * @param {number|string} bookId - The ID of the book to update
 * @param {number|string|null} excludeRatingId - Optional ID of a rating to exclude (for beforeDelete)
 */
async function updateBookRatings(bookId, excludeRatingId = null) {
  if (!bookId) return;

  if (aggregatingBooks.has(bookId)) {
    return;
  }
  aggregatingBooks.add(bookId);

  try {
    const { average_rating, count } = await computeAggregate('book', bookId, excludeRatingId);

    const book = await strapi.db.query('api::book.book').findOne({
      where: { id: bookId },
      select: ['documentId']
    });

    if (!book?.documentId) {
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
  } catch (error) {
    strapi.log.error(`Failed to update book ${bookId} ratings`, error);
  } finally {
    aggregatingBooks.delete(bookId);
  }
}
