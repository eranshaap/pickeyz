// Every number the ministry calls cost us: the two numbers that govern one request to data.gov.il.
// Each carries its source in a comment and must not be changed in code without changing the comment.

export const MOT_TIMEOUT_MS = 30_000;    // source: findCar-constants.md, "מספרים שאינם בציון" — MOT_TIMEOUT_MS: one request is abandoned after 30 s
export const MOT_RETRY_PAUSE_MS = 5_000; // source: findCar-constants.md, "מספרים שאינם בציון" — MOT_RETRY_PAUSE_MS: the pause between a failed attempt and its single retry
