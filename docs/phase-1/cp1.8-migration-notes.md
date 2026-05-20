# CP1.8 Migration Notes

## TTL update for historical logs

The application code now keeps hydration logs for 365 days by setting the TTL on `hydration_logs.createdAt` to `31536000` seconds.

MongoDB TTL changes are not retroactive for an existing index definition. To update the TTL for documents that are already in production, an operator must recreate the TTL index manually in MongoDB Atlas before deploying the API.

Run the following commands against the production database used by Railway:

```javascript
db.hydration_logs.dropIndex('createdAt_1');
db.hydration_logs.createIndex(
  { createdAt: 1 },
  { name: 'createdAt_1', expireAfterSeconds: 31536000 }
);
```

Note: `SupplementLog` is not present in the codebase yet at this checkpoint, so there is no production TTL index to recreate for `supplement_logs` yet. When that collection is introduced, use the same `dropIndex('createdAt_1')` and `createIndex({ createdAt: 1 }, { name: 'createdAt_1', expireAfterSeconds: 31536000 })` pattern there as well.