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

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### 1. Backend

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

### 2. Web App (Frontend)

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local if the backend runs on a different port/host
# Default: NEXT_PUBLIC_API_URL=http://localhost:3002/api
npm run dev            # Runs on http://localhost:3003
```

**Available scripts:**
- `npm run dev` — Start development server (port 3003)
- `npm run build` — Create optimized production build
- `npm run start` — Serve the production build
- `npm run lint` — Run ESLint

**Key technologies:** Next.js 14, React 18, TypeScript, Tailwind CSS, React Query, Leaflet (maps), Zustand (state), Socket.IO (chat)

**Prerequisites:**
- The backend must be running first (`cd backend && npm run start:dev`)
- Node.js 18+

### 3. Mobile App

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
  "role": "SHIPPER",
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
- **users** - All user accounts with role (SHIPPER/CARRIER/ADMIN)
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
