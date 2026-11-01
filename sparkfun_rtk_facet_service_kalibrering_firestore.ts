/**
 * SparkFunFacetService.ts
 * 
 * Komplett kärnmodul för Sparbanksspåret Råda (Lidköping) i `snowgun-forecast`.
 * Innehåller:
 * 1. Anläggningskonfiguration (20 brunnar, 8.5m effektiv slangradie, Brunn 7 väderstationsnotering).
 * 2. Lokal 1x1m Grid-projektion med Brunn 7 som origo.
 * 3. NMEA $GNGGA-parser (extraherar RTK Fix Quality, HDOP, MSL-höjd, Geoid-separation & körriktning/heading).
 * 4. 3-stegs Kalibrerings-Wizard med RTK Fixed & stillastående-spärr (Brunn 7 -> Mark bredvid -> Monterad).
 * 5. Stöd för alla 4 mät-typer: 'bare_ground', 'planning', 'bed', 'track' (inkl. faktisk spårlängd).
 * 6. 3D-karthjälpare för MapLibre GL (`fill-extrusion` 3D-voxels, 8.5m slangcirklar & 8m tvärsnittsprofil).
 */

// ============================================================================
// 1. TYPER & ANLÄGGNINGSKONFIGURATION (SPARBANKSSPÅRET RÅDA)
// ============================================================================

export type MeasurementMode = 'bare_ground' | 'planning' | 'bed' | 'track';

export interface WellNode {
  id: number;
  name: string;
  lat: number;
  lng: number;
  lidElevationM?: number;
  hasWeatherStation?: boolean;
  useWindSensor?: boolean;
  weatherStationNotes?: string;
  hoseLengthNominalM: number;
  hoseReachEffectiveM: number; // Praktisk räckvidd pga djupa brunnar (8-9m)
}

export interface EquipmentPreset {
  id: 'atv_tracks' | 'atv_wheels' | 'dozer_blade' | 'track_sled' | 'skis_handheld';
  name: string;
  defaultMeasurementMode: MeasurementMode;
  antennaHeightM: number;
  minSafeSnowCm: number;
  targetSnowCm: number;
  lastCalibratedAt?: number;
}

export const RADA_EQUIPMENT_PRESETS: EquipmentPreset[] = [
  {
    id: 'atv_tracks',
    name: 'Bandgående Fyrhjuling (Snö)',
    defaultMeasurementMode: 'bed',
    antennaHeightM: 1.22,
    minSafeSnowCm: 15,
    targetSnowCm: 35,
  },
  {
    id: 'atv_wheels',
    name: 'Fyrhjuling på hjul (Barmark)',
    defaultMeasurementMode: 'bare_ground',
    antennaHeightM: 1.15,
    minSafeSnowCm: 0,
    targetSnowCm: 0,
  },
  {
    id: 'dozer_blade',
    name: 'Schaktblad (Magnetfot)',
    defaultMeasurementMode: 'planning',
    antennaHeightM: 0.45,
    minSafeSnowCm: 15,
    targetSnowCm: 40,
  },
  {
    id: 'track_sled',
    name: 'Spårsläde (2 + Skejt + 2)',
    defaultMeasurementMode: 'track',
    antennaHeightM: 0.20,
    minSafeSnowCm: 18,
    targetSnowCm: 35,
  },
  {
    id: 'skis_handheld',
    name: 'Skidor / Ryggsäck i spår',
    defaultMeasurementMode: 'track',
    antennaHeightM: 1.65,
    minSafeSnowCm: 15,
    targetSnowCm: 30,
  },
];

