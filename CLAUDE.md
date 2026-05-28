# FAST Project — Claude Context File

This file gives every new Claude chat session instant context about the project.
**Update this file after every meaningful structural or architectural change.**

---

## What is FAST?

FAST (First Aid Smart Transport) is an **ambulance dispatch management system** built for Hod HaSharon, Israel.  
It coordinates ambulance dispatch in real time: a dispatcher assigns emergency or routine calls to available ambulances, drivers receive navigation instructions, and a manager oversees the fleet and system configuration.

---

## Repository Layout

```
FAST-Project/
├── FAST-Routing-Server/        ← Java 17 backend
│   ├── src/main/java/
│   │   ├── api/
│   │   │   ├── DataStore.java          ← All Firestore persistence + in-memory cache
│   │   │   └── controllers/
│   │   │       └── RoutingController.java  ← HTTP server + all REST handlers
│   │   ├── core/
│   │   │   ├── models/                 ← Domain objects
│   │   │   │   ├── User.java           ← Base user (id, username, password, role, ambulanceId, displayName)
│   │   │   │   ├── DriverUser.java     ← extends User, adds ambulanceNumber
│   │   │   │   ├── DispatcherUser.java ← extends User (no extra fields)
│   │   │   │   ├── ManagerUser.java    ← extends User (no extra fields)
│   │   │   │   ├── AmbulanceInfo.java  ← id, driverId, driverName, lat, lon, status, ambulanceNumber
│   │   │   │   ├── CaseRecord.java     ← Full call record: address, coords, urgency, patient details,
│   │   │   │   │                          notes, assignedAmbulanceId, assignedDriverName,
│   │   │   │   │                          status, createdAt, arrivalTime
│   │   │   │   ├── NoGoZone.java       ← Bounding box where contraflow is forbidden
│   │   │   │   ├── RouteRequest/Response/Coordinate/StepInstruction.java
│   │   │   └── interfaces/
│   │   │       ├── IRoutingEngineClient.java
│   │   │       └── IRoutingStrategy.java
│   │   ├── routing/
│   │   │   ├── engine/
│   │   │   │   ├── FastRoutingEngineClient.java  ← Embedded GraphHopper, two profiles:
│   │   │   │   │                                    ambulance_routine / ambulance_emergency
│   │   │   │   └── FastRoutingEngine.java        ← Strategy wrapper
│   │   │   ├── strategies/
│   │   │   │   ├── EmergencyRoutingStrategy.java ← contraflow allowed, 1.2× speed
│   │   │   │   └── RoutineRoutingStrategy.java   ← one-way rules respected
│   │   │   ├── parsers/
│   │   │   │   ├── AmbulanceAccessParser.java
│   │   │   │   └── AmbulanceSpeedParser.java
│   │   │   ├── AmbulanceImportRegistry.java
│   │   │   ├── DualCarriagewayDetector.java
│   │   │   └── TrafficSignalIndex.java           ← 114 OSM traffic signal nodes
│   │   └── util/
│   │       └── GraphCacheBuilder.java  ← Docker build-time cache pre-builder (avoids 35s cold start)
│   ├── export.osm              ← 1.54 MB OSM map data for Hod HaSharon area
│   ├── graph-cache-v2/         ← Pre-built GraphHopper binary graph (built in Docker, not in git)
│   ├── Dockerfile              ← Multi-stage: build JAR → pre-build graph cache → JRE runtime
│   ├── .dockerignore
│   └── pom.xml                 ← Java 17, GraphHopper 11.0, Gson 2.10.1, google-auth-library 1.23.0
│
├── fast-frontend/              ← React 19 + Vite 7 frontend
│   ├── src/
│   │   ├── App.jsx             ← React Router; ProtectedRoute by role
│   │   ├── config.js           ← API_BASE = VITE_API_URL || 'http://localhost:8082'
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx         ← Login; drivers redirect to /pick-ambulance
│   │   │   ├── AmbulanceSelectPage.jsx ← Driver picks their ambulance for the shift
│   │   │   ├── DriverView.jsx        ← Full-screen map navigation, polls active case every 3s,
│   │   │   │                            "הגעתי לאירוע" arrival button, cancel-trip flow
│   │   │   ├── DispatcherDashboard.jsx ← Create/assign cases, live ETA, active missions tab,
│   │   │   │                             sends updates to driver, cancel case
│   │   │   └── ManagerSuite.jsx      ← Tabs: משתמשים | אמבולנסים | אירועים | אזורי איסור
│   │   └── components/
│   │       └── MapDisplay.jsx        ← Leaflet map (route polyline, ambulance markers, signals)
│   └── vite.config.js / package.json
│
├── render.yaml                 ← Render.com deployment config (free tier)
├── CLAUDE.md                   ← This file
└── docs/
    ├── STP.md                  ← Software Test Plan
    └── STD.md                  ← Software Test Design (28 test cases)
```

---

## Architecture

