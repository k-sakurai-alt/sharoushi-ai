require('dotenv').config();

const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', './views');

// webhookルートはexpress.json()より先に登録（raw bodyが必要なため）
const webhookRouter = require('./routes/webhook');
app.use('/webhook', webhookRouter);

// ミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'sharoushi-ai-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 1日
}));

// 管理画面ルート
const adminRouter = require('./routes/admin');
app.use('/admin', adminRouter);

// トップページ → 管理画面へリダイレクト
app.get('/', (req, res) => res.redirect('/admin'));

app.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
  console.log(`管理画面: http://localhost:${PORT}/admin`);
});
