# TSCraft

A simple Minecraft-like UI implemented with **TypeScript** and **Three.js**,
where you can freely place and destroy blocks in a 3D world.

You can try here! https://reouno.github.io/tscraft/

![Demo](./tscraft_02.gif)

# Usage (http-server)

This repository loads Three.js from a CDN and runs TypeScript compiled into plain JavaScript. Use `npx http-server` to serve it locally for testing.

## Prerequisites
- Node.js must be installed  
- TypeScript build is done with `tsc` (globally installed) or `npx tsc`

## Steps
1) **Build**  
- For first build / after changes: `tsc` or `tsc -p .`  
- Watch mode (optional): `tsc -w` or `tsc -p . -w`  
  - The `tsconfig.json` in this repo specifies `module: none`, and outputs `main.js` for the browser.

2) **Serve**  
- At the project root: `npx http-server -p 8080`  
- Open in browser: `http://localhost:8080/` (`index.html` will be shown automatically)  
- If the port is occupied, change it with `-p 3000` or another port.

## Notes
- `index.html` loads Three.js (CDN) first, then `main.js`.  
- `main.ts` uses the global `THREE`, so no `import` is needed.  
- Opening with `file://` directly may cause CORS or other issues—always open through a local server.

## Controls (basic)
- **Click**: Lock the mouse cursor (enable view control)  
- **View**: Mouse movement  
- **Move**: `W/A/S/D`  
- **Run**: `Shift`  
- **Jump**: `Space`  
- **Destroy**: Left click (destroy block at crosshair)  
- **Place**: Right click (place next to hit surface, reach ≈ 5m)  

