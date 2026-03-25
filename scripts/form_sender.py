#!/usr/bin/env python3
"""
社労士事務所 フォーム半自動送信スクリプト
HPのお問い合わせフォームを自動検出・入力し、ユーザーが送信ボタンを押す
"""

import asyncio
import csv
import re
import sys
import argparse
from playwright.async_api import async_playwright

# ===== 送信者情報 =====
SENDER_NAME = '桜井 謙司'
SENDER_FAMILY_NAME = '桜井'
SENDER_GIVEN_NAME = '謙司'
SENDER_NAME_KATAKANA = 'サクライ ケンジ'
SENDER_FAMILY_NAME_KATAKANA = 'サクライ'
SENDER_GIVEN_NAME_KATAKANA = 'ケンジ'
SENDER_NAME_HIRAGANA = 'さくらい けんじ'
SENDER_FAMILY_NAME_HIRAGANA = 'さくらい'
SENDER_GIVEN_NAME_HIRAGANA = 'けんじ'
SENDER_COMPANY = '合同会社エスコネクト'
SENDER_EMAIL = 'info@lp.sconnect.co.jp'
SENDER_PHONE = '080-6107-4151'
SENDER_ZIPCODE = '530-0001'
SENDER_PREFECTURE = '大阪府'
SENDER_ADDRESS = '大阪市北区梅田1−2−2 大阪駅前第2ビル12F-12'

# お問い合わせページのパス候補
CONTACT_PATHS = [
    '/contact', '/contact.html', '/contact/',
    '/contacts', '/inquiry', '/inquiry.html', '/inquiry/',
    '/お問い合わせ', '/toiawase',
    '/form', '/form.html',
]

# フォームフィールドの検出キーワード（上から優先順位順）
FIELD_PATTERNS = {
    'family_name_hiragana': ['姓ふりがな', '姓かな', '苗字ふりがな', 'seifurigana'],
    'given_name_hiragana':  ['名ふりがな', '名かな', 'meifurigana'],
    'family_name_katakana': ['姓フリガナ', '姓カナ', '苗字フリガナ', 'seikata'],
    'given_name_katakana':  ['名フリガナ', '名カナ', 'meikata'],
    'family_name': ['sei', 'lastname', 'last_name', 'family_name', '姓', '苗字', 'myoji'],
    'name_hiragana': ['ふりがな', 'hiragana', 'ひらがな', '平仮名', 'よみ', 'yomi', 'ruby'],
    'name_katakana': ['フリガナ', 'katakana', 'カタカナ', '片仮名', 'ヨミ', 'furigana'],
    'company': ['company', 'corporation', '会社', '貴社', '事務所', '法人', '組織', 'office', 'jimusho', 'corp'],
    'subject': ['subject', '件名', 'タイトル', '題名', 'title'],
    'name':    ['fullname', 'full_name', 'your_name', 'お名前', '名前', '氏名', 'shimei', 'name'],
    'given_name':  ['mei', 'firstname', 'first_name', 'given_name', 'namae'],
    'email':   ['email', 'mail', 'メール', 'e-mail', 'メールアドレス'],
    'phone':   ['tel', 'phone', '電話', '連絡先', 'telephone'],
    'zipcode':     ['zip', '郵便', '〒', 'postal'],
    'prefecture':  ['prefecture', '都道府県', '都道府', '県', 'pref'],
    'address':     ['address', '住所', '所在地'],
    'inquiry_type': ['区分', '種別', '種類', '項目', 'category', 'type', '分類', 'kubun', 'inquiry_type', 'contact_type'],
    'message': ['message', 'body', '内容', '本文', 'お問い合わせ内容', 'inquiry', 'ご相談', 'comment'],
}

def build_message(office_name):
    return f"""突然のご連絡、失礼いたします。

社労士事務所向けLINE AIサービス「シャロAI」をご紹介させてください。

先生方から「同じ質問に何度も対応している」「夜間や休日の問い合わせが負担」というお声を多くいただき、開発いたしました。顧問先のLINE問い合わせをAIが24時間自動対応し、回答内容は各事務所に合わせて完全カスタマイズできます。初期設定はすべてこちらで対応するため、先生方のご負担はございません。

初期設定費用・初月ともに完全無料でお試しいただけます。ご関心がございましたら、ご返信いただければ幸いです。よろしくお願いいたします。

桜井 謙司（合同会社エスコネクト）
シャロAI: https://lp.sconnect.co.jp"""

def build_subject(office_name):
    return "社労士事務所のLINE・電話対応をAIに任せる方法【シャロAI】"

