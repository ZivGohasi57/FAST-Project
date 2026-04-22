# FAST — Ambulance Navigation & Dispatch System

[![Java](https://img.shields.io/badge/Java-17-red.svg)](https://www.oracle.com/java/)
[![React](https://img.shields.io/badge/React-19%2B-blue.svg)](https://react.dev/)
[![GraphHopper](https://img.shields.io/badge/Routing-GraphHopper%2011-green.svg)](https://www.graphhopper.com/)
[![Vite](https://img.shields.io/badge/Build-Vite-646CFF.svg)](https://vitejs.dev/)
[![License: Personal](https://img.shields.io/badge/License-Academic-green.svg)](#license)

**FAST** is a full-stack ambulance management and navigation system built as a final-year Computer Science capstone project.
The system provides intelligent, context-aware routing for emergency medical services — distinguishing between **routine** and **emergency** driving modes — with a live dispatch dashboard and a driver navigation interface.

The core innovation is a **custom routing engine** built on top of GraphHopper that enables contraflow navigation (driving against one-way streets) on appropriate urban roads during emergencies, with realistic siren-adjusted intersection delay modeling.

---

## 🧠 Core Features

### 🗺️ Smart Routing Engine (Java Backend)
* **Dual Routing Profiles**: `Routine` mode respects traffic laws; `Emergency` mode optimizes for fastest arrival time.
* **Contraflow Navigation**: Emergency routes may use contraflow on one-way streets — but only on urban roads where no parallel dual carriageway exists, and only when it saves ≥ 30 seconds.
* **Traffic Signal Awareness**: All `highway=traffic_signals` nodes are parsed from OSM data at startup. Intersection delay penalties differ by mode (routine: 90s/signal vs. emergency: 30s/signal).
* **Dual Carriageway Detection**: A SAX-based OSM parser identifies divided roads using spatial proximity and bearing comparison, preventing unsafe contraflow suggestions.
* **Realistic Speed Modeling**: Emergency profile applies a 1.2× speed multiplier with traffic flow and 0.7× for contraflow segments.
* **Step-by-Step Instructions**: Each route includes turn-by-turn maneuvers with street name, distance, turn sign, roundabout exit number, and a contraflow flag.

### 🚑 Dispatch & Fleet Management
* **Case Management**: Create, list, assign, and complete emergency cases.
* **ETA Intelligence**: `/api/eta` computes both routine and emergency arrival times from every active ambulance to a target location — enabling the dispatcher to assign the optimal unit.
* **Role-Based Access**: Three user roles — Driver, Dispatcher, and Manager — each with a dedicated view and protected routes.
* **User Management**: Manager can view, add, and remove system users via the API.

### 🖥️ Driver Navigation Interface (React Frontend)
* **Full-Screen Leaflet Map**: Interactive map with CARTO Voyager tiles, custom SVG ambulance/destination markers, and zoom-aware traffic signal overlay.
* **Address Autocomplete**: Nominatim-powered search limited to Israel, with Hebrew-first results and 420ms debounce.
* **Live Instruction Banner**: Displays the next maneuver with SVG turn arrows, roundabout icons, and a contraflow warning overlay.
* **GPS Support**: Resolves the driver's current location via the browser Geolocation API.
* **Emergency/Routine Toggle**: Animated pulse indicator lets the driver switch modes before computing a route.

---

## 📐 Tech Stack

### Backend
* **Language**: Java 17
* **Routing Engine**: GraphHopper 11.0 (embedded JAR, not a remote API)
* **HTTP Server**: `com.sun.net.httpserver` (no external web framework)
* **Serialization**: Google Gson 2.10.1
* **OSM Parsing**: Java SAX parser for traffic signals and dual-carriageway detection
* **Build**: Maven (`pom.xml`) + local `lib/` JARs

### Frontend
* **Framework**: React 19 + Vite 7
* **Routing**: React Router DOM 7
* **Maps**: Leaflet 1.9 + React-Leaflet 5
* **HTTP Client**: Axios 1.13
* **Map Tiles**: CARTO Voyager (`basemaps.cartocdn.com`)
* **Geocoding**: Nominatim / OpenStreetMap (free, no API key required)
* **Linting**: ESLint 9 with React Hooks plugin

---

## 📁 Project Structure

```text
FAST-Project/
├── FAST-Routing-Server/          # Java backend
│   ├── src/main/java/
│   │   ├── api/
│   │   │   ├── DataStore.java               # In-memory singleton state store
│   │   │   └── controllers/
│   │   │       └── RoutingController.java   # HTTP server & all API handlers
│   │   ├── core/
│   │   │   ├── interfaces/                  # IRoutingStrategy, IRoutingEngineClient
│   │   │   └── models/                      # CaseRecord, User, RouteRequest, etc.
│   │   └── routing/
│   │       ├── engine/
│   │       │   ├── FastRoutingEngine.java         # Strategy-pattern context
│   │       │   └── FastRoutingEngineClient.java   # GraphHopper wrapper
│   │       ├── strategies/
│   │       │   ├── EmergencyRoutingStrategy.java
│   │       │   └── RoutineRoutingStrategy.java
│   │       ├── parsers/
│   │       │   ├── AmbulanceAccessParser.java     # Contraflow access rules
│   │       │   └── AmbulanceSpeedParser.java      # Speed encoding
│   │       ├── AmbulanceImportRegistry.java       # Custom vehicle type registration
│   │       ├── DualCarriagewayDetector.java       # Divided-road OSM parser
│   │       └── TrafficSignalIndex.java            # Traffic light OSM parser
│   ├── export.osm                # OSM road data — Petah Tikva, Israel
│   ├── graph-cache-v2/           # Pre-built GraphHopper road network cache
│   ├── graphhopper-web-11.0.jar
│   └── pom.xml
│
├── fast-frontend/                # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx               # Router + role-based protected routes
│   │   ├── api/routingService.js # API wrapper
│   │   ├── components/
│   │   │   └── MapDisplay.jsx    # Full-featured Leaflet map component
│   │   └── pages/
│   │       ├── LoginPage.jsx
│   │       ├── DriverView.jsx            # Main navigation UI
│   │       ├── DispatcherDashboard.jsx
│   │       └── ManagerSuite.jsx
│   └── package.json
│
└── docs/                         # Project documentation (Hebrew)
```

---

## 🏗️ System Architecture

```
┌─────────────────────────────┐     HTTP (port 8082)     ┌──────────────────────────┐
│     React Frontend           │ ◄────────────────────► │   Java Routing Server    │
│  (Vite dev server :5173)    │                          │  (com.sun.net.httpserver) │
│                              │                          │                           │
│  · DriverView (Leaflet map) │                          │  · RoutingController      │
│  · DispatcherDashboard       │                          │  · FastRoutingEngine      │
│  · ManagerSuite              │                          │  · GraphHopper 11.0       │
└─────────────────────────────┘                          │  · DataStore (in-memory)  │
                                                          └──────────────────────────┘
                                                                       │
                                                          ┌────────────┘
                                                          │  export.osm (Petah Tikva)
                                                          │  graph-cache-v2/
                                                          └──────────────────────────
```

The system is intentionally **stateless** — all user, ambulance, and case data is held in an in-memory `DataStore` singleton and resets on server restart. This keeps the architecture simple for an academic context.

---

## 🧪 Development Philosophy

This project was built as a **final-year academic capstone** to explore the intersection of graph algorithms, map data engineering, and real-time UI design in the context of emergency services.

Key engineering decisions include:
* **Custom Vehicle Profiles**: Extending GraphHopper's built-in profile system to model an ambulance with mode-specific access and speed rules — without modifying library internals.
* **OSM-Native Intelligence**: All domain knowledge (traffic signals, one-way streets, dual carriageways) is extracted directly from OpenStreetMap data, requiring no external data provider.
* **Strategy Pattern for Routing**: Routing behavior is fully swappable at runtime via `IRoutingStrategy`, making it straightforward to add new profiles (e.g., bicycle, fire truck) in the future.
* **Pre-built Graph Cache**: The GraphHopper road network is compiled once and committed to the repo, so the server starts instantly without re-importing OSM data on every run.

---

## ▶️ Running Locally

**1. Start the Java API server** (from `FAST-Routing-Server/`):
```bash
# Using Maven
mvn compile exec:java -Dexec.mainClass="api.controllers.RoutingController"

# Or manually (macOS/Linux)
javac -cp ".:lib/*" -d . $(find . -name "*.java")
java -cp ".:lib/*" api.controllers.RoutingController
```
Server runs on **http://localhost:8082**

**2. Start the React frontend** (from `fast-frontend/`):
```bash
npm install
npm run dev
```
App runs on **http://localhost:5173**

---

## 🗺️ Roadmap

- [x] Dual routing profiles (Routine & Emergency)
- [x] Contraflow navigation with dual-carriageway safety check
- [x] Traffic signal-aware intersection delay model
- [x] Step-by-step turn instruction generation
- [x] ETA comparison across all active ambulances
- [x] Role-based authentication (Driver / Dispatcher / Manager)
- [x] Live Leaflet map with turn-by-turn instruction banner
- [ ] Dispatcher dashboard — full case assignment UI
- [ ] Manager suite — user and fleet management UI
- [ ] Persistent storage (replace in-memory DataStore)
- [ ] Expand map coverage beyond Petah Tikva

---

## 📄 License

**Academic Capstone Project**

Copyright (c) 2025 Ziv Gohasi.
Built as a final-year project for the Computer Science program.
