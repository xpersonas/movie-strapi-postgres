# Movie Backend (Strapi)

This repository contains the Strapi 5 backend that powers the Nuxt frontend for *The Movie Store*. The frontend lives in a separate repository and is deployed to Vercel, while this backend is deployed to Render.

## Hosting Footprint
- **API**: Render web service `strapi` (Node 20, starter plan) defined in [render.yaml](render.yaml).
- **Database**: Render managed PostgreSQL instance (`strapi`). The connection string is injected into the service as `DATABASE_URL`.
- **Frontend**: Nuxt app deployed independently on Vercel and uses this backend’s REST/GraphQL APIs.
- **Media storage**: Amazon S3 bucket `nuxt-movies` in `us-east-2`, storing files under the `uploads/` prefix.

## Local Development
1. Install dependencies: `yarn install`.
2. Copy the environment template: `cp .env.example .env` and fill in secrets (Strapi app keys, Render/Postgres credentials, AWS keys, etc.).
3. Run Strapi in development mode: `yarn develop`.
4. To build the admin panel locally run `yarn build`; to start it in production mode run `yarn start`.

> Node 20.x is required (Render also runs 20.x). Use a version manager or the `.nvmrc`/DDEV configuration you already have in this repo.

## Environment Variables
Key variables currently in use:

| Variable | Purpose |
| --- | --- |
| `APP_KEYS`, `ADMIN_JWT_SECRET`, `JWT_SECRET`, `API_TOKEN_SALT` | Standard Strapi secrets. |
| `DATABASE_URL` | Postgres connection string from Render. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | IAM user credentials that can read/write the S3 bucket. |
| `AWS_REGION` | `us-east-2` for the `nuxt-movies` bucket. |
| `AWS_BUCKET_NAME` | Name of the S3 bucket (currently `nuxt-movies`). |
| `AWS_BASE_PATH` | Object key prefix (`uploads`) to keep files organized. |

Check `.env.example` for the latest list and keep production secrets in Render’s dashboard.

## Media Library (S3)
- Files uploaded through Strapi go directly to S3 via `@strapi/provider-upload-aws-s3`.
- Objects are written under `uploads/` so URLs look like `https://nuxt-movies.s3.us-east-2.amazonaws.com/uploads/...`.
- To back up or restore assets locally you can use the AWS CLI: `aws s3 sync s3://nuxt-movies/uploads ./public/uploads`.

## Database Syncs
To clone production data locally, export the Render database using the `pg_dump` CLI and the `DATABASE_URL` from Render:

```bash
pg_dump "$DATABASE_URL" > backups/strapi-prod.sql
# then restore with
psql strapi_local < backups/strapi-prod.sql
```

The Render dashboard exposes the connection string and credentials; you can also retrieve them via `render services --output json`.

## Deployment Notes
- Render builds with `yarn install && yarn build` and starts with `yarn start` (see [render.yaml](render.yaml)).
- Auto-deploy is disabled, so trigger deployments manually from the Render dashboard after merging changes.
- The Nuxt frontend on Vercel should be redeployed whenever backend API changes require updated client behavior.
