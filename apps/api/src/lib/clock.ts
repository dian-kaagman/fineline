/** Injected time source, so business rules and rate limits are testable without the wall clock. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