export const RADA_FACILITY_CONFIG = {
  facilityId: 'rada_sparbankssparet',
  facilityName: 'Sparbanksspåret Råda',
  location: 'Rådåsgården, Lidköping',
  originWellId: 7,
  origin: { lat: 58.503781, lng: 13.087922 }, // Brunn 7 är origo (0,0) i vårt lokala meter-grid
  sweposNearestStation: {
    name: 'Swepos Lidköping',
    lat: 58.502074,
    lng: 13.128938,
    baselineKm: 2.4,
  },
  trackWidthMeters: 8.0,
  trackLayoutDescription:
    '8m bred gata (bredare i kurvor). Vid god snötillgång: 2 klassiska + skejtbädd + 2 klassiska. Motsols varv med vändslingor vid Brunn 1 och Brunn 16 (Klockan).',
  defaultHoseNominalM: 10.0,
  defaultHoseEffectiveM: 8.5, // Djupa brunnar + styv slang ger 8-9m faktisk räckvidd
  defaultHoseMinM: 8.0,
  defaultHoseMaxM: 9.0,
  recommendedSurveySpeedKmh: { min: 4, max: 10 },
  wells: [
    { id: 1, name: 'Brunn 1 (Söder / Spårdelning & Vändslinga)', lat: 58.500038, lng: 13.088891, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 2, name: 'Brunn 2', lat: 58.500810, lng: 13.088443, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 3, name: 'Brunn 3', lat: 58.501464, lng: 13.088295, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 4, name: 'Brunn 4', lat: 58.502066, lng: 13.088121, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 5, name: 'Brunn 5', lat: 58.502645, lng: 13.087593, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 6, name: 'Brunn 6', lat: 58.503150, lng: 13.088064, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    {
      id: 7,
      name: 'Brunn 7 (Väderstation)',
      lat: 58.503781,
      lng: 13.087922,
      hasWeatherStation: true,
      useWindSensor: false, // VIKTIGT: Vindmätaren är ej pålitlig!
      weatherStationNotes:
        'Håller systemets väderstation (temp/fukt OK). OBS: Vindmätare ej pålitlig – använd SMHI/extern prognos för vind.',
      hoseLengthNominalM: 10,
      hoseReachEffectiveM: 8.5,
    },
    { id: 8, name: 'Brunn 8', lat: 58.504247, lng: 13.087730, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 9, name: 'Brunn 9', lat: 58.504722, lng: 13.087461, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 10, name: 'Brunn 10', lat: 58.505265, lng: 13.087402, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 11, name: 'Brunn 11', lat: 58.505641, lng: 13.086717, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 12, name: 'Brunn 12', lat: 58.506026, lng: 13.086323, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 13, name: 'Brunn 13', lat: 58.506739, lng: 13.086040, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 14, name: 'Brunn 14', lat: 58.506874, lng: 13.087089, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 15, name: 'Brunn 15', lat: 58.507007, lng: 13.088262, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 16, name: 'Brunn 16 (Klockan / Spårdelning)', lat: 58.506981, lng: 13.089118, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 17, name: 'Brunn 17 (Klockan)', lat: 58.506829, lng: 13.090311, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 18, name: 'Brunn 18 (Klockan)', lat: 58.507088, lng: 13.090475, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 19, name: 'Brunn 19 (Klockan Nordost / Vändslinga)', lat: 58.507521, lng: 13.089579, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
    { id: 20, name: 'Brunn 20', lat: 58.503410, lng: 13.086911, hoseLengthNominalM: 10, hoseReachEffectiveM: 8.5 },
  ] as WellNode[],
};

// ============================================================================
// 2. RTK POSITIONS-, KALIBRERINGS-, 3D- & GRID-TYPER
// ============================================================================

export type RtkFixQuality = 0 | 1 | 2 | 4 | 5;

export interface FacetPositionReading {
  timestamp: number;
  lat: number;
  lng: number;
  altitudeMslM: number;
  geoidSeparationM: number;
  ellipsoidHeightM: number;
  fixQuality: RtkFixQuality;
  fixLabel: 'RTK_FIXED' | 'RTK_FLOAT' | 'DGPS' | 'SINGLE_GPS' | 'NO_FIX';
  satellites: number;
  hdop: number;
  estimatedVerticalAccuracyM: number;
  speedMetersPerSec: number;
  headingDeg: number; // 0 = Norr, 90 = Öst (används för 3D-kamerarotation & 8m tvärsnitt)
  isStationary: boolean;
  source: 'BLE_NMEA' | 'SERIAL_NMEA' | 'MOCK_GEOLOCATION' | 'SIMULATOR' | 'SD_LOG';
  grid: {
    xMeters: number;
    yMeters: number;
    gx: number;
    gy: number;
    key: string;
  };
}

export interface BareGroundCell {
  key: string;
  gx: number;
  gy: number;
  zGroundM: number;
  samples: number;
  interpolated?: boolean;
  updatedAt: number;
}

export interface SnowLayerCell {
  key: string;
  gx: number;
  gy: number;
  zSnowM: number;
  snowDepthCm: number;
  mode: Exclude<MeasurementMode, 'bare_ground'>;
  nearestWellId: number;
  updatedAt: number;
}

export interface TrackLinePoint {
  lat: number;
  lng: number;
  snowDepthCm: number;
  timestamp: number;
}

export type SnowStatusZone = 'CRITICAL_SHALLOW' | 'THIN_BASE' | 'OPTIMAL_TARGET' | 'SNOW_PILE';

export const SNOW_DEPTH_COLORS: Record<SnowStatusZone, string> = {
  CRITICAL_SHALLOW: '#EF4444', // Röd (< 15 cm)
  THIN_BASE: '#F59E0B',        // Gul (15 - 30 cm)
  OPTIMAL_TARGET: '#10B981',   // Grön (30 - 60 cm)
  SNOW_PILE: '#3B82F6',        // Blå (> 60 cm / Kanonhög)
};

export interface SnowDepthResult {
  gridKey: string;
  mode: MeasurementMode;
  snowDepthMeters: number;
  snowDepthCm: number;
  groundElevationM: number;
  snowSurfaceElevationM: number;
  zone: SnowStatusZone;
  colorHex: string;
  nearestWellId: number;
  distanceToNearestWellM: number;
  withinHoseReach: boolean;
  activeTrackLengthMeters: number;
}

export interface CrossSectionSample {
  offsetMeters: number; // -4m (vänster kant) till +4m (höger kant)
  gridKey: string;
  groundElevationM: number | null;
  snowSurfaceElevationM: number | null;
  snowDepthCm: number | null;
  colorHex: string;
}

export interface CalibrationWizardState {
  well7ReferenceZ: number | null; // Låst master-Z på Brunn 7-locket
  sessionZOffsetM: number;        // Dagens offset mot Brunn 7-locket
  step2GroundZ: number | null;    // Steg 2: Uppmätt mark/snöyta bredvid fordonet
  step3MountedZ: number | null;   // Steg 3: Uppmätt Z när pucken sitter på fordonet
  activeAntennaHeightM: number;   // Automatiskt uträknad monteringshöjd (step3 - step2)
  canCaptureStep: boolean;        // True endast om RTK Fixed (4) + stillastående (<0.1 m/s)
  stabilitySampleCount: number;
}

// ============================================================================
// 3. LOKAL PROJEKTION, 3D GEOJSON-BYGGARE & NMEA $GNGGA PARSER
// ============================================================================

const METERS_PER_DEG_LAT = 111395; // Vid 58.503° N
const METERS_PER_DEG_LNG = 58210;  // Vid 58.503° N

export function projectToRadaGrid(lat: number, lng: number, cellSizeM = 1.0) {
  const xMeters = (lng - RADA_FACILITY_CONFIG.origin.lng) * METERS_PER_DEG_LNG;
  const yMeters = (lat - RADA_FACILITY_CONFIG.origin.lat) * METERS_PER_DEG_LAT;
  const gx = Math.floor(xMeters / cellSizeM);
  const gy = Math.floor(yMeters / cellSizeM);
  return {
    xMeters,
    yMeters,
    gx,
    gy,
    key: `${gx}_${gy}`,
  };
}

export function gridCellToLatLng(gx: number, gy: number, cellSizeM = 1.0) {
  const centerX = (gx + 0.5) * cellSizeM;
  const centerY = (gy + 0.5) * cellSizeM;
  return {
    lat: RADA_FACILITY_CONFIG.origin.lat + centerY / METERS_PER_DEG_LAT,
    lng: RADA_FACILITY_CONFIG.origin.lng + centerX / METERS_PER_DEG_LNG,
  };
}

/**
 * Returnerar de 4 hörnen för en 1x1m-ruta i [lng, lat] för MapLibre GL 3D `fill-extrusion`.
 */
export function getGridCellPolygonCoords(gx: number, gy: number, cellSizeM = 1.0): number[][][] {
  const minX = gx * cellSizeM;
  const maxX = (gx + 1) * cellSizeM;
  const minY = gy * cellSizeM;
  const maxY = (gy + 1) * cellSizeM;

  const minLat = RADA_FACILITY_CONFIG.origin.lat + minY / METERS_PER_DEG_LAT;
  const maxLat = RADA_FACILITY_CONFIG.origin.lat + maxY / METERS_PER_DEG_LAT;
  const minLng = RADA_FACILITY_CONFIG.origin.lng + minX / METERS_PER_DEG_LNG;
  const maxLng = RADA_FACILITY_CONFIG.origin.lng + maxX / METERS_PER_DEG_LNG;

  return [[
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ]];
}

export function classifySnowDepthZone(snowDepthCm: number, minSafeCm = 15): SnowStatusZone {
  if (snowDepthCm < minSafeCm) return 'CRITICAL_SHALLOW';
  if (snowDepthCm < 30) return 'THIN_BASE';
  if (snowDepthCm <= 60) return 'OPTIMAL_TARGET';
  return 'SNOW_PILE';
}

function parseNmeaCoord(raw: string, hemisphere: string): number {
  if (!raw || !hemisphere) return NaN;
  const dotIndex = raw.indexOf('.');
  if (dotIndex < 2) return NaN;
  const degDigits = dotIndex - 2;
  const degrees = parseInt(raw.slice(0, degDigits), 10);
  const minutes = parseFloat(raw.slice(degDigits));
  let decimal = degrees + minutes / 60.0;
  if (hemisphere === 'S' || hemisphere === 'W') {
    decimal = -decimal;
  }
  return decimal;
}

function verifyNmeaChecksum(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!trimmed.startsWith('$')) return false;
  const starIdx = trimmed.indexOf('*');
  if (starIdx === -1) return true;
  const payload = trimmed.slice(1, starIdx);
  const expectedHex = trimmed.slice(starIdx + 1, starIdx + 3).toUpperCase();
  let xor = 0;
  for (let i = 0; i < payload.length; i++) {
    xor ^= payload.charCodeAt(i);
  }
  const calculatedHex = xor.toString(16).toUpperCase().padStart(2, '0');
  return calculatedHex === expectedHex;
}

export function parseNmeaGga(
  rawLine: string,
  source: FacetPositionReading['source'] = 'BLE_NMEA',
  prevReading: FacetPositionReading | null = null,
  cellSizeM = 1.0
): FacetPositionReading | null {
  const line = rawLine.trim();
  if (!line.startsWith('$GNGGA') && !line.startsWith('$GPGGA')) {
    return null;
  }
  if (!verifyNmeaChecksum(line)) {
    return null;
  }

  const cleanLine = line.split('*')[0];
  const parts = cleanLine.split(',');
  if (parts.length < 13) return null;

  const lat = parseNmeaCoord(parts[2], parts[3]);
  const lng = parseNmeaCoord(parts[4], parts[5]);
  const fixRaw = parseInt(parts[6], 10);
  const satellites = parseInt(parts[7], 10) || 0;
  const hdop = parseFloat(parts[8]) || 99.9;
  const altitudeMslM = parseFloat(parts[9]);
  const geoidSeparationM = parseFloat(parts[11]) || 0;

  if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(altitudeMslM)) {
    return null;
  }

  const fixQuality: RtkFixQuality =
    fixRaw === 4 ? 4 : fixRaw === 5 ? 5 : fixRaw === 2 ? 2 : fixRaw === 1 ? 1 : 0;

  const fixLabelMap: Record<RtkFixQuality, FacetPositionReading['fixLabel']> = {
    4: 'RTK_FIXED',
    5: 'RTK_FLOAT',
    2: 'DGPS',
    1: 'SINGLE_GPS',
    0: 'NO_FIX',
  };

  const estimatedVerticalAccuracyM =
    fixQuality === 4 ? 0.014 : fixQuality === 5 ? 0.2 : fixQuality === 2 ? 0.8 : 3.5;

  const now = Date.now();
  const grid = projectToRadaGrid(lat, lng, cellSizeM);

  // Beräkna hastighet och körriktning (headingDeg) för 3D-kameran och tvärsnittsprofilen
  let speedMetersPerSec = 0;
  let headingDeg = prevReading?.headingDeg ?? 0;

  if (prevReading) {
    const dtSec = Math.max(0.05, (now - prevReading.timestamp) / 1000);
    const dx = grid.xMeters - prevReading.grid.xMeters;
    const dy = grid.yMeters - prevReading.grid.yMeters;
    const distM = Math.hypot(dx, dy);
    speedMetersPerSec = distM / dtSec;

    if (distM > 0.15) {
      const rawHeading = (Math.atan2(dx, dy) * 180) / Math.PI;
      headingDeg = (rawHeading + 360) % 360;
    }
  }

  return {
    timestamp: now,
    lat,
    lng,
    altitudeMslM,
    geoidSeparationM,
    ellipsoidHeightM: altitudeMslM + geoidSeparationM,
    fixQuality,
    fixLabel: fixLabelMap[fixQuality],
    satellites,
    hdop,
    estimatedVerticalAccuracyM,
    speedMetersPerSec: Math.round(speedMetersPerSec * 100) / 100,
    headingDeg: Math.round(headingDeg),
    isStationary: speedMetersPerSec < 0.1,
    source,
    grid,
  };
}

