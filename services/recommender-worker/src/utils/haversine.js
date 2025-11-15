// https://www.geeksforgeeks.org/dsa/program-distance-two-points-earth
// Funcion Haversine para calcular distancia en metros entre dos coordenadas
// lat1, lon1, lat2, lon2 are numbers (degrees)
const toRad = (deg) => (deg * Math.PI) / 180;

function haversine(lat1, lon1, lat2, lon2) {
	if (
		[lat1, lon1, lat2, lon2].some(
			(v) => v === undefined || v === null || Number.isNaN(Number(v))
		)
	) {
		return Infinity;
	}
	const R = 6371000; // metros
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) *
			Math.cos(toRad(lat2)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return Math.round(R * c);
}

module.exports = { haversine };

