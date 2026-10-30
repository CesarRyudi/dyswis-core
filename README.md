# Dyswis

> **Mobile-first real-time collaborative learning platform with low-latency synchronized media consumption, dynamic document annotation, and distributed classroom orchestration.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg)](https://react.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-11.0-ea2849.svg)](https://nestjs.com/)
[![Nx](https://img.shields.io/badge/Nx-Monorepo-143055.svg)](https://nx.dev/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-010101.svg)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-7.7-2d3748.svg)](https://www.prisma.io/)
[![Vitest](https://img.shields.io/badge/Vitest-4.1-729b1b.svg)](https://vitest.dev/)

---

## Executive Summary

**Dyswis** is a distributed, mobile-first synchronous presentation platform designed for interactive educational environments. Built around an asynchronous presentation engine, Dyswis enables an instructor (Host/Leader) to broadcast and synchronize slides (PDFs), rich text documents, and multimedia (Video/Audio) across hundreds of connected students (Viewers) with sub-100ms coordination.

Viewers benefit from an autonomous **Follow Mode**—they can break away from the presenter to study ahead, highlight text, or draft private margin notes, and snap back to the live presentation instantly with a single tap.

---

## Core Engineering Highlights

### 1. Precision Clock Synchronization (NTP-Inspired Algorithm)
- **Problem**: Achieving sub-frame synchronized video and audio playback across heterogeneous mobile networks (4G/5G, high-latency Wi-Fi) without specialized streaming hardware.
- **Solution**: Implemented an in-house NTP-inspired time synchronization protocol over WebSockets (`ClockSyncService`).
- **Mechanism**:
  - The client exchanges multiple time-stamped ping/pong packets with the server: $t_0$ (client dispatch), $t_{server}$ (server receipt/echo), and $t_3$ (client reception).
  - Computes Round-Trip Time ($RTT = t_3 - t_0$) and instantaneous clock offset ($\theta = t_{server} + \frac{RTT}{2} - t_3$).
  - Evaluates discrete transmission samples to aggressively reject network jitter spikes, selecting the minimal-RTT sample to calibrate local timestamps to server time with millisecond precision.
  - Future playback events are scheduled against this synchronized absolute epoch ($T_{target} = T_{now} + \Delta t$).

### 2. Real-Time Vector Drawing Overlay & Responsive Projection
- **Problem**: Synchronizing whiteboard annotations, ink drawings, and laser pointers across radically different device viewports (smartphones, tablets, 4K desktops) and screen orientations.
- **Solution**: Hardware-accelerated canvas/SVG drawing engine utilizing normalized percentage coordinate vectors ($x\%, y\% \in [0, 100]$).
- **Mechanism**:
  - Employs a 60 FPS throttled transmission pipeline to minimize network egress while guaranteeing ultra-smooth stroke interpolation.
  - Inverse geometric projection transforms coordinates dynamically through CSS letterboxing, multi-level pinch zoom, and 4-quadrant rotational matrices ($0^\circ, 90^\circ, 180^\circ, 270^\circ$).
  - Pointer capture pipeline cleanly isolates multi-touch gestures, differentiating native browser pinch-to-zoom from active stylus or finger drawings with automatic stroke abort and erasure reconciliation.

### 3. Rich-Text Anchor Sync & Content-Drift Resilience
- **Problem**: Presenters live-editing TipTap/ProseMirror text content can inadvertently break viewer paragraph scroll tracking, causing annotations attached to mutated paragraphs to desynchronize or vanish.
- **Solution**: Hybrid DOM-node tracking with semantic snapshot hashing (`textSnapshot.ts`).
- **Mechanism**:
  - Combines stable block UUIDs with normalized semantic text hashing (`cleanTextForComparison`).
  - When a presenter rewrites a paragraph, viewer annotations linked to that block gracefully detach into immutable **Historical Annotations**, visually marked and archived in the student's personal notes dashboard (`/dashboard/notes`) without breaking active document layouts.
  - Non-intrusive programmatic scrolling (`applyLineScroll`) respects user touch interaction, immediately relinquishing control whenever a viewer begins manual scrolling.

### 4. Monorepo Architecture & Type Safety
- **Architecture**: Integrated Nx monorepo enforcing modular separation of concerns:
  - `apps/web`: React 19 Single Page Application bundled with Vite, styled with Material UI (Dark Glassmorphism design system).
  - `apps/api`: NestJS 11 backend featuring Socket.io WebSockets, Passport JWT authentication, and Prisma ORM.
  - `libs/shared-types`: Zero-dependency isomorphic TypeScript library declaring socket event schemas, payload interfaces, DTOs, and domain models shared end-to-end.
- **Security & Authorization**:
  - WebSocket role-based authorization guard verifying `client.data.role === 'leader'` across all host-only broadcast channels.
  - Prevention of user enumeration during authentication with uniform failure responses.
  - Mandatory production environment checks preventing execution with default development secrets.

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph Clients["Client Layer (React 19 SPA)"]
        Host["Host / Presenter<br/>(Leader Controls & Broadcast)"]
        Viewer1["Viewer A (Follow Mode)"]
        Viewer2["Viewer B (Free Navigation)"]
    end

    subgraph SharedLib["Contract Layer"]
        SharedTypes["@dyswis/shared-types<br/>(Socket Events, DTOs, Domain Types)"]
    end

    subgraph Backend["Backend Layer (NestJS 11)"]
        Gateway["SyncGateway (WebSocket Hub)<br/>- Role-based Guards<br/>- NTP Clock Pong<br/>- Room State Hydration"]
        REST["REST API Controllers<br/>- AuthController (JWT)<br/>- RoomsController<br/>- AnnotationsController<br/>- HighlightsController"]
        PrismaService["Prisma ORM Client (v7)"]
        StorageService["StorageService (Supabase / Local)"]
    end

    subgraph Persistence["Persistence & Infrastructure"]
        Postgres[("PostgreSQL Database<br/>(Supabase)")]
        Storage[("Cloud Object Storage<br/>(PDFs & Video Media)")]
    end

    Host -- "WebSockets (Sync, Drawing, Video)" --> Gateway
    Viewer1 -- "WebSockets (State Sync, Pong)" --> Gateway
    Viewer2 -- "WebSockets (State Sync, Pong)" --> Gateway
    Host -- "HTTPS (Uploads, Auth, CRUD)" --> REST
    Viewer1 -- "HTTPS (Join, Notes, Auth)" --> REST

    Clients -. "Type Contracts" .-> SharedTypes
    Backend -. "Type Contracts" .-> SharedTypes

    Gateway --> PrismaService
    REST --> PrismaService
    REST --> StorageService
    PrismaService --> Postgres
    StorageService --> Storage
```

---

## Repository Structure

```
dyswis/
├── apps/
│   ├── api/                      # NestJS 11 Backend Application
│   │   ├── prisma/               # Prisma Schema & Database Migrations
│   │   └── src/app/
│   │       ├── annotations/      # Private User Notes Management
│   │       ├── auth/             # JWT Authentication, Google OAuth, Strategies
│   │       ├── common/           # Global Exception Filters & Interceptors
│   │       ├── highlights/       # Multi-color Text Highlight CRUD
│   │       ├── rooms/            # Room Lifecycle, Access Codes & PIN Verification
│   │       ├── storage/          # Supabase / Local Multipart Storage Driver
│   │       └── sync.gateway.ts   # Real-time WebSocket Orchestration Hub
│   └── web/                      # React 19 Frontend Application (Vite)
│       └── src/
│           ├── components/       # PdfViewer, TextViewer, DrawingOverlay, Players
│           ├── contexts/         # AuthContext, RoomContext (Socket Provider)
│           ├── hooks/            # useLongPress, useDebounce, Gestures
│           ├── pages/            # LeaderPage, ViewerPage, NotesDashboard, JoinPage
│           └── services/         # API Client, ClockSyncService (NTP)
└── libs/
    └── shared-types/             # Isomorphic TypeScript Contracts
```

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **PostgreSQL**: Local PostgreSQL instance or free cloud database (e.g., [Supabase](https://supabase.com))

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/CesarRyudi/dyswis-core.git
   cd dyswis-core
   ```

2. **Install monorepo dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
   *Edit `apps/api/.env` with your PostgreSQL database credentials and a secure random JWT secret.*

4. **Initialize database schema and Prisma client:**
   ```bash
   npm run prisma:migrate
   npm run prisma:generate
   ```

5. **Start development servers:**
   ```bash
   # Terminal 1 - Start NestJS API Gateway (port 3001)
   npx nx serve api

   # Terminal 2 - Start React Client Application (port 4200)
   npx nx serve web
   ```

---

## Environment Variables

### Backend Configuration (`apps/api/.env`)

| Variable | Required | Description | Default / Example |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | **Yes** | PostgreSQL connection URI | `postgresql://user:pass@host:5432/dyswis` |
| `JWT_SECRET` | **Yes** | 256-bit secret string used to sign Host JWTs | `openssl rand -hex 32` |
| `NODE_ENV` | No | Application environment (`development` / `production`) | `development` |
| `PORT` | No | HTTP / WebSocket server listen port | `3001` |
| `CORS_ORIGIN` | No | Allowed CORS origin whitelist (comma-delimited) | `http://localhost:4200` |
| `SUPABASE_URL` | No | Supabase API endpoint (if using Cloud Storage) | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | No | Supabase service-role administrative key | `eyJhbGci...` |

### Frontend Configuration (`apps/web/.env`)

| Variable | Required | Description | Default / Example |
| :--- | :---: | :--- | :--- |
| `VITE_API_URL` | No | Base URL for REST API endpoints and WebSockets | Defaults to current origin / proxy |

---

## Testing & Quality Assurance

The codebase employs automated testing with **Vitest**:

```bash
# Run all unit and integration tests across apps and libraries
npm run test

# Run tests in watch mode for development
npx vitest

# Run tests with code coverage report
npx vitest run --coverage
```

### Core Test Suites
- **`apps/web/src/services/clockSync.spec.ts`**: Verifies NTP clock offset calculation, multi-packet jitter rejection, and server timestamp translation.
- **`apps/web/src/utils/textSnapshot.spec.ts`**: Tests semantic snapshot normalization and content-drift detection for collaborative annotations.
- **`apps/api/src/app/auth/auth.service.spec.ts`**: Validates password hashing, user registration, JWT generation, and anti-user enumeration security.
- **`apps/api/src/app/common/global-exception.filter.spec.ts`**: Validates exception mapping, including `MulterError('LIMIT_FILE_SIZE')` to HTTP 413 and preservation of `HttpException` status codes.

---

## Production Build Pipeline

```bash
# Production build of the NestJS backend (generates Prisma client + dist bundle)
npm run build

# Production build of the React frontend (Vite static bundle with code splitting)
npm run build:web

# Launch production backend server
npm start
```

---

## License & Proprietary Notice

Copyright (c) 2026 Cesar Ryudi. All rights reserved.

This codebase and associated assets are proprietary and confidential. No part of this software may be copied, reproduced, distributed, modified, sublicensed, or used in any form—commercially or privately—without prior written permission from the copyright holder.

This repository is publicly accessible for technical portfolio review and candidate evaluation purposes only.

