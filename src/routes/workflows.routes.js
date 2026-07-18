import express from 'express';
import { createWithdrawal, reconcileSale, runAdvancePayout } from '../controllers/workflows.controller.js';

const router = express.Router();

router.post('/advance-payouts/run', runAdvancePayout);
router.post('/sales/:saleId/reconcile', reconcileSale);
router.post('/withdrawals', createWithdrawal);

export default router;
