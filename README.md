# bt-webtask

Web port of the VR ball-throwing task. Social Learning Lab @ Stanford.

Each top-level folder is an independently deployable version; Pages serves each
from its own `index.html`.

| Folder | Conditions | What it is |
|---|---|---|
| `two-prong/` | improvement, stochastic | The original. **See the warning below before collecting with it.** |
| `two-prong-FixedTargets/` | improvement, stochastic | `two-prong` with fixed coerced distances, the VR roll behaviour, and the debug ghost ball. |
| `Improvement-LargeTarget/` | improvement | Visual ring radius 1.2; scoring zones unchanged. |
| `Improvement-SmallTarget/` | improvement | Visual ring radius 0.24 (80% smaller); scoring zones unchanged. |
| `Improvement-NoWobble/` | improvement, stochastic | Catapult sway/flex amplitudes zeroed. |
| `Moving-Linear/` | improvement, stochastic | Target ring sweeps left-right. **Speed not calibrated.** |
| `Moving-Circular/` | improvement, stochastic | Target ring orbits on the ground plane. **Speed not calibrated.** |
| `analysis/` | — | Per-participant skill-slope fit and self-rating models. |

## Warning about `two-prong/`

`two-prong/` has a defect that makes the improvement manipulation invisible on
screen. The displayed landing is re-derived from the participant's pull and then
pushed a further `ROLL_DIST` past the coerced target, so the ball comes to rest
roughly 1.5 world units from the centre on *every* success regardless of ordinal:

| success | logged distance | actually came to rest at | % outside the 1.2 ring |
|---|---|---|---|
| 1st | 1.05 | 1.59 | 66% |
| 2nd | 0.75 | 1.54 | 69% |
| 3rd | 0.45 | 1.50 | 75% |
| 4th | 0.15 | 1.49 | 81% |

(20,000 simulated throws per ordinal.) The logged column improves; the seen column
does not, and the *tightest* success is the most likely to look like a miss. The
exported data looks correct, which is why this is easy to miss — `dist_from_center`
reads from the coerced target, not from where the ball was drawn.

Data already collected with `two-prong/` is not wrong, but participants did not
see the improvement they were supposed to see, so a null result on self-rating is
uninformative rather than evidence against the hypothesis.

`two-prong-FixedTargets/` fixes this. `two-prong/` is left untouched here so
nothing mid-collection changes underneath it.

## Fidelity to the VR task

The coercion engine is a direct port of `NEW_ball_improvement.py`: zone sizes
`[1.2, 0.9, 0.6, 0.3]`, success-ordinal indexing, failure zones `[-5,-4]`/`[4,5]`
shifting 0.5 toward centre per failure (max 3.0), failure side chosen by throw
direction. Verified against the Python original on both trial structures.

### Deliberate deviations

1. **Shrinking-ring draw in both conditions.** Success targets come from the same
   formula in improvement and stochastic, so the two differ *only* in the temporal
   order of S/F trials — isolating trial order as the single manipulated variable.
2. **Fixed, not sampled targets** (`two-prong-FixedTargets` and the `Moving-*`
   variants). Distance from the ring centre is a constant per trial ordinal:

   | | t1 | t2 | t3 | t4 | t5 | t6 | t7 |
   |---|---|---|---|---|---|---|---|
   | improvement `FFFSSSS` | F 4.0 | F 3.5 | F 3.0 | S 1.05 | S 0.75 | S 0.45 | S 0.15 |
   | stochastic `SSFFSFS` | S 1.05 | S 0.75 | F 4.0 | F 3.5 | S 0.45 | F 3.0 | S 0.15 |

   Success angle is still random; failure side is still set by throw direction.
   The distances are the midpoints of the annuli previously sampled, so mean
   spacing is unchanged and only the per-trial variance is removed.

   **This removes all between-participant variance in the coerced outcome**, so a
   slope fit to what participants *saw* is a constant per condition. See
   `analysis/`.

### The roll, as in VR

On coerced trials the ball lands `LANDING_OFFSET` (3.0, the VR value) short of the
target along the throw line and rolls onto it, resting exactly there. Logged
position and displayed position are the same point, as they are in VR.

