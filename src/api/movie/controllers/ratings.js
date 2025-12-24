'use strict';

module.exports = {
  async aggregateRatings(ctx) {
    console.log('it is happening...');
    // Remove the "return true;" line that's stopping execution
    
    try {
      const { db } = strapi;
      console.log('Aggregating movie ratings...');
      
      const ratingsByMovie = await db.query('api::rating.rating').findMany({
        select: ['id', 'documentId', 'score'],
        where: {
          $and: [
            { movie: { $notNull: true } }
          ]
        },
        populate: {
          movie: true,
        },
      });

      const movieRatings = {};

      for (const rating of ratingsByMovie) {
        if (!rating.movie) continue;
        
        const movieId = rating.movie.documentId	;
        if (!movieRatings[movieId]) {
          movieRatings[movieId] = {
            totalScore: 0,
            count: 0
          };
        }
        
        movieRatings[movieId].totalScore += rating.score;
        movieRatings[movieId].count += 1;
      }

      // Update each movie with its aggregate rating data while keeping existing updatedAt
      for (const [movieId, data] of Object.entries(movieRatings)) {
        const average_rating = data.count > 0 
          ? parseFloat((data.totalScore / data.count).toFixed(2)) 
          : 0;
        
        const movie = await db.query('api::movie.movie').findOne({
          where: { documentId: movieId },
          select: ['updatedAt'],
        });

        if (!movie) {
          console.warn(`Movie ${movieId} not found while aggregating ratings`);
          continue;
        }

        await db.query('api::movie.movie').update({
          where: { documentId: movieId },
          data: {
            average_rating,
            total_ratings: data.count,
            updatedAt: movie.updatedAt,
          },
          publish: true,
        });
        
        console.log(`Updated movie ${movieId} with average rating ${average_rating} from ${data.count} ratings`);
      }
      
      return { data: { message: 'Successfully updated all movie rating averages', payload: ratingsByMovie, movieRatings: movieRatings } };
    } catch (error) {
      console.error('Failed to update movie rating averages:', error);
      return ctx.badRequest('Failed to update movie rating averages', { error: error.message });
    }
  }
};