# Software Test Design (STD)
## FAST – Ambulance Dispatch Management System

---

## 1. Introduction

This Software Test Design document provides detailed test cases for verifying the functionality of the **FAST** ambulance dispatch management system. It covers all system modules: authentication, case management, ambulance tracking, routing, ETA calculation, no-go zone management, and user management.

All test cases assume the backend is running on `localhost:8082` and the frontend is running on `localhost:5173`. The data directory is pre-seeded with default users on first run.

---

## 2. Test Cases

### Authentication

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-001 | Login with valid driver credentials | Server running, data seeded with default users | 1. Open the app in browser<br>2. Enter username `driver1` and password `123`<br>3. Click Login | User is redirected to DriverView; role shown as "driver" | To be filled during testing |
| TC-002 | Login with valid dispatcher credentials | Server running, data seeded | 1. Enter username `dispatcher1` and password `123`<br>2. Click Login | User is redirected to DispatcherDashboard | To be filled during testing |
| TC-003 | Login with valid manager credentials | Server running, data seeded | 1. Enter username `manager1` and password `123`<br>2. Click Login | User is redirected to ManagerSuite | To be filled during testing |
| TC-004 | Login with incorrect password | Server running, user `driver1` exists | 1. Enter username `driver1` and password `wrongpass`<br>2. Click Login | Error message shown; user stays on login page; HTTP 401 returned | To be filled during testing |
| TC-005 | Login with non-existent username | Server running | 1. Enter username `unknown` and password `123`<br>2. Click Login | Error message shown; HTTP 401 returned | To be filled during testing |

---

### Ambulance Management

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-006 | Retrieve all ambulances | Server running, ambulances seeded (amb-1, amb-2) | 1. Send GET request to `/api/ambulances` | JSON array containing amb-1 and amb-2 with their statuses, locations, and driver names is returned | To be filled during testing |
| TC-007 | Update ambulance location | Server running, amb-1 exists | 1. Send POST to `/api/ambulances/location` with body `{"ambulanceId":"amb-1","lat":32.1700,"lon":34.9250}`<br>2. Send GET to `/api/ambulances` | Response 200; GET shows amb-1 with updated lat/lon | To be filled during testing |

---

### Case Management

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-008 | Create a new emergency case | Logged in as dispatcher1 | 1. In DispatcherDashboard, fill in address, urgency = "emergency", patient details<br>2. Submit the form | New case appears in the case list with status "pending" and urgency "emergency" | To be filled during testing |
| TC-009 | Create a new routine case | Logged in as dispatcher1 | 1. In DispatcherDashboard, fill in address, urgency = "routine", patient details<br>2. Submit the form | New case appears with status "pending" and urgency "routine" | To be filled during testing |
| TC-010 | List all cases | At least one case exists | 1. Send GET to `/api/cases` | JSON array returned, sorted newest-first by createdAt | To be filled during testing |
| TC-011 | Assign a case to an ambulance | A pending case exists; an available ambulance (amb-1) exists | 1. In DispatcherDashboard, click Assign on a pending case and select amb-1<br>2. Send GET to `/api/cases` | Case status changes to "active"; amb-1 status changes to "busy" | To be filled during testing |
| TC-012 | Driver views their active case | driver1 is logged in; a case is assigned to amb-1 | 1. In DriverView, the active case section loads automatically | Active case details (address, description, urgency, patient details) are displayed; route is shown on the map | To be filled during testing |
| TC-013 | Update case notes and patient details | A case with status "active" exists | 1. In DispatcherDashboard, open the active case<br>2. Add a note and update patient details<br>3. Save | Notes are appended with a timestamp in `[HH:mm] text` format; patient details are updated | To be filled during testing |
| TC-014 | Complete a case | A case with status "active" is assigned to amb-1 | 1. In DispatcherDashboard, click Complete on the active case | Case status changes to "completed"; amb-1 status changes back to "available" | To be filled during testing |
| TC-015 | Driver requests case cancellation | driver1 has an active case (status "active") | 1. In DriverView, click the Cancel Request button | Case status changes to "cancel_requested"; dispatcher sees the cancel request in DispatcherDashboard | To be filled during testing |
| TC-016 | Dispatcher approves case cancellation | A case with status "cancel_requested" exists | 1. In DispatcherDashboard, click Approve Cancel on the case | Case status changes to "cancelled"; assigned ambulance status changes back to "available" | To be filled during testing |

