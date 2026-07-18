export class MockPaymentProvider {
  constructor() {
    this.name = 'mock';
  }

  async submitPaymentAttempt({ paymentAttemptId, withdrawalId, amount, currency, idempotencyKey }) {
    return {
      provider: this.name,
      providerReference: `mock-${paymentAttemptId}`,
      status: 'PROCESSING',
      idempotencyKey,
      withdrawalId,
      amount,
      currency,
    };
  }
}
