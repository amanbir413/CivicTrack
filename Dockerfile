FROM node:20-alpine
ENV NODE_ENV=production PORT=10000 ENABLE_DEMO_ACCOUNTS=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p /app/data/private-uploads && chown -R node:node /app
COPY --chown=node:node . .
USER node
EXPOSE 10000
CMD ["sh", "-c", "npm run db:migrate && if [ \"$ENABLE_DEMO_ACCOUNTS\" = \"true\" ]; then npm run db:seed-demo-accounts; fi && exec npm start"]
