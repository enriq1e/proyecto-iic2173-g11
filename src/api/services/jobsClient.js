const axios = require('axios');
const { withFibRetry } = require('../utils/retry');

// Resuelve la URL base del JobMaster
// Local: JOBMASTER_URL=http://localhost:8080
const JOBMASTER_URL = process.env.JOBMASTER_URL || 'http://localhost:8080';

// Encola un job de recomendaciones
async function enqueueRecommendationJob({ userId, propertyId, source = 'purchase' }) {
  if (!userId || !propertyId) {
    throw new Error('userId and propertyId are required');
  }
  const url = `${JOBMASTER_URL.replace(/\/$/, '')}/job`;
  const body = { userId, propertyId, source };

  const exec = async () => {
    const res = await axios.post(url, body, { timeout: 5000 });
    return res.data;
  };

  const data = await withFibRetry(exec, {
    maxRetries: 5,
    baseDelayMs: 500,
    shouldRetry: (err) => {
      const status = err?.response?.status;
      // Reintentar en timeouts/red y solo 5xx
      return !status || (status >= 500 && status < 600);
    },
    onRetry: ({ attempt, delay, error }) => {
      console.warn(`enqueueRecommendationJob reintento #${attempt} en ${delay}ms:`, error?.message || error);
    },
  });

  return data; // { jobId }
}

module.exports = { enqueueRecommendationJob };
