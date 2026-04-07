import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_DEBUG: z
      .string()
      .optional()
      .transform((val) => val === "true"),
  },
  server: {},
  runtimeEnv: import.meta.env,
});
