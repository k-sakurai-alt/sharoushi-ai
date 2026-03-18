const express = require('express');
const line = require('@line/bot-sdk');
const { generateResponse } = require('../services/claude');
const db = require('../db/database');

const router = express.Router();

// ユーザーごとの選択カテゴリを一時保存
const userSessions = new Map();

const CATEGORIES = [
  { label: '労務管理', key: '労務管理' },
  { label: '社会保険', key: '社会保険' },
  { label: '雇用保険', key: '雇用保険' },
  { label: '給与計算', key: '給与計算' },
  { label: 'その他', key: 'その他' },
];

const MENU_TRIGGER_WORDS = ['メニュー', 'menu', 'はじめまして', 'こんにちは', 'ヘルプ', 'help'];

function getLineConfig() {
  return {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  };
}

function buildMenuMessage(welcomeText) {
  return {
    type: 'text',
    text: welcomeText,
    quickReply: {
      items: CATEGORIES.map(cat => ({
        type: 'action',
        action: {
          type: 'message',
          label: cat.label,
          text: `【${cat.key}】`,
        },
      })),
    },
  };
}

router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  const config = getLineConfig();
  const signature = req.headers['x-line-signature'];
  const body = req.body.toString('utf8');

  if (!line.validateSignature(body, config.channelSecret, signature)) {
    return res.status(403).send('Invalid signature');
  }

  const parsedBody = JSON.parse(body);
  const client = new line.Client(config);
  const events = parsedBody.events || [];

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
  const userMessage = event.message.text.trim();

  try {
    const officeName = await db.getSetting('office_name');

    // メニュー表示トリガー
    if (MENU_TRIGGER_WORDS.includes(userMessage)) {
      const welcomeMessage = await db.getSetting('welcome_message');
      const menuText = `${welcomeMessage}\n\nご相談内容をお選びください。`;
      await client.replyMessage(event.replyToken, buildMenuMessage(menuText));
      return;
    }

    // カテゴリ選択
    const categoryMatch = userMessage.match(/^【(.+)】$/);
    if (categoryMatch) {
      const category = categoryMatch[1];
      userSessions.set(userId, category);
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `「${category}」についてのご質問を入力してください。`,
        quickReply: {
          items: [{
            type: 'action',
            action: { type: 'message', label: 'メニューに戻る', text: 'メニュー' },
          }],
        },
      });
      return;
    }

    // AI回答生成（カテゴリがあれば付加）
    const selectedCategory = userSessions.get(userId);
    const contextMessage = selectedCategory
      ? `[${selectedCategory}に関する質問] ${userMessage}`
      : userMessage;

    const aiResponse = await generateResponse(userId, contextMessage);
    await db.saveConversation(userId, userMessage, aiResponse);

    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: aiResponse,
      quickReply: {
        items: [{
          type: 'action',
          action: { type: 'message', label: 'メニューに戻る', text: 'メニュー' },
        }],
      },
    });
  } catch (err) {
    console.error('Handle event error:', err);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '申し訳ございません。一時的にエラーが発生しました。しばらくしてからもう一度お試しください。',
    });
  }
}

module.exports = router;
