import {
    type Action,
    composeContext, Content, elizaLogger,
    generateObject, getEmbeddingZeroVector,
    HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    ServiceType,
    type State, stringToUuid,
} from '@elizaos/core'
import {z} from 'zod'
import {validateNknConfig} from '../environment'
import {NknClientService} from '../services'
import {sendMessageTemplate} from '../templates/sendMessage'

const SendMessageActionSchema = z.object({
    address: z.string(),
    message: z.string(),
})

export interface SendMessageContent extends Content {
    address: string;
    message: string;
}

export const sendMessageAction: Action = {
    name: 'SEND_MESSAGE',
    similes: [
        'SEND_MESSAGE',
        'SEND_TEXT',
    ],
    description:
        'Sends a message to a user in the current room.',
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        await validateNknConfig(runtime)
        return true
    },
    handler: async (runtime: IAgentRuntime,
                    message: Memory,
                    state: State,
                    options: any,
                    callback: HandlerCallback): Promise<boolean> => {
        let currentState = state
        if (!currentState) {
            currentState = (await runtime.composeState(message)) as State
        } else {
            currentState = await runtime.updateRecentMessageState(state)
        }

        // Compose context
        const sendMessageContext = composeContext({
            state: currentState,
            template: sendMessageTemplate,
        })

        // Generate transfer content
        const content = (
            await generateObject({
                runtime,
                context: sendMessageContext,
                modelClass: ModelClass.LARGE,
                schema: SendMessageActionSchema,
            })
        ).object as unknown as SendMessageContent

        if (!content.address) {
            elizaLogger.error(`Invalid NKN address: ${content.address}`)
            if (callback) {
                callback({
                    text: 'Invalid NKN address',
                    content: {error: 'Invalid NKN address'},
                })
            }
            return false
        }

        const agentId = runtime.agentId
        const nknClientService = runtime.getService<NknClientService>(ServiceType.NKN_CLIENT_SERVICE)
        const nknClientInstance = nknClientService.getNknClientInstance(agentId)
        nknClientInstance.setMemory(message)
        await nknClientInstance.waitConnected()
        const messageId = await nknClientInstance.sendMessage(content.address, content.message)
        const newMessage: Memory = {
            id: stringToUuid(messageId),
            agentId: runtime.agentId,
            roomId: message.roomId,
            userId: message.userId,
            content,
        }

        await runtime.messageManager.createMemory(newMessage)
        elizaLogger.info(`Sent message to ${content.address}: ${content.message}`)

        // Create a timeout promise that will reject after 10 minutes
        const timeoutPromise = new Promise<boolean>((_, reject) => {
            setTimeout(() => {
                elizaLogger.error('Timeout waiting for callback.')
                reject(new Error('Callback not called within 10 minutes'))
            }, 10 * 60 * 1000)  // 10 minutes in milliseconds
        })

        // Create a promise that resolves when the callback is called
        const callbackPromise = new Promise<boolean>((resolve, reject) => {
            const wrappedCallback = (response) => {
                if (response) {
                    response.text = `Sent message to ${content.address}: ${content.message}
Received message: ${response.text}`
                    callback(response)
                    resolve(true) // Callback was called, resolve promise
                } else {
                    reject(new Error('Callback called but no response.'))
                }
            }
            nknClientInstance.setCallback(wrappedCallback)
        })

        try {
            await Promise.race([callbackPromise, timeoutPromise])
            return true
        } catch (error) {
            elizaLogger.error('Error:', error)
            return false
        }
    },
    examples: [
        [
            {
                user: '{{user1}}',
                content: {text: 'Please ask Alice what time the meeting starts tomorrow?'},
            },
            {
                user: '{{agent}}',
                content: {
                    text: 'I don\'t have Alice\'s address, please tell me the address.',
                },
            },
            {
                user: '{{user1}}',
                content: {
                    text: 'Alice\'s NKN address is 03397286c9c728bdd779b44f41bd28b0f6463531cbf8dc0df38949c86d84ed6f',
                },
            },
            {
                user: '{{agent}}',
                content: {
                    text: 'I will send a message to Alice.\n<message>',
                    action: 'SEND_MESSAGE',
                },
            },
        ],
    ],
}
