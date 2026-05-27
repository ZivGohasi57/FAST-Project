# Software Test Plan (STP)
## FAST – Ambulance Dispatch Management System

---

## 1. Introduction

This Software Test Plan outlines the testing strategy for the **FAST** ambulance dispatch management system, developed for the Hod HaSharon area in Israel. The system manages ambulance dispatching, real-time routing, and case lifecycle management across three user roles: driver, dispatcher, and manager.

The objective of this plan is to ensure the correct functioning of all system modules, including user authentication, case management, ambulance tracking, routing with no-go zones, and user/zone management.

---

## 2. Test Items

- **Authentication Module** – Login and session management
- **Case Management Module** – Create, assign, update, complete, and cancel cases
- **Ambulance Tracking Module** – Location updates and status tracking
- **Routing Module** – Emergency and routine route calculation using GraphHopper + OSM data
- **ETA Calculation Module** – Real-time ETA estimation for all available ambulances
- **No-Go Zone Module** – Create, delete, and enforce geographic routing restrictions
- **User Management Module** – Create and delete system users (manager role)
- **Role-Based UI** – DriverView, DispatcherDashboard, ManagerSuite

---

## 3. Features to be Tested

- Successful login with valid credentials (all three roles)
- Rejection of login with invalid credentials
- Role-based redirection after login (driver → DriverView, dispatcher → DispatcherDashboard, manager → ManagerSuite)
- Case creation by dispatcher with address, urgency, patient details
- Case assignment to a specific ambulance
- Active case retrieval by driver (per ambulanceId)
- Case notes and patient details update
- Case completion (marks ambulance as available)
- Cancel-case flow: driver requests cancellation → dispatcher approves
- Real-time ambulance location update
- Emergency route calculation (contraflow allowed)
- Routine route calculation (standard road rules)
- No-go zone enforcement: emergency route falling inside a restricted zone falls back to routine routing
- ETA calculation for all non-offline ambulances
- Manager creates a new driver user (auto-creates ambulance entry)
- Manager creates a new dispatcher/manager user
- Manager deletes a user
- Manager adds a no-go zone with bounding coordinates
- Manager deletes a no-go zone
- Data persistence across server restarts (JSON file storage)

---

## 4. Features Not to be Tested

- Mobile app or native application (system is web-browser based only)
- External API integrations (no third-party services used)
- Cloud deployment (Render.com, Firebase – deployment was removed; system is fully local)
- Advanced analytics or historical reporting
- Password hashing / cryptographic security (passwords are stored in plaintext in current version)
- Concurrent multi-user stress testing or load testing
- Offline mode or network failure recovery

---

## 5. Testing Strategy

Testing will be conducted in four phases:

**Unit Testing** – Verify individual API endpoints in isolation using direct HTTP requests (e.g., via browser or curl). Focus on correct response codes and JSON payloads.

**Integration Testing** – Verify interactions between modules: login produces a session token used in subsequent requests; case assignment updates both the case status and the ambulance status; completing a case releases the ambulance.

**System Testing** – End-to-end flows tested through the React frontend in a browser. Tests cover full user journeys: dispatcher creates and assigns a case → driver receives and acts on it → dispatcher closes or cancels it.

**Acceptance Testing** – Manual walkthroughs with realistic data (Hod HaSharon area coordinates) to confirm the system meets operational requirements for dispatch use.

---

## 6. Test Environment

- **Backend:** Java 17, Maven, com.sun.net.httpserver on `localhost:8082`
- **Routing Engine:** GraphHopper with pre-built graph cache (`graph-cache-v2`) and OSM map (`export.osm`) for the Hod HaSharon area
- **Data Storage:** Local JSON files under `FAST-Routing-Server/data/` (users.json, cases.json, ambulances.json, nogozones.json, counters.json)
- **Frontend:** React 19 + Vite 7, served via `npm run dev` (default: `localhost:5173`)
- **Browser:** Google Chrome (latest version)
- **API testing tool:** Browser DevTools / curl
- **Seed data:** driver1, driver2 (password: 123), dispatcher1 (password: 123), manager1 (password: 123)

---

## 7. Responsibilities

- **Tomer Stoianov** – Backend API testing (routing, cases, ambulances, no-go zones), integration testing
- **Tomer Stoianov** – Frontend system testing (DriverView, DispatcherDashboard, ManagerSuite), acceptance testing

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
|------|-----------|-------------|
| GraphHopper graph-cache not found on startup | Medium | Ensure `graph-cache-v2/` and `export.osm` exist in the working directory before running the server |
| Port 8082 already in use | Low | Change the PORT environment variable before starting the backend |
| JSON data files corrupted between tests | Medium | Delete the `data/` directory to trigger a clean re-seed from default users |
| CORS errors during frontend testing | Low | Backend already sets `Access-Control-Allow-Origin: *`; ensure frontend `config.js` points to the correct backend URL |
| Routing returns no path for coordinates outside the OSM area | Medium | Use only coordinates within the Hod HaSharon bounding box for all test cases |
