#!/usr/bin/env python3
"""
兵庫県社会保険労務士会 会員スクレイピング
https://www.sr-hyogo.gr.jp/search/ から全会員の事務所情報を収集
※ メアドは掲載なし。事務所名・住所・電話番号を取得してCSVに保存。
"""

import requests
from bs4 import BeautifulSoup
import csv
import time
import re
import sys
import os
import argparse

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
}
LIST_URL = 'https://www.sr-hyogo.gr.jp/search/result?office_name=&name=&kana='
OUTPUT_FILE = 'scripts/hyogo_sr_leads.csv'
PROGRESS_FILE = 'scripts/hyogo_sr_progress.txt'
INTERVAL = 1.5  # サーバー負荷対策：1件ごとの待機秒数

def fetch(url, timeout=15):
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.encoding = 'utf-8'
        return r
    except Exception as e:
        print(f'  [失敗] {url}: {e}', file=sys.stderr)
        return None

def get_detail_links(soup):
    links = []
    for a in soup.find_all('a', href=re.compile(r'/search/detail/')):
        href = a['href']
        if not href.startswith('http'):
            href = 'https://www.sr-hyogo.gr.jp' + href
        # 前後のテキスト（担当者名・事務所名）を取得
        parent = a.find_parent()
        office_hint = parent.get_text(strip=True) if parent else ''
        links.append({'url': href, 'hint': office_hint})
    return links

def scrape_detail(url):
    r = fetch(url)
    if not r:
        return None

    soup = BeautifulSoup(r.text, 'html.parser')
    data = {'url': url, 'name': '', 'office': '', 'address': '', 'phone': ''}

    # th+td形式のテーブルから情報を取得
    for row in soup.find_all('tr'):
        cells = row.find_all(['th', 'td'])
        if len(cells) < 2:
            continue
        label = cells[0].get_text(strip=True)
        value = cells[1].get_text(strip=True)
        if '事務所名' in label and not data['office']:
            data['office'] = value
        elif '氏名' in label and not data['name']:
            data['name'] = value
        elif 'TEL' in label and not data['phone']:
            data['phone'] = value
        elif '住所' in label and not data['address']:
            data['address'] = value

    # テーブルで取れない場合はdl/dt形式などを試す
    if not data['office']:
        for dt in soup.find_all('dt'):
            label = dt.get_text(strip=True)
            dd = dt.find_next_sibling('dd')
            if not dd:
                continue
            value = dd.get_text(strip=True)
            if '事務所名' in label and not data['office']:
                data['office'] = value
            elif 'TEL' in label and not data['phone']:
                data['phone'] = value
            elif '住所' in label and not data['address']:
                data['address'] = value

    # 事務所名がどうしても取れない場合はhintから補完（呼び出し元でセット）
    return data

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return int(f.read().strip())
    return 0

def save_progress(idx):
    with open(PROGRESS_FILE, 'w') as f:
        f.write(str(idx))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--resume', action='store_true', help='前回の続きから再開')
    parser.add_argument('--max', type=int, default=0, help='取得上限（0=全件）')
    args = parser.parse_args()

    print('兵庫県社会保険労務士会 会員情報収集')
    print(f'出力先: {OUTPUT_FILE}')
    print(f'間隔: {INTERVAL}秒/件\n')

    # 一覧ページから全詳細リンクを取得
    print('[1] 一覧ページ取得中...')
    r = fetch(LIST_URL)
    if not r:
        print('取得失敗'); return

    soup = BeautifulSoup(r.text, 'html.parser')
    links = get_detail_links(soup)
    # 重複除去
    seen = set()
    unique_links = []
    for l in links:
        if l['url'] not in seen:
            seen.add(l['url'])
            unique_links.append(l)
    links = unique_links

    total = len(links)
    print(f'    → {total}件のリンクを取得')

    if args.max > 0:
        links = links[:args.max]
        print(f'    → 上限{args.max}件で実行')

    # 再開位置の決定
    start_idx = 0
    existing_results = []
    if args.resume and os.path.exists(OUTPUT_FILE):
        start_idx = load_progress()
        with open(OUTPUT_FILE, encoding='utf-8-sig') as f:
            existing_results = list(csv.DictReader(f))
        print(f'    → {start_idx}件目から再開（既存: {len(existing_results)}件）\n')
    else:
        start_idx = 0
        print()

    results = list(existing_results)
    target = links[start_idx:]

    for i, link in enumerate(target):
        idx = start_idx + i
        url = link['url']
        hint = link['hint']

        print(f'[{idx+1:4d}/{total}] {url.split("/")[-1]:8s}', end=' ', flush=True)

        data = scrape_detail(url)
        if data:
            if not data['office'] and hint:
                data['office'] = hint[:30]
            print(f'→ {data["office"][:25]:25s} {data["phone"] or "TELなし"}')
            results.append({
                'office': data['office'],
                'name': data['name'],
                'email': '',  # このサイトはメアド非公開
                'phone': data['phone'],
                'address': data['address'],
                'notes': '',  # HP URLは後でDDG検索で補完
            })
        else:
            print('→ 取得失敗')
            results.append({
                'office': hint[:30] if hint else '',
                'name': '', 'email': '', 'phone': '', 'address': '', 'notes': '',
            })

        # 進捗保存（10件ごと）
        if (idx + 1) % 10 == 0:
            save_progress(idx + 1)
            with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=['office','name','email','phone','address','notes'])
                writer.writeheader()
                writer.writerows(results)

        time.sleep(INTERVAL)

    # 最終保存
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['office','name','email','phone','address','notes'])
        writer.writeheader()
        writer.writerows(results)

    if os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)

    print(f'\n=== 完了 ===')
    print(f'取得件数: {len(results)}件')
    print(f'出力: {OUTPUT_FILE}')
    print(f'\n次のステップ:')
    print(f'  管理画面からCSVをインポート後、「HPを探す」ボタンでHP URLを収集')
    print(f'  HP URLが集まったらフォーム営業開始')

if __name__ == '__main__':
    main()
