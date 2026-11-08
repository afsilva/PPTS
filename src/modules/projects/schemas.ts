import { z } from "zod";

export const projectMembershipSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(["CONTRIBUTOR", "MANAGER"]),
});

export type ProjectMembershipInput = z.infer<typeof projectMembershipSchema>;
