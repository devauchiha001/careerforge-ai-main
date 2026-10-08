import { himalayasProvider } from "./himalayas";
import { jobicyProvider } from "./jobicy";
import type { JobProvider } from "../jobProvider";

export const JOB_PROVIDERS: JobProvider[] = [jobicyProvider, himalayasProvider];
export { himalayasProvider, jobicyProvider };
