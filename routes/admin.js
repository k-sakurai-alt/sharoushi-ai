const express = require('express');
const db = require('../db/database');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
  // フォローアップ対象（sent & 7日以上経過）
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const followupCount = leads.filter(l => l.status === 'sent' && new Date(l.updated_at) <= sevenDaysAgo).length;
  res.render('sales', { leads, query: req.query, followupCount });
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
- 担当者: ${contact_name || ''}
- 所在地: ${lead?.notes || notes || ''}

メールの書き方の指示：
- 件名から書くこと
- 宛名は「事務所名＋様」とする（例：○○社会保険労務士事務所様）。個人名は使わない
- 全文をです・ます調で統一する（くだけた表現・話し言葉は使わない）
- 本文は260〜320文字。段落は2〜3つ
- 書き出しは「突然のご連絡、失礼いたします」から始める
- 開発の背景にある実体験（先生方から聞いた話）を1〜2文で丁寧に盛り込む
- シャロAIの説明として「LINEで自動対応・設定はこちらで対応・事務所ごとにカスタマイズ可能」を押しつけがましくなく盛り込む
- 「先生が繰り返し対応していた定型質問をAIが代わりに受け付けるため、本来の業務に集中できる時間が増えます」という趣旨を自然な流れで一文入れる
- 「初月は完全無料でお試しいただけます」という一文を必ず本文に入れる。押しつけがましくならないよう自然な流れで
- 締めは「もしご関心をお持ちでしたら、お気軽にご返信いただければ幸いです。よろしくお願いいたします。」
- 署名は書かない（システムが自動付与する）

【禁止事項】
- 箇条書き
- アスタリスク（*）・ハイフン区切り（---）などのマークダウン記号を一切使わない
- 「本文：」「署名：」「署名」などのラベル・見出し・区切り語を本文中に一切入れない（件名行は「件名: ○○」形式のみ）。署名情報は見出しなしでそのまま記載すること
- 「貴社」「益々のご発展」などの古い定型文
- 話し言葉・くだけた表現（「〜ですよね」「〜なんです」など）
- 「〜させていただく」「ご提供させていただく」などの二重敬語
- 「〜ではないでしょうか」「〜かもしれません」などの曖昧表現
- 同じ文型の繰り返し`,

    followup: `シャロAIの営業担当として、以下の事務所に1週間前に営業メールを送ったが返信がない状況です。
フォローアップメールを作成してください。

事務所名: ${office}
担当者名: ${contact_name || ''}

【要件】
- 件名も含めて出力
- 宛名は「事務所名＋様」とする（例：○○社会保険労務士事務所様）。個人名は使わない
- 全文をです・ます調で統一する（くだけた表現・話し言葉は使わない）
- 「〜させていただく」「ご提供させていただく」などの二重敬語を使わない
- アスタリスク（*）・ハイフン区切り（---）などのマークダウン記号を一切使わない
- 150〜200文字程度（短く）
- 責めない・催促しない・あくまで確認ベース
- 「初月は完全無料でお試しいただける」という点を一文で丁寧に添える
- 署名は書かない（システムが自動付与する）`,

    monitor: `以下のメールをそのまま送れる状態で書いてください。

送り手のプロフィール：
- 名前：桜井 謙司、合同会社エスコネクト代表、大阪在住
- 社労士事務所向けのLINE AIサービス「シャロAI」を作った
- 以前、複数の社労士先生と話す中で「同じ質問に何度も答えるのが正直しんどい」「夜に問い合わせが来ても翌朝まで対応できない」という声を聞いて開発した

宛先：
- 事務所名: ${office}

メールの書き方の指示：
- 件名から書くこと
- 宛名は「事務所名＋様」とする（例：○○社会保険労務士事務所様）。個人名は使わない
- 全文をです・ます調で統一する（くだけた表現・話し言葉は使わない）
- 本文は240〜300文字。段落は2〜3つ
- 書き出しは「突然のご連絡、失礼いたします」から始める
- 開発の背景にある実体験（先生方から聞いた話）を1〜2文で丁寧に盛り込む
- LINEでAIが自動応答する仕組みであること・設定はこちらで全て対応することを自然に盛り込む
- 「初月は完全無料でお試しいただけます」という一文を必ず本文に入れる（メールの中で一番目立つ訴求として）
- 締めは「もしご関心をお持ちでしたら、お気軽にご返信いただければ幸いです。よろしくお願いいたします。」
- 署名は書かない（システムが自動付与する）

