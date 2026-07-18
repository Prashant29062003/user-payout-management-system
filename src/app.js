import express from 'express';
import { ApiResponse } from './shared/utils/api-response.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';

const app = express();

app.use(express.json());
app.use('/api/v1', apiRouter);

app.get('/health', (req, res) => {
  res.json(ApiResponse.success({ status: 'ok' }, 'Service is healthy'));
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
