"""KURO ephemeris table builder.

Produces public/data/ephemeris.bin + ephemeris.json: Sun and Earth vectors as seen
from the Moon's centre, expressed in the Moon Mean-Earth/Polar-Axis frame (MOON_ME)
of JPL DE421 -- the same frame the LOLA polar products are delivered in.

Chain:  DE421 (PyPI `de421`, read with jplephem)
        -> barycentric Sun / Earth / Moon (ICRF, km), Sun corrected for light-time
        -> DE421 lunar libration Euler angles (phi, theta, psi): ICRF -> Moon principal axes (PA)
        -> constant DE421 PA -> ME rotation (Williams et al. 2008, JPL IOM 335-JW,DB,WF-20080314-001)
Not modelled: stellar aberration (~20 arcsec), Earth light-time (~1.3 s). Both << Sun's 0.27 deg radius.

Usage: python build_ephemeris.py [out_dir]
"""
import json, sys, os
import numpy as np
import de421
from jplephem import Ephemeris

AU_KM = 149597870.700
C_KM_S = 299792.458
ARCSEC = np.pi / 648000.0
JD_START = 2439126.5      # 1966-01-01T00:00 TT
JD_END = 2469807.5        # 2050-01-01T00:00 TT
STEP_DAYS = 0.5

def rx(a):
    c, s = np.cos(a), np.sin(a); o, z = np.ones_like(c), np.zeros_like(c)
    return np.array([[o, z, z], [z, c, s], [z, -s, c]])
def ry(a):
    c, s = np.cos(a), np.sin(a); o, z = np.ones_like(c), np.zeros_like(c)
    return np.array([[c, z, -s], [z, o, z], [s, z, c]])
def rz(a):
    c, s = np.cos(a), np.sin(a); o, z = np.ones_like(c), np.zeros_like(c)
    return np.array([[c, s, z], [-s, c, z], [z, z, o]])

PA_TO_ME = (rx(np.float64(-0.30 * ARCSEC)) @ ry(np.float64(-78.56 * ARCSEC)) @ rz(np.float64(-67.92 * ARCSEC)))

def moon_vectors(eph, jd_tdb, frame="ME"):
    """Return (sun_vec_AU, earth_vec_km) from Moon centre in the Moon-fixed frame. jd_tdb: 1-D array."""
    jd = np.atleast_1d(np.asarray(jd_tdb, dtype=np.float64))
    emb = eph.position("earthmoon", jd)
    mgeo = eph.position("moon", jd)
    earth = emb - mgeo * eph.earth_share
    moon = earth + mgeo
    lt = np.linalg.norm(eph.position("sun", jd) - moon, axis=0) / C_KM_S / 86400.0
    sun = eph.position("sun", jd - lt)          # one light-time iteration is ample (Sun moves ~1e-3 km/s)
    s_icrf = sun - moon
    e_icrf = earth - moon
    phi, theta, psi = eph.position("librations", jd)
    R = np.einsum("ijn,jkn,kln->iln", rz(psi), rx(theta), rz(phi))   # ICRF -> PA
    if frame == "ME":
        R = np.einsum("ij,jkn->ikn", PA_TO_ME, R)
    s = np.einsum("ijn,jn->in", R, s_icrf) / AU_KM
    e = np.einsum("ijn,jn->in", R, e_icrf)
    return s, e

def main(out_dir):
    eph = Ephemeris(de421)
    n = int(round((JD_END - JD_START) / STEP_DAYS)) + 1
    jd = JD_START + STEP_DAYS * np.arange(n)
    out = np.empty((n, 6), dtype=np.float32)
    for a in range(0, n, 4096):
        s, e = moon_vectors(eph, jd[a:a + 4096])
        out[a:a + 4096, 0:3] = s.T
        out[a:a + 4096, 3:6] = e.T
    os.makedirs(out_dir, exist_ok=True)
    out.tofile(os.path.join(out_dir, "ephemeris.bin"))
    meta = {
        "format": "float32 little-endian, 6 values per sample: sunX,sunY,sunZ (AU), earthX,earthY,earthZ (km)",
        "origin": "Moon centre", "frame": "MOON_ME (DE421 mean Earth / polar axis)",
        "ephemeris": "JPL DE421 (PyPI de421 2008.1) incl. DE421 lunar librations",
        "timeScale": "TT (treated as TDB; difference < 2 ms)",
        "jdStart": JD_START, "stepDays": STEP_DAYS, "count": n,
        "corrections": {"sunLightTime": True, "stellarAberration": False, "earthLightTime": False},
        "interpolation": "Catmull-Rom cubic between samples; never extrapolate",
        "references": ["Folkner, Williams & Boggs (2009) JPL IPN PR 42-178 (DE421)",
                       "Williams, Boggs & Folkner (2008) DE421 Lunar Orbit, Physical Librations, and Surface Coordinates"],
    }
    json.dump(meta, open(os.path.join(out_dir, "ephemeris.json"), "w"), indent=1)
    print("wrote", n, "samples,", out.nbytes, "bytes")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "public", "data"))