【禁止事項】
- 箇条書き
- アスタリスク（*）・ハイフン区切り（---）などのマークダウン記号を一切使わない
- 「本文：」「署名：」などのラベル・見出し・区切り語を本文中に一切入れない（件名行は「件名: ○○」形式のみ）
- 「貴社」「益々のご発展」などの古い定型文
- 「〜させていただく」「ご提供させていただく」などの二重敬語
- 「〜ではないでしょうか」「〜かもしれません」などの曖昧表現`,

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
    const SIGNATURE = `桜井 謙司（合同会社エスコネクト）/ シャロAI: https://lp.sconnect.co.jp / info@lp.sconnect.co.jp`;
    let text = response.data.content[0].text.trim();
    if (agent_type === 'cold_email' || agent_type === 'followup' || agent_type === 'monitor') {
      text = text.replace(/桜井[^\n]*エスコネクト[^\n]*/g, '').replace(/info@lp\.sconnect\.co\.jp[^\n]*/g, '').trimEnd();
      text = `${text}\n\n${SIGNATURE}`;
    }
    res.json({ result: text });
  } catch (e) {
    res.json({ error: 'AI生成に失敗しました: ' + e.message });
  }
});

// 営業メール一括生成
router.get('/sales/generate-all', requireAuth, async (req, res) => {
  const axios = require('axios');
  const leads = await db.getOutreach();
  const allPending = leads.filter(l => l.status === 'pending');
  const MAX = 30; // 一度に生成する上限（タイムアウト防止）
  const pendingLeads = allPending.slice(0, MAX);

  const generateEmail = async (lead) => {
    const isForm = !lead.email;
    const prompt = `あなたは合同会社エスコネクトの桜井です。社労士事務所向けにLINE AIサービス「シャロAI」を提供しています。
以下の事務所に送る営業文を書いてください。

事務所名: ${lead.office}
担当者名: ${lead.contact_name || ''}
所在地: ${lead.notes || ''}

【絶対に守ること】
- 全文をです・ます調で統一する
- 宛名は「事務所名＋様」とする（例：○○社会保険労務士事務所様）。個人名は使わない
- 話し言葉・くだけた表現（「〜ですよね」「〜なんです」「〜ですが」など）を使わない
- 「〜させていただく」「ご提供させていただく」などの二重敬語を使わない
- 「お世話になっております」「貴社の益々のご発展」などの古い定型文を一切使わない
- アスタリスク（*）・ハイフン区切り（---）などのマークダウン記号を一切使わない
- 「本文：」「署名：」「署名」などのラベル・見出し・区切り語を本文中に一切入れない
${isForm
  ? '- 件名は不要。本文のみ出力する（冒頭に件名行を入れない）'
  : '- 最初の行に「件名: ○○」形式で件名を出力し、その後に本文を続ける'}
- 本文は220〜300文字（読み飛ばされない長さ）
- 書き出しは「突然のご連絡、失礼いたします」から始める
- 社労士先生が日々感じているであろう「同じ質問への対応疲れ」「夜間や休日の問い合わせ」という具体的なシーンに丁寧に触れる
- シャロAIの特徴として「LINEで自動応答・設定はこちらで対応・事務所ごとにカスタマイズ可能」をさりげなく盛り込む
- 「先生が繰り返し対応していた定型質問をAIが代わりに受け付けるため、本来の業務に集中できる時間が増えます」という趣旨を自然な流れで一文入れる
- 「初月は完全無料でお試しいただけます」という一文を必ず本文に入れる。押しつけがましくならないよう自然な流れで
- 締めは「もしご関心をお持ちでしたら、お気軽にご返信いただければ幸いです。よろしくお願いいたします。」
- 署名は書かない（システムが自動付与する）`;

    const SIGNATURE = `桜井 謙司（合同会社エスコネクト）/ シャロAI: https://lp.sconnect.co.jp / info@lp.sconnect.co.jp`;

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] },
        { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }
      );
      const generated = response.data.content[0].text.trim();
      // AIが署名を書いてしまった場合に備えて除去してから固定署名を付与
      const withoutSig = generated.replace(/桜井[^\n]*エスコネクト[^\n]*/g, '').replace(/info@lp\.sconnect\.co\.jp[^\n]*/g, '').trimEnd();
      const finalEmail = `${withoutSig}\n\n${SIGNATURE}`;
      return { ...lead, generatedEmail: finalEmail };
    } catch (e) {
      return { ...lead, generatedEmail: '生成エラー: ' + e.message };
    }
  };

  // 3件ずつバッチ処理、バッチ間2秒待機（429レート制限対策）
  const results = [];
  for (let i = 0; i < pendingLeads.length; i += 3) {
    const batch = pendingLeads.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(generateEmail));
    results.push(...batchResults);
    if (i + 3 < pendingLeads.length) await new Promise(r => setTimeout(r, 2000));
  }

  const remainingCount = allPending.length - pendingLeads.length;
  // 生成結果をセッションに保存（再表示用）
  req.session.lastGeneratedEmails = { results, remainingCount };
  res.render('sales-emails', { results, pageTitle: '一括営業メール生成結果', remainingCount });
});

