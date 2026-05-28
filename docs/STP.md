# Software Test Plan (STP)
## FAST – Ambulance Dispatch Management System

---

## 1. Introduction

This Software Test Plan outlines the testing strategy for the **FAST** (First Aid Smart Transport) ambulance dispatch management system, developed for the Hod HaSharon area in Israel. The system coordinates real-time ambulance dispatch: dispatchers assign emergency or routine calls to available ambulances, drivers receive navigation instructions, and managers oversee fleet configuration and system users.

The objective of this plan is to ensure the correct functioning of all system modules, including user authentication, case management, ambulance tracking, routing with no-go zones, and user/zone management.

---

## 2. Test Items

- **Authentication Module** – Login and session management for all three roles
- **Case Management Module** – Create, assign, update, complete, and cancel cases
- **Ambulance Management Module** – Location updates, status tracking, and driver-to-ambulance assignment
- **Routing Module** – Emergency and routine route calculation using embedded GraphHopper + OSM data
- **ETA Calculation Module** – Real-time ETA estimation for all available ambulances
- **No-Go Zone Module** – Create, delete, and enforce geographic routing restrictions
- **User Management Module** – Create and delete system users (manager role only)
- **Role-Based UI** – DriverView, DispatcherDashboard, ManagerSuite

---

## 3. Features to be Tested

- Successful login with valid credentials for all three roles
- Rejection of login with invalid credentials
- Role-based redirection after login (driver → /pick-ambulance → DriverView, dispatcher → DispatcherDashboard, manager → ManagerSuite)
- Driver ambulance selection at shift start
- Case creation by dispatcher with address, urgency, and patient details
- Case assignment to a specific ambulance
- Active case retrieval by driver (per ambulanceId, polled every 3 seconds)
- Case notes and patient details update by dispatcher
- Driver arrival stamping ("הגעתי לאירוע" button → arrivalTime recorded)
- Case completion (marks ambulance as available)
- Cancel-case flow: driver requests cancellation → dispatcher approves
- Real-time ambulance location update
- Emergency route calculation (contraflow allowed, 1.2× speed factor)
- Routine route calculation (standard one-way rules enforced)
- No-go zone enforcement: emergency route falling inside a restricted zone falls back to routine routing
- ETA calculation for all non-offline ambulances
- Manager creates a new driver user
- Manager creates a new dispatcher/manager user
- Manager deletes a user
- Manager adds a no-go zone with bounding coordinates
- Manager deletes a no-go zone
- Data persistence in Firebase Firestore across server restarts

---

## 4. Features Not to be Tested

- Mobile or native applications (system is web-browser based only)
- Password hashing or cryptographic security (passwords stored in plaintext in current version)
- Concurrent multi-user stress testing or load testing
- Offline mode or network failure recovery
- Advanced analytics or historical reporting dashboards

---

## 5. Testing Strategy

Testing will be conducted in four phases:

**Unit Testing** – Verify individual API endpoints in isolation using direct HTTP requests (curl or browser DevTools). Focus on correct HTTP response codes and JSON payloads.

**Integration Testing** – Verify interactions between modules: login produces a session token used in subsequent requests; case assignment updates both the case status and the ambulance status in Firestore; completing a case releases the ambulance.

**System Testing** – End-to-end flows tested through the React frontend in a browser. Tests cover full user journeys: dispatcher creates and assigns a case → driver selects ambulance and receives the case → driver navigates and marks arrival → dispatcher closes or cancels the case.

**Acceptance Testing** – Manual walkthroughs with realistic Hod HaSharon area coordinates to confirm the system meets operational dispatch requirements.

---

## 6. Test Environment

- **Backend:** Java 17, Maven, `com.sun.net.httpserver` on `localhost:8082`
- **Routing Engine:** Embedded GraphHopper 11.0 with pre-built graph cache (`graph-cache-v2/`) and OSM map (`export.osm`) for the Hod HaSharon area. Two routing profiles: `ambulance_routine` and `ambulance_emergency`
- **Data Storage:** Firebase Firestore (project: `fast-ambulance-app`), accessed via REST API with OAuth2. Collections: `users`, `ambulances`, `cases`, `nogozones`, `counters`
- **Frontend:** React 19 + Vite 7, served via `npm run dev` (default: `localhost:5173`)
- **Browser:** Google Chrome (latest version)
- **API Testing Tool:** Browser DevTools / curl
- **Seed Data (auto-seeded on first run if `users` collection is empty):**
  - `driver1` / password: `123` → ambulance `amb-101`
  - `driver2` / password: `123` → ambulance `amb-102`
  - `dispatcher1` / password: `123`
  - `manager1` / password: `123`

---

## 7. Responsibilities

| Name | Responsibility |
|------|----------------|
| Tomer Stoianov | Backend API testing (routing, cases, ambulances, no-go zones), integration testing |
| Tomer Stoianov | Frontend system testing (DriverView, DispatcherDashboard, ManagerSuite), acceptance testing |

---

## 8. Schedule

| Phase               | Timing        |
|---------------------|---------------|
| Unit Testing        | Weeks 8–9     |
| Integration Testing | Week 10       |
| System Testing      | Weeks 11–12   |
| Acceptance Testing  | Week 13       |

---

## 9. Risks and Contingencies

| Risk | Likelihood | Contingency |
|------|------------|-------------|
| GraphHopper graph-cache not found on startup (35 s build instead of 3 s load) | Medium | Ensure `graph-cache-v2/` directory and `export.osm` exist in the working directory before running the server |
| Port 8082 already in use | Low | Set the `PORT` environment variable to an available port before starting the backend |
| Firebase credentials missing or invalid | Medium | Ensure `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT` environment variables are set correctly before starting the backend |
| Session tokens lost on backend restart (stored in-memory) | High (by design) | Re-login after every backend restart during testing; this behavior is intentional for the Render.com free-tier stateless design |
| Routing returns no path for coordinates outside the OSM area | Medium | Use only coordinates within the Hod HaSharon bounding box for all test cases |
| CORS errors during frontend testing | Low | Backend already sets `Access-Control-Allow-Origin: *`; ensure `config.js` points to the correct backend URL (`http://localhost:8082`) |
| Render.com free-tier cold start (backend sleeps after 15 min inactivity) | High | For local testing, always run the backend locally; for cloud testing, allow up to 60 s for first response after inactivity |
