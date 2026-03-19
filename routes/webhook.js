const express = require('express');
const line = require('@line/bot-sdk');
const { generateResponse } = require('../services/claude');
const db = require('../db/database');

const router = express.Router();

const userSessions = new Map();

const CATEGORIES = [
  { label: '👔 労務管理', key: '労務管理', color: '#2C5F8A' },
  { label: '🏥 社会保険', key: '社会保険', color: '#1A7A5C' },
  { label: '📋 雇用保険', key: '雇用保険', color: '#5A3A8A' },
  { label: '💴 給与計算', key: '給与計算', color: '#8A5A1A' },
  { label: '💬 その他相談', key: 'その他', color: '#4A6A8A' },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

const CATEGORY_FAQS = {
  '労務管理': [
    '有給休暇は何日取れますか？',
    '残業代の計算方法を教えてください',
    '育児休業を取りたいのですが',
    '就業規則について知りたい',
  ],
  '社会保険': [
    '社会保険の加入条件は？',
    '扶養に入れる条件を教えてください',
    '退職後の健康保険はどうすれば？',
    '傷病手当金の申請方法は？',
  ],
  '雇用保険': [
    '失業給付はいくらもらえますか？',
    '育児休業給付金の条件は？',
    '雇用保険の加入条件を教えてください',
    '離職票はいつもらえますか？',
  ],
  '給与計算': [
    '残業代の正しい計算方法は？',
    '交通費は社会保険料に含まれますか？',
    '給与明細の見方を教えてください',
    '手取り額の計算方法は？',
  ],
  'その他': [
    '顧問契約について教えてください',
    '助成金について知りたい',
    '相談費用はいくらですか？',
    '担当者に直接連絡したい',
  ],
};

const MENU_TRIGGER_WORDS = ['メニュー', 'menu', 'はじめまして', 'こんにちは', 'ヘルプ', 'help', '最初に戻る'];

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
        paddingAll: '20px',
        backgroundColor: '#1A3A5C',
        contents: [
          { type: 'text', text: officeName, color: '#a8c8e8', size: 'sm' },
          { type: 'text', text: 'AI相談アシスタント', color: '#ffffff', size: 'xl', weight: 'bold', margin: 'xs' },
          { type: 'text', text: 'いつでもお気軽にご相談ください', color: '#7aadd4', size: 'xs', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: welcomeText, wrap: true, size: 'sm', color: '#555555' },
          { type: 'separator', margin: 'lg', color: '#e0e0e0' },
          { type: 'text', text: 'ご相談内容をお選びください', weight: 'bold', size: 'md', margin: 'lg', color: '#1A3A5C' },
          ...CATEGORIES.map(cat => ({
            type: 'button',
            action: { type: 'message', label: cat.label, text: `【${cat.key}】` },
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
        paddingAll: '12px',
        contents: [
          { type: 'text', text: '※具体的な法的判断は担当の先生にご確認ください', size: 'xxs', color: '#aaaaaa', align: 'center', wrap: true },
        ],
        backgroundColor: '#f8f8f8',
      },
      styles: { footer: { separator: true } },
    },
  };
}

function buildCategoryFlex(category) {
  const cat = CATEGORY_MAP[category] || { color: '#2C5F8A' };
  const faqs = CATEGORY_FAQS[category] || [];
  const label = CATEGORIES.find(c => c.key === category)?.label || category;

  const faqButtons = faqs.map(q => ({
    type: 'button',
    action: { type: 'message', label: q.length > 20 ? q.substring(0, 19) + '…' : q, text: q },
    style: 'secondary',
    height: 'sm',
    margin: 'sm',
    color: '#1A3A5C',
  }));

  return {
    type: 'flex',
    altText: `${category}についてご質問ください`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        backgroundColor: cat.color,
        contents: [
          { type: 'text', text: label, color: '#ffffff', weight: 'bold', size: 'lg' },
          { type: 'text', text: 'よく聞かれる質問を選ぶか、自由に入力してください', color: '#FFFFFFBF', size: 'xxs', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'none',
        contents: [
          { type: 'text', text: 'よくある質問', weight: 'bold', size: 'xs', color: '#888888', margin: 'none' },
          { type: 'separator', margin: 'sm', color: '#e8e8e8' },
          ...faqButtons,
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            backgroundColor: '#f5f7fa',
            cornerRadius: '8px',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '💬 上記以外はメッセージで自由にご入力ください', size: 'xxs', color: '#888888', wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          { type: 'button', action: { type: 'message', label: '← メニューに戻る', text: 'メニュー' }, style: 'secondary', height: 'sm' },
        ],
      },
      styles: { footer: { separator: true } },
    },
  };
}

function buildResponseFlex(category, aiResponse) {
  const cat = CATEGORY_MAP[category];
  const headerColor = cat ? cat.color : '#1A3A5C';
  const headerLabel = cat ? CATEGORIES.find(c => c.key === category)?.label : '回答';

  return {
    type: 'flex',
    altText: aiResponse.substring(0, 50),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'horizontal',
        paddingAll: '14px',
        backgroundColor: headerColor,
        contents: [
          { type: 'text', text: headerLabel || '回答', color: '#ffffff', weight: 'bold', size: 'sm', flex: 1 },
          { type: 'text', text: 'AI回答', color: '#ffffff88', size: 'xs', align: 'end' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: aiResponse, wrap: true, size: 'sm', color: '#333333', lineSpacing: '6px' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        paddingAll: '12px',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: { type: 'message', label: '続けて質問', text: `【${category || 'その他'}】` },
            style: 'primary',
            color: headerColor,
            height: 'sm',
            flex: 1,
          },
          {
            type: 'button',
            action: { type: 'message', label: 'メニューへ', text: 'メニュー' },
            style: 'secondary',
            height: 'sm',
            flex: 1,
          },
        ],
        backgroundColor: '#f8f8f8',
      },
      styles: { footer: { separator: true } },
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
  const [officeName, welcomeMessage] = await Promise.all([
    db.getSetting('office_name'),
    db.getSetting('welcome_message'),
  ]);

  // フォロー時に自動でメニュー表示
  if (event.type === 'follow') {
    await client.replyMessage(event.replyToken, buildMenuFlex(officeName, welcomeMessage));
    return;
  }

  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  try {
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

    await client.replyMessage(event.replyToken, buildResponseFlex(selectedCategory, aiResponse));
  } catch (err) {
    console.error('Handle event error:', err);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '申し訳ございません。一時的にエラーが発生しました。しばらくしてからもう一度お試しください。',
    });
  }
}

module.exports = router;