// 生成済みメールを再表示（再生成しない）
router.get('/sales/view-emails', requireAuth, (req, res) => {
  const saved = req.session.lastGeneratedEmails;
  if (!saved) return res.redirect('/admin/sales/generate-all');
  res.render('sales-emails', { results: saved.results, pageTitle: '一括営業メール生成結果', remainingCount: saved.remainingCount });
});

// 一括送信API
router.post('/sales/send-all', async (req, res) => {
  if (!req.session.loggedIn) return res.status(401).json({ error: '未ログイン' });
  const { emails } = req.body; // [{to, subject, body, id, notes}]
  if (!Array.isArray(emails) || emails.length === 0) return res.status(400).json({ error: 'emailsが必要です' });

  const { google } = require('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
  );
  const accessToken = await db.getSetting('google_access_token');
  const refreshToken = await db.getSetting('google_refresh_token');
  if (!refreshToken) return res.status(400).json({ error: 'Gmail未連携', needAuth: true });
  oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) await db.setSetting('google_access_token', tokens.access_token);
  });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // 実際の送信元アドレスをGmail APIから取得（Fromアドレス詐称を防ぐ）
  let senderEmail = 'me';
  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    senderEmail = profile.data.emailAddress;
  } catch(e) { /* 取得失敗時はGmailのデフォルト */ }

  const results = [];
  for (const item of emails) {
    try {
      const subject = item.subject || '社労士事務所のLINE・電話対応をAIに任せる方法';
      const message = [
        `From: =?UTF-8?B?${Buffer.from('桜井 謙司（合同会社エスコネクト）').toString('base64')}?= <${senderEmail}>`,
        `To: ${item.to}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: base64`,
        `List-Unsubscribe: <mailto:${senderEmail}?subject=unsubscribe>`,
        `Precedence: personal`,
        ``,
        Buffer.from(item.body).toString('base64'),
      ].join('\r\n');
      const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
      // ステータスを送信済みに更新
      if (item.id) await db.updateOutreachStatus(item.id, 'sent', item.notes || '');
      results.push({ to: item.to, success: true });
      await new Promise(r => setTimeout(r, 12000)); // 送信間隔12秒（迷惑メール対策）
    } catch (e) {
      results.push({ to: item.to, success: false, error: e.message });
    }
  }
  res.json({ results });
});

router.post('/sales/add', requireAuth, async (req, res) => {
  const { office, contact_name, email, notes } = req.body;
  await db.addOutreach(office, contact_name, email, notes);
  res.redirect('/admin/sales');
});

router.post('/sales/update', requireAuth, async (req, res) => {
  const { id, status, notes } = req.body;
  await db.updateOutreachStatus(id, status, notes);
  if (req.headers['x-requested-with'] === 'fetch') {
    return res.json({ success: true });
  }
  res.redirect('/admin/sales');
});

router.post('/sales/delete', requireAuth, async (req, res) => {
  await db.deleteOutreach(req.body.id);
  res.redirect('/admin/sales');
});

// 住所になっている誤データを削除してCSVから再インポート
router.post('/sales/reimport-hyogo', requireAuth, async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  try {
    // 住所パターン（市・区・町・村を含む）のofficeを削除
    const existing = await db.getOutreach();
    const addressPattern = /[市区町村]|〒|\d{3}-\d{4}|丁目|番地|ビル|号室/;
    for (const row of existing) {
      if (addressPattern.test(row.office)) {
        await db.deleteOutreach(row.id);
      }
    }

    // 正しいCSVを再インポート
    const csvPath = path.join(__dirname, '../scripts/hyogo_leads.csv');
    if (!fs.existsSync(csvPath)) return res.redirect('/admin/sales?error=no_file');
    const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });

    const remaining = await db.getOutreach();
    const existingEmails = new Set(remaining.map(r => r.email).filter(Boolean));
    const existingOffices = new Set(remaining.map(r => r.office));

    let added = 0, skipped = 0;
    for (const row of records) {
      const office = (row.office || '').trim();
      const email = (row.email || '').trim().toLowerCase();
      const notes = row.notes || row.form_url || '';
      if (!office || addressPattern.test(office)) { skipped++; continue; }
      if (existingOffices.has(office)) { skipped++; continue; }
      if (email && existingEmails.has(email)) { skipped++; continue; }
      await db.addOutreach(office, '', email || null, notes);
      existingOffices.add(office);
      if (email) existingEmails.add(email);
      added++;
    }
    res.redirect(`/admin/sales?import_added=${added}&import_skipped=${skipped}`);
  } catch (e) {
    console.error('reimport error:', e);
    res.redirect('/admin/sales?error=import_failed');
  }
});

