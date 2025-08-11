# Vercel Deployment Guide

## Prerequisites
1. Vercel CLI installed: `npm i -g vercel`
2. Vercel account created
3. GitHub repository connected to Vercel

## Step 1: Set up Vercel Postgres
1. Go to your Vercel dashboard
2. Navigate to your project > Storage
3. Create a new Postgres database
4. Note down the connection strings (they'll be auto-added to your env vars)

## Step 2: Configure Environment Variables
In your Vercel project settings, add these environment variables:
- `NODE_ENV=production`
- `JWT_SECRET=your-super-secure-secret-here`
- `FRONTEND_URL=https://your-frontend-url.vercel.app`
- `CORS_ORIGIN=https://your-frontend-url.vercel.app`

## Step 3: Deploy
```bash
# Build and deploy
vercel --prod

# Or push to main branch if GitHub integration is set up
git add .
git commit -m "Add Vercel deployment configuration"
git push origin main
```

## Step 4: Test the deployment
1. Check that the API responds at your Vercel URL
2. Test database connections
3. Verify CORS settings with your frontend

## Database Migration
The database will be automatically initialized on first deployment.
Tables will be created when the application starts.
