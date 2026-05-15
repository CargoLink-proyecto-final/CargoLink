# CargoLink

Digital platform for road freight transportation management connecting shippers and carriers.

## Architecture

```
CargoLink/
├── backend/          # NestJS REST API + WebSocket
├── frontend/         # Next.js web application
├── mobile/           # React Native (Expo) mobile app
└── README.md
```

## Tech Stack

| Layer    | Technology                                         |
|----------|----------------------------------------------------|
| Mobile   | React Native, Expo, TypeScript, Zustand            |
| Web      | Next.js 14, React 18, TypeScript, Tailwind CSS     |
| Backend  | NestJS, Prisma ORM, JWT Auth, Socket.IO            |
| Database | PostgreSQL                                         |
| Maps     | Leaflet (web), React Native Maps (mobile)          |
| Chat     | WebSockets (Socket.IO)                             |

## User Roles

- **Shipper** - Publishes loads, tracks shipments
- **Carrier** - Browses/accepts loads, manages trips, GPS tracking
- **Admin** - Manages users, monitors all loads and trips

---

## Setup Instructions

### Option A: Docker Compose (Recommended)

The fastest way to get the full stack running. A single command builds all containers, runs database migrations, and seeds demo data automatically.

#### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2+, included with Docker Desktop)

#### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changeme          # REQUIRED — choose a secure password
POSTGRES_DB=cargolink

# Backend
JWT_SECRET=changeme-use-a-long-random-string   # REQUIRED — random secret for JWT signing
JWT_EXPIRATION=7d
CORS_ORIGIN=http://localhost:3000
```

#### 2. Build and start

```bash
docker compose up -d
```

This will:
1. Pull the PostgreSQL 15 image
2. Build the backend (NestJS) and frontend (Next.js) images using multi-stage Dockerfiles
3. Wait for PostgreSQL to pass its health check
4. Run all Prisma migrations (`prisma migrate deploy`)
5. Seed the database with demo data (users + sample load)
6. Start the NestJS API server and the Next.js frontend

#### 3. Verify

```bash
# Check all containers are running
docker compose ps

# Check backend logs (migrations + seed output)
docker compose logs backend

# Check frontend logs
docker compose logs frontend
```

Once running:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Swagger docs:** http://localhost:3001/api/docs
- **PostgreSQL:** localhost:5432

#### Database seeding

Seeding runs automatically on every container start via `docker-entrypoint.sh`. Users are created with `upsert` (insert-or-skip), so they won't be duplicated. The sample load uses `create`, so it may be duplicated if the seed runs again — use `docker compose down -v` for a clean reset if needed.

**Demo accounts** (all use password: `password123`):

| Email | Role | Name | Company |
|-------|------|------|---------|
| `admin@cargolink.com` | ADMIN | Admin CargoLink | — |
| `shipper@example.com` | CARGO_GENERATOR | Juan García | Logística Sur S.A. |
| `carrier@example.com` | TRANSPORTER | Carlos Martínez | Transporte Rápido |

A sample load ("Electrónica a Córdoba") is also created, associated to the shipper account.

To re-seed manually (e.g., after wiping the database):

```bash
docker compose exec backend node dist/prisma/seed.js
```

#### Common Docker commands

```bash
# Stop all containers
docker compose down

# Stop and remove database volume (full reset)
docker compose down -v

# Rebuild images after code changes
docker compose up -d --build

# Run migrations manually
docker compose exec backend npx prisma migrate deploy

# Open a shell inside the backend container
docker compose exec backend sh

# View real-time logs
docker compose logs -f backend
```

#### Startup flow diagram

```
docker compose up
       │
       ▼
  PostgreSQL starts
       │ health check: pg_isready
       ▼
  Backend container starts
       │
       ├─ 1. prisma migrate deploy  (apply pending migrations)
       ├─ 2. node dist/prisma/seed.js  (upsert demo data)
       └─ 3. node dist/src/main  (start NestJS server on :3001)
       │
       ▼
  Frontend container starts
       └─ node server.js  (Next.js on :3000)
```

---

### Option B: Local development (without Docker)

#### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm

#### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL connection string

npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed    # Seeds demo data
npm run start:dev      # Runs on http://localhost:3001
```

**Swagger docs:** http://localhost:3001/api/docs

**Demo accounts** (password: `password123`):
- Admin: `admin@cargolink.com`
- Shipper: `shipper@example.com`
- Carrier: `carrier@example.com`

