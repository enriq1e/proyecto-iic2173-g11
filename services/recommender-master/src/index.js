require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const Bull = require('bull');

// Configuración de Express
const app = express();
app.use(express.json());
app.use(morgan('dev'));

// Configuración de variables de entorno
const PORT = process.env.PORT;
const REDIS_URL = process.env.REDIS_URL;

// fila de trabajos con valores predeterminados 
let queue;

try {
  queue = new Bull('recommendations', REDIS_URL, {
    settings: {
      backoffStrategies: {
        // no custom strategies for now
      }
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      // No los eliminaremos inmediatamente para permitir consultas rápidas del estado del trabajo
      removeOnComplete: { age: 60 },
      removeOnFail: 50
    }
  });
} catch (e) {
  console.error('Failed to initialize Bull queue:', e.message);
}

// GET /heartbeat: indica si el servicio está operativo
app.get('/heartbeat', (req, res) => {
  res.json({ ok: true, service: 'recommender-master' });
});

// POST /job: recibe datos mínimos y encola un trabajo, retorna id del job
app.post('/job', async (req, res) => {
  try {
    const { userId, propertyId, source } = req.body || {};


    // Validamos body
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required and must be a string' });
    }
    if (!propertyId || typeof propertyId !== 'string') {
      return res.status(400).json({ error: 'propertyId is required and must be a string' });
    }

    const payload = {
      userId,
      propertyId,
      source: typeof source === 'string' && source.trim() ? source : 'purchase',
      createdAt: new Date().toISOString()
    };

    // Crear el job en la cola
  const job = await queue.add('compute-recommendations', payload);
    return res.status(202).json({ jobId: job.id });
  } catch (err) {
    console.error('Error creating job:', err);
    return res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /job/:id: estado y resultado del job
app.get('/job/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Job id is required' });

    const job = await queue.getJob(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const state = await job.getState();
  // returnvalue se fija cuando el worker resuelve
    const result = job.returnvalue ?? null;
    const failedReason = job.failedReason || (job.stacktrace && job.stacktrace[0]) || null;
    const progress = job.progress || 0;

    return res.json({
      id: job.id,
      state,
      progress,
      result: state === 'completed' ? result : null,
      error: state === 'failed' ? failedReason : null
    });
  } catch (err) {
    console.error('Error fetching job:', err);
    return res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Placeholder root
app.get('/', (req, res) => res.redirect('/heartbeat'));

// Graceful shutdown
const signals = ['SIGTERM', 'SIGINT'];
let server;
function start() {
  server = app.listen(PORT, () => {
    console.log(`Recommender Master listening on port ${PORT}`);
  });
}

async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down...`);
  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('HTTP server closed');
    }
    if (queue) {
      await queue.close();
      console.log('Queue closed');
    }
  } catch (err) {
    console.error('Error during shutdown:', err);
  } finally {
    process.exit(0);
  }
}

signals.forEach((sig) => process.on(sig, () => shutdown(sig)));

start();
