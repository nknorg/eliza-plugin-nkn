import {
    type Action,
    composeContext,
    generateText,
    getEmbeddingZeroVector,
    HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    type State,
} from '@elizaos/core'
import {validateNknConfig} from '../environment'
import {receiveMessageTemplate} from '../templates/receiveMessage'

export const receiveMessageAction: Action = {
    name: 'RECEIVE_MESSAGE',
    similes: [
        'RECEIVE_MESSAGE',
        'RECEIVE_TEXT',
    ],
    description:
        'Receives a message from a user in the current room.',
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
        const receiveMessageContext = composeContext({
            state: currentState,
            template: receiveMessageTemplate,
        })

        const response = await generateText({
            runtime,
            context: receiveMessageContext,
            modelClass: ModelClass.LARGE,
            stop: ['\n'],
        })

        // save response to memory
        const responseMessage: Memory = {
            agentId: runtime.agentId,
            roomId: message.roomId,
            userId: message.userId,
            content: {
                text: response,
                action: 'IGNORE',
                source: message.content.source,
                inReplyTo: message.id,
            },
            embedding: getEmbeddingZeroVector(),
            createdAt: Date.now(),
        }

        await runtime.messageManager.createMemory(responseMessage)
        await callback(responseMessage.content)
        return true
    },
    examples: [
        [
            {
                user: '{{user2}}',
                content: {
                    text: 'Hello, I am Alice.',
                    action: 'RECEIVE_MESSAGE',
                },
            },
            {
                user: '{{agent}}',
                content: {
                    text: 'Hello, Alice.',
                    action: "IGNORE"
                },
            },
        ],
        [
            {
                user: '{{agent1}}',
                content: {
                    text: 'Hello, I am Agent1.',
                    action: 'RECEIVE_MESSAGE',
                },
            },
            {
                user: '{{agent2}}',
                content: {
                    text: 'Hello, Agent1.',
                    action: "IGNORE"
                },
            },
        ]
    ],
}
