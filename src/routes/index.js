import express from 'express';
import accountsRoutes from './accounts.routes.js';
import workflowsRoutes from './workflows.routes.js';
import webhooksRoutes from './webhooks.routes.js';

const router = express.Router();

router.use('/accounts', accountsRoutes);
router.use('/workflows', workflowsRoutes);
router.use('/webhooks', webhooksRoutes);

export default router;
