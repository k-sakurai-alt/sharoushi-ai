const express = require('express');
const line = require('@line/bot-sdk');
const { generateResponse } = require('../services/claude');
const db = require('../db/database');

const router = express.Router();

// ユーザーごとの選択カテゴリを一時保存
const userSessions = new Map();

const CATEGORIES = [
  { label: '👔 労務管理', key: '労務管理', color: '#2C5F8A' },
  { label: '🏥 社会保険', key: '社会保険', color: '#2C5F8A' },
  { label: '📋 雇用保険', key: '雇用保険', color: '#2C5F8A' },
  { label: '💴 給与計算', key: '給与計算', color: '#2C5F8A' },
  { label: '💬 その他相談', key: 'その他', color: '#5A7A9A' },
];

const MENU_TRIGGER_WORDS = ['メニュー', 'menu', 'はじめまして', 'こんにちは', 'ヘルプ', 'help'];

function getLineConfig() {
  return {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  };
}

function buildMenuFlex(officeName, welcomeText) {
  return {
    type: 'flex',
    altText: 'ご相談メニュー',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: officeName,
            color: '#a8c8e8',
            size: 'sm',
          },
          {
            type: 'text',
            text: 'AI相談アシスタント',
            color: '#ffffff',
            size: 'xl',
            weight: 'bold',
            margin: 'xs',
          },
        ],
        backgroundColor: '#1A3A5C',
        paddingAll: '20px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: welcomeText,
            wrap: true,
            size: 'sm',
            color: '#555555',
          },
          {
            type: 'separator',
            margin: 'lg',
            color: '#e0e0e0',
          },
          {
            type: 'text',
            text: 'ご相談内容をお選びください',
            weight: 'bold',
            size: 'md',
            margin: 'lg',
            color: '#1A3A5C',
          },
          ...CATEGORIES.map(cat => ({
            type: 'button',
            action: {
              type: 'message',
              label: cat.label,
              text: `【${cat.key}】`,
            },
            style: 'primary',
            color: cat.color,
            margin: 'sm',
            height: 'sm',
          })),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '※複雑な案件は担当の先生にご確認ください',
            size: 'xxs',
            color: '#aaaaaa',
            align: 'center',
            wrap: true,
          },
        ],
        paddingAll: '10px',
      },
      styles: {
        header: { separator: false },
        footer: { separator: true },
      },
    },
  };
}

function buildCategoryFlex(category) {
  return {
    type: 'flex',
    altText: `${category}についてご質問ください`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: category,
            weight: 'bold',
            size: 'lg',
            color: '#1A3A5C',
          },
          {
            type: 'text',
            text: 'についてご質問をどうぞ。\nメッセージを入力してください。',
            wrap: true,
            size: 'sm',
            color: '#555555',
            margin: 'sm',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: { type: 'message', label: '← メニューに戻る', text: 'メニュー' },
            style: 'secondary',
            height: 'sm',
          },
        ],
        paddingAll: '10px',
      },
      styles: {
        footer: { separator: true },
      },
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
    const [officeName, welcomeMessage] = await Promise.all([
      db.getSetting('office_name'),
      db.getSetting('welcome_message'),
    ]);

    // メニュー表示
    if (MENU_TRIGGER_WORDS.includes(userMessage)) {
      await client.replyMessage(event.replyToken, buildMenuFlex(officeName, welcomeMessage));
      return;
    }

    // カテゴリ選択
    const categoryMatch = userMessage.match(/^【(.+)】$/);
    if (categoryMatch) {
      const category = categoryMatch[1];
      userSessions.set(userId, category);
      await client.replyMessage(event.replyToken, buildCategoryFlex(category));
      return;
    }

    // AI回答生成
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
