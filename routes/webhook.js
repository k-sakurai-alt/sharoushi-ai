const express = require('express');
const line = require('@line/bot-sdk');
const { generateResponse } = require('../services/claude');
const db = require('../db/database');

const router = express.Router();

function getLineConfig() {
  return {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  };
}

router.post('/', (req, res) => {
  const config = getLineConfig();
  const signature = req.headers['x-line-signature'];

  if (!line.validateSignature(JSON.stringify(req.body), config.channelSecret, signature)) {
    return res.status(403).send('Invalid signature');
  }

  const client = new line.Client(config);
  const events = req.body.events || [];

  Promise.all(events.map(event => handleEvent(event, client)))
    .then(() => res.json({ status: 'ok' }))
    .catch(err => {
      console.error('Webhook error:', err);
      res.status(500).send('Error');
    });
});

async function handleEvent(event, client) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const userMessage = event.message.text;

  try {
    // ウェルカムメッセージ対応
    if (userMessage === 'はじめまして' || userMessage === 'こんにちは') {
      const welcomeMessage = await db.getSetting('welcome_message');
      await client.replyMessage(event.replyToken, { type: 'text', text: welcomeMessage });
      return;
    }

    // AIで回答生成
    const aiResponse = await generateResponse(userId, userMessage);

    // 会話を保存
    await db.saveConversation(userId, userMessage, aiResponse);

    // LINEに返信
    await client.replyMessage(event.replyToken, { type: 'text', text: aiResponse });
  } catch (err) {
    console.error('Handle event error:', err);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '申し訳ございません。一時的にエラーが発生しました。しばらくしてからもう一度お試しください。',
    });
  }
}

module.exports = router;
