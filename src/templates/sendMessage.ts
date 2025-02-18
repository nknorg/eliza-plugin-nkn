export const sendMessageTemplate = `{{actionExamples}}
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
`
