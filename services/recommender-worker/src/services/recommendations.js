const axios = require('axios');
const { haversine } = require('../utils/haversine');

const PROPERTIES_API_BASE = process.env.PROPERTIES_API_BASE;
const GEOCODE_API_KEY = process.env.GEOCODE_API_KEY;

// Cache simple por ejecución para no repetir geocoding
const geocodeCache = new Map();

// --- Utilidades de precios / UF ---
async function getUfValue() {
	const url = process.env.UF_API_URL || 'https://mindicador.cl/api/uf';
	try {
		const { data } = await axios.get(url, { timeout: 5000 });
		const valor = data?.serie?.[0]?.valor;
		if (!valor) throw new Error('UF sin valor');
		return Number(valor);
	} catch (err) {
		const fallback = Number(process.env.UF_FALLBACK || 40000);
		console.error(`[UF] Error obteniendo UF (${err?.message}). Usando fallback=${fallback}`);
		return fallback;
	}
}

function parseNumeric(val) {
	if (val == null) return null;
	const n = Number(String(val).replace(/[\s.,]/g, m => (m === ',' ? '.' : ''))
		.replace(/[^\d.]/g, ''));
	return Number.isFinite(n) ? n : null;
}

function normalizePriceCLP(price, currency, ufValue) {
	if (price == null) return null;
	const text = String(price);
	const n = parseNumeric(text);
	if (n == null) return null;
	const cur = (currency || '').toString().toUpperCase();
	const isUF = cur === 'UF' || /\bUF\b/i.test(text);
	if (isUF) return Math.round(n * ufValue);
	return Math.round(n); // asumir CLP
}

// Parsea "n dormitorios" a n
function parseBedrooms(bedroomsStr) {
	if (!bedroomsStr) return null;
	const m = String(bedroomsStr).match(/(\d+)/);
	return m ? Number(m[1]) : null;
}

// Extrae un "área" representativa de la ubicación (heurística: último token significativo)
function extractArea(locationText) {
	if (!locationText) return null;
	const parts = String(locationText)
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	if (!parts.length) return null;
	const blacklist = new Set(['chile']);
	for (let i = parts.length - 1; i >= 0; i--) {
		const tok = parts[i].toLowerCase();
		if (blacklist.has(tok)) continue;
		if (/[a-záéíóúñ]/i.test(tok) && tok.length >= 4) return tok;
	}
	// fallback: primer token
	return parts[0].toLowerCase();
}

// Axios instance for geocoding with explicit User-Agent (Nominatim based services require it)
const geocodeHttp = axios.create({
	baseURL: 'https://geocode.maps.co',
	timeout: 8000,
	headers: {
		'User-Agent': process.env.GEOCODE_USER_AGENT || 'arquisis-recommender/1.0',
	},
});

function sleep(ms) {
	return new Promise((res) => setTimeout(res, ms));
}

