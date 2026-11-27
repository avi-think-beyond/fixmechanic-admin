"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.normalizeVehicleType = normalizeVehicleType;
exports.normalizeServiceCategory = normalizeServiceCategory;
exports.maskPhoneNumber = maskPhoneNumber;
exports.maskDisplayName = maskDisplayName;
exports.calculateHaversineDistanceKm = calculateHaversineDistanceKm;
exports.encodeGeohash = encodeGeohash;
exports.DEFAULT_CONFIG = {
    defaultSearchRadiusKm: 5.0,
    maxSearchRadiusKm: 15.0,
    radiusExpansionStepKm: 3.0,
    initialOfferBatchSize: 3,
    offerTimeoutSeconds: 45,
    maxMechanicDispatchAttempts: 3,
    localityName: "Gurugram (Sector 29 Pilot Zone)",
    localityCenter: { lat: 28.4595, lng: 77.0266 },
    maxMechanicLocationStalenessMinutes: 20,
    chatAutoCloseOnCompletion: true,
};
function normalizeVehicleType(raw) {
    const s = (raw || "").trim().toUpperCase().replace(/[\s\-]+/g, "_");
    if (s === "TWO_WHEELER" ||
        s === "BIKE" ||
        s === "SCOOTER" ||
        s === "MOTORCYCLE" ||
        s === "2W") {
        return "TWO_WHEELER";
    }
    if (s === "EV_TWO_WHEELER" || s === "EV_BIKE" || s === "ELECTRIC_BIKE") {
        return "EV_TWO_WHEELER";
    }
    if (s === "EV_FOUR_WHEELER" || s === "EV_CAR" || s === "ELECTRIC_CAR") {
        return "EV_FOUR_WHEELER";
    }
    if (s === "COMMERCIAL_LIGHT" || s === "COMMERCIAL" || s === "VAN" || s === "AUTO") {
        return "COMMERCIAL_LIGHT";
    }
    return "FOUR_WHEELER_CAR";
}
function normalizeServiceCategory(raw) {
    const s = (raw || "").trim().toUpperCase();
    if (!s)
        return "OTHER";
    if (s.includes("TYRE") || s.includes("TIRE") || s.includes("PUNCTURE") || s.includes("FLAT")) {
        return "FLAT_TYRE";
    }
    if (s.includes("BATTERY") || s.includes("JUMPSTART") || s.includes("JUMP")) {
        return "BATTERY_JUMPSTART";
    }
    if (s.includes("FUEL") || s.includes("PETROL") || s.includes("DIESEL")) {
        return "FUEL_DELIVERY";
    }
    if (s.includes("LOCK") || s.includes("KEY")) {
        return "LOCKOUT";
    }
    if (s.includes("TOW") || s.includes("FLATBED") || s.includes("RECOVERY")) {
        return "TOWING";
    }
    if (s.includes("COOLANT") || s.includes("OVERHEAT") || s.includes("RADIATOR")) {
        return "OVERHEATING_COOLANT";
    }
    if (s.includes("BRAKE") || s.includes("CLUTCH") || s.includes("CHAIN")) {
        return "CLUTCH_BRAKE_CHAIN";
    }
    if (s.includes("ENGINE") || s.includes("START") || s.includes("SPARK") || s.includes("MINOR")) {
        return "MINOR_MECHANICAL";
    }
    return s.replace(/[\s/\-]+/g, "_");
}
function maskPhoneNumber(raw) {
    if (!raw)
        return "+91-XXXX-XXXX";
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 4)
        return "+91-XXXX-XXXX";
    return `+91-XXXXXX${digits.slice(-4)}`;
}
function maskDisplayName(name) {
    const trimmed = (name || "Customer").trim();
    if (!trimmed)
        return "Customer";
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1)
        return parts[0];
    return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}
function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
}
function toRad(degrees) {
    return (degrees * Math.PI) / 180;
}
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
function encodeGeohash(lat, lng, precision = 7) {
    let latMin = -90.0;
    let latMax = 90.0;
    let lngMin = -180.0;
    let lngMax = 180.0;
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
            }
            else {
                lngMax = mid;
            }
        }
        else {
            mid = (latMin + latMax) / 2;
            if (lat > mid) {
                ch |= 1 << (4 - bit);
                latMin = mid;
            }
            else {
                latMax = mid;
            }
        }
        isEven = !isEven;
        if (bit < 4) {
            bit++;
        }
        else {
            geohash += BASE32[ch];
            bit = 0;
            ch = 0;
        }
    }
    return geohash;
}
//# sourceMappingURL=config.js.map