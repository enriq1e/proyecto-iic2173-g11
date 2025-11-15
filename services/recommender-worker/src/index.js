require('dotenv').config();
const Bull = require('bull');
const { computeRecommendations } = require('./services/recommendations');
const axios = require('axios');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || '2');

const queue = new Bull('recommendations', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: 50
  }
});

// fila de trabajos - worker
queue.process('compute-recommendations', CONCURRENCY, async (job) => {
  const { data } = job;
  console.log(`[worker] Processing job ${job.id}`, data || {});
  const result = await computeRecommendations(data || {});
  // Webhook opcional para persistir en la API
  const webhook = process.env.WEBHOOK_URL;
  if (webhook) {
    try {
      const payload = {
        userId: data?.userId,
        propertyId: data?.propertyId,
        recommendations: (result?.recommendations || []).map(r => r.id),
        jobId: String(job.id),
      };
      const headers = {};
      if (process.env.INTERNAL_API_KEY) headers['X-Internal-Key'] = process.env.INTERNAL_API_KEY;
      await axios.post(webhook, payload, { headers, timeout: 5000 });
    } catch (e) {
      console.warn('[worker] webhook failed:', e?.message || e);
    }
  }
  return result;
});

// registramos trabajos completados y fallidos
queue.on('completed', (job, result) => {
  console.log(`[worker] Job ${job.id} completed`, result);
});
queue.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err?.message);
});

process.on('SIGINT', async () => {
  await queue.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await queue.close();
  process.exit(0);
});
