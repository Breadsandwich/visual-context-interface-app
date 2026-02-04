# ADOM Visual Context Interface - Implementation Plan

## Requirements Restatement

Build a **Dockerized development tool** that:
1. Wraps any local React application in an iframe via a proxy
2. Injects an inspector script to enable DOM element selection and highlighting
3. Allows screenshot capture of specific regions
4. Generates a structured JSON payload with route, element context, visual data, and user instructions
5. Outputs payload to console and clipboard for use with Claude Code

**Key Constraint**: The target application must NOT require any code changes or dependencies.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Compose Network                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐      ┌──────────────────────┐         │
│  │   Service A:         │      │   Service B:         │         │
│  │   Visual Context     │      │   Dummy Target       │         │
│  │   Tool               │      │   (React App)        │         │
│  │                      │      │                      │         │
│  │  ┌────────────────┐  │      │  localhost:3001      │         │
│  │  │ React Parent   │  │      │  (internal)          │         │
│  │  │ App (Vite)     │  │      └──────────────────────┘         │
│  │  │ Port 5173      │  │                │                      │
│  │  └───────┬────────┘  │                │                      │
│  │          │           │                │                      │
│  │  ┌───────▼────────┐  │                │                      │
│  │  │ FastAPI Proxy  │◄─┼────────────────┘                      │
│  │  │ Port 8000      │  │   Proxies requests to target          │
│  │  │                │  │   Injects inspector.js                │
│  │  └────────────────┘  │                                       │
│  └──────────────────────┘                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack (Based on User Selection)

| Component | Technology |
|-----------|------------|
| Proxy Backend | **Python + FastAPI** |
| Frontend State | **Zustand** |
| Screenshot Library | **html2canvas** (injected) |
| WebSocket | HTTP-only (MVP) |
| Containerization | Docker + Docker Compose |
| Frontend Build | Vite + React + TypeScript |

---

## Implementation Phases

### Phase 1: Project Scaffolding & Docker Setup
**Complexity: LOW | Files: ~10**

1. Initialize monorepo structure:
   ```
   /
   ├── proxy/                 # FastAPI proxy service
   │   ├── main.py
   │   ├── requirements.txt
   │   └── Dockerfile
   ├── frontend/              # React parent app
   │   ├── src/
   │   ├── package.json
   │   ├── vite.config.ts
   │   └── Dockerfile
   ├── dummy-target/          # Test React app
   │   ├── src/
   │   ├── package.json
   │   └── Dockerfile
   ├── inspector/             # Injected script (built separately)
   │   └── inspector.js
   ├── docker-compose.yml
   └── README.md
   ```

2. Create Docker Compose configuration with:
   - Service A: `visual-context-tool` (frontend + proxy)
   - Service B: `dummy-target` (simple React landing page)
   - Shared network for inter-service communication

3. Set up environment variable handling:
   - `TARGET_PORT` - port of target app (default: 3001)
   - `TARGET_HOST` - host of target app (default: dummy-target)

**Deliverables:**
- [ ] Monorepo folder structure
- [ ] docker-compose.yml with both services
- [ ] Individual Dockerfiles for each service
- [ ] Basic README.md with setup instructions

---

### Phase 2: FastAPI Proxy Service
**Complexity: MEDIUM | Files: ~5**

1. Create FastAPI application with:
   - Root proxy endpoint (`/proxy/*`) that forwards to target
   - HTML response interception and script injection
   - Asset proxying (CSS, JS, images) with path rewriting
   - CORS headers for iframe communication

2. Implement HTML injection logic:
   ```python
   # Inject before </body>
   injection = f'''
   <script src="/inspector/html2canvas.min.js"></script>
   <script src="/inspector/inspector.js"></script>
   '''
   ```

3. Handle relative path rewriting:
   - Rewrite `href="/styles.css"` → `href="/proxy/styles.css"`
   - Rewrite `src="/app.js"` → `src="/proxy/app.js"`

4. Serve inspector script bundle from `/inspector/*` endpoint

**Deliverables:**
- [ ] `proxy/main.py` - FastAPI application
- [ ] `proxy/injection.py` - HTML manipulation logic
- [ ] `proxy/requirements.txt` - Dependencies
- [ ] `proxy/Dockerfile`
- [ ] Unit tests for proxy logic