```
Browser (React SPA)
       │  REST / JSON (axios)
       ▼
Render.com — fast-backend (Docker, free tier)
       │  Java 17 · com.sun.net.httpserver · port 8082
       │
       ├── RoutingController.java  (HTTP routing layer)
       │       GET  /api/route            → GraphHopper route calc
       │       GET  /api/eta              → ETA for all ambulances
       │       GET  /api/signals          → Traffic signal nodes
       │       POST /api/auth/login
       │       GET/POST/DELETE /api/ambulances
       │       POST /api/ambulances/location
       │       POST /api/ambulances/assign   ← driver picks ambulance for shift
       │       GET/POST /api/cases
       │       POST /api/cases/assign
       │       POST /api/cases/arrive        ← stamps arrivalTime
       │       POST /api/cases/complete
       │       POST /api/cases/update
       │       POST /api/cases/cancel-request
       │       POST /api/cases/cancel
       │       GET  /api/cases/active?ambulanceId=...
       │       GET/POST/DELETE /api/users
       │       GET/POST/DELETE /api/nogozones
       │
       ├── DataStore.java  (persistence layer)
       │       Firestore REST API (no Admin SDK / no gRPC)
       │       google-auth-library-oauth2-http for OAuth2 token
       │       In-memory cache: cases/ambulances TTL 2s, users/nogozones TTL 60s
       │       Collections: users, ambulances, cases, nogozones, counters
       │
       └── FastRoutingEngineClient.java  (routing engine)
               Embedded GraphHopper 11.0
               OSM file: export.osm (Hod HaSharon)
               Two profiles: ambulance_routine / ambulance_emergency
               Graph pre-built at Docker build time → fast cold starts

Render.com — fast-frontend (static site)
       React 19 + Vite 7, served from /dist
       VITE_API_URL=https://fast-backend-7hia.onrender.com
```

---

## User Roles & Flows

| Role | Page | Key behaviour |
|------|------|---------------|
| **driver** | `/pick-ambulance` → `/driver` | Picks ambulance for shift; full-screen GPS navigation; polls active case every 3 s; "הגעתי לאירוע" button stamps arrival time; cancel-trip request |
| **dispatcher** | `/dispatcher` | Creates emergency/routine calls with Nominatim address search; gets ETA for all ambulances; assigns call to ambulance; sends real-time updates; manages active missions |
| **manager** | `/manager` | Adds/removes users and ambulances; views all case history with full details; draws no-go zones on map (contraflow forbidden in those areas) |

---

## Data Model

### Firestore Collections

**`users`** — one doc per user  
Fields: `username`, `password`, `role`, `ambulanceId`, `displayName`, `ambulanceNumber` (drivers only)

**`ambulances`** — one doc per vehicle  
Fields: `driverId`, `driverName`, `lat`, `lon`, `status` (available/busy/offline), `ambulanceNumber`

**`cases`** — one doc per call  
Fields: `address`, `lat`, `lon`, `description`, `patientDetails`, `urgency` (routine/emergency), `notes` (timestamped dispatcher updates), `assignedAmbulanceId`, `assignedDriverName`, `status` (pending/active/cancel_requested/cancelled/completed), `createdAt` (epoch ms), `arrivalTime` (epoch ms, 0 = not yet arrived)

**`nogozones`** — bounding boxes  
Fields: `name`, `minLat`, `maxLat`, `minLon`, `maxLon`

**`counters/sequences`** — auto-increment counters  
Fields: `caseSeq`, `userSeq`, `zoneSeq`

### Seed data (runs once if `users` collection is empty)
- driver1 / driver2 (password: 123) — amb-101 / amb-102
- dispatcher1 / manager1 (password: 123)

---

## Key Technical Decisions & Gotchas

### Static field initialization order (critical)
`DataStore.java` uses `private static final DataStore INSTANCE = new DataStore()`.  
Any `static final` field used inside the constructor (e.g. `COL_TTL`, `BASE_URL`, `SCOPES`) **must be declared BEFORE `INSTANCE`** in the source file. Reversing this causes `NullPointerException` at startup — happened twice.

### No gRPC / no Firebase Admin SDK
Firestore is accessed via the **REST API** (`https://firestore.googleapis.com/v1/...`) using `google-auth-library-oauth2-http` for OAuth2. The Admin SDK pulled in protobuf/gRPC which conflicted with the shaded JAR.

### Render free tier
- Backend sleeps after 15 min inactivity → cold start
- **No persistent disk** → GraphHopper graph cache cannot survive restarts unless baked into the Docker image
- Fix: `GraphCacheBuilder` runs during `docker build`, pre-builds `graph-cache-v2/`, which is then `COPY --from=build` into the runtime stage → ~3 s load time instead of ~35 s

### In-memory sessions
Login tokens are stored in a `ConcurrentHashMap` in `DataStore`. They are lost on every server restart/wakeup. This is intentional (Render free tier, stateless design). The frontend stores auth in `localStorage`.

### Dispatcher `activeCase` state
`activeCase` in `DispatcherDashboard.jsx` is React local state (lost on page refresh). On mount, the missions `useEffect` restores it from the first active Firestore case found — so the dispatcher can still send updates after a refresh.

---

## Deployment

- **Backend**: Render.com Docker web service `fast-backend` — push to `main` triggers redeploy  
- **Frontend**: Render.com static site `fast-frontend` — `npm ci && npm run build`, publishes `dist/`  
- **Database**: Firebase Firestore (free tier, `fast-ambulance-app` project)  
- **Environment variables on Render backend**: `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT` (service account JSON, set manually in Render dashboard)

---

## How to run locally

```bash
# Backend
cd FAST-Routing-Server
mvn package -DskipTests
java -Xmx400m \
     -DFIREBASE_PROJECT_ID=fast-ambulance-app \
     -DFIREBASE_SERVICE_ACCOUNT="$(cat serviceAccount.json)" \
     -jar target/fast-routing-1.0-SNAPSHOT.jar

# Frontend
cd fast-frontend
npm install
npm run dev        # VITE_API_URL defaults to http://localhost:8082
```

---

## When to update this file

Update `CLAUDE.md` whenever:
- A new API endpoint is added or removed
- A new page or component is added to the frontend
- A new Firestore collection or field is introduced
- A significant architectural decision is made
- A recurring bug/gotcha is discovered and fixed
