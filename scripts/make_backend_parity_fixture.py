"""Run the REAL kuro_backend_fast recommendation stack on varied synthetic candidates and save inputs + outputs.

The KURO frontend's TypeScript port (src/services/backendScore.ts) must reproduce every number exactly.
Usage (from the KURO folder):
  python scripts/make_backend_parity_fixture.py kuro_backend_fast/kuro_backend_fast src/services/backend-parity.json
Then update PARITY_CASES in src/services/backendScore.ts if the number of cases changes.
"""
import json, random, sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, sys.argv[1])
from engines.mission_analysis.mission_analysis_engine import MissionAnalysisEngine  # noqa: E402
from engines.recommendation.recommendation_engine import RecommendationEngine  # noqa: E402

CODE = {"V": "VISIBLE", "B": "BLOCKED", "U": "UNCERTAIN"}
t0 = datetime(2027, 1, 1, tzinfo=timezone.utc)
rng = random.Random(20261115)


def runs_pattern(n, p_vis, mean_run, p_unc=0.0):
    out, cur = [], "V" if rng.random() < p_vis else "B"
    while len(out) < n:
        length = max(1, int(rng.expovariate(1 / mean_run)))
        st = "U" if rng.random() < p_unc else cur
        out.extend([st] * length)
        cur = "V" if rng.random() < p_vis else "B"
    return "".join(out[:n])


cases = []
# hand-picked edge cases
fixed = [
    ("always-both", "V" * 96, "V" * 96, 900, 2.0, None),
    ("never-sun", "B" * 96, "V" * 96, 900, 2.0, None),
    ("never-earth", "V" * 96, "B" * 96, 900, 2.0, None),
    ("all-dark-steep", "B" * 96, "B" * 96, 900, 20.0, None),
    ("no-slope", "V" * 60 + "B" * 36, "V" * 50 + "B" * 46, 900, None, None),
    ("slope-5-exact", "V" * 96, "VB" * 48, 900, 5.0, None),
    ("slope-15-exact", "VVB" * 32, "V" * 96, 900, 15.0, None),
    ("with-roughness", "V" * 70 + "B" * 26, "V" * 80 + "B" * 16, 900, 3.0, 0.1),
    ("rough-only", "V" * 70 + "B" * 26, "V" * 80 + "B" * 16, 900, None, 0.5),
    ("all-uncertain", "U" * 96, "U" * 96, 900, 3.0, None),
    ("one-sample", "V", "B", 900, 1.0, None),
    ("eighths", "V" * 5 + "B" * 3, "V" * 3 + "B" * 5, 1800, 4.5, None),   # percentages like 62.5 / 37.5
    ("long-dark-10d", "B" * 480 + "V" * 96, "V" * 576, 1800, 1.0, None),
    ("long-gap-24h", "V" * 200, "B" * 96 + "V" * 104, 900, 1.0, None),
]
for name, sun, earth, step, slope, rough in fixed:
    cases.append(dict(id=name, sun=sun, earth=earth, stepSeconds=step, slopeDeg=slope, roughnessM=rough))
# backend's own test_scoring.py patterns
N = 500
cases.append(dict(id="backend-A", sun="".join("V" if i % 100 < 60 else "B" for i in range(N)), earth="".join("V" if i % 100 < 60 else "B" for i in range(N)), stepSeconds=600, slopeDeg=3.0, roughnessM=0.1))
cases.append(dict(id="backend-B", sun="".join("V" if i % 100 < 60 else "B" for i in range(N)), earth="".join("V" if i % 100 >= 40 else "B" for i in range(N)), stepSeconds=600, slopeDeg=3.0, roughnessM=0.1))
cases.append(dict(id="backend-C", sun="".join("U" if i % 10 < 7 else "V" for i in range(N)), earth="".join("U" if i % 10 < 7 else "V" for i in range(N)), stepSeconds=600, slopeDeg=3.0, roughnessM=0.1))
# random cases like real stays (15 or 30 min steps, 7–120 days)
for k in range(60):
    step = rng.choice([900, 1800])
    days = rng.choice([7, 14, 30, 60, 120])
    n = days * 86400 // step
    slope = rng.choice([None, round(rng.uniform(0, 25), 3), round(rng.uniform(0, 8), 3)])
    rough = rng.choice([None, None, None, round(rng.uniform(0, 1.4), 3)])
    p_unc = rng.choice([0, 0, 0.05])
    cases.append(dict(id=f"random-{k}", sun=runs_pattern(n, rng.uniform(0, 1), rng.uniform(4, 200), p_unc),
                      earth=runs_pattern(n, rng.uniform(0, 1), rng.uniform(4, 200), p_unc), stepSeconds=step, slopeDeg=slope, roughnessM=rough))

mae = MissionAnalysisEngine()
terrain_cands, mission_cands = [], []
for c in cases:
    samples = [{"timestamp_utc": (t0 + timedelta(seconds=c["stepSeconds"] * i)).isoformat().replace("+00:00", "Z"),
                "sun": {"status": CODE[s]}, "earth": {"status": CODE[e]}} for i, (s, e) in enumerate(zip(c["sun"], c["earth"]))]
    mission_cands.append(mae.analyze_candidate({"candidate_id": c["id"], "candidate_name": c["id"], "region": "SP", "samples": samples}))
    metrics = {"slope": {}, "roughness": {}}
    if c["slopeDeg"] is not None:
        metrics["slope"]["20m"] = c["slopeDeg"]
    if c["roughnessM"] is not None:
        metrics["roughness"]["20m"] = c["roughnessM"]
    terrain_cands.append({"status": "completed", "candidate": {"candidate_id": c["id"], "candidate_name": c["id"], "region": "SP"}, "surface_metrics": metrics})

rec = RecommendationEngine(top_n=5).recommend({"status": "completed", "region": "SP", "candidates": terrain_cands},
                                               {"status": "completed", "candidates": mission_cands})
by_id = {c["candidate_id"]: c for c in rec["all_ranked_candidates"]}
for c in cases:
    r = by_id[c["id"]]
    c["expected"] = {
        "rank": r["rank"],
        "overall": r["ranking"]["overall_score"],
        "overallCompleteness": r["ranking"]["data_completeness_percentage"],
        "components": {k: {"score": r["scores"][k]["score"], "completeness": r["scores"][k]["data_completeness_percentage"]}
                       for k in ("terrain", "safety", "illumination", "communication", "mission")},
    }
json.dump({"generatedBy": "kuro_backend_fast RecommendationEngine 1.0.0 + MissionAnalysisEngine 1.0.0 (make_parity_fixture.py)",
           "cases": cases}, open(sys.argv[2], "w"), separators=(",", ":"))
print(len(cases), "cases written")
