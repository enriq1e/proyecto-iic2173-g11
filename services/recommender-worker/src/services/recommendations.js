const axios = require('axios');
const { haversine } = require('../utils/haversine');

const PROPERTIES_API_BASE = process.env.PROPERTIES_API_BASE;
const GEOCODE_API_KEY = process.env.GEOCODE_API_KEY;

// Cache simple por ejecución para no repetir geocoding
const geocodeCache = new Map();

// Parsea "n dormitorios" a n
function parseBedrooms(bedroomsStr) {
	if (!bedroomsStr) return null;
	const m = String(bedroomsStr).match(/(\d+)/);
	return m ? Number(m[1]) : null;
}

// Extrae el área base (antes de la coma) de la ubicación
function extractArea(locationText) {
	if (!locationText) return null;
	const part = String(locationText).split(',')[0].trim();
	return part ? part.toLowerCase() : null;
}

// Geocoding directo desde dirección a lat/lon
async function forwardGeocode(q) {
	if (!q) return null;
	const key = `fwd:${q}`;
	if (geocodeCache.has(key)) return geocodeCache.get(key);
	try {
		const { data } = await axios.get('https://geocode.maps.co/search', {
			params: { q, api_key: GEOCODE_API_KEY },
			timeout: 8000,
		});
		const first = Array.isArray(data) && data.length ? data[0] : null;
		const result = first
			? {
					lat: Number(first.lat),
					lon: Number(first.lon),
					address: first.address || {},
					display_name: first.display_name,
				}
			: null;
		geocodeCache.set(key, result);
		return result;
	} catch (e) {
		return null;
	}
}

// Obtiene una propiedad por ID desde el servicio externo
async function fetchPropertyById(id) {
	const url = `${PROPERTIES_API_BASE.replace(/\/$/, '')}/properties/${encodeURIComponent(id)}`;
	const { data } = await axios.get(url, { timeout: 10000 });
	return data;
}

// Obtiene lista de propiedades (limit por performance)
async function fetchAllProperties(limit = 300) {
	const base = PROPERTIES_API_BASE.replace(/\/$/, '');
	const url = `${base}/properties`;
	const { data } = await axios.get(url, { params: { limit }, timeout: 15000 });
	return Array.isArray(data) ? data : (data?.rows || []);
}

// Convierte precio textual a número
function toNumber(val) {
	if (val == null) return null;
	const n = Number(String(val).replace(/[^\d.]/g, ''));
	return Number.isFinite(n) ? n : null;
}

// Calcula recomendaciones según reglas del enunciado
async function computeRecommendations({ userId, propertyId }) {
	if (!propertyId) {
		throw new Error('propertyId is required');
	}

	// Reset cache per invocation
	geocodeCache.clear();

	// 1) Obtener ubicación, dormitorios y precio de la propiedad base
	const baseProp = await fetchPropertyById(propertyId);
	if (!baseProp) throw new Error('Base property not found');

	const baseBedrooms = parseBedrooms(baseProp.bedrooms);
	const basePrice = toNumber(baseProp.price);
	const baseLocationText = baseProp.location || '';
	const baseArea = extractArea(baseLocationText);

	// Geocodificar base para obtener lat/lon
	const baseGeo = await forwardGeocode(baseLocationText);
	if (!baseGeo) throw new Error('Failed to geocode base property');
	const baseLat = baseGeo.lat;
	const baseLon = baseGeo.lon;

	// 2) Filtrar por mismos dormitorios, precio <= base y misma área
	const all = await fetchAllProperties(500);
	const prefiltered = all.filter((p) => {
		if (!p || String(p.id) === String(baseProp.id)) return false;
		const b = parseBedrooms(p.bedrooms);
		const price = toNumber(p.price);
		if (b == null || price == null || baseBedrooms == null || basePrice == null) return false;
		if (b !== baseBedrooms) return false;
		if (price > basePrice) return false;
		// compara área (antes de la coma) de la ubicación
		const candArea = extractArea(p.location || '');
		if (baseArea && candArea && candArea !== baseArea) return false;
		return true;
	});

	// 3) Geocodificar candidatos y calcular distancia
	const enriched = [];
	for (const p of prefiltered) {
		const geo = await forwardGeocode(p.location || '');
		if (!geo) continue;
		const distance = haversine(baseLat, baseLon, geo.lat, geo.lon);
		enriched.push({
			id: p.id,
			name: p.name,
			price: toNumber(p.price),
			location: p.location,
			img: p.img,
			url: p.url,
			bedrooms: parseBedrooms(p.bedrooms),
			distance,
		});
	}

	// 3b) Ordenar por distancia y luego por precio
	enriched.sort((a, b) => (a.distance - b.distance) || (a.price - b.price));

	// 4) Tomar los 3 primeros
	const top = enriched.slice(0, 3);
	const result = {
		base: {
			id: baseProp.id,
			name: baseProp.name,
			price: basePrice,
			location: baseLocationText,
			bedrooms: baseBedrooms,
			lat: baseLat,
			lon: baseLon,
		},
		recommendations: top,
		counts: { candidates: prefiltered.length, considered: enriched.length, returned: top.length },
		computedAt: new Date().toISOString(),
	};

	if (top.length === 0) {
		result.message = 'No hay coincidencias';
	}
	return result;
}

module.exports = { computeRecommendations };