---

### Phase 3: Inspector Script (Injected Module)
**Complexity: HIGH | Files: ~3**

1. Create vanilla JavaScript module (`inspector.js`):
   - No dependencies except html2canvas (loaded separately)
   - Self-contained, IIFE-wrapped to avoid global pollution

2. Implement hover highlighting:
   ```javascript
   // Create overlay element
   // Listen for mousemove events
   // Position overlay on hovered element
   // Show element tag, id, classes in tooltip
   ```

3. Implement click selection:
   ```javascript
   // Capture: tagName, id, classList, outerHTML
   // Generate unique CSS selector
   // Send via postMessage to parent
   ```

4. Implement screenshot capture:
   ```javascript
   // Use html2canvas to render element/region
   // Convert canvas to base64 PNG
   // Send via postMessage to parent
   ```

5. PostMessage protocol:
   ```javascript
   {
     type: 'INSPECTOR_EVENT',
     action: 'ELEMENT_SELECTED' | 'SCREENSHOT_CAPTURED' | 'ROUTE_CHANGED',
     payload: { ... }
   }
   ```

6. Mode management:
   - Listen for `INSPECTOR_COMMAND` messages from parent
   - Toggle between inspection/interaction modes
   - Disable pointer-events appropriately

**Deliverables:**
- [ ] `inspector/inspector.js` - Main inspector module
- [ ] `inspector/highlight.js` - Highlight overlay logic
- [ ] `inspector/selector.js` - CSS selector generation
- [ ] Include html2canvas as bundled dependency

---

### Phase 4: React Parent Application
**Complexity: HIGH | Files: ~15**

1. Set up Vite + React + TypeScript project:
   ```
   frontend/src/
   ├── components/
   │   ├── Viewport.tsx          # iframe container
   │   ├── ControlPanel.tsx      # sidebar with chat/input
   │   ├── ModeToggle.tsx        # inspection/interaction toggle
   │   ├── SelectionOverlay.tsx  # drag-to-select rectangle
   │   ├── PayloadPreview.tsx    # JSON output display
   │   └── InstructionInput.tsx  # text input for user prompt
   ├── stores/
   │   └── inspectorStore.ts     # Zustand store
   ├── hooks/
   │   ├── usePostMessage.ts     # postMessage listener
   │   └── useAreaSelection.ts   # drag selection logic
   ├── types/
   │   └── inspector.ts          # TypeScript interfaces
   ├── utils/
   │   └── payloadBuilder.ts     # JSON payload construction
   ├── App.tsx
   └── main.tsx
   ```

2. Implement Zustand store:
   ```typescript
   interface InspectorStore {
     mode: 'interaction' | 'inspection' | 'screenshot';
     selectedElement: ElementContext | null;
     screenshotData: string | null;
     currentRoute: string;
     userPrompt: string;
     setMode: (mode) => void;
     setSelectedElement: (el) => void;
     // ...
   }
   ```

3. Implement Viewport component:
   - Render iframe pointing to `/proxy/`
   - Handle postMessage events from inspector
   - Forward mode commands to inspector

4. Implement Control Panel:
   - Mode toggle buttons (Interact / Inspect / Screenshot)
   - Selected element display with HTML preview
   - Screenshot preview thumbnail
   - User instruction textarea
   - Export/Send button

5. Implement drag-to-select overlay:
   - Positioned absolutely over iframe
   - Draw rectangle on mouse drag
   - Calculate coordinates relative to iframe
   - Send capture command to inspector

6. Implement payload generation:
   ```typescript
   interface OutputPayload {
     route: string;
     context: {
       html: string;
       selector: string;
       tagName: string;
       id: string;
       classes: string[];
     };
     visual: string; // base64 PNG
     prompt: string;
   }
   ```

**Deliverables:**
- [ ] Complete React component tree
- [ ] Zustand store with all state
- [ ] PostMessage communication hooks
- [ ] Area selection overlay
- [ ] Payload builder utility
- [ ] Copy-to-clipboard functionality

---

### Phase 5: Dummy Target Application
**Complexity: LOW | Files: ~5**

