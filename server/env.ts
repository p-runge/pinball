import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
  },
  client: {},
  clientPrefix: "VITE_",
  runtimeEnv: process.env,
});
