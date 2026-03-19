const express = require('express');
const db = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.redirect('/admin/login');
}

// ログイン画面
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { password } = req.body;
  const adminPassword = await db.getSetting('admin_password');
  if (password === adminPassword) {
    req.session.loggedIn = true;
    res.redirect('/admin');
  } else {
    res.render('login', { error: 'パスワードが違います' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ダッシュボード
router.get('/', requireAuth, async (req, res) => {
  const [settings, conversations] = await Promise.all([
    db.getAllSettings(),
    db.getConversations(5),
  ]);
  res.render('dashboard', { settings, conversations });
});

// 設定更新
router.post('/settings', requireAuth, async (req, res) => {
  const { office_name, welcome_message, system_prompt, admin_password } = req.body;
  await Promise.all([
    db.setSetting('office_name', office_name),
    db.setSetting('welcome_message', welcome_message),
    db.setSetting('system_prompt', system_prompt),
    admin_password ? db.setSetting('admin_password', admin_password) : Promise.resolve(),
  ]);
  res.redirect('/admin?saved=1');
});

// FAQ一覧・追加
router.get('/faqs', requireAuth, async (req, res) => {
  const faqs = await db.getFaqs();
  res.render('faqs', { faqs });
});

router.post('/faqs', requireAuth, async (req, res) => {
  const { question, answer } = req.body;
  if (question && answer) {
    await db.addFaq(question, answer);
  }
  res.redirect('/admin/faqs');
});

router.post('/faqs/delete', requireAuth, async (req, res) => {
  const { id } = req.body;
  await db.deleteFaq(id);
  res.redirect('/admin/faqs');
});

// 会話ログ
router.get('/logs', requireAuth, async (req, res) => {
  const conversations = await db.getConversations(100);
  res.render('logs', { conversations });
});

// 問い合わせ一覧
router.get('/inquiries', requireAuth, async (req, res) => {
  const inquiries = await db.getInquiries();
  res.render('inquiries', { inquiries });
});

// 営業支援
router.get('/sales', requireAuth, async (req, res) => {
  const leads = await db.getOutreach();
  res.render('sales', { leads });
});

router.post('/sales/generate', requireAuth, async (req, res) => {
  const { office, contact_name, prefecture, size, agent_type } = req.body;
  const axios = require('axios');

  const prompts = {
    cold_email: `あなたはシャロAIという社労士事務所向けLINE AIアシスタントサービスの営業担当です。
以下の事務所に向けた、自然で押しつけがましくない営業メールを日本語で作成してください。

事務所名: ${office}
担当者名: ${contact_name || '先生'}
所在地: ${prefecture || ''}
規模感: ${size || '不明'}

【メールの要件】
- 件名も含めて出力すること
- 300〜400文字程度（短く・読みやすく）
- 「繰り返しの問い合わせ対応」「時間外対応」という痛みに触れる
- シャロAIの価値（初月無料・設定おまかせ・LINE活用）を自然に伝える
- 押し売りせず「まず話だけでも」という低ハードルなCTAで締める
- 署名は「シャロAI 桜井」とする`,

    followup: `シャロAIの営業担当として、以下の事務所に1週間前に営業メールを送ったが返信がない状況です。
自然なフォローアップメールを作成してください。

事務所名: ${office}
担当者名: ${contact_name || '先生'}

【要件】
- 件名も含めて出力
- 150〜200文字程度（短く）
- 責めない・催促しない・あくまで確認ベース
- 1点だけ新しい情報（例：初月無料キャンペーン）を添える
- 署名は「シャロAI 桜井」`,

    proposal: `シャロAIの営業担当として、以下の事務所に向けた提案書の本文を作成してください。

事務所名: ${office}
担当者名: ${contact_name || '先生'}
規模感: ${size || '不明'}

【要件】
- 課題の整理（繰り返し対応・時間外・差別化）
- シャロAIで解決できること（具体的に）
- 料金プラン（ライト¥5,000・スタンダード¥10,000・プレミアム¥20,000）
- 初月無料・設定おまかせ・いつでも解約可
- 次のステップ（デモ日程調整）
- メール本文として使える文体で`,
  };

  const prompt = prompts[agent_type];
  if (!prompt) return res.json({ error: '不明なエージェントタイプです' });

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );
    const text = response.data.content[0].text;
    res.json({ result: text });
  } catch (e) {
    res.json({ error: 'AI生成に失敗しました: ' + e.message });
  }
});

router.post('/sales/add', requireAuth, async (req, res) => {
  const { office, contact_name, email, notes } = req.body;
  await db.addOutreach(office, contact_name, email, notes);
  res.redirect('/admin/sales');
});

router.post('/sales/update', requireAuth, async (req, res) => {
  const { id, status, notes } = req.body;
  await db.updateOutreachStatus(id, status, notes);
  res.redirect('/admin/sales');
});

router.post('/sales/delete', requireAuth, async (req, res) => {
  await db.deleteOutreach(req.body.id);
  res.redirect('/admin/sales');
});

module.exports = router;
