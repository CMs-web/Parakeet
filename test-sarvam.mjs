import dotenv from 'dotenv';
dotenv.config();

import { SarvamAIClient } from 'sarvamai';

const apiKey = process.env.SARVAM_API_KEY;

if (!apiKey) {
  console.error('Error: SARVAM_API_KEY is not set in .env');
  process.exit(1);
}

const client = new SarvamAIClient({
  apiSubscriptionKey: apiKey,
});

async function main() {
  const response = await client.chat.completions({
    model: 'sarvam-105b-conversations',
    messages: [
      {
        role: 'user',
        content: 'Hello! Please introduce yourself in one short sentence.',
      },
    ],
  });

  console.log('\n--- Sarvam AI Reply ---');
  console.log(response.choices?.[0]?.message?.content);
}

main().catch(console.error);
