const request = require('supertest');
const app = require('../app.js');

// Mock del mqtt para que no se caiga
jest.mock('../../broker/mqttClient', () => ({
  sendPurchaseRequest: jest.fn(),
}));

describe('API Propiedades', () => {

    // Mockeamos la bdd
    beforeAll(() => {
      app.context.orm = {
        Propertie: {
          findAll: jest.fn().mockResolvedValue([
            { id: 530, location: 'Santiago', price: 1000, currency: '$' },
          ]),
        },
      };
    });


  // Testeamos algunas rutas  
  test('GET /', async () => {
    const res = await request(app.callback()).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('Home API Properties');
  });

  test('GET /properties', async () => {
    const res = await request(app.callback()).get('/properties');
    expect(res.statusCode).toBe(200);
  });
});
