import express from 'express';
import { ApiResponse } from './shared/utils/api-response.js';

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json(ApiResponse.success({ status: 'ok' }, 'Service is healthy'));
});

export default app;