// ============================================================================
// 4. HUVUDKLASS: SPARKFUN FACET, 3-STEGS KALIBRERING, 4 MÄT-LÄGEN & 3D-EXPORT
// ============================================================================

type ReadingListener = (
  reading: FacetPositionReading,
  snow: SnowDepthResult | null,
  calibration: CalibrationWizardState
) => void;

const NORDIC_UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NORDIC_UART_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export class SparkFunFacetService {
  private listeners: Set<ReadingListener> = new Set();

  // Rutnätslager i minnet (synkas med Cloud Firestore med { merge: true })
  private bareGroundGrid: Map<string, BareGroundCell> = new Map();
  private snowGrids: Record<Exclude<MeasurementMode, 'bare_ground'>, Map<string, SnowLayerCell>> = {
    planning: new Map(),
    bed: new Map(),
    track: new Map(),
  };

  // Spårlinje och spårlängd när man kör i läget 'track'
  private activeTrackPolyline: TrackLinePoint[] = [];
  private activeTrackLengthMeters = 0;

  private currentEquipment: EquipmentPreset = RADA_EQUIPMENT_PRESETS[0];
  private currentMode: MeasurementMode = 'bed';
  private isRecording = false;
  private lastReading: FacetPositionReading | null = null;

  // Buffer av de senaste 10 stillastående RTK Fixed-mätningarna för 3-stegs-kalibreringen
  private stationaryFixedZBuffer: number[] = [];
  private calibrationState: CalibrationWizardState = {
    well7ReferenceZ: null,
    sessionZOffsetM: 0.0,
    step2GroundZ: null,
    step3MountedZ: null,
    activeAntennaHeightM: RADA_EQUIPMENT_PRESETS[0].antennaHeightM,
    canCaptureStep: false,
    stabilitySampleCount: 0,
  };

  // Anslutnings-handles
  private geoWatchId: number | null = null;
  private simTimerId: ReturnType<typeof setInterval> | null = null;
  private bleDevice: any = null;
  private nmeaBuffer = '';

  constructor(initialBareGroundCells?: BareGroundCell[], well7RefZ?: number) {
    if (initialBareGroundCells) {
      initialBareGroundCells.forEach((cell) => this.bareGroundGrid.set(cell.key, cell));
    }
    if (typeof well7RefZ === 'number') {
      this.calibrationState.well7ReferenceZ = well7RefZ;
    }
  }

  public subscribe(listener: ReadingListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public setEquipmentPreset(presetId: EquipmentPreset['id']): void {
    const found = RADA_EQUIPMENT_PRESETS.find((p) => p.id === presetId);
    if (found) {
      this.currentEquipment = found;
      this.calibrationState.activeAntennaHeightM = found.antennaHeightM;
      this.currentMode = found.defaultMeasurementMode;
    }
  }

  public setMeasurementMode(mode: MeasurementMode): void {
    this.currentMode = mode;
    if (mode === 'track' && !this.isRecording) {
      this.activeTrackPolyline = [];
      this.activeTrackLengthMeters = 0;
    }
  }

  public setRecording(enabled: boolean): void {
    this.isRecording = enabled;
    if (enabled && this.currentMode === 'track') {
      this.activeTrackPolyline = [];
      this.activeTrackLengthMeters = 0;
    }
  }

  // --------------------------------------------------------------------------
  // 3-STEGS KALIBRERINGS-WIZARD (Brunn 7 -> Mark bredvid -> Monterad på rigg)
  // --------------------------------------------------------------------------

  private getAveragedStationaryZ(): number {
    if (!this.calibrationState.canCaptureStep || this.stationaryFixedZBuffer.length < 5) {
      throw new Error(
        'Kan inte låsa kalibreringspunkt: Vänta på RTK Fixed (grön status) och håll pucken helt stilla (< 0.1 m/s) i 2 sekunder.'
      );
    }
    const sum = this.stationaryFixedZBuffer.reduce((acc, z) => acc + z, 0);
    return sum / this.stationaryFixedZBuffer.length;
  }

  public calibrateStep1Well7Lid(lockAsNewMasterReference = false): CalibrationWizardState {
    const rawAvgZ = this.getAveragedStationaryZ();

    if (lockAsNewMasterReference || this.calibrationState.well7ReferenceZ === null) {
      this.calibrationState.well7ReferenceZ = Number(rawAvgZ.toFixed(4));
      this.calibrationState.sessionZOffsetM = 0.0;
    } else {
      this.calibrationState.sessionZOffsetM = Number(
        (rawAvgZ - this.calibrationState.well7ReferenceZ).toFixed(4)
      );
    }
    return { ...this.calibrationState };
  }

  public calibrateStep2GroundBesideRig(): CalibrationWizardState {
    const rawAvgZ = this.getAveragedStationaryZ();
    const correctedGroundZ = rawAvgZ - this.calibrationState.sessionZOffsetM;
    this.calibrationState.step2GroundZ = Number(correctedGroundZ.toFixed(4));
    return { ...this.calibrationState };
  }

  public calibrateStep3MountedOnRig(): {
    calibration: CalibrationWizardState;
    antennaHeightM: number;
    antennaHeightCm: number;
  } {
    if (this.calibrationState.step2GroundZ === null) {
      throw new Error('Utför Steg 2 (Mät marknivå bredvid fordonet) innan Steg 3.');
    }

    const rawAvgZ = this.getAveragedStationaryZ();
    const correctedMountedZ = rawAvgZ - this.calibrationState.sessionZOffsetM;
    this.calibrationState.step3MountedZ = Number(correctedMountedZ.toFixed(4));

    const calculatedHeightM = Number(
      (correctedMountedZ - this.calibrationState.step2GroundZ).toFixed(3)
    );
    if (calculatedHeightM < 0.05 || calculatedHeightM > 3.5) {
      throw new Error(
        `Orimlig monteringshöjd (${calculatedHeightM} m). Kontrollera att pucken stod på marken i Steg 2 och på fästet i Steg 3.`
      );
    }

    this.calibrationState.activeAntennaHeightM = calculatedHeightM;
    this.currentEquipment.antennaHeightM = calculatedHeightM;
    this.currentEquipment.lastCalibratedAt = Date.now();

    return {
      calibration: { ...this.calibrationState },
      antennaHeightM: calculatedHeightM,
      antennaHeightCm: Math.round(calculatedHeightM * 1000) / 10,
    };
  }

  // --------------------------------------------------------------------------
  // Anslutningar (BLE, Web Serial, Mock Location, Råda-Simulator)
  // --------------------------------------------------------------------------

  public async connectWebBluetooth(): Promise<void> {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      throw new Error('Web Bluetooth stöds inte i denna webbläsare (använd Chrome på Android/Desktop).');
    }

    this.disconnectAll();

    this.bleDevice = await nav.bluetooth.requestDevice({
      filters: [{ namePrefix: 'Facet' }, { namePrefix: 'RTK' }],
      optionalServices: [NORDIC_UART_SERVICE_UUID],
    });

    const server = await this.bleDevice.gatt.connect();
    const service = await server.getPrimaryService(NORDIC_UART_SERVICE_UUID);
    const txChar = await service.getCharacteristic(NORDIC_UART_TX_CHAR_UUID);

    await txChar.startNotifications();
    txChar.addEventListener('characteristicvaluechanged', (event: any) => {
      const value: DataView = event.target.value;
      const chunk = new TextDecoder().decode(value);
      this.handleIncomingNmeaChunk(chunk, 'BLE_NMEA');
    });
  }

  public async connectWebSerial(baudRate = 115200): Promise<void> {
    const nav = navigator as any;
    if (!nav.serial) {
      throw new Error('Web Serial API stöds inte i denna webbläsare.');
    }

    this.disconnectAll();

    const port = await nav.serial.requestPort();
    await port.open({ baudRate });

    const reader = port.readable.getReader();
    const readLoop = async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            const chunk = new TextDecoder().decode(value);
            this.handleIncomingNmeaChunk(chunk, 'SERIAL_NMEA');
          }
        }
      } catch (err) {
        console.error('Web Serial läsfel:', err);
      } finally {
        reader.releaseLock();
      }
    };
    readLoop();
  }

  public startMockLocationWatch(): void {
    if (!navigator.geolocation) {
      throw new Error('Geolocation saknas i webbläsaren.');
    }

    this.disconnectAll();

    this.geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, altitude, accuracy, altitudeAccuracy, speed, heading } = pos.coords;
        const altMsl = altitude ?? 78.0;
        const vAcc = altitudeAccuracy ?? accuracy ?? 1.0;
        const spd = speed ?? 0;

        const isRtkFixed = accuracy <= 0.05;
        const isRtkFloat = accuracy > 0.05 && accuracy <= 0.5;

        const reading: FacetPositionReading = {
          timestamp: pos.timestamp || Date.now(),
          lat: latitude,
          lng: longitude,
          altitudeMslM: altMsl,
          geoidSeparationM: 35.1,
          ellipsoidHeightM: altMsl + 35.1,
          fixQuality: isRtkFixed ? 4 : isRtkFloat ? 5 : 1,
          fixLabel: isRtkFixed ? 'RTK_FIXED' : isRtkFloat ? 'RTK_FLOAT' : 'SINGLE_GPS',
          satellites: 18,
          hdop: 0.7,
          estimatedVerticalAccuracyM: vAcc,
          speedMetersPerSec: spd,
          headingDeg: heading ?? this.lastReading?.headingDeg ?? 0,
          isStationary: spd < 0.1,
          source: 'MOCK_GEOLOCATION',
          grid: projectToRadaGrid(latitude, longitude),
        };

        this.processReading(reading);
      },
      (err) => console.error('Geolocation error:', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
  }

  public startRadaTrackSimulator(intervalMs = 250): void {
    this.disconnectAll();

    if (this.bareGroundGrid.size === 0) {
      this.seedSyntheticBareGroundForRada();
    }

    let step = 0;
    const wells = RADA_FACILITY_CONFIG.wells;

    this.simTimerId = setInterval(() => {
      const totalSegments = wells.length - 1;
      const progress = (step % 240) / 240;
      const segFloat = progress * totalSegments;
      const segIdx = Math.min(Math.floor(segFloat), totalSegments - 1);
      const t = segFloat - segIdx;

      const wA = wells[segIdx];
      const wB = wells[segIdx + 1];

      const lat = wA.lat + (wB.lat - wA.lat) * t;
      const lng = wA.lng + (wB.lng - wA.lng) * t;

      const grid = projectToRadaGrid(lat, lng);
      const baseGroundZ = 75.0 + Math.sin(segIdx * 0.6) * 2.5;
      const distToWellFactor = Math.cos(t * Math.PI * 2);
      const simulatedSnowDepthM = Math.max(0.08, 0.38 + distToWellFactor * 0.28);

      const antennaZ =
        baseGroundZ +
        simulatedSnowDepthM +
        this.calibrationState.activeAntennaHeightM +
        this.calibrationState.sessionZOffsetM;

      const dy = (wB.lat - wA.lat) * METERS_PER_DEG_LAT;
      const dx = (wB.lng - wA.lng) * METERS_PER_DEG_LNG;
      const headingDeg = Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360);

      const reading: FacetPositionReading = {
        timestamp: Date.now(),
        lat,
        lng,
        altitudeMslM: antennaZ,
        geoidSeparationM: 35.1,
        ellipsoidHeightM: antennaZ + 35.1,
        fixQuality: 4,
        fixLabel: 'RTK_FIXED',
        satellites: 24,
        hdop: 0.58,
        estimatedVerticalAccuracyM: 0.014,
        speedMetersPerSec: 1.8,
        headingDeg,
        isStationary: false,
        source: 'SIMULATOR',
        grid,
      };

      step++;
      this.processReading(reading);
    }, intervalMs);
  }

  public disconnectAll(): void {
    if (this.geoWatchId !== null) {
      navigator.geolocation.clearWatch(this.geoWatchId);
      this.geoWatchId = null;
    }
    if (this.simTimerId !== null) {
      clearInterval(this.simTimerId);
      this.simTimerId = null;
    }
    if (this.bleDevice?.gatt?.connected) {
      this.bleDevice.gatt.disconnect();
    }
  }

  // --------------------------------------------------------------------------
  // Bearbetning av läsning, påfyllning av Grid & Spårlängdsberäkning
  // --------------------------------------------------------------------------

  private handleIncomingNmeaChunk(
    chunk: string,
    source: FacetPositionReading['source']
  ): void {
    this.nmeaBuffer += chunk;
    const lines = this.nmeaBuffer.split(/\r?\n/);
    this.nmeaBuffer = lines.pop() || '';

    for (const line of lines) {
      const reading = parseNmeaGga(line, source, this.lastReading);
      if (reading) {
        this.processReading(reading);
      }
    }
  }

  private processReading(reading: FacetPositionReading): void {
    this.lastReading = reading;

    // Uppdatera stabilitetsbuffert för 3-stegs-kalibreringen (kräver RTK Fixed + stillastående)
    if (reading.fixQuality === 4 && reading.isStationary) {
      this.stationaryFixedZBuffer.push(reading.altitudeMslM);
      if (this.stationaryFixedZBuffer.length > 10) {
        this.stationaryFixedZBuffer.shift();
      }
      this.calibrationState.stabilitySampleCount = this.stationaryFixedZBuffer.length;
      this.calibrationState.canCaptureStep = this.stationaryFixedZBuffer.length >= 5;
    } else {
      this.stationaryFixedZBuffer = [];
      this.calibrationState.stabilitySampleCount = 0;
      this.calibrationState.canCaptureStep = false;
    }

    const trueSurfaceZ =
      reading.altitudeMslM -
      this.calibrationState.sessionZOffsetM -
      this.calibrationState.activeAntennaHeightM;

    if (this.isRecording && reading.fixQuality === 4) {
      if (this.currentMode === 'bare_ground') {
        const existing = this.bareGroundGrid.get(reading.grid.key);
        if (existing && !existing.interpolated) {
          const newSamples = existing.samples + 1;
          const avgZ = (existing.zGroundM * existing.samples + trueSurfaceZ) / newSamples;
          this.bareGroundGrid.set(reading.grid.key, {
            ...existing,
            zGroundM: Number(avgZ.toFixed(3)),
            samples: newSamples,
            updatedAt: reading.timestamp,
          });
        } else {
          this.bareGroundGrid.set(reading.grid.key, {
            key: reading.grid.key,
            gx: reading.grid.gx,
            gy: reading.grid.gy,
            zGroundM: Number(trueSurfaceZ.toFixed(3)),
            samples: 1,
            interpolated: false,
            updatedAt: reading.timestamp,
          });
        }
      }
    }

    const snowResult = this.calculateSnowDepth(reading, trueSurfaceZ);

    if (this.isRecording && reading.fixQuality === 4 && this.currentMode !== 'bare_ground' && snowResult) {
      const targetLayer = this.snowGrids[this.currentMode];
      targetLayer.set(reading.grid.key, {
        key: reading.grid.key,
        gx: reading.grid.gx,
        gy: reading.grid.gy,
        zSnowM: Number(trueSurfaceZ.toFixed(3)),
        snowDepthCm: snowResult.snowDepthCm,
        mode: this.currentMode,
        nearestWellId: snowResult.nearestWellId,
        updatedAt: reading.timestamp,
      });

      if (this.currentMode === 'track') {
        const lastPt = this.activeTrackPolyline[this.activeTrackPolyline.length - 1];
        if (!lastPt) {
          this.activeTrackPolyline.push({
            lat: reading.lat,
            lng: reading.lng,
            snowDepthCm: snowResult.snowDepthCm,
            timestamp: reading.timestamp,
          });
        } else {
          const dy = (reading.lat - lastPt.lat) * METERS_PER_DEG_LAT;
          const dx = (reading.lng - lastPt.lng) * METERS_PER_DEG_LNG;
          const distM = Math.hypot(dx, dy);
          if (distM >= 2.0 && distM < 40.0) {
            this.activeTrackLengthMeters += distM;
            this.activeTrackPolyline.push({
              lat: reading.lat,
              lng: reading.lng,
              snowDepthCm: snowResult.snowDepthCm,
              timestamp: reading.timestamp,
            });
          }
        }
      }
    }

    this.listeners.forEach((cb) => cb(reading, snowResult, { ...this.calibrationState }));
  }

  private calculateSnowDepth(
    reading: FacetPositionReading,
    trueSurfaceZ: number
  ): SnowDepthResult | null {
    let nearestWell = RADA_FACILITY_CONFIG.wells[0];
    let minDistanceM = Infinity;

    for (const well of RADA_FACILITY_CONFIG.wells) {
      const wellGrid = projectToRadaGrid(well.lat, well.lng);
      const dx = reading.grid.xMeters - wellGrid.xMeters;
      const dy = reading.grid.yMeters - wellGrid.yMeters;
      const dist = Math.hypot(dx, dy);
      if (dist < minDistanceM) {
        minDistanceM = dist;
        nearestWell = well;
      }
    }

    const bareCell = this.bareGroundGrid.get(reading.grid.key);
    if (!bareCell) return null;

    const snowDepthMeters = trueSurfaceZ - bareCell.zGroundM;
    const snowDepthCm = Math.round(snowDepthMeters * 100);
    const zone = classifySnowDepthZone(snowDepthCm, this.currentEquipment.minSafeSnowCm);

    return {
      gridKey: reading.grid.key,
      mode: this.currentMode,
      snowDepthMeters,
      snowDepthCm,
      groundElevationM: bareCell.zGroundM,
      snowSurfaceElevationM: trueSurfaceZ,
      zone,
      colorHex: SNOW_DEPTH_COLORS[zone],
      nearestWellId: nearestWell.id,
      distanceToNearestWellM: Math.round(minDistanceM * 10) / 10,
      withinHoseReach: minDistanceM <= nearestWell.hoseReachEffectiveM,
      activeTrackLengthMeters: Math.round(this.activeTrackLengthMeters),
    };
  }

  // --------------------------------------------------------------------------
  // 5. 3D-VISUALISERINGSHJÄLPARE (MapLibre `fill-extrusion` & 8m Tvärsnitt)
  // --------------------------------------------------------------------------

  /**
   * Genererar en GeoJSON FeatureCollection för MapLibre GL `fill-extrusion` (Vy 1 & Vy 2).
   * Varje 1x1m-ruta blir en 3D-stapel med höjd = snödjup * verticalExaggeration (default 5x)
   * och färg enligt SNOW_DEPTH_COLORS.
   */
  public buildGridExtrusionGeoJson(
    mode: Exclude<MeasurementMode, 'bare_ground'> = 'planning',
    verticalExaggeration = 5.0
  ) {
    const layer = this.snowGrids[mode];
    const features = Array.from(layer.values()).map((cell) => {
      const zone = classifySnowDepthZone(cell.snowDepthCm, this.currentEquipment.minSafeSnowCm);
      const heightMeters = Math.max(0.05, (cell.snowDepthCm / 100) * verticalExaggeration);

      return {
        type: 'Feature' as const,
        properties: {
          key: cell.key,
          snowDepthCm: cell.snowDepthCm,
          extrusionHeightM: Number(heightMeters.toFixed(2)),
          color: SNOW_DEPTH_COLORS[zone],
          zone,
          nearestWellId: cell.nearestWellId,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: getGridCellPolygonCoords(cell.gx, cell.gy),
        },
      };
    });

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }

  /**
   * Genererar 8,5-meters slangräckviddscirklar (GeoJSON Polygoner) runt alla 20 brunnar
   * för 3D-vyn (Vy 1).
   */
  public buildWellHoseCirclesGeoJson(segments = 36) {
    const features = RADA_FACILITY_CONFIG.wells.map((well) => {
      const wellGrid = projectToRadaGrid(well.lat, well.lng);
      const radiusM = well.hoseReachEffectiveM;
      const ring: number[][] = [];

      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const px = wellGrid.xMeters + Math.cos(angle) * radiusM;
        const py = wellGrid.yMeters + Math.sin(angle) * radiusM;
        const lat = RADA_FACILITY_CONFIG.origin.lat + py / METERS_PER_DEG_LAT;
        const lng = RADA_FACILITY_CONFIG.origin.lng + px / METERS_PER_DEG_LNG;
        ring.push([lng, lat]);
      }

      return {
        type: 'Feature' as const,
        properties: {
          wellId: well.id,
          name: well.name,
          hoseReachEffectiveM: well.hoseReachEffectiveM,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [ring],
        },
      };
    });

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }

  /**
   * Genererar en 8 meter bred tvärsnittsprofil (-4m till +4m vinkelrätt mot körriktningen)
   * för den nedre grafen i Förar-HUD:en (Vy 2).
   */
  public getTrackCrossSectionProfile(
    reading: FacetPositionReading,
    mode: Exclude<MeasurementMode, 'bare_ground'> = 'bed',
    halfWidthMeters = 4
  ): CrossSectionSample[] {
    const samples: CrossSectionSample[] = [];
    // Vinkelrätt vektor (höger sida = heading + 90 grader)
    const perpRad = ((reading.headingDeg + 90) * Math.PI) / 180;
    const perpX = Math.sin(perpRad);
    const perpY = Math.cos(perpRad);

    const snowLayer = this.snowGrids[mode];

    for (let offset = -halfWidthMeters; offset <= halfWidthMeters; offset += 1) {
      const sampleX = reading.grid.xMeters + perpX * offset;
      const sampleY = reading.grid.yMeters + perpY * offset;
      const gx = Math.floor(sampleX);
      const gy = Math.floor(sampleY);
      const key = `${gx}_${gy}`;

      const bare = this.bareGroundGrid.get(key);
      const snow = snowLayer.get(key);

      const zone = snow
        ? classifySnowDepthZone(snow.snowDepthCm, this.currentEquipment.minSafeSnowCm)
        : 'OPTIMAL_TARGET';

      samples.push({
        offsetMeters: offset,
        gridKey: key,
        groundElevationM: bare ? bare.zGroundM : null,
        snowSurfaceElevationM: snow ? snow.zSnowM : null,
        snowDepthCm: snow ? snow.snowDepthCm : null,
        colorHex: snow ? SNOW_DEPTH_COLORS[zone] : '#475569',
      });
    }

    return samples;
  }

  // --------------------------------------------------------------------------
  // 6. Export-metoder för Cloud Firestore ({ merge: true } Påfyllning & Gästvy)
  // --------------------------------------------------------------------------

  public getBareGroundCellsMap(): Record<string, BareGroundCell> {
    return Object.fromEntries(this.bareGroundGrid.entries());
  }

  public getSnowLayerCellsMap(
    mode: Exclude<MeasurementMode, 'bare_ground'>
  ): Record<string, SnowLayerCell> {
    return Object.fromEntries(this.snowGrids[mode].entries());
  }

  public buildPublicGuestStatusPayload(
    trackConfigurationLabel = '2 klassiska + skejtbädd + 2 klassiska'
  ) {
    const bedCells = Array.from(this.snowGrids.bed.values());
    const trackCells = Array.from(this.snowGrids.track.values());
    const sourceCells = bedCells.length > 0 ? bedCells : trackCells;

    const depths = sourceCells.map((c) => c.snowDepthCm);
    const avgDepth =
      depths.length > 0 ? Math.round(depths.reduce((a, b) => a + b, 0) / depths.length) : 0;
    const minDepth = depths.length > 0 ? Math.min(...depths) : 0;

    return {
      facilityName: RADA_FACILITY_CONFIG.facilityName,
      updatedAt: Date.now(),
      activeTrackLengthMeters: Math.round(this.activeTrackLengthMeters),
      activeTrackConfiguration: trackConfigurationLabel,
      averageSnowDepthCm: avgDepth,
      minSnowDepthCm: minDepth,
      trackPolyline: this.activeTrackPolyline,
    };
  }

  private seedSyntheticBareGroundForRada(): void {
    const wells = RADA_FACILITY_CONFIG.wells;
    for (let i = 0; i < wells.length - 1; i++) {
      const wA = wells[i];
      const wB = wells[i + 1];
      const baseZ = 75.0 + Math.sin(i * 0.6) * 2.5;

      for (let s = 0; s <= 40; s++) {
        const t = s / 40;
        const lat = wA.lat + (wB.lat - wA.lat) * t;
        const lng = wA.lng + (wB.lng - wA.lng) * t;
        const grid = projectToRadaGrid(lat, lng);

        for (let offsetX = -4; offsetX <= 4; offsetX++) {
          const gx = grid.gx + offsetX;
          const gy = grid.gy;
          const key = `${gx}_${gy}`;
          this.bareGroundGrid.set(key, {
            key,
            gx,
            gy,
            zGroundM: Number((baseZ + Math.abs(offsetX) * 0.03).toFixed(3)),
            samples: 5,
            interpolated: false,
            updatedAt: Date.now(),
          });
        }
      }
    }
  }
}