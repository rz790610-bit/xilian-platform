import { router, publicProcedure } from "../../core/trpc";
import { authService } from "../services/auth.service";
import { z } from "zod";
export const authRoutes = router({
  validate: publicProcedure.input(z.object({ token: z.string() })).query(({ input }) => authService.validateToken(input.token)),
});
