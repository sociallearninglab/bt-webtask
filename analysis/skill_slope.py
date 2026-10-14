#!/usr/bin/env python3
"""
skill_slope.py — per-participant curve fit, then slope -> self-rating.

WHAT IT FITS, AND WHY THAT COLUMN
---------------------------------
Each participant throws 7 recorded trials. Two accuracy measures exist per trial:

  dist_from_center  the COERCED outcome — what they saw and what the manipulation
                    dictated. As of the fixed-target change this is identical for
                    every participant in a condition (improvement is always
                    4.0, 3.5, 3.0, 1.05, 0.75, 0.45, 0.15), so a slope fit to it
                    is a constant per condition and cannot predict anything
                    within one. It is fit here anyway, purely as a check that the
                    manipulation ran as designed.

  real_dist         the UNCOERCED counterfactual — where the throw would have
                    landed from their pull alone, computed on every trial and
                    logged whether or not the ghost ball was displayed. This is
                    the only per-participant accuracy signal in the task, so it
                    is what the reported skill slope is fit to.

SIGN CONVENTION
---------------
Raw OLS slope of distance on trial index is negative when someone is improving
(landing closer to center over time). That is confusing to read, so the reported
`skill_slope` is NEGATED: positive = improving, negative = getting worse, in
world units per trial.

SELF-RATING
-----------
Two questionnaire items are combined into one signed score:
    relative_skill in {better, worse, same}, magnitude in 1..10 (asked only if
    better/worse). signed_rating = +magnitude if better, -magnitude if worse,
    0 if same. Range -10..+10.
The direction item alone is also modelled, as an ordered/binary outcome.

USAGE
-----
    python3 skill_slope.py DATA_DIR [-o OUT_DIR]

DATA_DIR holds the raw jsPsych CSVs DataPipe writes (one per participant, the
`makeRawSaveTrial` file). The VR-format .txt files are not used — they are a
human-readable export, the CSV is the complete record.
"""

import argparse
import os
import sys
import glob

import numpy as np
import pandas as pd

MIN_TRIALS_FOR_FIT = 4          # need enough points for a slope to mean anything


# ----------------------------------------------------------------- loading
def load_participants(data_dir):
    """Read every CSV in data_dir and return a list of per-participant frames."""
    paths = sorted(glob.glob(os.path.join(data_dir, "*.csv")))
    if not paths:
        sys.exit(f"No CSV files found in {data_dir!r}")
    frames = []
    for p in paths:
        try:
            df = pd.read_csv(p, low_memory=False)
        except Exception as e:                                  # noqa: BLE001
            print(f"  ! skipping {os.path.basename(p)}: {e}", file=sys.stderr)
            continue
        df["_source_file"] = os.path.basename(p)
        frames.append(df)
    return frames


def _truthy(v):
    """jsPsych booleans survive the CSV round-trip as True/'true'/1."""
    return str(v).strip().lower() in ("true", "1", "t", "yes")


