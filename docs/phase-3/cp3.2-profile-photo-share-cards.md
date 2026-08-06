# CP3.2 — Foto de Perfil e Share Cards

This checkpoint adds personalized visual identity and an organic growth mechanism to the product without any additional external service. The profile photo lives in MongoDB next to the rest of the app's data, and every Share Card is rendered and captured entirely on the user's own phone — no cloud storage, no server-side rendering, no image CDN.

## Files Created

### Backend

- [apps/api/src/models/UserPhoto.ts](../../apps/api/src/models/UserPhoto.ts): new file, the `user_photos` collection.
- [apps/api/src/models/User.ts](../../apps/api/src/models/User.ts): extended with `hasProfilePhoto` and `profilePhotoUpdatedAt`.
- [apps/api/src/controllers/user.controller.ts](../../apps/api/src/controllers/user.controller.ts): added `uploadProfilePhoto()`, `getMyProfilePhoto()`, and `deleteProfilePhoto()`.
- [apps/api/src/routes/users.ts](../../apps/api/src/routes/users.ts): exposed the three authenticated endpoints `POST /users/profile-photo`, `GET /users/me/photo`, and `DELETE /users/profile-photo`.

### Mobile

- [apps/mobile/src/components/profile/ProfilePhoto.tsx](../../apps/mobile/src/components/profile/ProfilePhoto.tsx): new file, the shared avatar component with cache logic described below.
- [apps/mobile/src/utils/shareCard.utils.ts](../../apps/mobile/src/utils/shareCard.utils.ts): new file, `generateAndShare()`.
- [apps/mobile/src/components/shareCards/RecipeShareCard.tsx](../../apps/mobile/src/components/shareCards/RecipeShareCard.tsx): new file.
- [apps/mobile/src/components/shareCards/AchievementShareCard.tsx](../../apps/mobile/src/components/shareCards/AchievementShareCard.tsx): new file.
- [apps/mobile/src/components/shareCards/WeeklyShareCard.tsx](../../apps/mobile/src/components/shareCards/WeeklyShareCard.tsx): new file.
- [apps/mobile/src/components/shareCards/ShareFormatSheet.tsx](../../apps/mobile/src/components/shareCards/ShareFormatSheet.tsx): new file, the format-selection bottom sheet used ahead of `RecipeShareCard` captures.

## Profile Photo Storage in MongoDB

The photo is stored in a dedicated `user_photos` collection instead of being embedded in the `User` document or pushed to external cloud storage.

`User` is read on the order of dozens of times a day by unrelated parts of the app — the home screen, every history query, XP and mission checks, and so on. If a ~400KB base64 image lived inside that document, every one of those reads would carry the image payload along for no reason. Keeping the photo in `user_photos` means `User` only ever carries two lightweight fields:

- `hasProfilePhoto: boolean`
- `profilePhotoUpdatedAt: Date`

[apps/api/src/models/UserPhoto.ts](../../apps/api/src/models/UserPhoto.ts) enforces a unique index on `userId`, so there is exactly one photo document per user, never more — an upload always upserts that single document rather than accumulating history.

On the mobile side, [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx) enforces a 300KB (`300 * 1024` bytes) ceiling on the compressed file *before* base64 encoding, which is why the backend's own limit is set higher, at 530,000 base64 characters — base64 inflates binary size by roughly a third. Before upload, the image goes through `expo-image-manipulator`: its largest dimension is scaled down to 400px while preserving aspect ratio (a portrait photo does not become a square crop, it becomes something like 267×400), re-encoded as JPEG at quality `0.7`. If the manipulated file still exceeds 300KB, the upload is rejected client-side before any network call is made.

Deleting the photo removes the entire `user_photos` document for that user — there is no soft delete or archival copy.

## ProfilePhoto Component Cache Strategy

Every response from `GET /users/me` already carries `hasProfilePhoto` and `profilePhotoUpdatedAt`, so [apps/mobile/src/components/profile/ProfilePhoto.tsx](../../apps/mobile/src/components/profile/ProfilePhoto.tsx) never has to ask the backend whether a photo exists — that answer is already sitting in data the app fetches anyway.

The component keeps a single MMKV entry per user, under the key `profile_photo_{userId}`, holding a JSON blob with `imageBase64`, `mimeType`, and the `profilePhotoUpdatedAt` value that was current when that blob was cached — the timestamp travels inside the same cache entry rather than living under a separate key.

On mount or whenever `profilePhotoUpdatedAt` changes:

1. If `hasProfilePhoto` is `false`, the component clears any cached entry for that user and falls back to showing initials.
2. Otherwise, it reads the cached blob and compares its stored `profilePhotoUpdatedAt` against the current prop value.
3. If they match, the cached `imageBase64` is rendered directly — zero network calls.
4. If they differ, or there is no cached entry yet, the component calls `GET /users/me/photo`, writes the returned `imageBase64` and `mimeType` together with the current `profilePhotoUpdatedAt` back into the same MMKV key, and renders the result.

If the fetch fails for any reason, the component silently falls back to showing the user's initials instead of surfacing an error — a broken avatar is treated as a cosmetic, not a functional, failure.

## Share Cards

All three Share Card types are React components rendered off-screen — `position: absolute` with an extreme negative `left` offset, so they exist in the tree and can be measured and captured, but are never visible or interactive to the user — and wrapped in a `react-native-view-shot` `ViewShot` node. Capturing and sharing all go through the single reusable [apps/mobile/src/utils/shareCard.utils.ts](../../apps/mobile/src/utils/shareCard.utils.ts) function `generateAndShare()`, which calls the `ViewShot` ref's `capture()` method to produce a JPEG, then hands the resulting file to `expo-sharing`'s `Sharing.shareAsync()` to open the OS-native share sheet. No image ever touches a server in this flow.

### RecipeShareCard

- **Data source:** a `PulseAiRecipe` object passed directly as a prop, plus the current user's name/photo.
- **Format:** `square` (1080×1080, feed) or `story` (1080×1920, Stories), chosen in `ShareFormatSheet` immediately before capture.
- **Activation:** the `share-outline` icon on both `RecipeCard` (Pulse AI results) and `FavoriteCard`.
- **Content shown:** recipe title, four macro pills (protein, carbs, fat, calories), the user's avatar and name, and the BLENDi brand mark.

### AchievementShareCard

- **Data source:** `newLevel` and `newLevelNameKey` read from `gamification.store`'s level-up payload.
- **Activation:** the optional "Share this moment" action inside `LevelUpCelebration`, available before the celebration overlay auto-closes.
- **Timing:** selecting share triggers the overlay's close sequence first; only after that close completes does a 300ms timer (`SHARE_START_DELAY`) elapse before `generateAndShare()` runs, which keeps the capture free of the overlay's own closing animation artifacts.

### WeeklyShareCard

- **Data source:** `GET /blend-logs/history` filtered to the last 7 days — the same history endpoint built in CP1.8, not a new backend query.
- **Format:** fixed 1080×1080 square.
- **Activation:** the `share-social-outline` icon in the `MeScreen` header.
- **Content shown:** the week's date range, total blends, average daily protein, current streak, and supplement adherence rate, alongside the user's avatar and name.
