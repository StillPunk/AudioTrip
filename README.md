# AudioTrip

AudioTrip is an interactive WebGL-based 3D rhythm game built specifically for the Telegram Mini App (TMA) ecosystem. Players ride down a procedurally generated cosmic track mapped out in real-time to the beats, frequency ranges, and intensity of their chosen audio tracks.

The project features a highly optimized rendering loop using **Three.js**, responsive state-management via **Zustand**, and real-time audio analysis with the **Web Audio API**.

---

## Key Features

### 1. Procedural Track & Block Generation
*   **Audio Intensity Mapping:** Analyzes PCM audio data in real-time to map out track curves, hills, banks, and obstacle distributions dynamically depending on the track's tempo and energy level.
*   **Audio Beat Analysis:** Spawns color scoring blocks and obstacle columns based on RMS (Root Mean Square) energy thresholds and frequency band data.

### 2. Immersive Visual Environments (`EnvironmentState`)
*   **Space Zone:** Ride through nebula particle systems, cosmic dust, and custom meteor showers.
*   **Neon City Zone:** Procedural instanced-mesh skyscrapers with custom emissive materials and preloaded background video projection screens.
*   **Solar System Zone:** Fly past high-resolution, orbiting textured planetary bodies (Earth, Mars, Jupiter).
*   **Hyperspace Jumps:** ZONE transitions occur dynamically. High-intensity sections (e.g., reaching drops or heavy bass choruses) trigger hyperspace visual streaks and morph the game world seamlessly into the next environment.

### 3. Dynamic Visual Effects & Shaders
*   **Emissive Post-Processing:** Glow and neon lighting effects rendered via standard `UnrealBloomPass` layers.
*   **Procedural Weather & lightning:** Storm effects with random lighting bolts and point-light flashes calculated dynamically and synchronized with high-frequency audio bands.
*   **Sketch Mode (Special Event):** Hitting special scoring checkpoints (White Holes) triggers a post-processing Sobel operator filter (via a custom shader) to morph the game into a black-and-white hand-drawn comic sketch look temporarily.

### 4. Interactive Music Search & Local Uploads
*   **YouTube Query Suggestions:** Integrates a YouTube-suggest API proxy to query, search, and pre-stream track audio and companion video chunks.
*   **Local File Uploads:** Supports choosing offline media files with on-the-fly client-side decoding and ID3 metadata tag reading.

### 5. Telegram Mini App Native Support
*   **Strict Environment Verification:** Detects WebApp environment parameters on load and features an immediate QR-fallback modal redirecting desktop browsers to `@AudioTripBot`.
*   **Native Haptics:** Triggers localized haptic vibration feedbacks via the WebApp API on collisions or misses.
*   **Score tracking & Storage:** Saves and fetches high-score records, total token balances, and gameplay history tied to the user's Telegram ID.

---

## Tech Stack

*   **Core Framework:** React 19 (Strict Mode) & TypeScript
*   **3D Graphics & Post-Processing:** Three.js (WebGL renderer with EffectComposer, ShaderPass, and BloomPass)
*   **State Management:** Zustand 5
*   **Animations:** GSAP (GreenSock Animation Platform)
*   **Localization:** Built-in lightweight multi-language manager (EN / RU)
*   **Build & Security Tools:** Vite 7, Rollup, and built-in obfuscation routines (`vite-plugin-javascript-obfuscator` used during compilation)

---

## Project Structure

```text
├── src/
│   ├── app/                  # Application initialization and bootstrap logic
│   ├── pages/                # Main game viewport components
│   ├── shared/
│   │   ├── config/           # Localization dictionaries, shaders, mathematical constants
│   │   ├── lib/              # Async loaders, track curves, and coordinate interpolation helpers
│   │   ├── model/            # Zustand UI store and centralized WebGL state references
│   │   └── types/            # TypeScript schema types
│   ├── entities/
│   │   ├── audio/            # Web Audio API decode controllers, gains, and audio buffer pools
│   │   ├── game/             # Collision systems, score modifiers, and track procedural builders
│   │   ├── graphics/         # Mesh instancers, procedural skyboxes, and particle generators
│   │   └── ui/               # Input listeners, haptic feedback, and window resize listeners
│   └── widgets/              # UI Overlays (HUD, Pause, History, Tutorial, Loading Screens)
```

---

## Getting Started

### Prerequisites

*   **Node.js** (v20+ recommended)
*   **npm** or **yarn**

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/StillPunk/AudioTrip.git
   cd AudioTrip
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally

To run the development server with live reload:
```bash
npm run dev
```

*Note: Since the application relies on the Telegram WebApp sandbox for initialization and haptics, run it in a Telegram testing client or make sure to test with a simulated viewport.*

### Production Build & Obfuscation

To compile the application, check for TypeScript issues, and obfuscate the JavaScript bundle for deployment:
```bash
npm run build
```

The optimized and minified assets will be generated in the `dist/` directory.

---

## License

This project is licensed under the [MIT License](LICENSE).
