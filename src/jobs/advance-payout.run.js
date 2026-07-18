import { advancePayoutJob } from './advance-payout.job.js';

const results = await advancePayoutJob.run();
console.log('Advance payout job results:', JSON.stringify(results, null, 2));
