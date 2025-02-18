import type {IAgentRuntime} from '@elizaos/core'
import {z} from 'zod'

export const nknEnvSchema = z.object({
    NKN_CLIENT_PRIVATE_KEY: z.string().min(1, 'NKN_CLIENT_PRIVATE_KEY is required'),
    NKN_CLIENT_ID: z.string().optional(),
})

export type NknConfig = z.infer<typeof nknEnvSchema>

export async function validateNknConfig(runtime: IAgentRuntime): Promise<NknConfig> {
    try {
        const config = {
            NKN_CLIENT_PRIVATE_KEY:
                runtime.getSetting('NKN_CLIENT_PRIVATE_KEY') || process.env.NKN_CLIENT_PRIVATE_KEY,
            NKN_CLIENT_ID:
                runtime.getSetting('NKN_CLIENT_ID') || process.env.NKN_CLIENT_ID,
        }
        return nknEnvSchema.parse(config)
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessages = error.errors
                .map((err) => `${err.path.join('.')}: ${err.message}`)
                .join('\n')
            throw new Error(
                `NKN configuration validation failed:\n${errorMessages}`,
            )
        }
        throw error
    }
}
