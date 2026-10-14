# bt-webtask

Web port of the VR ball-throwing task. Social Learning Lab @ Stanford.
Each folder is a deployable version; Pages serves it from its own `index.html`.

| Folder | Conditions | What it is |
|---|---|---|
| `two-prong/` | improvement, stochastic | The original. **Read the warning below.** |
| `two-prong-FixedTargets/` | improvement, stochastic | `two-prong` with fixed coerced distances, the VR roll, and a debug ghost ball. |
| `Improvement-LargeTarget/` | improvement | Visual ring radius 1.2. |
| `Improvement-SmallTarget/` | improvement | Visual ring radius 0.24. |
| `Improvement-NoWobble/` | improvement, stochastic | Catapult wobble disabled. |
| `Moving-Linear/` | improvement, stochastic | Ring sweeps left–right. Speed not calibrated. |
| `Moving-Circular/` | improvement, stochastic | Ring orbits. Speed not calibrated. |
| `analysis/` | — | Skill-slope fit and self-rating models. |

## `two-prong/` hides the improvement

In `two-prong/` the ball is drawn landing somewhere other than the coerced
target, then rolls a further ~1.4 units past it. The result: every success comes
to rest ~1.5 units from centre regardless of ordinal.

| success | logged | actually rested at |
|---|---|---|
| 1st | 1.05 | 1.59 |
| 2nd | 0.75 | 1.54 |
| 3rd | 0.45 | 1.50 |
| 4th | 0.15 | 1.49 |

Participants never saw the improvement they were supposed to see. **The exported
data looks correct** — `dist_from_center` reads the coerced target, not the drawn
ball — so nothing in the files reveals this. A null result on self-rating from
`two-prong/` data is uninformative rather than evidence against the hypothesis.

`two-prong-FixedTargets/` fixes it: the ball lands 3.0 units short of the target
(the VR `LANDING_OFFSET`) and rolls onto it, resting exactly there. Logged
position and drawn position are the same point, as in VR.

`two-prong/` is left untouched so nothing mid-collection changes underneath it.

## What's manipulated

The engine is a port of `NEW_ball_improvement.py` — same zone sizes, same
success-ordinal indexing, same failure-zone shift, failure side from throw
direction. Two deliberate differences:

**1. Both conditions use the same shrinking-ring formula**, so improvement and
stochastic differ *only* in the order of S/F trials.

**2. Coerced distances are fixed, not sampled** (in `two-prong-FixedTargets` and
both `Moving-*`):

| | t1 | t2 | t3 | t4 | t5 | t6 | t7 |
|---|---|---|---|---|---|---|---|
| improvement `FFFSSSS` | F 4.0 | F 3.5 | F 3.0 | S 1.05 | S 0.75 | S 0.45 | S 0.15 |
| stochastic `SSFFSFS` | S 1.05 | S 0.75 | F 4.0 | F 3.5 | S 0.45 | F 3.0 | S 0.15 |

Angle is still random; failure side still follows the pull. These are the
midpoints of the ranges previously sampled, so mean spacing is unchanged.

**Consequence for analysis:** every participant in a condition now sees the
identical sequence, so a slope fit to what they *saw* is a constant. Fit
`real_dist` instead — see below.

## Ghost ball (debug)

Add `?ghost=1` to any experiment URL to see a translucent ball on the
**uncoerced** path — where the throw would have gone unmanipulated — next to the
real one, with both distances on screen. Off by default; participant links never
have it.

Regardless of the flag, the uncoerced landing is logged every trial as
`real_x` / `real_y` / `real_dist`. **This is the only per-participant accuracy
signal left** now that coerced distances are fixed.

## Moving target

The ring sweeps while the participant aims and **stops at release**, so the ball
always flies to a stationary target. (While it kept moving, the coercion had to
curve the ball to catch it — which looks like exactly what it is.)

Distance from the ring centre is identical to the static version, which is what
makes the studies comparable. Ring travel is bounded so a coerced offset never
hits the field edge and gets truncated — without that guard, a 4.0 failure near
the wall came to rest at 3.5.

Per-trial ring state is logged. **Analysis needs `ring_fixed_x` / `ring_fixed_d`**
— a landing is an offset from that point, not from `(0, RING_D)`.

## Analysis

```bash
pip install pandas numpy statsmodels
python3 analysis/skill_slope.py DATA_DIR -o out/
```

`DATA_DIR` = a folder of the raw jsPsych CSVs from DataPipe. Fits each
participant's `real_dist` against trial number (negated, so positive = improving)
and regresses self-rating on that slope with condition as a covariate.

## Known issues

- **Moving-target speed is a guess.** `PERIOD_MS: 4200`, `AMPLITUDE: 3.2`. The
  ring crosses ~2 units in half a second — possibly too fast to aim at. Pilot it.
- **All versions share DataPipe `l4vuPmnrCh5F`.** The new folders need their own
  project before real participants, or data pools and assignment drifts.
- **Aim and power aren't independent.** `power` uses the full 2-D drag length, so
  pulling sideways adds power too — a confound in any slope fit to `real_dist`.
- **`fail_side` labels are mirrored** vs. the screen (they follow VR's frame).
- **`applyReleaseNoise()` is never called** — dead code, left documented.
- **Questionnaire drift:** `Improvement-*` ask perceived study purpose where
  `two-prong` asks the manipulation check, so suspicion isn't comparable and the
  exported `.txt` fields are renumbered.

