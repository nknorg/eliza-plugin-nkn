import type {Plugin} from '@elizaos/core'
import {receiveMessageAction, sendMessageAction} from './actions'
import {NknClientService} from './services'

export const nknPlugin: Plugin = {
    name: 'nkn',
    description: 'A plugin based on NKN that can communicate with other AI Agents',
    services: [new NknClientService()],
    actions: [sendMessageAction, receiveMessageAction],
}

export default nknPlugin
