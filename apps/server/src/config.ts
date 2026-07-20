import { z } from "zod";

const env = z
  .object({
    PORT: z.coerce.number().int().positive().default(3001),
    CLIENT_ORIGIN: z.url().default("http://localhost:5173"),
  })
  .parse(process.env);

export const config = {
  port: env.PORT,
  clientOrigin: env.CLIENT_ORIGIN,
};