# ----------------------------------------------------------------- fitting
def ols_slope(x, y):
    """Least-squares slope and intercept, plus R^2. No scipy needed."""
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    ok = np.isfinite(x) & np.isfinite(y)
    x, y = x[ok], y[ok]
    if len(x) < 2 or np.allclose(x, x[0]):
        return np.nan, np.nan, np.nan, len(x)
    slope, intercept = np.polyfit(x, y, 1)
    pred = slope * x + intercept
    ss_res = float(np.sum((y - pred) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else np.nan
    return float(slope), float(intercept), r2, len(x)


def extract_one(df):
    """Pull one participant's slopes and self-rating out of their raw CSV."""
    if "trial_kind" not in df.columns:
        return None
    throws = df[df["trial_kind"] == "throw"].copy()
    if throws.empty:
        return None

    # recorded block only — practice/warmup throws are excluded from the fit
    if "recorded" in throws.columns:
        recorded = throws[throws["recorded"].map(_truthy)].copy()
    else:
        recorded = throws.copy()
    if recorded.empty:
        return None

    recorded = recorded.sort_values("trial_number")
    idx = recorded["trial_number"].astype(float).to_numpy()

    out = {
        "participant": recorded["participant"].iloc[0] if "participant" in recorded else None,
        "condition": recorded["condition"].iloc[0] if "condition" in recorded else None,
        "source_file": df["_source_file"].iloc[0],
        "n_recorded_throws": int(len(recorded)),
    }

    # --- the slope that matters: real (uncoerced) accuracy over trials ---
    if "real_dist" in recorded.columns:
        s, b, r2, n = ols_slope(idx, recorded["real_dist"])
        out.update(skill_slope=-s if np.isfinite(s) else np.nan,   # +ve = improving
                   skill_intercept=b, skill_r2=r2, skill_n=n,
                   real_dist_mean=float(pd.to_numeric(recorded["real_dist"],
                                                      errors="coerce").mean()))
    else:
        out.update(skill_slope=np.nan, skill_intercept=np.nan,
                   skill_r2=np.nan, skill_n=0, real_dist_mean=np.nan)
        out["_warn_no_real_dist"] = True

    # --- design check: the coerced outcome they actually saw ---
    if "dist_from_center" in recorded.columns:
        s, b, r2, n = ols_slope(idx, recorded["dist_from_center"])
        out.update(shown_slope=-s if np.isfinite(s) else np.nan, shown_r2=r2)
    else:
        out.update(shown_slope=np.nan, shown_r2=np.nan)

    # --- self-rating ---
    direction, magnitude = None, np.nan
    if "measure" in df.columns:
        d = df[df["measure"] == "relative_skill_direction"]
        if not d.empty and "relative_skill" in d.columns:
            direction = d["relative_skill"].dropna().iloc[-1] if d["relative_skill"].notna().any() else None
        m = df[df["measure"] == "relative_skill_magnitude"]
        if not m.empty and "magnitude" in m.columns and m["magnitude"].notna().any():
            magnitude = float(m["magnitude"].dropna().iloc[-1])

    if direction == "better":
        signed = magnitude if np.isfinite(magnitude) else np.nan
    elif direction == "worse":
        signed = -magnitude if np.isfinite(magnitude) else np.nan
    elif direction == "same":
        signed = 0.0
    else:
        signed = np.nan

    out.update(rating_direction=direction, rating_magnitude=magnitude,
               signed_rating=signed,
               rated_better=(1 if direction == "better" else 0) if direction else np.nan)

    # --- suspicion, as an exclusion flag ---
    if "measure" in df.columns:
        mc = df[df["measure"] == "manipulation_check"]
        if not mc.empty and "suspected" in mc.columns:
            out["suspected_manipulation"] = _truthy(mc["suspected"].dropna().iloc[-1]) \
                if mc["suspected"].notna().any() else np.nan
    return out


# ----------------------------------------------------------------- models
def run_models(tbl):
    """signed_rating ~ skill_slope (+ condition), and the binary direction model."""
    try:
        import statsmodels.api as sm
        import statsmodels.formula.api as smf
    except ImportError:
        print("\n[statsmodels not installed — per-participant slopes were still "
              "written; install it for the regressions:\n"
              "   pip install statsmodels --break-system-packages]\n")
        return

    d = tbl.dropna(subset=["skill_slope", "signed_rating"]).copy()
    if len(d) < 5:
        print(f"\n[only {len(d)} usable participants — skipping regressions]")
        return

    print("\n" + "=" * 70)
    print("MODEL 1  signed_rating ~ skill_slope")
    print("=" * 70)
    print(smf.ols("signed_rating ~ skill_slope", data=d).fit().summary().tables[1])

    if d["condition"].nunique() > 1:
        print("\n" + "=" * 70)
        print("MODEL 2  signed_rating ~ skill_slope + condition")
        print("   (does real skill predict self-rating once the narrative is held fixed?)")
        print("=" * 70)
        print(smf.ols("signed_rating ~ skill_slope + C(condition)",
                      data=d).fit().summary().tables[1])

        print("\n" + "=" * 70)
        print("MODEL 3  signed_rating ~ skill_slope * condition")
        print("   (does skill matter more in one narrative than the other?)")
        print("=" * 70)
        print(smf.ols("signed_rating ~ skill_slope * C(condition)",
                      data=d).fit().summary().tables[1])

    b = tbl.dropna(subset=["skill_slope", "rated_better"]).copy()
    if len(b) >= 10 and b["rated_better"].nunique() > 1:
        print("\n" + "=" * 70)
        print("MODEL 4  P(rated 'better') ~ skill_slope  [logit]")
        print("=" * 70)
        try:
            print(smf.logit("rated_better ~ skill_slope", data=b).fit(disp=0)
                  .summary().tables[1])
        except Exception as e:                                   # noqa: BLE001
            print(f"  logit did not converge: {e}")


# ----------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("data_dir", help="directory of raw jsPsych CSVs")
    ap.add_argument("-o", "--out-dir", default=".", help="where to write outputs")
    args = ap.parse_args()

    frames = load_participants(args.data_dir)
    rows = [r for r in (extract_one(f) for f in frames) if r]
    if not rows:
        sys.exit("No participants with throw trials found.")
    tbl = pd.DataFrame(rows)

    os.makedirs(args.out_dir, exist_ok=True)
    out_csv = os.path.join(args.out_dir, "per_participant_slopes.csv")
    tbl.to_csv(out_csv, index=False)

    print(f"Parsed {len(tbl)} participants from {args.data_dir}")
    print(f"Wrote  {out_csv}\n")

    if tbl.get("_warn_no_real_dist", pd.Series(dtype=bool)).any():
        n = int(tbl["_warn_no_real_dist"].fillna(False).sum())
        print(f"!! {n} file(s) have no real_dist column. Those were collected before\n"
              "   the uncoerced landing was logged, so no skill slope can be fit for\n"
              "   them — only the condition-level shown_slope.\n")

    print("-" * 70)
    print("SKILL SLOPE  (fit to real_dist; +ve = throws getting closer to centre)")
    print("-" * 70)
    print(tbl.groupby("condition")["skill_slope"]
            .agg(["count", "mean", "std", "min", "max"]).round(3).to_string())

    print("\n" + "-" * 70)
    print("SHOWN SLOPE  (fit to dist_from_center — design check)")
    print("   With fixed targets this should be IDENTICAL within a condition.")
    print("   Any spread here means some sessions ran a different build.")
    print("-" * 70)
    print(tbl.groupby("condition")["shown_slope"]
            .agg(["count", "mean", "std"]).round(4).to_string())

    print("\n" + "-" * 70)
    print("SELF-RATING")
    print("-" * 70)
    print(pd.crosstab(tbl["condition"], tbl["rating_direction"]).to_string())
    print()
    print(tbl.groupby("condition")["signed_rating"]
            .agg(["count", "mean", "std"]).round(2).to_string())

    d = tbl.dropna(subset=["skill_slope", "signed_rating"])
    if len(d) >= 3:
        print(f"\nPearson r(skill_slope, signed_rating) = "
              f"{d['skill_slope'].corr(d['signed_rating']):.3f}   (n={len(d)})")

    run_models(tbl)


if __name__ == "__main__":
    main()
