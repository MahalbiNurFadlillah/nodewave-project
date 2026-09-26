# Deployment guide

## 1) Backend on Railway

1. Open Railway and create a new project.
2. Add a PostgreSQL service.
3. Import this repository, but point Railway to the `backend` folder as the app root.
4. Set the following environment variables in Railway:
   - `DATABASE_URL` = Railway Postgres URL
   - `JWT_SECRET` = any strong secret string
   - `JWT_EXPIRES_IN` = `7d`
   - `PORT` = `4000`
   - `NODE_ENV` = `production`
   - `FRONTEND_URL` = public Vercel URL
5. Deploy the app.
6. Run these commands in Railway Shell:
   - `bunx prisma generate`
   - `bunx prisma migrate deploy`
   - `bun run src/prisma/seed.ts`

This ensures the seeded accounts are available on the live deployment:
- PM: `pm@nodewave.id` / `Password123!`
- Internal Team: `frontend@nodewave.id` / `Password123!`
- Client Guest: `client@acmecorp.com` / `Password123!`

## 2) Frontend on Vercel

1. Import the `frontend` folder as a Vercel project.
2. Use the default Next.js build settings.
3. Set environment variable:
   - `NEXT_PUBLIC_BE_URL` = your live Railway backend URL
4. Deploy.

Example:
- `NEXT_PUBLIC_BE_URL=https://your-railway-app.up.railway.app`

## 3) Final verification

After deployment, verify these URLs:
- `https://your-railway-app.up.railway.app/health`
- frontend login page and seeded login flow

Check that the PM, Internal Team, and Client Guest credentials can sign in successfully from the live app.