---

### Routing

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-017 | Calculate emergency route | Server running, graph-cache loaded | 1. Send GET to `/api/route?startLat=32.1668&startLon=34.9201&endLat=32.1850&endLon=34.9100&isEmergency=true` | JSON route response with a path array, distance in meters, and estimated time in seconds is returned; route uses emergency (contraflow) strategy | To be filled during testing |
| TC-018 | Calculate routine route | Server running, graph-cache loaded | 1. Send GET to `/api/route?startLat=32.1668&startLon=34.9201&endLat=32.1850&endLon=34.9100&isEmergency=false` | JSON route response returned; estimated time should be >= emergency route time | To be filled during testing |
| TC-019 | Emergency route falls back to routine when passing through a no-go zone | A no-go zone covering the emergency route path exists | 1. Add a no-go zone that covers the path between start and end coordinates<br>2. Send GET to `/api/route` with `isEmergency=true` for those coordinates | Response returns a routine (non-contraflow) route instead of the emergency route | To be filled during testing |
| TC-020 | ETA calculation for all ambulances | At least one non-offline ambulance exists | 1. Send GET to `/api/eta?endLat=32.1850&endLon=34.9100` | JSON array with one entry per non-offline ambulance, each containing `ambulanceId`, `routineEtaSec`, and `emergencyEtaSec` | To be filled during testing |

---

### User Management (Manager)

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-021 | Manager creates a new driver user | Logged in as manager1 | 1. In ManagerSuite, fill in username `driver3`, password `123`, role `driver`, ambulanceId `amb-3`, display name `Test Driver`<br>2. Submit | New user appears in the user list; a new ambulance entry `amb-3` is automatically created with status "available" | To be filled during testing |
| TC-022 | Manager creates a new dispatcher user | Logged in as manager1 | 1. In ManagerSuite, fill in username `dispatcher2`, password `123`, role `dispatcher`, no ambulanceId<br>2. Submit | New user appears in the user list with role "dispatcher"; no ambulance entry is created | To be filled during testing |
| TC-023 | Manager deletes a user | Logged in as manager1; a non-seed user exists | 1. In ManagerSuite, click Delete on the target user<br>2. Send GET to `/api/users` | User is removed from the list; subsequent login attempt with that user's credentials returns HTTP 401 | To be filled during testing |

---

### No-Go Zone Management (Manager)

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-024 | Manager adds a no-go zone | Logged in as manager1 | 1. In ManagerSuite, enter zone name `Test Zone`, minLat `32.160`, maxLat `32.175`, minLon `34.910`, maxLon `34.930`<br>2. Submit | Zone appears in the no-go zones list with a generated ID (e.g., `zone-1`); zone polygon is displayed on the map | To be filled during testing |
| TC-025 | Manager deletes a no-go zone | Logged in as manager1; at least one no-go zone exists | 1. In ManagerSuite, click Delete on the target zone<br>2. Verify zone list | Zone is removed from the list and no longer shown on the map | To be filled during testing |
| TC-026 | No-go zone persists after server restart | A no-go zone was previously created | 1. Stop and restart the backend server<br>2. Send GET to `/api/nogozones` | The previously created zone is still present in the response (persisted in nogozones.json) | To be filled during testing |

---

### Data Persistence

| Test Case ID | Description | Preconditions | Test Steps | Expected Result | Actual Result |
|---|---|---|---|---|---|
| TC-027 | Cases persist after server restart | One or more cases exist | 1. Create a new case via the dispatcher<br>2. Stop the backend server<br>3. Restart the backend server<br>4. Send GET to `/api/cases` | All previously created cases are present in the response | To be filled during testing |
| TC-028 | Ambulance location persists after server restart | amb-1 location was updated | 1. Send POST to `/api/ambulances/location` to update amb-1's coordinates<br>2. Stop and restart the backend server<br>3. Send GET to `/api/ambulances` | amb-1 shows the updated coordinates | To be filled during testing |