## Ghost ball (debug)

Append `?ghost=1` to any experiment URL to draw a translucent ball along the
**uncoerced** trajectory — where the throw would have gone with no manipulation —
alongside the real one, with both distances printed on screen. Off by default; a
participant link will never contain it.

Independently of the flag, the uncoerced landing is logged on every trial for
every participant as `real_x` / `real_y` / `real_dist`. Since the coerced
distances are fixed across participants, this counterfactual is the only
per-participant accuracy signal in the task.

## Moving target

One `ringPosAt(t)` drives both the renderer and the coercion.

**The ring stops at release.** It sweeps while the participant aims — that is
where the added difficulty and the release-timing demand live — and then holds
position, so the ball flies an ordinary arc to a stationary target. While the ring
kept travelling through the flight, the coercion had to bend the ball toward
wherever it ended up, and a visibly curving ball is exactly what makes a
participant suspect manipulation.

**The coerced distances are identical to the static version.** The engine hands
out an *offset* from the ring centre, so distance-from-centre is preserved even
though the centre moves. The one thing that can break it is the field clamp: with
the ring near a wall and the target offset further that way, `ring.x + offset.x`
leaves the drawable area and gets truncated, *shortening* the distance. Measured
before the guard existed, a 4.0 failure thrown to the same side as a ring at
x = ±3.2 came to rest **3.5** from centre. The ring's travel is therefore bounded
so a target at the largest offset the engine can request always fits
(`MAX_TARGET_OFFSET` = 4.0, so lateral amplitude caps at 2.7), derived from the
engine constants rather than hard-coded. Verified over 58,752 ring positions per
mode: zero deviations.

Per-trial ring state is logged (`ring_freeze`, `ring_fixed_x`, `ring_fixed_d`,
`ring_mode`, `ring_period_ms`, `ring_amplitude`, `ring_amplitude_effective`,
`ring_base_d`). **Analysis needs `ring_fixed_x/d`** — a landing is an offset from
that point, not from `(0, RING_D)`.

## Analysis

```bash
pip install pandas numpy statsmodels
python3 analysis/skill_slope.py DATA_DIR -o out/
```

`DATA_DIR` is a directory of the raw jsPsych CSVs DataPipe writes. Produces
`per_participant_slopes.csv` plus regressions of signed self-rating on the fitted
skill slope, with condition as a covariate. The slope is fit to `real_dist` and
negated, so positive means throws getting closer to centre. It also fits the
coerced outcome as a design check — within-condition variance there should be
exactly zero.

## Known issues

- **Moving-target speed is uncalibrated.** `PERIOD_MS: 4200` / `AMPLITUDE: 3.2`
  were never derived from anything. The ring crosses ~2 world units in half a
  second, which may be too fast to aim at deliberately. Pilot and tune.
- **All versions share DataPipe experiment `l4vuPmnrCh5F`.** The new folders need
  their own project before real participants, or their data lands in the same OSF
  project and balanced assignment drifts (`NUM_CONDITIONS` also differs per
  variant).
- **U trials roll forward past the natural landing.** VR instead decelerates the
  ball to a stop 3 m *short* of it. U is excluded from participant assignment, so
  this only matters if you run it.
- **`applyReleaseNoise()` is dead code** — defined, never called. Left documented
  rather than wired in, since jittering coerced targets would undo deviation 2.
- **`fail_side` labels are mirrored** relative to the screen. They follow VR's
  frame (facing −y, +x is the participant's left); the web camera puts +x on
  screen-right. Convention, not a bug.
- **Questionnaire drift.** The three `Improvement-*` variants ask perceived study
  purpose where `two-prong` asks the manipulation check, which renumbers the
  exported `.txt` fields and makes the suspicion measure non-comparable across
  arms.
- **Aim and power are not independent.** `power` uses the full 2-D drag length, so
  pulling sideways adds power as well as lateral error. Lateral and depth error
  are correlated through the input, which is a confound in any skill slope fit to
  `real_dist`.
