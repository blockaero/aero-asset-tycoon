# Aero Asset Tycoon

Deterministic aviation aftermarket strategy prototype. Run an asset-management company, buy single assets or packages, stock and repair components, fulfill airline demand, expand a supplier/customer network, and protect the ACC balance.

## Run the playable prototype

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The sim API runs on `http://127.0.0.1:8787`.

Production build and local server:

```powershell
npm run build
npm run serve
```

Then open `http://127.0.0.1:8787`.

## Verification

```powershell
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

## Headless experiments

```powershell
npm run sim -- run --seed 1 --ticks 100
npm run sim -- evolve --seed 1 --generations 3 --population 8 --ticks 40
npm run sim -- sequence --seed 1
npm run sim -- balance --seed 101 --seeds 5 --ticks 24
```

One simulation tick is one week. Live pace is 25, 50, or 75 seconds per weekly pulse; headless runs never wait on wall time.

Aircraft and engine nomenclature is real for learning. Organizations, P/Ns, prices, reliability, events, and outcomes are fictional game data. This project is not affiliated with any OEM, airline, MRO, or airport.