async def find_contact_url(page, base_url):
    """トップページからお問い合わせページURLを探す"""
    try:
        await page.goto(base_url, timeout=15000, wait_until='domcontentloaded')
        links = await page.eval_on_selector_all('a[href]', '''els => els.map(el => ({
            href: el.href,
            text: el.textContent.trim()
        }))''')
        for link in links:
            text = link.get('text', '').lower()
            href = link.get('href', '')
            if any(w in text or w in href.lower() for w in ['contact', 'inquiry', 'お問い合わせ', '問い合わせ', 'toiawase']):
                if base_url.split('/')[2] in href:
                    return href
    except Exception:
        pass

    for path in CONTACT_PATHS:
        url = base_url.rstrip('/') + path
        try:
            r = await page.request.get(url, timeout=8000)
            if r.status == 200:
                return url
        except Exception:
            continue
    return None

def detect_field_type(attrs):
    label = attrs.get('label', '').strip()
    if label:
        label_lower = label.lower()
        for field_type, keywords in FIELD_PATTERNS.items():
            if any(kw.lower() in label_lower for kw in keywords):
                return field_type

    text = ' '.join([
        attrs.get('name', ''),
        attrs.get('id', ''),
        attrs.get('placeholder', ''),
        attrs.get('aria_label', ''),
        attrs.get('title', ''),
    ]).lower()
    for field_type, keywords in FIELD_PATTERNS.items():
        if any(kw.lower() in text for kw in keywords):
            return field_type
    return None

