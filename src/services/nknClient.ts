import {Content, elizaLogger, IAgentRuntime, Memory, Service, ServiceType, stringToUuid} from '@elizaos/core'
import {Message, MultiClient} from 'nkn-sdk'
import {v4 as uuidV4} from 'uuid'

enum PayloadType {
    BINARY = 0,
    TEXT = 1,
    ACK = 2,
    SESSION = 3,
}

class NknClientInstance {
    private privateKey: string
    private clientId: string

    private runtime: IAgentRuntime
    private memory: Memory
    private callback: Function
    private nknClient: MultiClient
    private connectResolve: any
    private connected: Promise<boolean>

    constructor(privateKey: string, clientId: string, runtime: IAgentRuntime) {
        this.privateKey = privateKey
        this.clientId = clientId
        this.runtime = runtime


        // Create NKN client
        this.connected = new Promise<boolean>(resolve => {
            this.connectResolve = resolve
        })
        this.nknClient = new MultiClient({
            identifier: clientId,
            seed: privateKey,
            msgHoldingSeconds: 3999999999,
            numSubClients: 4,
            originalClient: true,
        })
        this.nknClient.onConnect(({addr}) => {
            elizaLogger.info(`NKN client connected. Address: ${this.nknClient.addr}`)
            this.connectResolve(true)
        })
        this.nknClient.onConnectFailed(() => {
            elizaLogger.error('NKN client connection failed.')
        })

        this.nknClient.onMessage(async (message: Message) => {
            elizaLogger.info(`Received message from ${message.src}: ${message.payload}`)
            await this.receiveMessage(message)
        })
    }

    setMemory(memory: Memory) {
        this.memory = memory
    }

    setCallback(callback: Function) {
        this.callback = callback
    }

    async receiveMessage(message: Message) {
        if (message.src == this.nknClient.addr) { // ignore self message
            return
        }
        const data = JSON.parse(<string>message.payload)
        if (data.contentType === 'receipt') { // ignore receipt message
            return
        }
        if (message.payloadType == PayloadType.TEXT) {
            await this.receiveTextMessage(message, data)
        }
    }

    async receiveTextMessage(message: Message, payloadData: any) {
        if (payloadData.contentType !== 'text') { // ignore not text message
            return
        }
        const content: string = payloadData.content
        const messageId: string = payloadData.id

        const newMemory: Memory = {
            id: stringToUuid(messageId),
            userId: stringToUuid(message.src),
            agentId: this.runtime.agentId,
            roomId: stringToUuid(message.src),
            content: {
                text: content,
                action: 'RECEIVE_MESSAGE',
            } as Content,
        }

        if (this.memory) {
            newMemory.roomId = this.memory.roomId
        }

        if (!payloadData.options?.replyTo) {
            await this.runtime.messageManager.createMemory(newMemory)

            await this.runtime.processActions(newMemory, [newMemory], null, async (response) => {
                await this.sendMessage(message.src, response.text, {replyTo: messageId})
                return [newMemory]
            })
        }

        if (typeof this.callback === 'function') {
            await this.callback(newMemory.content)
            this.callback = null
        }
    }

    async waitConnected() {
        await this.connected
    }

    async sendMessage(src: string, message: string, options?: any): Promise<string> {
        const messageId = uuidV4()
        const data = {
            id: messageId,
            contentType: 'text',
            content: message,
            timestamp: Date.now(),
            options: {
                replyTo: options?.replyTo,
            },
        }
        try {
            await this.waitConnected()
            await this.nknClient.send(src, JSON.stringify(data), {noReply: true})
            return messageId
        } catch (e) {
            elizaLogger.error(`Failed to send message to ${src}: ${e}`)
        }
    }
}

export class NknClientService extends Service {
    static serviceType = ServiceType.NKN_CLIENT_SERVICE

    private instanceMap: Map<string, NknClientInstance> = new Map()

    constructor() {
        super()
    }

    setNknClientInstance(agentId: string, instance: NknClientInstance) {
        this.instanceMap.set(agentId, instance)
    }

    getNknClientInstance(agentId: string): NknClientInstance {
        return this.instanceMap.get(agentId)
    }

    async initialize(runtime: IAgentRuntime): Promise<void> {
        const privateKey = runtime.getSetting('NKN_CLIENT_PRIVATE_KEY') as string
        const clientId = runtime.getSetting('NKN_CLIENT_ID') as string
        if (!privateKey) {
            throw new Error('NKN_CLIENT_PRIVATE_KEY is required')
        }
        const newNknClient = new NknClientInstance(privateKey, clientId, runtime)
        this.setNknClientInstance(runtime.agentId, newNknClient)
    }


}