#### 2. Web App (Frontend)

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local if the backend runs on a different port/host
# Default: NEXT_PUBLIC_API_URL=http://localhost:3002/api
npm run dev            # Runs on http://localhost:3003
```

**Available scripts:**
- `npm run dev` — Start development server
- `npm run build` — Create optimized production build
- `npm run start` — Serve the production build
- `npm run lint` — Run ESLint

**Prerequisites:**
- The backend must be running first (`cd backend && npm run start:dev`)
- Node.js 20+

#### 3. Mobile App

```bash
cd mobile
npm install
npx expo start         # Scan QR with Expo Go app
```

> For physical device testing, update the API_URL in `src/services/api.ts` to your machine's local IP.

---

## API Endpoints

### Auth
| Method | Endpoint                  | Description             |
|--------|---------------------------|-------------------------|
| POST   | /api/auth/register        | Register new user       |
| POST   | /api/auth/login           | Login                   |
| POST   | /api/auth/forgot-password | Request password reset  |
| POST   | /api/auth/reset-password  | Reset password w/ token |

### Users
| Method | Endpoint                    | Description                  |
|--------|-----------------------------|------------------------------|
| GET    | /api/users/me               | Get current profile          |
| PATCH  | /api/users/me               | Update profile               |
| GET    | /api/users                  | List users (Admin)           |
| GET    | /api/users/:id              | Get user by ID               |
| PATCH  | /api/users/:id/toggle-active | Toggle active (Admin)       |

### Loads
| Method | Endpoint              | Description                    |
|--------|-----------------------|--------------------------------|
| POST   | /api/loads            | Create load (Shipper)          |
| GET    | /api/loads            | List all loads                 |
| GET    | /api/loads/available  | List available loads           |
| GET    | /api/loads/my         | List my loads (Shipper)        |
| GET    | /api/loads/:id        | Get load details               |
| PATCH  | /api/loads/:id        | Update load (Shipper)          |
| DELETE | /api/loads/:id        | Cancel load (Shipper)          |

### Trips
| Method | Endpoint                  | Description                   |
|--------|---------------------------|-------------------------------|
| POST   | /api/trips/accept/:loadId | Accept load (Carrier)         |
| GET    | /api/trips                | List trips                    |
| GET    | /api/trips/my             | List my trips (Carrier)       |
| GET    | /api/trips/:id            | Get trip details              |
| PATCH  | /api/trips/:id/start      | Start trip (Carrier)          |
| PATCH  | /api/trips/:id/complete   | Complete trip (Carrier)       |
| PATCH  | /api/trips/:id/location   | Update GPS location (Carrier) |

### Messages
| Method | Endpoint                         | Description              |
|--------|----------------------------------|--------------------------|
| POST   | /api/messages/:receiverId        | Send message             |
| GET    | /api/messages/conversations      | List conversations       |
| GET    | /api/messages/conversation/:userId | Get conversation       |
| PATCH  | /api/messages/read/:senderId     | Mark as read             |

### Ratings
| Method | Endpoint                 | Description              |
|--------|--------------------------|--------------------------|
| POST   | /api/ratings             | Rate a completed trip    |
| GET    | /api/ratings/user/:userId | Get user ratings        |

### Request/Response Examples

**Register:**
```json
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "StrongPass123",
  "firstName": "John",
  "lastName": "Doe",
  "role": "CARGO_GENERATOR",
  "phone": "+1234567890",
  "companyName": "Acme Logistics"
}
```

**Create Load:**
```json
POST /api/loads
{
  "title": "Electronics to Córdoba",
  "originAddress": "Av. Corrientes 1234, CABA",
  "originLat": -34.6037,
  "originLng": -58.3816,
  "destAddress": "Av. Colón 567, Córdoba",
  "destLat": -31.4201,
  "destLng": -64.1888,
  "cargoType": "Electronics",
  "weight": 5000,
  "pickupDate": "2024-03-01T08:00:00Z",
  "price": 250000
}
```

**Response:**
```json
{
  "id": "uuid",
  "title": "Electronics to Córdoba",
  "status": "PUBLISHED",
  "shipper": { "id": "uuid", "firstName": "John", "lastName": "Doe" },
  "createdAt": "2024-01-15T10:00:00Z"
}
```

---

## Database Schema

### Tables
- **users** - All user accounts with role (CARGO_GENERATOR/TRANSPORTER/ADMIN)
- **loads** - Freight loads published by shippers
- **trips** - Trips created when a carrier accepts a load
- **messages** - Real-time chat messages between users
- **ratings** - Post-trip ratings and reviews

### Key Relationships
- User (Shipper) → has many → Loads
- User (Carrier) → has many → Trips
- Load → has one → Trip
- Trip → has many → Ratings
- User → has many → Messages (sent/received)

---

## Deployment Suggestions

| Component | Recommended Services                      |
|-----------|-------------------------------------------|
| Mobile    | Expo EAS Build + App Store / Play Store   |
| Web       | Vercel or Netlify                         |
| Backend   | Railway, Render, or AWS (ECS/Lambda)      |
| Database  | Supabase, Railway PostgreSQL, or AWS RDS  |

### Environment Variables

**Backend (.env):**
```
DATABASE_URL=postgresql://user:pass@host:5432/cargolink
JWT_SECRET=your-production-secret
JWT_EXPIRATION=7d
PORT=3001
CORS_ORIGIN=https://your-domain.com
```

**Web (.env.local):**
```
NEXT_PUBLIC_API_URL=https://api.your-domain.com/api
```
