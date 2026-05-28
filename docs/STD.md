# Software Test Design (STD)
## FAST – Ambulance Dispatch Management System

---

## 1. Introduction

This Software Test Design document provides detailed test cases for verifying the functionality of the **FAST** ambulance dispatch management system. It covers all system modules: authentication, ambulance management, case management, routing, ETA calculation, no-go zone management, and user management.

All test cases assume the backend is running on `localhost:8082` and the frontend is running on `localhost:5173`. Firebase Firestore is used for all data persistence. The system auto-seeds default users when the `users` Firestore collection is empty on first startup.

---

## 2. Test Cases

### Authentication

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-001 | Login with valid driver credentials | Server running, Firestore seeded with default users | 1. Open the app in browser at `localhost:5173`<br>2. Enter username `driver1` and password `123`<br>3. Click Login | User is redirected to `/pick-ambulance` (ambulance selection page) | To be filled during testing |
| TC-002 | Login with valid dispatcher credentials | Server running, Firestore seeded | 1. Enter username `dispatcher1` and password `123`<br>2. Click Login | User is redirected to `/dispatcher` (DispatcherDashboard) | To be filled during testing |
| TC-003 | Login with valid manager credentials | Server running, Firestore seeded | 1. Enter username `manager1` and password `123`<br>2. Click Login | User is redirected to `/manager` (ManagerSuite) | To be filled during testing |
| TC-004 | Login with incorrect password | Server running, user `driver1` exists in Firestore | 1. Enter username `driver1` and password `wrongpass`<br>2. Click Login | Error message displayed; user stays on login page; HTTP 401 returned from `/api/auth/login` | To be filled during testing |
| TC-005 | Login with non-existent username | Server running | 1. Enter username `nonexistent` and password `123`<br>2. Click Login | Error message displayed; HTTP 401 returned | To be filled during testing |

---

### Ambulance Management

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-006 | Retrieve all ambulances | Server running, Firestore seeded (amb-101, amb-102) | 1. Send GET to `http://localhost:8082/api/ambulances` | JSON array containing `amb-101` and `amb-102` with their statuses, locations, driver names, and ambulance numbers is returned with HTTP 200 | To be filled during testing |
| TC-007 | Driver selects ambulance at shift start | `driver1` has logged in and is on `/pick-ambulance` | 1. On the ambulance selection page, select `amb-101`<br>2. Click confirm/select | `driver1` is associated with `amb-101`; the ambulance's `driverId` and `driverName` are updated in Firestore; user is redirected to `/driver` (DriverView) | To be filled during testing |
| TC-008 | Update ambulance GPS location | Server running, `amb-101` exists in Firestore | 1. Send POST to `/api/ambulances/location` with body `{"ambulanceId":"amb-101","lat":32.1700,"lon":34.9250}`<br>2. Send GET to `/api/ambulances` | HTTP 200 from POST; GET response shows `amb-101` with updated `lat` and `lon` values | To be filled during testing |

---

### Case Management

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-009 | Create a new emergency case | Logged in as `dispatcher1`; at least one ambulance is available | 1. In DispatcherDashboard, search for an address in Hod HaSharon using the address field<br>2. Set urgency to "emergency", fill in patient details and description<br>3. Submit the form | New case appears in the case list with `status: "pending"` and `urgency: "emergency"`; case is persisted in Firestore | To be filled during testing |
| TC-010 | Create a new routine case | Logged in as `dispatcher1` | 1. In DispatcherDashboard, fill in address, set urgency to "routine", fill in patient details<br>2. Submit the form | New case appears with `status: "pending"` and `urgency: "routine"` | To be filled during testing |
| TC-011 | List all cases sorted by creation time | At least two cases exist in Firestore | 1. Send GET to `/api/cases` | JSON array returned, sorted newest-first by `createdAt` epoch value | To be filled during testing |
| TC-012 | Assign a case to an ambulance | A pending case exists; `amb-101` has `status: "available"` | 1. In DispatcherDashboard, click Assign on the pending case<br>2. Select `amb-101` from the ambulance list | Case `status` changes to `"active"` in Firestore; `amb-101` status changes to `"busy"`; `assignedAmbulanceId` and `assignedDriverName` are recorded on the case | To be filled during testing |
| TC-013 | Driver views their active case | `driver1` is logged in and associated with `amb-101`; a case is assigned to `amb-101` | 1. In DriverView, the active case section polls `/api/cases/active?ambulanceId=amb-101` every 3 s | Active case details (address, description, urgency, patient details) are displayed; route polyline is shown on the Leaflet map | To be filled during testing |
| TC-014 | Update case notes and patient details | A case with `status: "active"` exists | 1. In DispatcherDashboard, open the active case<br>2. Add a note and update patient details field<br>3. Save | Notes are appended in `[HH:mm] text` format with a timestamp; patient details field is updated in Firestore | To be filled during testing |
| TC-015 | Driver marks arrival at scene | `driver1` has an active case displayed in DriverView | 1. In DriverView, click "הגעתי לאירוע" (Arrived at scene) button | `arrivalTime` is set to the current epoch timestamp on the case in Firestore; button is replaced or disabled after clicking | To be filled during testing |
| TC-016 | Complete a case | A case with `status: "active"` is assigned to `amb-101` | 1. In DispatcherDashboard, click Complete on the active case | Case `status` changes to `"completed"` in Firestore; `amb-101` status changes back to `"available"` | To be filled during testing |
| TC-017 | Driver requests case cancellation | `driver1` has an active case (status `"active"`) displayed in DriverView | 1. In DriverView, click the Cancel Request button | Case `status` changes to `"cancel_requested"` in Firestore; dispatcher sees a cancellation request indicator in DispatcherDashboard | To be filled during testing |
| TC-018 | Dispatcher approves case cancellation | A case with `status: "cancel_requested"` exists | 1. In DispatcherDashboard, click Approve Cancel on the cancel-requested case | Case `status` changes to `"cancelled"` in Firestore; the assigned ambulance `status` changes back to `"available"` | To be filled during testing |

