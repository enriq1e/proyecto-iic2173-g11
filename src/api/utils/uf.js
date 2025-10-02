//RNF11 UF
const axios = require('axios');

async function getUfValue() {
  const url = process.env.UF_API_URL || 'https://mindicador.cl/api/uf';
  try {
    const { data } = await axios.get(url, { timeout: 5000 });
    // formato típico: { serie: [ { fecha, valor }, ... ] }
    const valor = data?.serie?.[0]?.valor;
    if (!valor) throw new Error('UF sin valor');
    return Number(valor);
  } catch (err) {
    const fallback = Number(process.env.UF_FALLBACK || 40000);
    console.error(`Error obteniendo UF (${err.message}). Usando fallback=${fallback}`);
    return fallback;
  }
}

module.exports = { getUfValue };