// 収集済みリストプレビュー
router.get('/sales/leads-preview', requireAuth, async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const csvPath = path.join(__dirname, '../scripts/hyogo_leads.csv');
  if (!fs.existsSync(csvPath)) return res.json({ error: 'ファイルが見つかりません' });
  const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
  const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  const existing = await db.getOutreach();
  const existingEmails = new Set(existing.map(r => r.email).filter(Boolean));
  const existingOffices = new Set(existing.map(r => r.office));
  const preview = records.map(row => {
    const email = row.email || '';
    const office = row.office || '';
    const isDuplicate = existingOffices.has(office) || (email && existingEmails.has(email));
    return { office, email, phone: row.phone || '', isDuplicate };
  });
  res.json({ total: preview.length, newCount: preview.filter(r => !r.isDuplicate).length, records: preview.slice(0, 50) });
});

// 兵庫県社労士会スクレイピング結果（hyogo_sr_leads.csv）をインポート
router.post('/sales/import-hyogo-sr', requireAuth, async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const csvPath = path.join(__dirname, '../scripts/hyogo_sr_leads.csv');
  if (!fs.existsSync(csvPath)) return res.redirect('/admin/sales?error=no_file');
  try {
    const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
    let added = 0, skipped = 0;
    const existing = await db.getOutreach();
    const existingOffices = new Set(existing.map(r => r.office));
    for (const row of records) {
      const office = (row.office || '').trim();
      if (!office) { skipped++; continue; }
      if (existingOffices.has(office)) { skipped++; continue; }
      await db.addOutreach(office, '', null, row.notes || '');
      existingOffices.add(office);
      added++;
    }
    res.redirect(`/admin/sales?import_added=${added}&import_skipped=${skipped}`);
  } catch (e) {
    console.error('import-hyogo-sr error:', e);
    res.redirect('/admin/sales?error=import_failed');
  }
});

// サーバー上のCSVをそのままインポート
router.post('/sales/import-hyogo', requireAuth, async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const csvPath = path.join(__dirname, '../scripts/hyogo_leads.csv');
  if (!fs.existsSync(csvPath)) return res.redirect('/admin/sales?error=no_file');
  try {
    const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
    let added = 0, skipped = 0;
    const existing = await db.getOutreach();
    const existingEmails = new Set(existing.map(r => r.email).filter(Boolean));
    const existingOffices = new Set(existing.map(r => r.office));
    for (const row of records) {
      const office = (row.office || '').trim();
      const email = (row.email || '').trim().toLowerCase();
      const notes = row.notes || row.form_url || '';
      if (!office) { skipped++; continue; }
      if (existingOffices.has(office)) { skipped++; continue; }
      if (email && existingEmails.has(email)) { skipped++; continue; }
      await db.addOutreach(office, '', email || null, notes);
      existingOffices.add(office);
      if (email) existingEmails.add(email);
      added++;
    }
    res.redirect(`/admin/sales?import_added=${added}&import_skipped=${skipped}`);
  } catch (e) {
    console.error('import-hyogo error:', e);
    res.redirect('/admin/sales?error=import_failed');
  }
});

// CSV一括インポート
router.post('/sales/import-csv', requireAuth, upload.single('csvfile'), async (req, res) => {
  if (!req.file) return res.redirect('/admin/sales?error=no_file');
  try {
    const content = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, ''); // BOM除去
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });

    let added = 0;
    let skipped = 0;
    const existing = await db.getOutreach();
    const existingEmails = new Set(existing.map(r => r.email).filter(Boolean));
    const existingOffices = new Set(existing.map(r => r.office));

    for (const row of records) {
      const office = row.office || row['事務所名'] || '';
      const email = row.email || row['メール'] || row['メールアドレス'] || '';
      const notes = row.notes || row.form_url || row['フォームURL'] || '';
      const contactName = row.name || row['担当者名'] || '';

      if (!office) { skipped++; continue; }
      // 事務所名 OR メアドどちらか一致で重複とみなす
      if (existingOffices.has(office)) { skipped++; continue; }
      if (email && existingEmails.has(email)) { skipped++; continue; }

      await db.addOutreach(office, contactName, email, notes);
      existingOffices.add(office);
      if (email) existingEmails.add(email);
      added++;
    }

    res.redirect(`/admin/sales?import_added=${added}&import_skipped=${skipped}`);
  } catch (e) {
    console.error('CSV import error:', e);
    res.redirect('/admin/sales?error=import_failed');
  }
});

