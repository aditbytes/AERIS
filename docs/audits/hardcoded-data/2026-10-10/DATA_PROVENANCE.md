# Data provenance and scientific validity

Scope is local revision 7cf0572049d69b550cbb42d7e74cf5472d521793 on 2026-10-10.
Source labels and Git capture commits are evidence of repository provenance, not
independent authentication of every external observation. No remote AWS objects,
upstream raw observation archives or current service datasets were downloaded.
Exact hashes, bytes, line counts and metadata are in DATASET_INVENTORY.json and
FILE_INVENTORY.csv. Ten distinct data/live datasets occupy 23,307,913 bytes and
1,322,321 physical lines. Seven web copies add 3,617,359 bytes but zero independent data.
These ten files contain 810,968 JSON scalar leaf entries and 230,164 coordinate positions
under the explicit counting rules; coordinates include repeated polygon ring closure.

## Operational and reference datasets

| Dataset | Exact records | Origin and units | Timing and limits |
|---|---:|---|---|
| fires.json |227 detections | Claimed NASA FIRMS VIIRS NOAA21/NOAA20/SNPP NRT; normalized WGS84 coordinates, FRP MW, brightness K | Captured 2026-10-07T18:41:50.671283Z; acquisition 07:44–08:41UTC that day. Thermal detections are not independently identified physical fires or PM2.5 emissions. |
| aqi.json |60 stations; 59 PM2.5; 0 PM10 | Claimed OpenAQ; PM2.5µg/m³; AQI is computed by project CPCB-like PM2.5 subindex logic | Captured 2026-10-07T18:58:03.921942Z; observations 2026-09-30T18:58:57Z–2026-10-07T08:00:00Z. All 59 PM2.5 readings are stale by the audit date. Range 1.1–235µg/m³. |
| wind.json |323 grid points; 15,504 hourly records | Claimed Open-Meteo GFS numerical forecast; wind m/s, direction degrees FROM, PBLH m | Captured 2026-10-07T18:37:57.090632Z; stored valid labels2026-10-06T18:30:00Z–2026-10-08T17:30:00Z. This is forecast data, not measured wind. Historical half-hour-label timezone concern remains unverified without original response. |
| sites.geojson |3,132 point features | OSM/Overpass school and hospital references, WGS84; capacity/beds only when supplied | Captured 2026-10-07T18:49:16.377954Z. No invented default occupancy; missing capacity remains null. Not a census or verified current occupancy. |
| population.json |222,792 cells | Claimed WorldPop India 2020, 1 km aggregate, persons/cell; DOI 10.5258/SOTON/WP00647, CC BY4.0 declared in payload | Generated 2026-10-09T01:28:11.818637Z. Source year 2020 remains 2020; capture date does not make it a 2026 population count. Source raster absent locally. |
| india-boundary.geojson |1 LineString; 2,326 positions | Fixed geographic reference; no author/source/license/date embedded | Actual external origin and permission unavailable from the payload/history alone. It is not established as an authoritative legal boundary. |
| sources.json |10 candidates; 215 included detections | Legacy heuristic model output derived from FIRMS; normalized strength/confidence are not measured emission mass or probabilities | Generated 2026-10-08T14:52:16.603976Z. Current detector replays samecapture as 22 candidates/151 included fires, not these archived outputs. |
| corridor.geojson |50 features: 40 bands + 10 centrelines | Legacy simplified model output; concentrations/risk use removed fixed-floor formulas | Generated 2026-10-08T14:52:16.643513Z; declared forecast start 2026-10-07T18:00:00Z. Snapshot has no reliable current algorithm/calibration binding. |
| ranked_sites.json |444 rankings | Derived site risk/ETA/band-peak increment and population intersection | Generated 2026-10-09T02:05:47.935603Z. All 444 increments are 15 ug/m3 and occupancies null. Estimate 7,132,123; low 7,132,123; high 14,488,106 are threshold sensitivity outputs, not confidence intervals. |
| actions.json |8 site + 3 authority actions | Generated rule recommendations and summary, not observations or verified official orders | Generated 2026-10-09T06:00:03.651716Z. Contains canned recommendations and deadline/ETA clamps inherited from rules code. |

## Source-to-user paths

AQI: `ingest/aqi/fetch_aqi.py` requests latest OpenAQ sensor records, normalizes PM
and observed_at, computes a PM2.5 subindex, and labels records OpenAQ. The ingestion
handler/storage publish JSON; API load adds publication freshness; frontend Zod
validates the payload; dataContext derives averages; AqiKpiCard/AqiForecast12h and
MapExplorer render AQI. Their observed-AQI wording hides the project calculation.
Original units, averaging periods and provider/license identifiers are not retained
sufficiently to establish an official 24-hour multi-pollutant AQI. Decimal breakpoint
gaps can map 30.05, 60.05, 90.05, 120.05, and 250.05 to AQI 500 (Severe). These are controlled probes,
not claims that such values exist in the real capture.

