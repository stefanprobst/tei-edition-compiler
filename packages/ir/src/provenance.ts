import { z } from 'zod';
export const ProvenanceSchema = z.object({ source: z.string().min(1), selector: z.string().min(1) }).strict();
