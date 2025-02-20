// src/actions/sendMessage.ts
import {
  composeContext,
  elizaLogger,
  generateObject,
  ModelClass,
  ServiceType,
  stringToUuid
} from "@elizaos/core";
import { z as z2 } from "zod";

// src/environment.ts
import { z } from "zod";
var nknEnvSchema = z.object({
  NKN_CLIENT_PRIVATE_KEY: z.string().min(1, "NKN_CLIENT_PRIVATE_KEY is required"),
  NKN_CLIENT_ID: z.string().optional()
});
async function validateNknConfig(runtime) {
  try {
    const config = {
      NKN_CLIENT_PRIVATE_KEY: runtime.getSetting("NKN_CLIENT_PRIVATE_KEY") || process.env.NKN_CLIENT_PRIVATE_KEY,
      NKN_CLIENT_ID: runtime.getSetting("NKN_CLIENT_ID") || process.env.NKN_CLIENT_ID
    };
    return nknEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `NKN configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/templates/sendMessage.ts
var sendMessageTemplate = `{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

The format of the address is as follows:
- Assistant: 03397286c9c728bdd779b44f41bd28b0f6463531cbf8dc0df38949c86d84ed6f
- User1: alice.d2286f7080da76c8fb2edfa4e280f27f9aaea201f6b3b871e11d41327b993b20
- User2: bob.5eb3a1856e4565416807750328564e08566642406f81720e39c5f16b5565fb23

Example response:
    \`\`\`json
{
    "address": "03397286c9c728bdd779b44f41bd28b0f6463531cbf8dc0df38949c86d84ed6f",
    "message": "What time does the meeting start tomorrow?"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information:
- The address (Assistant, User1, or User2)
- The message that you need to regenerate a piece of text to convey the message, telling the other party who you are and whose message you are conveying

Respond with a JSON markdown block containing only the extracted values.
`;

// src/actions/sendMessage.ts
var SendMessageActionSchema = z2.object({
  address: z2.string(),
  message: z2.string()
});
var sendMessageAction = {
  name: "SEND_MESSAGE",
  similes: [
    "SEND_MESSAGE",
    "SEND_TEXT"
  ],
  description: "Sends a message to a user in the current room.",
  validate: async (runtime, message) => {
    await validateNknConfig(runtime);
    return true;
  },
  handler: async (runtime, message, state, options, callback) => {
    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.updateRecentMessageState(state);
    }
    const sendMessageContext = composeContext({
      state: currentState,
      template: sendMessageTemplate
    });
    const content = (await generateObject({
      runtime,
      context: sendMessageContext,
      modelClass: ModelClass.LARGE,
      schema: SendMessageActionSchema
    })).object;
    if (!content.address) {
      elizaLogger.error(`Invalid NKN address: ${content.address}`);
      if (callback) {
        callback({
          text: "Invalid NKN address",
          content: { error: "Invalid NKN address" }
        });
      }
      return false;
    }
    const agentId = runtime.agentId;
    const nknClientService = runtime.getService(ServiceType.NKN_CLIENT_SERVICE);
    const nknClientInstance = nknClientService.getNknClientInstance(agentId);
    nknClientInstance.setMemory(message);
    await nknClientInstance.waitConnected();
    const messageId = await nknClientInstance.sendMessage(content.address, content.message);
    const newMessage = {
      id: stringToUuid(messageId),
      agentId: runtime.agentId,
      roomId: message.roomId,
      userId: message.userId,
      content
    };
    await runtime.messageManager.createMemory(newMessage);
    elizaLogger.info(`Sent message to ${content.address}: ${content.message}`);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        elizaLogger.error("Timeout waiting for callback.");
        reject(new Error("Callback not called within 10 minutes"));
      }, 10 * 60 * 1e3);
    });
    const callbackPromise = new Promise((resolve, reject) => {
      const wrappedCallback = (response) => {
        if (response) {
          response.text = `Sent message to ${content.address}: ${content.message}
Received message: ${response.text}`;
          callback(response);
          resolve(true);
        } else {
          reject(new Error("Callback called but no response."));
        }
      };
      nknClientInstance.setCallback(wrappedCallback);
    });
    try {
      await Promise.race([callbackPromise, timeoutPromise]);
      return true;
    } catch (error) {
      elizaLogger.error("Error:", error);
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Please ask Alice what time the meeting starts tomorrow?" }
      },
      {
        user: "{{agent}}",
        content: {
          text: "I don't have Alice's address, please tell me the address."
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Alice's NKN address is 03397286c9c728bdd779b44f41bd28b0f6463531cbf8dc0df38949c86d84ed6f"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "I will send a message to Alice.\n<message>",
          action: "SEND_MESSAGE"
        }
      }
    ]
  ]
};

// src/actions/receiveMessage.ts
import {
  composeContext as composeContext2,
  generateText,
  getEmbeddingZeroVector as getEmbeddingZeroVector2,
  ModelClass as ModelClass2
} from "@elizaos/core";

// src/templates/receiveMessage.ts
var receiveMessageTemplate = `{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

{{actions}}
`;

