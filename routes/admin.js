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

// 営業先一括登録（初回のみ使用）
router.get('/sales/seed', requireAuth, async (req, res) => {
  const leads = [
    { office: '川添社会保険労務士事務所', contact_name: '', email: 'info@sr-kawasoe.jp', notes: '宝塚市' },
    { office: '笑社会保険労務士事務所', contact_name: '', email: 'info@sremi.pro', notes: '川西市' },
    { office: '伊丹社労士事務所', contact_name: '西村', email: 'nishimura@hrm-t.com', notes: '伊丹市' },
    { office: '古本社会保険労務士事務所', contact_name: '', email: 'info@sogohoken.net', notes: '宝塚市' },
    { office: 'かなみ社会保険労務士事務所', contact_name: '永井', email: 'info@kanami-office.com', notes: '川西市' },
    { office: 'みつや社労士事務所', contact_name: '石河秀樹', email: 'info@mitsuya-sr.com', notes: '伊丹市' },
    { office: '柴田将司社会保険労務士事務所', contact_name: '柴田将司', email: 'mshibata.sr.office@gmail.com', notes: '伊丹市' },
    { office: 'レガーメ社会保険労務士・FP事務所', contact_name: '鳥居昌子', email: 'info@legame-sr.com', notes: '宝塚市' },
    { office: 'はみんぐふる社労士法人みやこ事務所', contact_name: '', email: 'info@miyakojimusyo.com', notes: '広域・宝塚対応' },
    { office: 'Lチャート社会保険労務士事務所', contact_name: '酒井孝志', email: 'info@lchart-sr.com', notes: '三田市' },
    { office: '植田社会保険労務士事務所', contact_name: '植田昌宏', email: 'ueda-syaroushi@celery.ocn.ne.jp', notes: '三田市' },
    { office: 'オフィスH&M', contact_name: '北方克典', email: 'info@office-h-m.com', notes: '尼崎市' },
    { office: 'ふたば社会保険労務士法人', contact_name: '山田眞裕子', email: 'mail@futaba-sr.com', notes: '西宮市' },
    { office: '古澤社労士事務所', contact_name: '', email: 'info@furusawa-sr.jp', notes: '西宮市' },
    { office: '福島労務サポートオフィス', contact_name: '福島達夫', email: '', notes: '宝塚市・フォーム: https://fk-support.com/' },
    { office: 'Yours社会保険労務士事務所', contact_name: '片岡さゆり', email: '', notes: '宝塚市・フォーム: https://yours-sr.com/' },
    { office: '牧江＆パートナーズ', contact_name: '牧江孝徳', email: '', notes: '西宮市・フォーム: https://www.makie-office.com/' },
    { office: '社会保険労務士法人エビスガオ', contact_name: '中嶋功起', email: '', notes: '西宮市・フォーム: https://ebisu-face.com/' },
    { office: 'かねくら社会保険労務士行政書士事務所', contact_name: '金倉正晃', email: '', notes: '西宮市・フォーム: https://www.kanekurasr.com/' },
    { office: '中薗総合労務事務所', contact_name: '中薗博章', email: '', notes: '尼崎市・フォーム: https://nakazono-office.net/' },
  ];
  for (const l of leads) {
    await db.addOutreach(l.office, l.contact_name, l.email, l.notes);
  }
  res.redirect('/admin/sales');
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
    cold_email: `以下のメールをそのまま送れる状態で書いてください。

送り手のプロフィール：
- 名前：桜井 謙司、合同会社エスコネクト代表、大阪在住
- 社労士事務所向けのLINE AIサービス「シャロAI」を作った
- 以前、複数の社労士先生と話す中で「同じ質問に何度も答えるのが正直しんどい」「夜に問い合わせが来ても翌朝まで対応できない」という声を聞いて開発した

宛先：
- 事務所名: ${office}
- 担当者: ${contact_name || '先生'}
- 所在地: ${lead?.notes || notes || ''}

メールの書き方の指示：
- 件名から書くこと
- 全文をです・ます調で統一する（くだけた表現・話し言葉は使わない）
- 本文は260〜320文字。段落は2〜3つ
- 書き出しは「突然のご連絡、失礼いたします」から始める
- 開発の背景にある実体験（先生方から聞いた話）を1〜2文で丁寧に盛り込む
- シャロAIの説明は「LINEで自動対応・初月無料・設定はこちらで対応」を押しつけがましくなく一言で
- 締めは「もしご関心をお持ちでしたら、お気軽にご返信いただければ幸いです。よろしくお願いいたします。」
- 署名：桜井 謙司（合同会社エスコネクト / シャロAI）info@lp.sconnect.co.jp

【禁止事項】
- 箇条書き
- 「貴社」「益々のご発展」などの古い定型文
- 話し言葉・くだけた表現（「〜ですよね」「〜なんです」など）
- 「〜させていただく」「ご提供させていただく」などの二重敬語
- 「〜ではないでしょうか」「〜かもしれません」などの曖昧表現
- 同じ文型の繰り返し`,

    followup: `シャロAIの営業担当として、以下の事務所に1週間前に営業メールを送ったが返信がない状況です。
フォローアップメールを作成してください。

事務所名: ${office}
担当者名: ${contact_name || '先生'}

【要件】
- 件名も含めて出力
- 全文をです・ます調で統一する（くだけた表現・話し言葉は使わない）
- 「〜させていただく」「ご提供させていただく」などの二重敬語を使わない
- 150〜200文字程度（短く）
- 責めない・催促しない・あくまで確認ベース
- 1点だけ新しい情報（例：初月無料キャンペーン）を丁寧に添える
- 署名は「桜井 謙司（シャロAI）」`,

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

// 営業メール一括生成
router.get('/sales/generate-all', requireAuth, async (req, res) => {
  const axios = require('axios');
  const leads = await db.getOutreach();
  const pendingLeads = leads.filter(l => l.status === 'pending');

  const generateEmail = async (lead) => {
    const prompt = `あなたは合同会社エスコネクトの桜井です。社労士事務所向けにLINE AIサービス「シャロAI」を提供しています。
以下の事務所に送る営業メールを書いてください。

事務所名: ${lead.office}
担当者名: ${lead.contact_name || '先生'}
所在地: ${lead.notes || ''}

【絶対に守ること】
- 全文をです・ます調で統一する
- 話し言葉・くだけた表現（「〜ですよね」「〜なんです」「〜ですが」など）を使わない
- 「〜させていただく」「ご提供させていただく」などの二重敬語を使わない
- 「お世話になっております」「貴社の益々のご発展」などの古い定型文を一切使わない
- 件名も含めて出力
- 本文は220〜300文字（読み飛ばされない長さ）
- 書き出しは「突然のご連絡、失礼いたします」から始める
- 社労士先生が日々感じているであろう「同じ質問への対応疲れ」「夜間や休日の問い合わせ」という具体的なシーンに丁寧に触れる
- シャロAIの特徴（LINEでAIが自動応答・初月無料・設定はこちらでやる）をさりげなく
- 締めは「もしご関心をお持ちでしたら、お気軽にご返信いただければ幸いです。よろしくお願いいたします。」
- 署名：桜井 謙司（合同会社エスコネクト / シャロAI）info@lp.sconnect.co.jp`;

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] },
        { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }
      );
      return { ...lead, generatedEmail: response.data.content[0].text };
    } catch (e) {
      return { ...lead, generatedEmail: '生成エラー: ' + e.message };
    }
  };

  // 5件ずつバッチ処理（レート制限対策）
  const results = [];
  for (let i = 0; i < pendingLeads.length; i += 5) {
    const batch = pendingLeads.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(generateEmail));
    results.push(...batchResults);
  }

  res.render('sales-emails', { results });
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
