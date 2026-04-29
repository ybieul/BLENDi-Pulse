# BLENDi Pulse — Documentation

BLENDi Pulse is the companion app for the BLENDi hardware platform, built in React Native with Expo for iOS and Android, with a Node.js and Express backend hosted on Railway, MongoDB Atlas as the primary database, and a centralized design tokens system shared across the stack. This `/docs` directory contains the project's technical documentation organized by development phase, and each phase is expected to have its own subfolder with one file per implemented checkpoint.

---

## Project Structure

| Layer | Path | Responsibility |
|---|---|---|
| Mobile app | `apps/mobile` | React Native and Expo client responsible for screens, navigation, device integration, and user-facing state |
| Backend API | `apps/api` | Node.js and Express service responsible for business logic, authentication, integrations, and persistence |
| Shared packages | `packages/shared` | Shared design tokens, Zod schemas, and TypeScript contracts consumed by mobile and backend |

---

## Documentation Index

### Architecture

| Document | Description |
|---|---|
| [architecture.md](architecture.md) | Global architecture decisions, stack overview, and cross-cutting concerns |

### API Reference

| Document | Description |
|---|---|
| [api/endpoints.md](api/endpoints.md) | Complete REST API reference with all implemented endpoints |

### Phase 0 — Foundation

| Checkpoint | Document | Description |
|---|---|---|
| CP0.1 | [phase-0/cp0.1-monorepo.md](phase-0/cp0.1-monorepo.md) | Monorepo structure and workspace configuration |
| CP0.2 | [phase-0/cp0.2-tokens.md](phase-0/cp0.2-tokens.md) | Design tokens and shared constants |
| CP0.3 | [phase-0/cp0.3-expo-init.md](phase-0/cp0.3-expo-init.md) | Expo project initialization and dependencies |
| CP0.4 | [phase-0/cp0.4-i18n.md](phase-0/cp0.4-i18n.md) | Internationalization system with i18next |
| CP0.5 | [phase-0/cp0.5-skeleton-loader.md](phase-0/cp0.5-skeleton-loader.md) | SkeletonLoader component and loading states |
| CP0.6 | [phase-0/cp0.6-backend-setup.md](phase-0/cp0.6-backend-setup.md) | Backend setup with Railway and MongoDB |
| CP0.7 | [phase-0/cp0.7-auth.md](phase-0/cp0.7-auth.md) | Authentication system with JWT and Zod schemas |
| CP0.8 | [phase-0/cp0.8-timezone.md](phase-0/cp0.8-timezone.md) | Timezone detection and date formatting |
| CP0.9 | [phase-0/cp0.9-google-login-otp.md](phase-0/cp0.9-google-login-otp.md) | Google OAuth login and OTP password reset |

### Phase 1 — Core Features

To be documented as phases are implemented.

### Phase 2 — Hardware Integration

To be documented as phases are implemented.

### Phase 3 — Social & Community

To be documented as phases are implemented.

### Phase 4 — Notifications & Email

To be documented as phases are implemented.

### Phase 5 — Launch Readiness

To be documented as phases are implemented.

---

## Key Decisions

- React Native with Expo managed workflow over bare workflow: reduces native maintenance overhead, keeps development faster, and remains sufficient for the current product scope.
- pnpm workspaces for the monorepo: enables a single lockfile, consistent dependency management, and clean sharing of internal packages across layers.
- Shared Zod schemas between frontend and backend: keeps validation rules as a single source of truth and prevents contract drift between form validation and API enforcement.
- Refresh token in `expo-secure-store` and access token in Zustand memory: keeps the long-lived credential in secure native storage while avoiding persistence of the short-lived access token.
- Six-digit OTP for password reset instead of magic link: works reliably in the current development phase without depending on production-grade transactional email link flows.
- EmailService in console mode in development with an interface ready for Resend in Phase 4: decouples local development from a live provider while preserving a clean integration boundary for future rollout.
- Timezone stored in the user profile in MongoDB: allows backend cron jobs and time-based automation to run according to each user's local timezone.

---

## Development Setup

```bash
# Clone the repository
git clone https://github.com/<org>/blendi-pulse.git
cd blendi-pulse

# Install all workspace dependencies
pnpm install

# Configure backend environment
cp apps/api/.env.example apps/api/.env

# Configure mobile environment
cp apps/mobile/.env.example apps/mobile/.env

# Start the backend
pnpm --filter @blendi/api dev

# Start the mobile app in another terminal
pnpm --filter @blendi/mobile start
```

Fill in the values required by each `.env` file before running the stack locally.

---

## Open Questions

| Question | Impact |
|---|---|
| Is the Apple Developer Account registered under the BLENDi company name? | Blocks Phase 5 distribution planning and the final App Store publishing path under the company brand |
| Will the Golden Ticket QR code be unique per unit or shared per production batch? | Blocks Phase 2 hardware pairing and ownership validation rules |
| Does the e-commerce stack use Shopify, and is API access available? | Blocks Phase 3 purchase verification and commerce integration planning |
| Is there a target launch date? | Blocks Phase 5 prioritization, release sequencing, and scope tradeoff decisions |

---

## Contributing

Every newly implemented checkpoint must have its corresponding `.md` file created before that checkpoint is marked as complete. New documentation should follow the same structure used by the existing phase documents so that every phase remains consistent, reviewable, and easy to navigate.