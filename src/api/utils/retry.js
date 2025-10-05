// RNF10 retry con Fibonacci
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normaliseOptions(options) {
  if (typeof options === "number") {
    return { maxRetries: options };
  }

  return options || {};
}

// Retry con Fibonacci. Ejecuta `fn` y reintenta ante error utilizando
// una secuencia Fibonacci multiplicada por `baseDelayMs`.
async function withFibRetry(fn, options) {
  const {
    maxRetries = 5,
    baseDelayMs = 1000,
    shouldRetry = () => true,
    onRetry,
  } = normaliseOptions(options);

  let fibPrev = 0;
  let fibCurr = 1;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const canRetry = attempt < maxRetries - 1 && shouldRetry(error, attempt);
      if (!canRetry) {
        throw error;
      }

      const delay = baseDelayMs * fibCurr;

      if (typeof onRetry === "function") {
        try {
          onRetry({ attempt: attempt + 1, delay, error });
        } catch (listenerErr) {
          console.warn("withFibRetry onRetry handler error:", listenerErr);
        }
      }

      console.warn(`[Retry ${attempt + 1}] Error:`, error.message || error);
      console.warn(`Esperando ${delay}ms antes de reintentar...`);
      await sleep(delay);

      [fibPrev, fibCurr] = [fibCurr, fibPrev + fibCurr || 1];
    }
  }
}

module.exports = { withFibRetry };
