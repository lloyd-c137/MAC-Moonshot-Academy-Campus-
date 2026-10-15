export type SpaceSeries = 'M' | 'S' | 'A' | 'CENTRAL' | 'PUBLIC' | 'SERVICE';

export type SpaceCategory =
  | 'arena'
  | 'classroom'
  | 'laboratory'
  | 'creative_maker'
  | 'library_reading'
  | 'quiet_study'
  | 'office'
  | 'dining'
  | 'performance_hall'
  | 'courtyard'
  | 'entrance'
  | 'health_service'
  | 'restroom'
  | 'circulation';

export type AccessStatus = 'open' | 'closed' | 'restricted' | 'unknown';
export type OccupancyStatus = 'available' | 'in_use' | 'crowded' | 'unknown';
export type PulseLevel = 'quiet' | 'moderate' | 'busy' | 'very_busy' | 'unknown';
export type GeometryProvenance = 'verified' | 'derived' | 'illustrative' | 'unverified';

export interface Point2D {
  x: number;
  y: number; // in normalized coordinates [0, 1000] width x [0, 863.5] height
}

export interface SpacePolygon {
  points: Point2D[];
}

export interface EnvironmentalReading {
  temperature: number; // °C
  humidity: number; // %
  co2: number; // ppm
  temperatureTrend: number[]; // 24 hourly points
  humidityTrend: number[];
  co2Trend: number[];
  lastUpdated: string;
  sensorHealth: 'live' | 'stale' | 'offline' | 'mock';
  /** Where the values come from: a bound real sensor, or the built-in demo sample. */
  source?: 'sensor' | 'demo';
  /** Capture time (epoch ms) for each trend point when the series comes from a sensor. */
  trendTimes?: number[];
  capturedAt?: number;
  /** Sensor-side status: why values are missing or old. */
  sensorNote?: string;
  /** Who supplies the sensor data, for the source link. */
  provider?: { name: string; url: string };
  sensorId?: string;
  isPrivateRoom?: boolean; // If true, do not expose exact headcounts for privacy (nurse, counseling, etc.)
}

export interface CampusSpace {
  id: string; // e.g. "M104", "S404", "A114", "ARENA-01"
  name: string; // e.g. "一小步空间", "绝对安静自习室", "餐厅"
  englishName?: string;
  series: SpaceSeries;
  category: SpaceCategory;
  areaM2?: number;
  center: Point2D;
  polygon: Point2D[];
  doorPoint: Point2D;
  floor: 'FF-01'; // Single validated floor plan FF-01
  features: string[];
  access: AccessStatus;
  occupancy: OccupancyStatus;
  headcountEstimate?: number;
  capacity?: number;
  environment: EnvironmentalReading;
  pulse: PulseLevel;
  description: string;
  tags: string[];
  isVerifiedInPlan: boolean; // Geometric audit
  geometryProvenance?: GeometryProvenance;
  locationProvenance?: GeometryProvenance;
  notes?: string;
}

export interface CampusEvent {
  id: string;
  title: string;
  spaceId: string;
  spaceName: string;
  description: string;
  category: 'sports' | 'academic' | 'arts' | 'community' | 'workshop' | 'gathering';
  startTime: string; // ISO string
  endTime: string;
  status: 'upcoming' | 'happening_now' | 'past';
  organizer: string;
  attendeesCount?: number;
  posterBgColor: string;
  tags: string[];
}

export interface CampusMoment {
  id: string;
  spaceId: string;
  spaceName: string;
  author: string;
  timeAgo: string;
  date: string;
  content: string;
  imageUrl?: string;
  category: 'memory' | 'student_project' | 'daily_snap' | 'event_highlight';
  likes: number;
}

export interface NavigationNode {
  id: string;
  name: string;
  x: number;
  y: number;
  type: 'entrance' | 'corridor' | 'door' | 'intersection' | 'hub';
  accessible: boolean;
}

export interface NavigationEdge {
  from: string;
  to: string;
  distance: number; // In meters
  accessible: boolean;
}

export interface NavigationRoute {
  nodes: NavigationNode[];
  totalDistanceMeters: number;
  estimatedMinutes: number;
  steps: string[];
}

export type MapLayerMode = 'explore' | 'spaces' | 'temperature' | 'humidity' | 'co2' | 'pulse' | 'events';
