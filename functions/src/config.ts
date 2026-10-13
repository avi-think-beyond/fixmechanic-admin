/**
 * Application Config & Geospatial Helpers
 */
import { ApplicationConfig } from "./types";

export const DEFAULT_CONFIG: ApplicationConfig = {
  defaultSearchRadiusKm: 5.0,
  maxSearchRadiusKm: 15.0,
  radiusExpansionStepKm: 3.0,
  initialOfferBatchSize: 3,
  offerTimeoutSeconds: 45,
  maxMechanicDispatchAttempts: 3,
  localityName: "Gurugram / South Delhi Pilot Area",
  localityCenter: { lat: 28.4595, lng: 77.0266 }, // Sector 29 Gurugram
  maxMechanicLocationStalenessMinutes: 20,
  chatAutoCloseOnCompletion: true,
};

/**
 * Calculate Great-Circle distance between two coordinates in kilometers (Haversine formula)
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Simple standard 32-character Geohash encoder for coordinate clustering
 */
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lng: number, precision: number = 7): string {
  let latMin = -90.0,
    latMax = 90.0;
  let lngMin = -180.0,
    lngMax = 180.0;
  let geohash = "";
  let isEven = true;
  let bit = 0;
  let ch = 0;

  while (geohash.length < precision) {
    let mid = 0;
    if (isEven) {
      mid = (lngMin + lngMax) / 2;
      if (lng > mid) {
        ch |= 1 << (4 - bit);
        lngMin = mid;
      } else {
        lngMax = mid;
      }
    } else {
      mid = (latMin + latMax) / 2;
      if (lat > mid) {
        ch |= 1 << (4 - bit);
        latMin = mid;
      } else {
        latMax = mid;
      }
    }

    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return geohash;
}