1. Create simple React application with:
   - Landing page with header, navigation, buttons
   - Multiple routes (Home, About, Contact)
   - Various interactive elements (forms, buttons, cards)
   - Intentional "issues" Claude can fix:
     - Misaligned button
     - Wrong color on heading
     - Missing form validation

2. Keep minimal:
   - Vite + React (no TypeScript needed)
   - Basic CSS styling
   - React Router for navigation

**Deliverables:**
- [ ] Simple multi-page React app
- [ ] Variety of selectable DOM elements
- [ ] Dockerfile for containerization

---

### Phase 6: Integration & Testing
**Complexity: MEDIUM | Files: ~5**

1. End-to-end integration:
   - Verify iframe loads proxied content
   - Test element highlighting works
   - Test click selection captures metadata
   - Test screenshot capture
   - Test payload export

2. Write integration tests:
   - Proxy correctly injects script
   - PostMessage communication works
   - Payload structure is valid

3. Create example workflow:
   - Select misaligned button
   - Add instruction "Move this button 10px to the left"
   - Export payload
   - Verify payload is valid for Claude Code

**Deliverables:**
- [ ] Integration test suite
- [ ] Example payload output
- [ ] Verified clipboard functionality

---

### Phase 7: Documentation & Demo
**Complexity: LOW | Files: ~3**

1. Complete README.md with:
   - Quick start: `docker-compose up`
   - Configuration options (TARGET_PORT, etc.)
   - Usage guide with screenshots
   - Payload format documentation

2. Record Loom video demonstrating:
   - `docker-compose up` workflow
   - Selecting element in dummy app
   - Adding instruction
   - Copying payload to Claude Code
   - Claude Code making the fix

**Deliverables:**
- [ ] Comprehensive README.md
- [ ] Loom video recording
- [ ] Usage examples

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| CORS issues with iframe communication | HIGH | Proxy sets appropriate headers; same-origin via proxy |
| html2canvas rendering differences | MEDIUM | Test with common CSS frameworks; provide fallback capture method |
| Relative path rewriting edge cases | MEDIUM | Comprehensive regex patterns; test with complex apps |
| Inspector script conflicts with target app | MEDIUM | Use IIFE pattern; prefix all globals with `__INSPECTOR__` |
| Large screenshot payloads (base64) | LOW | Compress images; warn user of large payloads |
| React hydration conflicts with injected script | LOW | Inject after DOMContentLoaded; avoid DOM mutations on React root |

---

## File Count Estimate

| Phase | Files | Lines (approx) |
|-------|-------|----------------|
| Phase 1: Scaffolding | 10 | 200 |
| Phase 2: Proxy | 5 | 300 |
| Phase 3: Inspector | 4 | 400 |
| Phase 4: React App | 15 | 800 |
| Phase 5: Dummy Target | 5 | 150 |
| Phase 6: Testing | 5 | 250 |
| Phase 7: Documentation | 3 | 150 |
| **Total** | **~47** | **~2,250** |

---

## Dependencies

### Proxy Service (Python)
```
fastapi>=0.109.0
uvicorn>=0.27.0
httpx>=0.26.0
beautifulsoup4>=4.12.0
lxml>=5.1.0
```

### Frontend (React)
```
react: ^18.2.0
react-dom: ^18.2.0
zustand: ^4.5.0
typescript: ^5.3.0
vite: ^5.0.0
```

### Inspector
```
html2canvas: ^1.4.1 (bundled)
```

---

## Success Criteria Checklist

- [ ] `docker-compose up` starts both services
- [ ] User can navigate dummy target in iframe
- [ ] Hover highlighting works in Inspection Mode
- [ ] Click selection captures element metadata
- [ ] Drag-to-select captures screenshot
- [ ] Export button logs valid JSON to console
- [ ] Payload copies to clipboard
- [ ] Claude Code can use payload to make fixes
- [ ] No changes required to target application

---

## Implementation Order

1. **Phase 1** → Project structure (foundation)
2. **Phase 5** → Dummy target (need something to test against)
3. **Phase 2** → Proxy service (core functionality)
4. **Phase 3** → Inspector script (requires proxy to inject)
5. **Phase 4** → React parent app (requires inspector to communicate)
6. **Phase 6** → Integration testing
7. **Phase 7** → Documentation

---

**WAITING FOR CONFIRMATION**: Proceed with this implementation plan? (yes / no / modify)