// Geocoding directo desde dirección a lat/lon, con cache y reintentos ligeros
async function forwardGeocode(q) {
	if (!q) return null;
	const key = `fwd:${q}`;
	if (geocodeCache.has(key)) return geocodeCache.get(key);
	const params = { q, api_key: GEOCODE_API_KEY };
	let lastError;
	for (let attempt = 1; attempt <= 2; attempt++) {
		try {
			const { data } = await geocodeHttp.get('/search', { params });
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
			lastError = e;
			// Backoff pequeño en casos de rate limit o errores transitorios
			const status = e?.response?.status;
			if (attempt < 2 && (status === 429 || status >= 500 || !status)) {
				await sleep(600);
				continue;
			}
			break;
		}
	}
	// Log de fallo
	try {
		const msg = lastError?.response?.status
			? `status ${lastError.response.status}`
			: lastError?.code || 'unknown';
		console.warn('[geo] forwardGeocode failed:', msg, 'q=', String(q).slice(0, 64));
	} catch {}
	return null;
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

// Convierte precio textual a número CLP (normalizado)
function toNumberCLP(val, currency, ufValue) {
	return normalizePriceCLP(val, currency, ufValue);
}

// Calcula recomendaciones según reglas del enunciado
async function computeRecommendations({ userId, propertyId }) {
	if (!propertyId) {
		throw new Error('propertyId is required');
	}

	// Reset cache per invocation
	geocodeCache.clear();

	// Obtener UF para normalizar precios
	const ufValue = await getUfValue();

	// 1) Obtener ubicación, dormitorios y precio de la propiedad base
	const baseProp = await fetchPropertyById(propertyId);
	if (!baseProp) throw new Error('Base property not found');

	const baseBedrooms = parseBedrooms(baseProp.bedrooms);
	const basePrice = toNumberCLP(baseProp.price, baseProp.currency, ufValue);
	const baseLocationText = baseProp.location || '';
	const baseArea = extractArea(baseLocationText);

	// Geocodificar base para obtener lat/lon (si falla, haremos fallback sin distancia)
	const baseGeo = await forwardGeocode(baseLocationText);
	const baseLat = baseGeo?.lat ?? null;
	const baseLon = baseGeo?.lon ?? null;

	// 2) Filtrar por mismos dormitorios, precio <= base y misma área (estricto)
	const all = await fetchAllProperties(500);
	const strict = all.filter((p) => {
		if (!p || String(p.id) === String(baseProp.id)) return false;
		const b = parseBedrooms(p.bedrooms);
		const price = toNumberCLP(p.price, p.currency, ufValue);
		if (b == null || price == null || baseBedrooms == null || basePrice == null) return false;
		if (b !== baseBedrooms) return false;
		if (price > basePrice) return false;
		// compara área representativa de la ubicación
		const candArea = extractArea(p.location || '');
		if (baseArea && candArea && candArea !== baseArea) return false;
		return true;
	});

	// Si no hay candidatos estrictos, relajamos el criterio de área
	const prefiltered = strict.length > 0 ? strict : all.filter((p) => {
		if (!p || String(p.id) === String(baseProp.id)) return false;
		const b = parseBedrooms(p.bedrooms);
		const price = toNumberCLP(p.price, p.currency, ufValue);
		if (b == null || price == null || baseBedrooms == null || basePrice == null) return false;
		if (b !== baseBedrooms) return false;
		if (price > basePrice) return false;
		return true;
	});
	if (strict.length === 0) {
		console.warn('[recs] no strict area matches; using relaxed area filter');
	}

	let enriched = [];
	if (baseLat != null && baseLon != null) {
		// 3) Geocodificar candidatos y calcular distancia
		for (const p of prefiltered) {
			const geo = await forwardGeocode(p.location || '');
			if (!geo) continue;
			const distance = haversine(baseLat, baseLon, geo.lat, geo.lon);
			enriched.push({
				id: p.id,
				name: p.name,
				price: toNumberCLP(p.price, p.currency, ufValue),
				location: p.location,
				img: p.img,
				url: p.url,
				bedrooms: parseBedrooms(p.bedrooms),
				distance,
				timestamp: p.timestamp ? new Date(p.timestamp).getTime() : 0,
			});
		}
		// Ordenar por distancia y luego por precio
		enriched.sort((a, b) => (a.distance - b.distance) || (a.price - b.price));
	} else {
		// Fallback: sin geocoding de base. Ordenar por cercanía de precio y recencia.
		console.warn('[geo] base geocode missing — using area/price fallback');
		enriched = prefiltered
			.map((p) => ({
				id: p.id,
				name: p.name,
				price: toNumberCLP(p.price, p.currency, ufValue),
				location: p.location,
				img: p.img,
				url: p.url,
				bedrooms: parseBedrooms(p.bedrooms),
				distance: null,
				timestamp: p.timestamp ? new Date(p.timestamp).getTime() : 0,
			}))
			.sort((a, b) => {
				const da = Math.abs((a.price ?? 0) - (basePrice ?? 0));
				const db = Math.abs((b.price ?? 0) - (basePrice ?? 0));
				if (da !== db) return da - db;
				return (b.timestamp || 0) - (a.timestamp || 0);
			});
	}

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