async def fill_form(page, office_name):
    message = build_message(office_name)
    subject = build_subject(office_name)
    filled = []

    fields = await page.eval_on_selector_all(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="radio"]):not([type="file"]), textarea, select',
        '''els => els.map(el => ({
            tag: el.tagName.toLowerCase(),
            type: el.type || '',
            name: el.name || '',
            id: el.id || '',
            placeholder: el.placeholder || '',
            aria_label: el.getAttribute('aria-label') || '',
            title: el.getAttribute('title') || '',
            maxlength: el.maxLength > 0 ? el.maxLength : -1,
            value: el.value || '',
        }))'''
    )

    zip_digits = SENDER_ZIPCODE.replace('-', '')
    phone_digits = SENDER_PHONE.replace('-', '')
    phone_parts = [phone_digits[:3], phone_digits[3:7], phone_digits[7:]]
    phone_part_idx = 0

    for i, field in enumerate(fields):
        selector = None
        if field.get('id'):
            selector = f"#{field['id']}"
        elif field.get('name'):
            selector = f"[name=\"{field['name']}\"]"
        else:
            continue

        label_text = ''
        try:
            if field.get('id'):
                label_text = await page.eval_on_selector(
                    f"label[for=\"{field['id']}\"]",
                    'el => el.textContent'
                ) or ''
        except Exception:
            pass
        if not label_text:
            try:
                label_text = await page.eval_on_selector(
                    selector,
                    '''el => {
                        const lbl = el.closest("label");
                        if (lbl) return lbl.textContent.trim();
                        const row = el.closest("tr");
                        if (row) {
                            const th = row.querySelector("th");
                            if (th) return th.textContent.trim();
                            const tds = row.querySelectorAll("td");
                            if (tds.length > 1) return tds[0].textContent.trim();
                        }
                        const dd = el.closest("dd");
                        if (dd && dd.previousElementSibling && dd.previousElementSibling.tagName === "DT")
                            return dd.previousElementSibling.textContent.trim();
                        const grp = el.closest(".form-group,.form-item,.form-row,.field,.input-group,.form__item,.mw_wp_form");
                        if (grp) { const l = grp.querySelector("label,dt,th"); return l ? l.textContent.trim() : ""; }
                        let prev = el.previousElementSibling;
                        while (prev) {
                            if (!prev.querySelector("input,select,textarea")) {
                                const t = prev.textContent.trim();
                                if (t) return t;
                            }
                            prev = prev.previousElementSibling;
                        }
                        return "";
                    }'''
                ) or ''
            except Exception:
                pass

        attrs = {**field, 'label': label_text}
        field_type = detect_field_type(attrs)

        if field_type == 'given_name':
            company_check = ' '.join([
                label_text,
                field.get('name', ''),
                field.get('id', ''),
                field.get('placeholder', ''),
            ])
            company_words = ['会社', '貴社', '事務所', '法人', 'company', 'corp', 'jimusho', 'organization']
            if any(w in company_check for w in company_words):
                field_type = 'company'

        print(f'    [検出] {selector} | label="{label_text[:15]}" | type={field_type}', flush=True)

        try:
            if field.get('type') == 'checkbox':
                check_text = ' '.join([label_text, field.get('value', ''), field.get('aria_label', '')]).lower()
                if 'その他' in check_text or 'other' in check_text:
                    await page.evaluate(
                        '''selector => {
                            const el = document.querySelector(selector);
                            if (el && !el.checked) {
                                el.checked = true;
                                el.dispatchEvent(new Event('change', {bubbles: true}));
                            }
                        }''', selector)
                    filled.append(f"checkbox(その他): {selector}")
                continue

            if field['tag'] == 'select':
                options = await page.evaluate(
                    '''selector => Array.from(document.querySelectorAll(selector + " option")).map(o => ({value: o.value, text: o.textContent.trim()}))''',
                    selector)
                if field_type == 'prefecture':
                    matched = next(
                        (o for o in options if '大阪' in o.get('text', '') or '大阪' in o.get('value', '')), None)
                    label = 'prefecture'
                else:
                    matched = next(
                        (o for o in options if 'その他' in o.get('text', '') or 'other' in o.get('value', '').lower()), None)
                    label = 'inquiry_type'
                if matched:
                    await page.evaluate(
                        '''({selector, value}) => {
                            const el = document.querySelector(selector);
                            if (el) {
                                el.value = value;
                                el.dispatchEvent(new Event('change', {bubbles: true}));
                            }
                        }''', {'selector': selector, 'value': matched['value']})
                    filled.append(f"{label}(select): {selector}")
                continue

            value = None
            if field_type == 'name':
                value = SENDER_NAME
            elif field_type == 'family_name':
                value = SENDER_FAMILY_NAME
            elif field_type == 'given_name':
                value = SENDER_GIVEN_NAME
            elif field_type == 'name_hiragana':
                value = SENDER_NAME_HIRAGANA
            elif field_type == 'name_katakana':
                value = SENDER_NAME_KATAKANA
            elif field_type == 'family_name_hiragana':
                value = SENDER_FAMILY_NAME_HIRAGANA
            elif field_type == 'given_name_hiragana':
                value = SENDER_GIVEN_NAME_HIRAGANA
            elif field_type == 'family_name_katakana':
                value = SENDER_FAMILY_NAME_KATAKANA
            elif field_type == 'given_name_katakana':
                value = SENDER_GIVEN_NAME_KATAKANA
            elif field_type == 'company':
                value = SENDER_COMPANY
            elif field_type == 'email':
                value = SENDER_EMAIL
            elif field_type == 'phone':
                ml = field.get('maxlength', -1)
                if ml in (3, 4):
                    if phone_part_idx < 3:
                        value = phone_parts[phone_part_idx]
                        phone_part_idx += 1
                else:
                    value = SENDER_PHONE
            elif field_type == 'zipcode':
                ml = field.get('maxlength', -1)
                if ml == 3:
                    value = zip_digits[:3]
                elif ml == 4:
                    value = zip_digits[3:]
                else:
                    value = SENDER_ZIPCODE
            elif field_type == 'prefecture':
                value = SENDER_PREFECTURE
            elif field_type == 'address':
                value = SENDER_ADDRESS
            elif field_type == 'subject':
                value = subject
            elif field_type == 'message':
                value = message

            if value is not None:
                await page.evaluate(
                    '''({selector, value}) => {
                        const el = document.querySelector(selector);
                        if (!el) return;
                        const proto = el.tagName === 'TEXTAREA'
                            ? window.HTMLTextAreaElement.prototype
                            : window.HTMLInputElement.prototype;
                        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                        if (setter) setter.call(el, value);
                        else el.value = value;
                        el.dispatchEvent(new Event('input', {bubbles: true}));
                        el.dispatchEvent(new Event('change', {bubbles: true}));
                    }''', {'selector': selector, 'value': value})
                filled.append(f"{field_type}: {selector}")
        except Exception as e:
            pass

    return filled