Observed PM2.5 map: same validated station readings feed `heatmap.ts` and
`useObservationHeatmap.ts`, then a MapLibre GeoJSON fill layer in both map views.
The runtime creates 28 occupied 0.1 degree cells from 59 qualifying readings; it selects
the newest valid record per station, preserves zero, reports timestamps/provenance,
and leaves unsampled cells empty. This is spatial station aggregation, not
interpolation, a continuous exposure field, a health classification or validation
of the plume. Mixed observation times and missing averaging/quality metadata limit it.

Fire/model path: FIRMS fetcher -> bronze/storage -> pipeline publish/detect ->
source clustering -> physics corridor -> exposure rank -> agent -> gold/API ->
browser. API missing storage produces HTTP 404/no_data and prior browser data is retained
with stale/error disclosure, not replaced by mocks. However FIRMS catches all
upstream errors and can publish a freshly timestamped empty capture, contradicting
the unconditional no-write-on-failure claim. Rules agent also inserts unsupported
summary/action values. Distinguish these paths from the correct API fallback behavior.

Default browser snapshot mode is selected when VITE_API_BASE_URL is absent; configured
API failure does not silently switch to snapshots. Seven publication files are
byte-identical to their data/live originals. Data/contracts preserve some provenance,
but outputs lack a reproducible source-version/parameter/input-hash chain.

Facility ranking intersects polygons, takes earliest containing band start and maximum
band concentration, then applies fixed vulnerability/ETA/occupancy weights. It does
not evaluate receptor-time puff concentrations. The exposed-population estimate
counts 2020 grid cells inside risk-qualified bands; low/high vary the risk threshold.
Current scientific documentation calls this a heuristic. Threshold changes can
materially change totals without supplying probabilistic uncertainty.

## Calibration, ML, examples and historical remediation

Current physics defaults are documented assumptions: initial sigma 2000 m, spread
coefficient 1000 m/sqrt(hour), lifetime 24 h and nominal strength-one concentration scale
1e12µg, with further grid/wind/kernel/risk safeguards. Detector confidence/class/type
and exposure scores are heuristic. No valid params.json or eligible multi-event
station/background history exists. Calibration target/holdout metrics are unavailable,
not zero error. Calibration gates reject mathematical fixtures as deployable fits.

Optional surrogate training uses BASELINE_SIMULATED labels from the same physics,
fixed seed 42, 1,400 scenarios and 11,200 point labels. Ignored dataset 6,397,544 bytes,
metadata 90,706 bytes and model 792,417 bytes were inspected as data/metadata only; the
pickle was never loaded. Evaluation reports describe teacher reproduction, not
real-observation forecast accuracy. Lambda staging excludes training, and the
production corridor directly calls physics. Optional inference exists but is not
the normal production corridor path. Test and browser fixtures are confined to tests.

An earlier population generator used city-distance/sine synthetic densities and was
removed before the current WorldPop snapshot. Introduction/removal evidence is
recorded separately in HISTORICAL_FINDINGS.csv; it does not make current population
synthetic. Old source/corridor formulas were removed from current code but their
archived output files remain. Reprocessing one capture is not new observed history.

## Licenses and external checks

The repository MIT LICENSE covers project software; it does not automatically
relicense external datasets. [OSM copyright/license](https://www.openstreetmap.org/copyright)
states ODbL and attribution obligations; the facility payload includes OSM attribution.
[OpenAQ terms](https://docs.openaq.org/about/terms) require OpenAQ attribution and
review of underlying provider terms; [license metadata](https://docs.openaq.org/resources/licenses)
supports provider-specific restrictions that normalization currently loses.
[Open-Meteo terms](https://open-meteo.com/en/terms) distinguish free-service use
conditions from its CC BY4.0 data license. Payload source text is not a full license
manifest. WorldPop CC BY4.0/DOI/year are documented locally; exact original raster
and dataset-specific license were not independently retrieved. Boundary licensing
is unknown. [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) describes satellite
active-fire/thermal-anomaly products; NRT data and FRP are not atmospheric source attribution.
[CPCB index description](https://www.cpcb.nic.in/displaypdf.php?id=bWFudWFsLW1vbml0b3JpbmcvQVFJX05BTVBfUmVwX01heTIwMTYucGRm)
describes pollutant subindices and averaging requirements; latest PM2.5 alone does not
establish a current official composite index. External documentation was checked
on the audit date; current source files and captures were not altered.

No model was calibrated, no scientific coefficient changed, no data fabricated or
downloaded, and no successful deployment or current AWS/live-feed behavior is claimed.
