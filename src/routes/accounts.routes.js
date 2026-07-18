import express from 'express';
import { getAccount, getAccountLedger } from '../controllers/account.controller.js';

const router = express.Router();

router.get('/:accountId/ledger', getAccountLedger);
router.get('/:accountId', getAccount);

export default router;