---

### Routing

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-019 | Calculate emergency route | Server running, `graph-cache-v2/` loaded | 1. Send GET to `/api/route?startLat=32.1668&startLon=34.9201&endLat=32.1850&endLon=34.9100&isEmergency=true` | HTTP 200; JSON response contains a `path` array of coordinates, `distanceMeters`, and `estimatedTimeSec`; uses the `ambulance_emergency` profile (contraflow allowed, 1.2× speed) | To be filled during testing |
| TC-020 | Calculate routine route | Server running, `graph-cache-v2/` loaded | 1. Send GET to `/api/route?startLat=32.1668&startLon=34.9201&endLat=32.1850&endLon=34.9100&isEmergency=false` | HTTP 200; JSON route response returned using the `ambulance_routine` profile (one-way rules enforced); `estimatedTimeSec` is greater than or equal to that of TC-019 | To be filled during testing |
| TC-021 | Emergency route falls back to routine when passing through a no-go zone | A no-go zone bounding box covers the path between the test coordinates | 1. Add a no-go zone via `/api/nogozones` that covers coordinates along the route between `32.1668,34.9201` and `32.1850,34.9100`<br>2. Send GET to `/api/route` with `isEmergency=true` for those coordinates | Response returns a route calculated with routine (non-contraflow) strategy instead of the emergency strategy | To be filled during testing |
| TC-022 | ETA calculation for all non-offline ambulances | At least one ambulance with `status != "offline"` exists | 1. Send GET to `/api/eta?endLat=32.1850&endLon=34.9100` | HTTP 200; JSON array with one entry per non-offline ambulance, each containing `ambulanceId`, `routineEtaSec`, and `emergencyEtaSec` | To be filled during testing |
| TC-023 | Traffic signals displayed on map | Server running | 1. Send GET to `/api/signals` | JSON array of coordinate objects for the 114 OSM traffic signal nodes in the Hod HaSharon area is returned | To be filled during testing |

---

### User Management (Manager)

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-024 | Manager creates a new driver user | Logged in as `manager1` | 1. In ManagerSuite, navigate to the Users tab<br>2. Fill in username `driver3`, password `123`, role `driver`, ambulanceId `amb-103`, display name `Test Driver`<br>3. Submit | New user `driver3` appears in the user list with role `"driver"`; a new ambulance entry `amb-103` is automatically created in Firestore with `status: "available"` | To be filled during testing |
| TC-025 | Manager creates a new dispatcher user | Logged in as `manager1` | 1. In ManagerSuite, fill in username `dispatcher2`, password `123`, role `dispatcher`, no ambulanceId<br>2. Submit | New user `dispatcher2` appears in the user list with role `"dispatcher"`; no ambulance entry is created | To be filled during testing |
| TC-026 | Manager deletes a user | Logged in as `manager1`; a non-seed user (e.g., `driver3`) exists | 1. In ManagerSuite, click Delete on `driver3`<br>2. Verify the user list | `driver3` is removed from the user list; a subsequent POST to `/api/auth/login` with `driver3`'s credentials returns HTTP 401 | To be filled during testing |

---

### No-Go Zone Management (Manager)

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-027 | Manager adds a no-go zone | Logged in as `manager1` | 1. In ManagerSuite, navigate to the No-Go Zones tab<br>2. Enter zone name `Test Zone`, minLat `32.160`, maxLat `32.175`, minLon `34.910`, maxLon `34.930`<br>3. Submit | Zone appears in the no-go zones list with an auto-generated ID (e.g., `zone-1`); zone bounding box polygon is displayed on the map | To be filled during testing |
| TC-028 | Manager deletes a no-go zone | Logged in as `manager1`; at least one no-go zone exists | 1. In ManagerSuite, click Delete on the target zone<br>2. Verify the zone list | Zone is removed from the Firestore `nogozones` collection and no longer shown on the map | To be filled during testing |

---

### Data Persistence (Firebase Firestore)

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-029 | Cases persist in Firestore across server restarts | A case was created and is visible via `/api/cases` | 1. Create a new case via DispatcherDashboard<br>2. Stop the backend server<br>3. Restart the backend server<br>4. Send GET to `/api/cases` | All previously created cases are present in the response; data was persisted in Firestore, not in server memory | To be filled during testing |
| TC-030 | No-go zones persist in Firestore across server restarts | A no-go zone was created | 1. Create a no-go zone via ManagerSuite<br>2. Stop and restart the backend server<br>3. Send GET to `/api/nogozones` | The previously created zone is present in the response; TTL cache is re-populated from Firestore within 60 s | To be filled during testing |
| TC-031 | In-memory session tokens are lost on server restart (expected behavior) | A user is logged in with a valid session token | 1. Log in as `dispatcher1` and note the session token<br>2. Stop and restart the backend server<br>3. Attempt any authenticated API call using the old token | HTTP 401 or equivalent auth error returned; user must log in again to obtain a new token | To be filled during testing |