// フォローアップ一括生成（sent & 7日以上経過）
router.get('/sales/generate-followup', requireAuth, async (req, res) => {
  const axios = require('axios');
  const leads = await db.getOutreach();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const targetLeads = leads.filter(l => l.status === 'sent' && new Date(l.updated_at) <= sevenDaysAgo);

  if (targetLeads.length === 0) {
    return res.redirect('/admin/sales?followup_none=1');
  }

  const SIGNATURE = `桜井 謙司（合同会社エスコネクト）/ シャロAI: https://lp.sconnect.co.jp / info@lp.sconnect.co.jp`;

  const generateFollowup = async (lead) => {
    const prompt = `シャロAIの営業担当として、以下の事務所に1週間前に営業メールを送ったが返信がない状況です。
フォローアップメールを作成してください。

事務所名: ${lead.office}
担当者名: ${lead.contact_name || ''}

【要件】
- 件名も含めて出力
- 宛名は「事務所名＋様」とする（例：○○社会保険労務士事務所様）。個人名は使わない
- 全文をです・ます調で統一する（くだけた表現・話し言葉は使わない）
- 「〜させていただく」「ご提供させていただく」などの二重敬語を使わない
- アスタリスク（*）・ハイフン区切り（---）などのマークダウン記号を一切使わない
- 150〜200文字程度（短く）
- 責めない・催促しない・あくまで確認ベース
- 「初月は完全無料でお試しいただけます」という点を一文で丁寧に添える
- 署名は書かない（システムが自動付与する）`;

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: 'claude-haiku-4-5-20251001', max_tokens: 512, messages: [{ role: 'user', content: prompt }] },
        { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }
      );
      const generated = response.data.content[0].text.trim();
      const withoutSig = generated.replace(/桜井[^\n]*エスコネクト[^\n]*/g, '').replace(/info@lp\.sconnect\.co\.jp[^\n]*/g, '').trimEnd();
      return { ...lead, generatedEmail: `${withoutSig}\n\n${SIGNATURE}` };
    } catch (e) {
      return { ...lead, generatedEmail: '生成エラー: ' + e.message };
    }
  };

  const results = [];
  for (let i = 0; i < targetLeads.length; i += 3) {
    const batch = targetLeads.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(generateFollowup));
    results.push(...batchResults);
    if (i + 3 < targetLeads.length) await new Promise(r => setTimeout(r, 2000));
  }

  res.render('sales-emails', { results, pageTitle: 'フォローアップメール一括生成' });
});

// 事務所名・住所でHP URLを自動検索して保存
router.post('/sales/find-hp', requireAuth, async (req, res) => {
  const axios = require('axios');
  const { id, office, address } = req.body;
  const query = encodeURIComponent(`${office} 社労士 公式サイト`);
  try {
    const r = await axios.get(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 8000,
    });
    // DDGのHTMLから最初の外部リンクを抽出
    const matches = r.data.match(/uddg=([^&"]+)/g) || [];
    const urls = matches
      .map(m => decodeURIComponent(m.replace('uddg=', '')))
      .filter(u => u.startsWith('http') && !u.includes('duckduckgo') && !u.includes('google'));
    const url = urls[0] || null;
    if (url && id) {
      await db.updateOutreachNotesById(id, url);
    }
    res.json({ url });
  } catch(e) {
    res.json({ url: null });
  }
});

// HP URLをCSVから既存レコードのnotesに反映
router.post('/sales/patch-hp-urls', requireAuth, async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const csvPath = path.join(__dirname, '../scripts/hyogo_leads.csv');
  if (!fs.existsSync(csvPath)) return res.redirect('/admin/sales?error=no_file');
  try {
    const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
    let updated = 0;
    for (const row of records) {
      const office = (row.office || '').trim();
      const notes = (row.notes || '').trim();
      if (office && notes) {
        await db.updateOutreachNotes(office, notes);
        updated++;
      }
    }
    res.redirect(`/admin/sales?import_added=${updated}&import_skipped=0`);
  } catch (e) {
    console.error('patch-hp-urls error:', e);
    res.redirect('/admin/sales?error=import_failed');
  }
});

module.exports = router;
