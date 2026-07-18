import express from 'express';
import { handlePaymentProviderWebhook } from '../controllers/webhook.controller.js';

const router = express.Router();

router.post('/payment-provider', handlePaymentProviderWebhook);

export default router;
