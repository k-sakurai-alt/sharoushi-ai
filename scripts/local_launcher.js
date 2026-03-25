#!/usr/bin/env node
/**
 * ローカルランチャーサーバー
 * 管理画面の「フォーム営業開始」ボタンからform_sender.pyを起動する
 * 使い方: node scripts/local_launcher.js
 */

const http = require('http');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3003;
const ROOT = path.join(__dirname, '..');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  if (url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ running: false, message: '待機中' }));
    return;
  }

  // スクレイピング開始
  if (url === '/scrape' && req.method === 'POST') {
    const outputFile = path.join(ROOT, 'scripts/hyogo_sr_leads.csv');
    const resumeFlag = fs.existsSync(outputFile) ? '--resume' : '';
    const cmd = `python3 "${path.join(ROOT, 'scripts/scrape_hyogo_sr.py')}" ${resumeFlag}`;
    const script = `osascript -e 'tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"'`;
    exec(script, (err) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Terminal起動に失敗しました: ' + err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Terminalでスクレイピングを起動しました（約34分）' }));
      }
    });
    return;
  }

  if (url === '/start' && req.method === 'POST') {
    const csvFiles = [
      'scripts/hyogo_leads.csv',
    ].filter(f => fs.existsSync(path.join(ROOT, f)))
     .map(f => path.join(ROOT, f));

    if (csvFiles.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'CSVファイルが見つかりません' }));
      return;
    }

    const csvArgs = csvFiles.map(f => `"${f}"`).join(' ');
    const cmd = `python3 "${path.join(ROOT, 'scripts/form_sender.py')}" --csv ${csvArgs}`;
    const script = `osascript -e 'tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"'`;

    exec(script, (err) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Terminal起動に失敗しました: ' + err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Terminalでform_senderを起動しました', files: csvFiles.length }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n✅ ローカルランチャー起動中: http://localhost:${PORT}`);
  console.log('管理画面の「フォーム営業開始」ボタンから呼び出せます');
  console.log('終了: Ctrl+C\n');
});
