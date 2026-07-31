# Runs the dashboard + the background poller as one always-on web service.
FROM node:20-alpine

WORKDIR /app

# Install only production deps first (better layer caching)
COPY package.json ./
RUN npm install --omit=dev

# App source (everything except what .dockerignore excludes)
COPY . .

# Hosts inject their own PORT; the app reads it from the environment.
ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
