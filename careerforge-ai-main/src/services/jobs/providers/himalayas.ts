import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import type { JobProvider } from "../jobProvider";
import { normalizeHimalayasResponse } from "./himalayasNormalizer";

const fetchHimalayasPage = httpsCallable<{ cursor?: string }, unknown>(functions, "himalayasJobs", { timeout: 20_000 });

export const himalayasProvider: JobProvider = {
  id: "himalayas",
  name: "Himalayas",
  async fetchPage(cursor) {
    const result = await fetchHimalayasPage(cursor ? { cursor } : {});
    return normalizeHimalayasResponse(result.data);
  },
};
