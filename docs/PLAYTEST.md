# Prototype playtest script

Run five fresh 24-week sessions with people who have not read the implementation. Do not explain controls unless the player is blocked for more than 30 seconds.

## Setup

```powershell
npm run dev
```

Use a different seed for each player. Record only anonymous notes.

Campaign entry is now the **world map**. Tokyo HQ is a place inside Kanto; desks (Marketplace, etc.) open as windows on a place. The location bar is World › region › place › window.

## Tasks to observe

1. From the world map, enter Kanto, then Tokyo HQ, and identify the next weekly pulse.
2. Find the Marketplace from the office scene (a window on HQ, not a peer tab).
3. Explain what happened to the opening inventory after the first pulse.
4. Buy one single asset or indivisible package.
5. Leave HQ back to Kanto, enter a customer or supplier place, and walk back up the stack.
6. Send an AR asset to an MRO if one is available.
7. Make or configure one buyer deal.
8. Inspect an asset and explain two of TSN, CSN, TSR, CSR, MTBR, MTBO, repair TAT, or logistics TAT.
9. Pause, save, resolve one step, and resume.

## Pass criteria

- Marketplace entry found without instruction.
- First sourcing choice made within 60 seconds.
- Player connects a red acquisition pulse with reduced spendable ACC, without assuming the asset disappeared.
- Player understands why available stock can ship automatically.
- World → Kanto → HQ → window → back-up-the-stack loop works without instruction.
- At least one player reaches a new node or signs a network agreement.
- The difference between repair TAT and logistics TAT is understood.
- No player describes the failure as arbitrary opening randomness.

## Questions after the session

- Why did you buy that asset/package?
- Which inventory would you deepen next?
- What caused your largest green and red ACC pulses?
- What is the difference between AR and serviceable?
- Which customer or supplier relationship would you build next?
- Would you sign the PBH offer? What could make it fail?

## Synthetic regression

Use the same five seeds across policy archetypes:

```powershell
npm run sim -- balance --seed 101 --seeds 5 --ticks 24
```

The synthetic suite detects deterministic balance regressions; it does not replace the five human sessions above.