// src/actions/receiveMessage.ts
var receiveMessageAction = {
  name: "RECEIVE_MESSAGE",
  similes: [
    "RECEIVE_MESSAGE",
    "RECEIVE_TEXT"
  ],
  description: "Receives a message from a user in the current room.",
  validate: async (runtime, message) => {
    await validateNknConfig(runtime);
    return true;
  },
  handler: async (runtime, message, state, options, callback) => {
    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.updateRecentMessageState(state);
    }
    const receiveMessageContext = composeContext2({
      state: currentState,
      template: receiveMessageTemplate
    });
    const response = await generateText({
      runtime,
      context: receiveMessageContext,
      modelClass: ModelClass2.LARGE,
      stop: ["\n"]
    });
    const responseMessage = {
      agentId: runtime.agentId,
      roomId: message.roomId,
      userId: message.userId,
      content: {
        text: response,
        action: "IGNORE",
        source: message.content.source,
        inReplyTo: message.id
      },
      embedding: getEmbeddingZeroVector2(),
      createdAt: Date.now()
    };
    await runtime.messageManager.createMemory(responseMessage);
    await callback(responseMessage.content);
    return true;
  },
  examples: [
    [
      {
        user: "{{user2}}",
        content: {
          text: "Hello, I am Alice.",
          action: "RECEIVE_MESSAGE"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "Hello, Alice.",
          action: "IGNORE"
        }
      }
    ],
    [
      {
        user: "{{agent1}}",
        content: {
          text: "Hello, I am Agent1.",
          action: "RECEIVE_MESSAGE"
        }
      },
      {
        user: "{{agent2}}",
        content: {
          text: "Hello, Agent1.",
          action: "IGNORE"
        }
      }
    ]
  ]
};

// src/services/nknClient.ts
import { elizaLogger as elizaLogger2, Service, ServiceType as ServiceType2, stringToUuid as stringToUuid2 } from "@elizaos/core";
import { MultiClient } from "nkn-sdk";
import { v4 as uuidV4 } from "uuid";
var NknClientInstance = class {
  privateKey;
  clientId;
  runtime;
  memory;
  callback;
  nknClient;
  connectResolve;
  connected;
  constructor(privateKey, clientId, runtime) {
    this.privateKey = privateKey;
    this.clientId = clientId;
    this.runtime = runtime;
    this.connected = new Promise((resolve) => {
      this.connectResolve = resolve;
    });
    this.nknClient = new MultiClient({
      identifier: clientId,
      seed: privateKey,
      msgHoldingSeconds: 3999999999,
      numSubClients: 4,
      originalClient: true
    });
    this.nknClient.onConnect(({ addr }) => {
      elizaLogger2.info(`NKN client connected. Address: ${this.nknClient.addr}`);
      this.connectResolve(true);
    });
    this.nknClient.onConnectFailed(() => {
      elizaLogger2.error("NKN client connection failed.");
    });
    this.nknClient.onMessage(async (message) => {
      elizaLogger2.info(`Received message from ${message.src}: ${message.payload}`);
      await this.receiveMessage(message);
    });
  }
  setMemory(memory) {
    this.memory = memory;
  }
  setCallback(callback) {
    this.callback = callback;
  }
  async receiveMessage(message) {
    if (message.src == this.nknClient.addr) {
      return;
    }
    const data = JSON.parse(message.payload);
    if (data.contentType === "receipt") {
      return;
    }
    if (message.payloadType == 1 /* TEXT */) {
      await this.receiveTextMessage(message, data);
    }
  }
  async receiveTextMessage(message, payloadData) {
    if (payloadData.contentType !== "text") {
      return;
    }
    const content = payloadData.content;
    const messageId = payloadData.id;
    const newMemory = {
      id: stringToUuid2(messageId),
      userId: stringToUuid2(message.src),
      agentId: this.runtime.agentId,
      roomId: stringToUuid2(message.src),
      content: {
        text: content,
        action: "RECEIVE_MESSAGE"
      }
    };
    if (this.memory) {
      newMemory.roomId = this.memory.roomId;
    }
    if (!payloadData.options?.replyTo) {
      await this.runtime.messageManager.createMemory(newMemory);
      await this.runtime.processActions(newMemory, [newMemory], null, async (response) => {
        await this.sendMessage(message.src, response.text, { replyTo: messageId });
        return [newMemory];
      });
    }
    if (typeof this.callback === "function") {
      await this.callback(newMemory.content);
      this.callback = null;
    }
  }
  async waitConnected() {
    await this.connected;
  }
  async sendMessage(src, message, options) {
    const messageId = uuidV4();
    const data = {
      id: messageId,
      contentType: "text",
      content: message,
      timestamp: Date.now(),
      options: {
        replyTo: options?.replyTo
      }
    };
    try {
      await this.waitConnected();
      await this.nknClient.send(src, JSON.stringify(data), { noReply: true });
      return messageId;
    } catch (e) {
      elizaLogger2.error(`Failed to send message to ${src}: ${e}`);
    }
  }
};
var NknClientService = class extends Service {
  static serviceType = ServiceType2.NKN_CLIENT_SERVICE;
  instanceMap = /* @__PURE__ */ new Map();
  constructor() {
    super();
  }
  setNknClientInstance(agentId, instance) {
    this.instanceMap.set(agentId, instance);
  }
  getNknClientInstance(agentId) {
    return this.instanceMap.get(agentId);
  }
  async initialize(runtime) {
    const privateKey = runtime.getSetting("NKN_CLIENT_PRIVATE_KEY");
    const clientId = runtime.getSetting("NKN_CLIENT_ID");
    if (!privateKey) {
      throw new Error("NKN_CLIENT_PRIVATE_KEY is required");
    }
    const newNknClient = new NknClientInstance(privateKey, clientId, runtime);
    this.setNknClientInstance(runtime.agentId, newNknClient);
  }
};

// src/index.ts
var nknPlugin = {
  name: "nkn",
  description: "A plugin based on NKN that can communicate with other AI Agents",
  services: [new NknClientService()],
  actions: [sendMessageAction, receiveMessageAction]
};
var index_default = nknPlugin;
export {
  index_default as default,
  nknPlugin
};
//# sourceMappingURL=index.js.map