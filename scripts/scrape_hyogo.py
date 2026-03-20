#!/usr/bin/env python3
"""
兵庫SR社労士会員検索スクレイピングスクリプト
http://www.hyogosr.gr.jp/sr-search/ から全会員のメアドを収集
"""

import requests
from bs4 import BeautifulSoup
import csv
import time
import re
import sys
from urllib.parse import urljoin

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
}
BASE_URL = 'http://www.hyogosr.gr.jp/sr-search/'
OUTPUT_FILE = 'scripts/hyogo_leads.csv'

def fetch(url, timeout=10):
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.encoding = r.apparent_encoding
        return r
    except Exception as e:
        print(f'  [失敗] {url}: {e}', file=sys.stderr)
        return None

def get_detail_links(soup):
    """一覧ページから詳細リンクを取得"""
    links = []
    for a in soup.find_all('a', href=re.compile('target_detail')):
        href = a['href']
        full_url = urljoin(BASE_URL, href)
        # 前後のテキスト（事務所名・住所）を取得
        row = a.find_parent('tr')
        if row:
            cells = row.find_all('td')
            name_kana = cells[0].get_text(strip=True) if len(cells) > 0 else ''
            name_kanji = cells[1].get_text(strip=True) if len(cells) > 1 else ''
            address = cells[2].get_text(strip=True) if len(cells) > 2 else ''
            phone = cells[3].get_text(strip=True) if len(cells) > 3 else ''
            links.append({
                'url': full_url,
                'name_kana': name_kana,
                'name': name_kanji,
                'address': address,
                'phone': phone
            })
    return links

def scrape_detail(entry):
    """詳細ページからメアド・事務所名を取得"""
    r = fetch(entry['url'])
    if not r:
        return entry

    soup = BeautifulSoup(r.text, 'html.parser')
    text = soup.get_text()

    # メアド抽出
    emails = re.findall(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', text)
    emails = [e for e in emails if not re.search(r'\.(png|jpg|gif)$', e, re.I)]
    email = emails[0] if emails else ''

    # 事務所名抽出（テーブルから）
    office_name = ''
    for row in soup.find_all('tr'):
        cells = row.find_all('td')
        if len(cells) >= 2:
            label = cells[0].get_text(strip=True)
            value = cells[1].get_text(strip=True)
            if '事務所名' in label:
                office_name = value
                break

    result = dict(entry)
    result['email'] = email
    result['office'] = office_name or entry.get('name', '')
    return result

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--max', type=int, default=255, help='最大件数（デフォルト全件255）')
    args = parser.parse_args()

    print('兵庫SR社労士会員 メアド収集')
    print(f'出力先: {OUTPUT_FILE}\n')

    print('[1] 一覧ページ取得中...')
    r = fetch(BASE_URL)
    if not r:
        print('取得失敗'); return

    soup = BeautifulSoup(r.text, 'html.parser')
    entries = get_detail_links(soup)
    print(f'    → {len(entries)}件のリンクを取得')

    target = entries[:args.max]
    print(f'    → {len(target)}件を処理\n')

    results = []
    for i, entry in enumerate(target):
        print(f'[{i+1:3d}/{len(target)}] {entry["name"][:20]:20s}', end=' ', flush=True)
        result = scrape_detail(entry)
        email = result.get('email', '')
        print(f'→ {email if email else "メアドなし":40s} {result.get("office","")[:25]}')
        results.append(result)
        time.sleep(0.8)

    # CSV出力
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['office', 'name', 'email', 'phone', 'address', 'notes'])
        writer.writeheader()
        for r in results:
            writer.writerow({
                'office': r.get('office', ''),
                'name': r.get('name', ''),
                'email': r.get('email', ''),
                'phone': r.get('phone', ''),
                'address': r.get('address', ''),
                'notes': ''
            })

    email_count = sum(1 for r in results if r.get('email'))
    print(f'\n=== 完了 ===')
    print(f'取得件数: {len(results)}件')
    print(f'メアドあり: {email_count}件 ({email_count*100//len(results) if results else 0}%)')
    print(f'出力: {OUTPUT_FILE}')

if __name__ == '__main__':
    main()