async def process_leads(csv_files, start_from=0):
    leads = []
    for csv_file in csv_files:
        try:
            with open(csv_file, encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    hp_url = row.get('notes', '')
                    email = row.get('email', '')
                    if hp_url.startswith('http') and not email:
                        leads.append({
                            'office': row.get('office', ''),
                            'hp_url': hp_url,
                            'source': csv_file,
                        })
        except Exception as e:
            print(f"CSV読み込みエラー: {csv_file}: {e}")

    leads = leads[start_from:]
    total = len(leads)
    print(f'\n対象: {total}件（HPあり・メアドなし）')
    print('=' * 60)
    print('操作方法:')
    print('  ブラウザでフォームが開きます')
    print('  内容確認後、送信ボタンを押してください')
    print('  送信完了したらターミナルでEnterを押すと次へ進みます')
    print('  スキップ: "s" + Enter')
    print('  終了: "q" + Enter')
    print('=' * 60)

    sent_count = 0
    skipped_count = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=300)
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 800},
            locale='ja-JP',
        )
        page = await context.new_page()

        for i, lead in enumerate(leads):
            office = lead['office']
            hp_url = lead['hp_url']

            print(f'\n{"="*60}')
            print(f'[{i+1+start_from}/{total+start_from}] {office}')
            print(f'  HP: {hp_url}')
            print(f'{"="*60}')

            print('  フォームページを検索中...', flush=True)
            contact_url = await find_contact_url(page, hp_url)

            if not contact_url:
                print('  ⚠️  フォームページが自動検出できませんでした')
                print(f'  ブラウザでHPを開きます。手動でフォームページを探してください')
                try:
                    await page.goto(hp_url, timeout=15000, wait_until='domcontentloaded')
                except Exception:
                    pass
                print(f'\n  ┌─ 操作を選んでください ─────────────────────────')
                print(f'  │  Enter  = ブラウザでフォームを手動入力後、送信完了した')
                print(f'  │  s      = この事務所をスキップして次へ')
                print(f'  │  q      = 今日はここで終了する')
                print(f'  └──────────────────────────────────────────────')
                user_input = input('  > ').strip().lower()
                if user_input == 'q':
                    print('\n終了します')
                    break
                elif user_input == 's':
                    skipped_count += 1
                    print('  → スキップ')
                else:
                    sent_count += 1
                    print(f'  ✓ 送信完了 ({sent_count}件目)')
                continue

            print(f'  ✅ フォームページ発見: {contact_url}')

            try:
                await page.goto(contact_url, timeout=15000, wait_until='domcontentloaded')
                await asyncio.sleep(1)

                filled = await fill_form(page, office)

                if filled:
                    print(f'  ✅ 自動入力完了: {", ".join(filled)}')
                else:
                    print(f'  ⚠️  自動入力できませんでした（フォーム構造が特殊）')
                    print(f'  ブラウザで手動入力してください')

                print(f'\n  ┌─ 操作を選んでください ─────────────────────────')
                print(f'  │  Enter  = ブラウザで送信ボタンを押して送信完了した')
                print(f'  │  s      = この事務所をスキップして次へ')
                print(f'  │  r      = フォームをリロードして再入力する')
                print(f'  │  q      = 今日はここで終了する')
                print(f'  └──────────────────────────────────────────────')
                user_input = input('  > ').strip().lower()

                if user_input == 'q':
                    print('\n終了します')
                    break
                elif user_input == 's':
                    skipped_count += 1
                    print('  → スキップ')
                elif user_input == 'r':
                    await page.goto(contact_url, timeout=15000, wait_until='domcontentloaded')
                    await asyncio.sleep(1)
                    await fill_form(page, office)
                    print('  リロードしました。送信後Enterを押してください')
                    input('  > ')
                    sent_count += 1
                    print(f'  ✓ 送信完了 ({sent_count}件目)')
                else:
                    sent_count += 1
                    print(f'  ✓ 送信完了 ({sent_count}件目)')

            except Exception as e:
                print(f'  ❌ エラー: {e}')
                print(f'  ┌─────────────────────────────────────────────')
                print(f'  │  s = スキップ / q = 終了 / Enter = 送信済み扱い')
                print(f'  └─────────────────────────────────────────────')
                user_input = input('  > ').strip().lower()
                if user_input == 'q':
                    break
                elif user_input == 's':
                    skipped_count += 1
                else:
                    sent_count += 1

            await asyncio.sleep(0.5)

        await browser.close()

    print(f'\n=== 完了 ===')
    print(f'送信: {sent_count}件 / スキップ: {skipped_count}件')

def main():
    parser = argparse.ArgumentParser(description='社労士事務所 フォーム半自動送信')
    parser.add_argument('--csv', nargs='+', required=True, help='対象CSVファイル（複数可）')
    parser.add_argument('--from', type=int, default=0, dest='start_from', help='何件目から開始するか')
    args = parser.parse_args()
    asyncio.run(process_leads(args.csv, args.start_from))

if __name__ == '__main__':
    main()
