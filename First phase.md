Act as a senior software architect and full-stack developer specialized in React Native, React.js, and scalable backend systems.

Your task is to design and build a complete platform called CargoLink, including:
	•	A mobile application (React Native) for iOS and Android
	•	A web application (React.js)
	•	A backend API
	•	A PostgreSQL database

⸻

🧩 Project Context

CargoLink is a digital platform designed to optimize road freight transportation management, connecting:
	•	Shippers (load providers)
	•	Carriers (truck drivers / transport companies)

The industry currently suffers from:
	•	Manual workflows
	•	Fragmented communication (calls, WhatsApp, etc.)
	•	Lack of real-time visibility

⸻

🎯 Objective

Build a full digital ecosystem that:
	•	Allows shippers to publish loads
	•	Allows carriers to find and accept trips
	•	Provides real-time tracking
	•	Centralizes communication
	•	Improves logistics efficiency

⸻

📱 Mobile App (MANDATORY)

Develop using:
	•	React Native
	•	TypeScript
	•	Compatible with iOS and Android

⸻

💻 Web Application (MANDATORY)

Develop using:
	•	React.js (with TypeScript)
	•	Recommended: Next.js for scalability and SEO
	•	Responsive design (desktop-first, but mobile-friendly)

⸻

👥 User Roles
	1.	Shipper
	2.	Carrier
	3.	Admin (for web panel)

⸻

🚀 Core Features

🔐 Authentication (Mobile + Web)
	•	Register / Login
	•	Role-based access
	•	Password recovery

⸻

📦 Load Management (Shipper)
	•	Create load:
	•	Origin
	•	Destination
	•	Cargo type
	•	Weight / volume
	•	Pickup date
	•	Price
	•	Edit / cancel loads
	•	View load history

⸻

🚛 Trip Management (Carrier)
	•	Browse available loads
	•	Apply filters
	•	Accept trips
	•	Track active trips
	•	Trip history

⸻

📍 Real-Time Tracking
	•	Live GPS tracking (mobile)
	•	Map visualization (mobile + web)
	•	Status updates:
	•	Pending
	•	In progress
	•	Delivered

⸻

💬 Communication
	•	Real-time chat between users
	•	Push notifications (mobile)
	•	Web notifications (optional)

⸻

⭐ Ratings
	•	Post-trip ratings
	•	Reviews

⸻

💻 Web-Specific Features

Admin Panel
	•	Manage users
	•	Monitor loads and trips
	•	View analytics (basic dashboard)

Shipper Dashboard
	•	Publish and manage loads
	•	Track shipments on a map

Carrier Dashboard
	•	View available loads
	•	Manage trips

⸻

🧱 Architecture Requirements

📱 Mobile (React Native)
	•	Clean folder structure
	•	State management: Redux Toolkit or Zustand
	•	Navigation: React Navigation
	•	Forms: React Hook Form or Formik

⸻

💻 Web (React / Next.js)
	•	Modular architecture
	•	Pages and components separation
	•	State management (Redux Toolkit / Zustand / React Query)
	•	API integration layer
	•	Responsive UI

⸻

🖥 Backend
	•	Node.js with NestJS (preferred) or Express
	•	REST API
	•	JWT authentication
	•	Role-based authorization
	•	Scalable architecture (controllers, services, repositories)

⸻

🗄 Database (MANDATORY)

Use PostgreSQL

Design a relational schema including:
	•	Users
	•	Roles
	•	Loads
	•	Trips
	•	Messages
	•	Ratings

Include:
	•	Relationships
	•	Constraints
	•	Indexes

Provide:
	•	SQL schema OR ORM models (Prisma or TypeORM preferred)

⸻

🔗 Integrations
	•	Google Maps API or Mapbox
	•	Firebase Cloud Messaging (push notifications)
	•	WebSockets (for chat and real-time updates)

⸻

🧪 Best Practices
	•	Clean architecture
	•	Scalable codebase
	•	TypeScript everywhere
	•	Error handling
	•	Environment configs
	•	Security best practices

⸻

📂 Expected Deliverables

Provide a complete starter architecture, including:

1. Mobile App
	•	Project structure
	•	Key screens implemented

2. Web App
	•	Project structure
	•	Example pages:
	•	Login
	•	Dashboard (per role)
	•	Load management
	•	Map tracking

3. Backend
	•	Folder structure
	•	Sample endpoints
	•	Auth flow

4. Database
	•	PostgreSQL schema
	•	Relationships

5. API Design
	•	Endpoint list
	•	Request/response examples

6. Setup Instructions
	•	How to run mobile app
	•	How to run web app
	•	How to run backend

7. Deployment Suggestions
	•	Mobile (Expo / CLI)
	•	Web (Vercel / Netlify)
	•	Backend (AWS / Railway / Render)
	•	Database (PostgreSQL managed service)

⸻

🎯 Expected Level of Detail

The solution must be:
	•	Practical and implementable
	•	Production-oriented
	•	Scalable
	•	Well-structured

