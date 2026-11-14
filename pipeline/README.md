# Offline data pipeline

Everything here runs once on a developer machine and writes compact files to `public/data/`.
Nothing in this folder ships to the browser.

## ephemeris/
`pip install de421 jplephem numpy` then `python pipeline/ephemeris/build_ephemeris.py`.
Rebuilds `public/data/ephemeris.bin` and `ephemeris.json`. No downloads needed — DE421 comes from PyPI.

## terrain/ (next stage)
Input: `data/lola/LDEM_80S_80MPP_ADJ.TIF` from NASA PGDA product 90 (Barker et al. 2023).
Outputs planned: height tiles for the 3D view and `public/data/horizons/<site>.json` horizon masks.
