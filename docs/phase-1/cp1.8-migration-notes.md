# CP1.8 Migration Notes

## TTL update for historical logs

The application code now keeps both hydration logs and supplement logs for 365 days by setting the TTL on `createdAt` to `31536000` seconds in the corresponding collections.

MongoDB TTL changes are not retroactive for an existing index definition. To update the TTL for documents that are already in production, an operator must recreate the TTL index manually in MongoDB Atlas before deploying the API.

Run the following commands against the production database used by Railway:

```javascript
db.hydration_logs.dropIndex('createdAt_1');
db.hydration_logs.createIndex(
  { createdAt: 1 },
  { name: 'createdAt_1', expireAfterSeconds: 31536000 }
);

db.supplement_logs.dropIndex('createdAt_1');
db.supplement_logs.createIndex(
  { createdAt: 1 },
  { name: 'createdAt_1', expireAfterSeconds: 31536000 }
);
```

If the old production environment still has the earlier 90-day TTL index, recreating these indexes is required for the new 365-day history window to take effect on existing Atlas indexes.