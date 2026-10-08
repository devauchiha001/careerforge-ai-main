import type { JobProviderPage } from "./types";

export type JobProvider = {
  id: string;
  name: string;
  fetchPage(cursor?: string): Promise<JobProviderPage>;
};

export { jobicyProvider } from "./providers/jobicy";
